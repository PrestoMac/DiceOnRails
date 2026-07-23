import { GameState, MCPResponse, Character, Message, EnemyAttack, InventoryItem, Currency, Enemy, InitiativeEntry } from '../types';
import { isDebugMode } from '../utils/debug';
import { cryptoRoll } from '../utils/random';
import { supabase } from './supabaseClient';
import { lookupSRDItem } from '../utils/srdItems';
import { generateId, fail } from './mcp/_shared';
import { createPartyService, PartyService } from './mcp/partyService';
import { createInventoryService, InventoryService } from './mcp/inventoryService';
import { createCombatService, CombatService } from './mcp/combatService';
import { createSpellcastingService, SpellcastingService } from './mcp/spellcastingService';
import { createProgressionService, ProgressionService } from './mcp/progressionService';
import { createStateService, StateService } from './mcp/stateService';
import { createContentService, ContentService } from './mcp/contentService';
import { createTravelService, TravelService } from './mcp/travelService';

export { generateId };

/** Central server-class that owns the game state and wires together all sub-services (party, inventory, combat, spells, progression, travel, content, state).
 *  Acts as the single canonical source of truth; all game state mutations must go through this class. */
export class MockMCPServer {
  private state: GameState;

  readonly party: PartyService;
  readonly inventory: InventoryService;
  readonly combat: CombatService;
  readonly spells: SpellcastingService;
  readonly progression: ProgressionService;
  readonly stateManager: StateService;
  readonly content: ContentService;
  readonly travel: TravelService;

  constructor() {
    this.state = {
      party: [],
      worldDescription: "You gather at The Rusty Tankard...",
      sessionLogs: [],
      quests: [],
      lore: [],
      currentAtmosphereUrl: undefined as string | undefined,
      actionQueue: [],
      startingLocation: undefined,
      locationImages: {}
    };

    this.stateManager = createStateService(this.state);
    this.stateManager.ensureGameStateFields();

    this.party = createPartyService(this.state);
    this.content = createContentService(this.state);
    this.inventory = createInventoryService(this.state, {
      getTarget: (id) => this.party.getTarget(id),
      supabase,
      lookupSRDItem,
      initializeDeathSaves: (c) => this.combat.initializeDeathSaves(c),
      updateInitiativeDeathStatus: (id, isDead) => this.combat.updateInitiativeDeathStatus(id, isDead),
    });
    this.combat = createCombatService(this.state, {
      getTarget: (id) => this.party.getTarget(id),
      inflict_damage: (amount, targetId, dmgType) => this.inventory.inflict_damage(amount, targetId, dmgType),
    });
    this.spells = createSpellcastingService(this.state, {
      getTarget: (id) => this.party.getTarget(id),
      inflict_damage: (amount, targetId, dmgType) => this.inventory.inflict_damage(amount, targetId, dmgType),
      make_save: (targetId, stat, dc) => this.combat.make_save(targetId, stat, dc),
      syncInitiativeConditions: () => this.combat.syncInitiativeConditions(),
    });
    this.progression = createProgressionService(this.state);
    this.travel = createTravelService(this.state, {
      getTarget: (id) => this.party.getTarget(id),
      adjust_currency: (gp, sp, cp, targetId) => this.inventory.adjust_currency(gp, sp, cp, targetId),
      update_inventory: (item_name, action, quantity, new_name, targetId, type, rarity, description, stats, equipped, cost_gp, cost_sp, cost_cp, autoDeductMarketPrice, craft) =>
        this.inventory.update_inventory(item_name, action, quantity, new_name, targetId, type, rarity, description, stats, equipped, cost_gp, cost_sp, cost_cp, autoDeductMarketPrice, craft),
      log_lore: (title, content, category) => this.content.log_lore(title, content, category),
      upsert_quest: (title, description, status, reputationChanges) => this.content.upsert_quest(title, description, status, reputationChanges),
    });
  }


  public setCharacter(character: Character) { this.party.setCharacter(character); }
  public joinParty(character: Character) { this.party.joinParty(character); }
  public getTarget(id?: string): Character | undefined { return this.party.getTarget(id); }
  public getResource(uri: string): unknown { return this.party.getResource(uri); }


  public updateInventoryDirectly(newInventory: InventoryItem[], targetId?: string) { this.inventory.updateInventoryDirectly(newInventory, targetId); }
  public updateCurrencyDirectly(newCurrency: Currency, targetId?: string) { this.inventory.updateCurrencyDirectly(newCurrency, targetId); }
  public async inflict_damage(amount: number, targetId?: string, damageType?: string): Promise<MCPResponse> { return this.inventory.inflict_damage(amount, targetId, damageType); }
  public async update_inventory(item_name: string, action: 'add' | 'remove' | 'edit', quantity?: number, new_name?: string, targetId?: string, type?: InventoryItem['type'], rarity?: InventoryItem['rarity'], description?: string, stats?: InventoryItem['stats'], equipped?: boolean, cost_gp?: number, cost_sp?: number, cost_cp?: number, autoDeductMarketPrice?: boolean, craft?: boolean): Promise<MCPResponse> { return this.inventory.update_inventory(item_name, action, quantity, new_name, targetId, type, rarity, description, stats, equipped, cost_gp, cost_sp, cost_cp, autoDeductMarketPrice, craft); }
  public async adjust_currency(gp?: number, sp?: number, cp?: number, targetId?: string): Promise<MCPResponse> { return this.inventory.adjust_currency(gp, sp, cp, targetId); }


  public get lastCurrencyAdjustment() { return this.inventory.getLastCurrencyAdjustment(); }


  public loadState(savedState: GameState) { this.stateManager.loadState(savedState); }
  public reset() { this.stateManager.reset(); this.inventory.clearCurrencyAdjustment(); }
  public getFullState(): GameState { return this.stateManager.getFullState(); }
  public setLastSuggestions(suggestions: string[]): void { this.state.lastSuggestions = suggestions; }
  public beginTransaction(): void { this.stateManager.beginTransaction(); }
  public rollbackTransaction(): void { this.stateManager.rollbackTransaction(); }
  public commitTransaction(): void { this.stateManager.commitTransaction(); }
  public captureRewindSnapshot(): GameState | undefined { return this.stateManager.captureRewindSnapshot(); }
  public restoreSnapshot(snapshot: GameState): void { this.stateManager.restoreSnapshot(snapshot); this.inventory.clearCurrencyAdjustment(); }
  public saveRewindPoint(gameState: GameState, messages: Message[]): void { this.stateManager.saveRewindPoint(gameState, messages); }
  public loadRewindPoint(): { gameState: GameState; messages: Message[] } | null { return this.stateManager.loadRewindPoint(); }
  public clearRewindPoint(): void { this.stateManager.clearRewindPoint(); }
  public saveEmergencySnapshot(state: GameState): void { this.stateManager.saveEmergencySnapshot(state); }
  public loadEmergencySnapshot(): GameState | null { return this.stateManager.loadEmergencySnapshot(); }
  public clearEmergencySnapshot(): void { this.stateManager.clearEmergencySnapshot(); }


  public awardExperience(amount: number, targetId?: string) { return this.progression.awardExperience(amount, targetId); }
  public async level_up(targetId: string, statAllocations?: Record<string, number>, subclassSelection?: string, chosenFeats?: string[]): Promise<MCPResponse> { return this.progression.level_up(targetId, statAllocations, subclassSelection, chosenFeats); }
  public allocateStatPoints(allocations: Partial<Record<keyof Character['stats'], number>>, targetId?: string, skillAllocations?: Record<string, number>, hpDeviation?: number): MCPResponse { return this.progression.allocateStatPoints(allocations, targetId, skillAllocations, hpDeviation); }
  public getCharacterProgression(targetId?: string): string { return this.progression.getCharacterProgression(targetId); }


  public async add_enemy(name: string, ac?: number, hp?: number, attacks?: EnemyAttack[], cr?: number, xp?: number, size?: string, type?: string, damageResistances?: string[], damageImmunities?: string[], damageVulnerabilities?: string[]): Promise<MCPResponse> { return this.combat.add_enemy(name, ac, hp, attacks, cr, xp, size, type, damageResistances, damageImmunities, damageVulnerabilities); }
  public async start_combat(targetId?: string, enemies?: Array<{ name: string; ac?: number; hp?: number; cr?: number; xp?: number; size?: string; type?: string; }>): Promise<MCPResponse> { return this.combat.start_combat(targetId, enemies); }
  public async next_turn(autoResolveEnemies?: boolean): Promise<MCPResponse> { return this.combat.next_turn(autoResolveEnemies); }
  public async end_combat(): Promise<MCPResponse> { return this.combat.end_combat(); }
  public async enemy_attack(enemyId: string, targetId?: string, attackIndex?: number): Promise<MCPResponse> { return this.combat.enemy_attack(enemyId, targetId, attackIndex); }
  public async make_save(targetId: string, stat: string, dc: number): Promise<MCPResponse> { return this.combat.make_save(targetId, stat, dc); }
  public async roll_death_save(targetId?: string): Promise<MCPResponse> { return this.combat.roll_death_save(targetId); }
  public getCurrentTurnInfo(): { name: string; type: 'player' | 'enemy'; id: string } | null { return this.combat.getCurrentTurnInfo(); }
  public updateInitiativeDeathStatus(id: string, isDead: boolean): void { this.combat.updateInitiativeDeathStatus(id, isDead); }
  public checkCombatEndConditions(): { ended: boolean; reason?: string; victory?: boolean } { return this.combat.checkCombatEndConditions(); }
  public async player_attack(attackerId: string, weaponName: string, targetId: string, isOffHand?: boolean, isSneakAttack?: boolean, sharpshooter?: boolean, greatWeaponMaster?: boolean): Promise<MCPResponse> { return this.combat.player_attack(attackerId, weaponName, targetId, isOffHand, isSneakAttack, sharpshooter, greatWeaponMaster); }
  public async resolveEnemyTurn(): Promise<MCPResponse> { return this.combat.resolveEnemyTurn(); }
  public async resolveAllPendingEnemyTurns(): Promise<{ messages: string[]; combatEnded: boolean; victory?: boolean; attackResults: Record<string, unknown>[] }> { return this.combat.resolveAllPendingEnemyTurns(); }
  public syncInitiativeConditions(): void { this.combat.syncInitiativeConditions(); }
  public initializeDeathSaves(character: Character) { this.combat.initializeDeathSaves(character); }


  public async upsert_quest(title: string, description: string, status: 'active' | 'completed' | 'failed', reputationChanges?: Array<{ faction: string; delta: number }>): Promise<MCPResponse> { return this.content.upsert_quest(title, description, status, reputationChanges); }
  public async log_lore(title: string, content: string, category: string): Promise<MCPResponse> { return this.content.log_lore(title, content, category); }


  public async move_to(location_name: string, description?: string, targetId?: string, skillCheck?: { skill_name?: string; difficulty?: number; onSuccess?: unknown }, route?: string, pace?: string): Promise<MCPResponse> { return this.travel.move_to(location_name, description, targetId, skillCheck, route, pace); }
  public async narrate_turn(narration: string, timePassed?: number): Promise<MCPResponse> { return this.travel.narrate_turn(narration, timePassed); }
  public setAtmosphere(url: string) { this.travel.setAtmosphere(url); }
  public setStartingLocation(location: { name: string; description: string; introHook?: string; atmosphereUrl?: string }) { this.travel.setStartingLocation(location); }
  public cacheLocationImage(name: string, url: string) { this.travel.cacheLocationImage(name, url); }
  public getCachedLocationImage(name: string): string | undefined { return this.travel.getCachedLocationImage(name); }
  public async roll_dice(sides: number, count?: number, modifier?: number, target_ac?: number, target_name?: string, roll_label?: string, isDamageRoll?: boolean, isOffHand?: boolean, weaponName?: string, attackerId?: string): Promise<MCPResponse> { return this.travel.roll_dice(sides, count, modifier, target_ac, target_name, roll_label, isDamageRoll, isOffHand, weaponName, attackerId); }
  public async check_skill(skill_name: string, difficulty: number, targetId?: string, onSuccess?: Record<string, unknown>): Promise<MCPResponse> { return this.travel.check_skill(skill_name, difficulty, targetId, onSuccess); }
  public async long_rest(narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse> { return this.travel.long_rest(narration, autoAdvanceTime); }
  public async short_rest(targetId?: string, narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse> { return this.travel.short_rest(targetId, narration, autoAdvanceTime); }


  public async cast_spell(characterId: string, spellId: string, slotLevel?: number, targets?: string[], targetSaveResults?: Record<string, boolean>, reaction?: boolean): Promise<MCPResponse> { return this.spells.cast_spell(characterId, spellId, slotLevel, targets, targetSaveResults, reaction); }
  public async resolve_dot_damage(spellId: string, targetId: string, casterId?: string): Promise<MCPResponse> { return this.spells.resolve_dot_damage(spellId, targetId, casterId); }
  public async cast_ritual(characterId: string, spellId: string): Promise<MCPResponse> { return this.spells.cast_ritual(characterId, spellId); }
  public async spell_effect(mode: 'counter' | 'dispel', casterId: string, targetSpellLevel: number, targetId?: string): Promise<MCPResponse> { return this.spells.spell_effect(mode, casterId, targetSpellLevel, targetId); }
  public async manage_spellbook(characterId: string, action: 'learn' | 'prepare' | 'unprepare' | 'forget', spellId: string): Promise<MCPResponse> { return this.spells.manage_spellbook(characterId, action, spellId); }
  public async use_resource(characterId: string, resourceId: string, targetId?: string, amount?: number): Promise<MCPResponse> { return this.spells.use_resource(characterId, resourceId, targetId, amount); }


  public async summon_creature(casterId: string, template: string, count: number = 1): Promise<MCPResponse> {
    const char = this.party.getTarget(casterId);
    if (!char) return fail('Caster not found.');
    const { createSummonedCreature } = await import('./summoningEngine');
    const summoned: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      const creature = createSummonedCreature(template, char.id, char.level);
      if (!creature) return fail(`Unknown creature template: ${template}`);
      const enemy: Enemy = {
        id: creature.id, name: creature.name, ac: creature.ac,
        hp: { current: creature.hp.current, max: creature.hp.max },
        attacks: creature.attacks, cr: creature.cr,
        xp: Math.floor(creature.cr * 100), isDead: false,
        type: creature.type, summonFields: creature.summonFields,
      } as Enemy;
      (enemy as unknown as { summonDurationRemaining?: number }).summonDurationRemaining = creature.summonFields?.duration;
      if (this.state.combat?.enemies && this.state.combat.enemies.length > 0) {
        const roll = cryptoRoll(20);
        const dexMod = enemy.stats ? Math.floor((enemy.stats.dex - 10) / 2) : 0;
        this.state.combat.enemies.push(enemy);
        this.state.combat.initiative.push({
          id: enemy.id, name: enemy.name, initiative: roll + dexMod,
          type: 'enemy', isDead: false, hasActedThisTurn: false,
          rawRoll: roll, modifier: dexMod,
        });
        this.state.combat.initiative.sort((a: InitiativeEntry, b: InitiativeEntry) => b.initiative - a.initiative);
      } else {
        if (!this.state.combat) {
          this.state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [] };
        }
        this.state.combat.enemies.push(enemy);
      }
      summoned.push(enemy);
    }
    const names = summoned.map((e: Enemy) => e.name).join(', ');
    this.state.sessionLogs.push(`${char.name} summons ${names}.`);
    return {
      success: true,
      data: { summoned: summoned.map((e: Enemy) => ({ id: e.id, name: e.name, hp: e.hp.max, ac: e.ac })) },
      message: `${char.name} summons ${count} ${template}(s): ${names}.`
    };
  }

  public async teleport_creature(characterId: string, destination: string, range: number = 30): Promise<MCPResponse> {
    const char = this.party.getTarget(characterId);
    if (!char) return fail('Character not found.');
    const { teleportCharacter } = await import('./teleportationEngine');
    const result = teleportCharacter(char, range, destination);
    char.location = destination;
    return { success: true, data: { character: char.name, destination, range }, message: result.message };
  }

  public async polymorph_creature(characterId: string, beastFormName: string, duration: number = 60): Promise<MCPResponse> {
    const char = this.party.getTarget(characterId);
    if (!char) return fail('Character not found.');
    const { BEAST_FORMS, applyPolymorph } = await import('./transformationEngine');
    const beast = BEAST_FORMS[beastFormName.toLowerCase()];
    if (!beast) return fail(`Unknown beast form: ${beastFormName}.`);
    const { getClassDef } = await import('./classEngine');
    const classDef = getClassDef(char.class);
    if (classDef?.spellcasting && beast.cr > char.level) {
      return fail(`Cannot polymorph into ${beast.name} (CR ${beast.cr}) - exceeds character level ${char.level}.`);
    }
    const transformation = applyPolymorph(char, beast, duration);
    if (!char.runtime) char.runtime = {};
    char.runtime.transformationState = transformation;
    char.hp.max = beast.hp.max;
    char.hp.current = beast.hp.max;
    this.state.sessionLogs.push(`${char.name} transforms into a ${beast.name}!`);
    return {
      success: true,
      data: { character: char.name, transformedInto: beast.name, newHp: beast.hp, newAc: beast.ac, attacks: beast.attacks, duration },
      message: `${char.name} transforms into a ${beast.name}! HP: ${beast.hp}, AC: ${beast.ac}. Duration: ${duration} minutes.`
    };
  }


  /** Routes an LLM tool call by name to the appropriate sub-service, dispatching across 29 cases (28 tools + unknown default). */
  public async executeToolCall(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    if (isDebugMode) {
      console.log(`[executeToolCall] Executing: ${name} with args:`, args);
    }
    try {
      let res: MCPResponse;
      switch (name) {
        case 'roll_dice':
          res = await this.travel.roll_dice(
            Number(args.sides ?? 20), Number(args.count ?? 1), Number(args.modifier ?? 0),
            args.target_ac !== undefined ? Number(args.target_ac) : undefined,
            args.target_name as string | undefined, args.roll_label as string | undefined,
            args.isDamageRoll as boolean | undefined, args.isOffHand as boolean | undefined,
            args.weaponName as string | undefined, args.attackerId as string | undefined
          ); break;
        case 'add_enemy':
          res = await this.combat.add_enemy(String(args.name || ''), args.ac !== undefined ? Number(args.ac) : undefined, args.hp !== undefined ? Number(args.hp) : undefined, undefined, args.cr !== undefined ? Number(args.cr) : undefined, args.xp !== undefined ? Number(args.xp) : undefined); break;
        case 'start_combat':
          res = await this.combat.start_combat(args.targetId as string | undefined, args.enemies as unknown as Array<{ name: string; ac?: number; hp?: number; cr?: number; xp?: number; size?: string; type?: string }>); break;
        case 'next_turn':
          res = await this.combat.next_turn(); break;
        case 'end_combat':
          res = await this.combat.end_combat(); break;
        case 'player_attack':
          res = await this.combat.player_attack(String(args.attackerId || ''), String(args.weaponName || ''), String(args.targetId || args.target_name || args.target || ''), args.isOffHand as boolean | undefined, args.isSneakAttack as boolean | undefined, args.sharpshooter as boolean | undefined, args.greatWeaponMaster as boolean | undefined); break;
        case 'move_to':
          res = await this.travel.move_to(String(args.location_name || 'Unknown'), String(args.description || ''), args.targetId as string | undefined, args.skillCheck as unknown as { skill_name?: string; difficulty?: number; onSuccess?: unknown }, args.route as string | undefined, args.pace as string | undefined); break;
        case 'check_skill':
          res = await this.travel.check_skill(String(args.skill_name || ''), Number(args.difficulty ?? 10), args.targetId as string, args.onSuccess as Record<string, unknown>); break;
        case 'inflict_damage':
          res = await this.inventory.inflict_damage(Number(args.amount ?? 0), (args.targetId || args.target_name) as string, args.damageType as string); break;
        case 'adjust_currency':
          res = await this.inventory.adjust_currency(Number(args.gp ?? 0), Number(args.sp ?? 0), Number(args.cp ?? 0), args.targetId as string); break;
        case 'update_inventory':
          res = await this.inventory.update_inventory(String(args.item_name || ''), String(args.action || 'add') as 'add' | 'remove' | 'edit', Number(args.quantity ?? 1), args.new_name as string | undefined, args.targetId as string, args.type as unknown as InventoryItem['type'], args.rarity as unknown as InventoryItem['rarity'], args.description as string, args.stats as unknown as InventoryItem['stats'], args.equipped as boolean, args.cost_gp as number | undefined, args.cost_sp as number | undefined, args.cost_cp as number | undefined, args.autoDeductMarketPrice as boolean | undefined, args.craft as boolean | undefined); break;
        case 'upsert_quest':
          res = await this.content.upsert_quest(String(args.title || ''), String(args.description || ''), String(args.status || 'active') as 'active' | 'completed' | 'failed', args.reputationChanges as unknown as Array<{ faction: string; delta: number }>); break;
        case 'log_lore':
          res = await this.content.log_lore(String(args.title || ''), String(args.content || ''), String(args.category || 'History')); break;
        case 'make_save':
          res = await this.combat.make_save(String(args.targetId || ''), String(args.stat || 'dex'), Number(args.dc ?? 10)); break;
        case 'roll_death_save':
          res = await this.combat.roll_death_save(String(args.targetId || '')); break;
        case 'award_experience':
          res = await this.progression.awardExperience(Number(args.amount ?? 0), args.targetId as string); break;
        case 'level_up':
          res = this.progression.allocateStatPoints((args.stats || {}) as unknown as Partial<Record<keyof Character['stats'], number>>, args.targetId as string, (args.skills || {}) as Record<string, number>, Number(args.hpDeviation ?? 0)); break;
        case 'long_rest':
          res = await this.travel.long_rest(args.narration as string | undefined, args.autoAdvanceTime as boolean | undefined); break;
        case 'short_rest':
          res = await this.travel.short_rest(args.targetId as string | undefined, args.narration as string | undefined, args.autoAdvanceTime as boolean | undefined); break;
        case 'cast_spell': {
          let targetsList = (args.targets as string[]) || [];
          if (targetsList.length === 0 && (args.targetId || args.target_name)) {
            targetsList = [String(args.targetId || args.target_name)];
          }
          res = await this.spells.cast_spell(String(args.characterId || args.casterId || ''), String(args.spellId || ''), Number(args.slotLevel ?? 0), targetsList, args.targetSaveResults as Record<string, boolean> | undefined, args.reaction as boolean | undefined); break;
        }
        case 'spell_effect':
          res = await this.spells.spell_effect(String(args.mode || 'counter') as 'counter' | 'dispel', String(args.casterId || ''), Number(args.targetSpellLevel ?? 3), args.targetId as string); break;
        case 'manage_spellbook':
          res = await this.spells.manage_spellbook(String(args.characterId || args.targetId || ''), String(args.action || 'learn') as 'learn' | 'prepare' | 'unprepare' | 'forget', String(args.spellId || '')); break;
        case 'use_resource':
          res = await this.spells.use_resource(String(args.characterId || args.targetId || ''), String(args.resourceId || ''), args.targetId as string, args.amount as number); break;
        case 'summon_creature':
          res = await this.summon_creature(String(args.casterId || ''), String(args.creatureName || args.template || ''), Number(args.count ?? 1)); break;
        case 'teleport_creature':
          res = await this.teleport_creature(String(args.characterId || args.targetId || ''), String(args.destination || ''), Number(args.range ?? 30)); break;
        case 'polymorph_creature':
          res = await this.polymorph_creature(String(args.characterId || args.targetId || ''), String(args.newForm || args.beastForm || 'wolf'), Number(args.duration ?? 60)); break;
        case 'cast_ritual':
          res = await this.spells.cast_ritual(String(args.characterId || args.casterId || ''), String(args.spellId || '')); break;
        case 'narrate_turn':
          if (Array.isArray(args.suggestions)) {
            this.state.lastSuggestions = args.suggestions
              .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
              .map(s => s.slice(0, 80))
              .slice(0, 3);
            if (isDebugMode) console.log(`[narrate_turn] Stored ${this.state.lastSuggestions.length} suggestions on state:`, this.state.lastSuggestions);
          } else if (isDebugMode) {
            console.log('[narrate_turn] No suggestions in args');
          }
          res = await this.travel.narrate_turn(String(args.narration || ''), Number(args.timePassed ?? 0)); break;
        default:
          res = fail(`Unknown tool: ${name}`);
      }
      if (isDebugMode) {
        console.log(`[executeToolCall] Outcome of ${name}:`, res);
      }
      return res;
    } catch (e: unknown) {
      const errRes = fail(`Error: ${(e as Error).message || String(e)}`);
      if (isDebugMode) {
        console.error(`[executeToolCall] Failed to execute ${name}:`, e);
      }
      return errRes;
    }
  }
}

let _mcpServer: MockMCPServer | undefined;
/** Returns the singleton MockMCPServer instance, creating it on first call. */
export function getMcpServer(): MockMCPServer {
  if (!_mcpServer) _mcpServer = new MockMCPServer();
  return _mcpServer;
}
/** Proxy that lazily initialises the MCP server on first property access and binds method calls to the instance. */
export const mcpServer = new Proxy({} as MockMCPServer, {
  get(_, prop) {
    if (typeof prop === 'string' && (prop === 'then' || prop === 'catch' || prop === 'finally')) return undefined;
    const instance = getMcpServer();
    const value = (instance as unknown as Record<string, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
  set(_, prop, value) {
    const instance = getMcpServer();
    (instance as unknown as Record<string, unknown>)[prop] = value;
    return true;
  },
});
