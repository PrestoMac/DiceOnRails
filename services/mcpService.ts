import { GameState, MCPResponse, Character, Message, EnemyAttack, InventoryItem, Currency, Enemy, InitiativeEntry, LocationSignificance, QuestDifficulty } from '../types';
import { initBattleMap, placeToken, moveToken as gridMoveToken, markTokenDead, autoPlaceParty, autoPlaceEnemies, distanceCells } from './gridService';
import { isDebugMode } from '../utils/debug';
import { cryptoRoll } from '../utils/random';
import { sanitizeNarration } from '../utils/textSanitize';
import { supabase } from './supabaseClient';
import { lookupSRDItem } from '../utils/srdItems';
import { generateId, fail } from './mcp/_shared';
import { createPartyService, PartyService } from './mcp/partyService';
import { createInventoryService, InventoryService } from './mcp/inventoryService';
import { createCombatService, CombatService, generateUniqueEnemyName } from './mcp/combatService';
import { createSpellcastingService, SpellcastingService } from './mcp/spellcastingService';
import { createProgressionService, ProgressionService } from './mcp/progressionService';
import { createStateService, StateService } from './mcp/stateService';
import { createContentService, ContentService } from './mcp/contentService';
import { createTravelService, TravelService, validateTravelTimeAdvance } from './mcp/travelService';
import { getClassDef, calculateSpeed } from './classEngine';

export { generateId };

/**
 * Actor-bearing tools and the argument key(s) that identify the acting/affected
 * character. Used by the multiplayer attribution nudge: when the party has more
 * than one member and the LLM omits every listed key, the action silently
 * defaults to party[0] (a mis-attribution). We stamp an in-band warning onto the
 * tool result message so the model self-corrects on subsequent calls. This NEVER
 * changes success/failure — it only appends text the LLM sees via formatToolResult.
 *
 * `long_rest` is excluded (party-wide by design). XP tools are engine-driven (no LLM call).
 */
const ACTOR_ID_ARGS: Record<string, string[]> = {
  player_attack: ['attackerId'],
  cast_spell: ['characterId', 'casterId'],
  check_skill: ['targetId'],
  make_save: ['targetId'],
  roll_death_save: ['targetId'],
  use_resource: ['characterId', 'targetId'],
  update_inventory: ['targetId'],
  adjust_currency: ['targetId'],
  short_rest: ['targetId'],
  manage_spellbook: ['characterId', 'targetId'],
  level_up: ['targetId'],
};

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
      make_save: (targetId, stat, dc, spellContext) => this.combat.make_save(targetId, stat, dc, spellContext),
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

  /** Patches arbitrary fields on a character (e.g. notes/gmNotes) by id. Mirrors the
   *  direct-update pattern used for inventory/currency. Used only by the UI sheet,
   *  never by the LLM tool path. No-op if the target is not found. */
  public updateCharacterFieldsDirectly(partial: Partial<Character>, targetId?: string) {
    const target = this.party.getTarget(targetId);
    if (target) Object.assign(target, partial);
  }
  public async inflict_damage(amount: number, targetId?: string, damageType?: string): Promise<MCPResponse> { return this.inventory.inflict_damage(amount, targetId, damageType); }
  public async update_inventory(item_name: string, action: 'add' | 'remove' | 'edit', quantity?: number, new_name?: string, targetId?: string, type?: InventoryItem['type'], rarity?: InventoryItem['rarity'], description?: string, stats?: InventoryItem['stats'], equipped?: boolean, cost_gp?: number, cost_sp?: number, cost_cp?: number, autoDeductMarketPrice?: boolean, craft?: boolean): Promise<MCPResponse> { return this.inventory.update_inventory(item_name, action, quantity, new_name, targetId, type, rarity, description, stats, equipped, cost_gp, cost_sp, cost_cp, autoDeductMarketPrice, craft); }
  public async adjust_currency(gp?: number, sp?: number, cp?: number, targetId?: string): Promise<MCPResponse> { return this.inventory.adjust_currency(gp, sp, cp, targetId); }


  public get lastCurrencyAdjustment() { return this.inventory.getLastCurrencyAdjustment(); }


  public loadState(savedState: GameState) { this.stateManager.loadState(savedState); }
  public reset() { this.stateManager.reset(); this.inventory.clearCurrencyAdjustment(); }
  public getFullState(): GameState { return this.stateManager.getFullState(); }
  public setLastSuggestions(suggestions: string[]): void { this.state.lastSuggestions = suggestions; }
  /**
   * Writes the per-character suggestion map (new source of truth). Replaces the
   * entire map — pass `{}` to clear. Solo stores a single entry under the lone
   * character's id; multiplayer stores one entry per party member.
   */
  public setLastSuggestionsByCharacter(map: Record<string, string[]>): void { this.state.lastSuggestionsByCharacter = map; }
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


  public async level_up(targetId: string, statAllocations?: Record<string, number>, subclassSelection?: string, chosenFeats?: string[]): Promise<MCPResponse> { return this.progression.level_up(targetId, statAllocations, subclassSelection, chosenFeats); }
  public allocateStatPoints(allocations: Partial<Record<keyof Character['stats'], number>>, targetId?: string, skillAllocations?: Record<string, number>, hpDeviation?: number): MCPResponse { return this.progression.allocateStatPoints(allocations, targetId, skillAllocations, hpDeviation); }
  public getCharacterProgression(targetId?: string): string { return this.progression.getCharacterProgression(targetId); }


  public async add_enemy(name: string, ac?: number, hp?: number, attacks?: EnemyAttack[], cr?: number, xp?: number, size?: string, type?: string, damageResistances?: string[], damageImmunities?: string[], damageVulnerabilities?: string[]): Promise<MCPResponse> { return this.combat.add_enemy(name, ac, hp, attacks, cr, xp, size, type, damageResistances, damageImmunities, damageVulnerabilities); }
  public async start_combat(targetId?: string, enemies?: Array<{ name: string; ac?: number; hp?: number; cr?: number; xp?: number; size?: string; type?: string; }>): Promise<MCPResponse> { return this.combat.start_combat(targetId, enemies); }
  public async next_turn(autoResolveEnemies?: boolean): Promise<MCPResponse> { return this.combat.next_turn(autoResolveEnemies); }
  public async end_combat(): Promise<MCPResponse> { return this.combat.end_combat(); }
  public async enemy_attack(enemyId: string, targetId?: string, attackIndex?: number): Promise<MCPResponse> { return this.combat.enemy_attack(enemyId, targetId, attackIndex); }
  public async make_save(targetId: string, stat: string, dc: number, spellContext?: { isMagical?: boolean; isCharm?: boolean }): Promise<MCPResponse> { return this.combat.make_save(targetId, stat, dc, spellContext); }
  public async roll_death_save(targetId?: string): Promise<MCPResponse> { return this.combat.roll_death_save(targetId); }
  public getCurrentTurnInfo(): { name: string; type: 'player' | 'enemy'; id: string } | null { return this.combat.getCurrentTurnInfo(); }
  public updateInitiativeDeathStatus(id: string, isDead: boolean): void { this.combat.updateInitiativeDeathStatus(id, isDead); }
  public checkCombatEndConditions(): { ended: boolean; reason?: string; victory?: boolean } { return this.combat.checkCombatEndConditions(); }
  public async player_attack(attackerId: string, weaponName: string, targetId: string, isOffHand?: boolean, isSneakAttack?: boolean, sharpshooter?: boolean, greatWeaponMaster?: boolean, divineSmite?: { slotLevel: number }): Promise<MCPResponse> { return this.combat.player_attack(attackerId, weaponName, targetId, isOffHand, isSneakAttack, sharpshooter, greatWeaponMaster, divineSmite); }
  public async resolveEnemyTurn(): Promise<MCPResponse> { return this.combat.resolveEnemyTurn(); }
  public async resolveAllPendingEnemyTurns(): Promise<{ messages: string[]; combatEnded: boolean; victory?: boolean; attackResults: Record<string, unknown>[] }> { return this.combat.resolveAllPendingEnemyTurns(); }
  public syncInitiativeConditions(): void { this.combat.syncInitiativeConditions(); }
  public initializeDeathSaves(character: Character) { this.combat.initializeDeathSaves(character); }


  public async upsert_quest(title: string, description: string, status: 'active' | 'completed' | 'failed', difficulty?: QuestDifficulty, reputationChanges?: Array<{ faction: string; delta: number }>): Promise<MCPResponse> { return this.content.upsert_quest(title, description, status, difficulty, reputationChanges); }
  public async log_lore(title: string, content: string, category: string): Promise<MCPResponse> { return this.content.log_lore(title, content, category); }


  public async move_to(location_name: string, description?: string, targetId?: string, skillCheck?: { skill_name?: string; difficulty?: number; onSuccess?: unknown }, significance?: LocationSignificance): Promise<MCPResponse> { return this.travel.move_to(location_name, description, targetId, skillCheck, significance); }
  public async narrate_turn(narration: string, timePassed?: number, xp?: number, roleplay?: 'dialogue' | 'creative'): Promise<MCPResponse> { return this.travel.narrate_turn(narration, timePassed, xp, roleplay); }
  public setAtmosphere(url: string) { this.travel.setAtmosphere(url); }
  public setStartingLocation(location: { name: string; description: string; introHook?: string; atmosphereUrl?: string }) { this.travel.setStartingLocation(location); }
  public cacheLocationImage(name: string, url: string) { this.travel.cacheLocationImage(name, url); }
  public getCachedLocationImage(name: string): string | undefined { return this.travel.getCachedLocationImage(name); }
  public async roll_dice(sides: number, count?: number, modifier?: number, target_ac?: number, target_name?: string, roll_label?: string, isDamageRoll?: boolean, isOffHand?: boolean, weaponName?: string, attackerId?: string): Promise<MCPResponse> { return this.travel.roll_dice(sides, count, modifier, target_ac, target_name, roll_label, isDamageRoll, isOffHand, weaponName, attackerId); }
  public async check_skill(skill_name: string, difficulty: number, targetId?: string, onSuccess?: Record<string, unknown>): Promise<MCPResponse> { return this.travel.check_skill(skill_name, difficulty, targetId, onSuccess); }
  public async long_rest(narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse> { return this.travel.long_rest(narration, autoAdvanceTime); }
  public async short_rest(targetId?: string, narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse> { return this.travel.short_rest(targetId, narration, autoAdvanceTime); }
  public async arcane_recovery(characterId: string, selections: Array<{ level: number; count: number }>): Promise<MCPResponse> { return this.travel.arcane_recovery(characterId, selections); }
  public async natural_recovery(characterId: string, selections: Array<{ level: number; count: number }>): Promise<MCPResponse> { return this.travel.natural_recovery(characterId, selections); }


  public async cast_spell(characterId: string, spellId: string, slotLevel?: number, targets?: string[], targetSaveResults?: Record<string, boolean>, reaction?: boolean): Promise<MCPResponse> { return this.spells.cast_spell(characterId, spellId, slotLevel, targets, targetSaveResults, reaction); }
  public async resolve_dot_damage(spellId: string, targetId: string, casterId?: string): Promise<MCPResponse> { return this.spells.resolve_dot_damage(spellId, targetId, casterId); }
  public async cast_ritual(characterId: string, spellId: string): Promise<MCPResponse> { return this.spells.cast_ritual(characterId, spellId); }
  public async spell_effect(mode: 'counter' | 'dispel', casterId: string, targetSpellLevel: number, targetId?: string): Promise<MCPResponse> { return this.spells.spell_effect(mode, casterId, targetSpellLevel, targetId); }
  public async manage_spellbook(characterId: string, action: 'learn' | 'prepare' | 'unprepare' | 'forget' | 'finish_prep', spellId: string): Promise<MCPResponse> { return this.spells.manage_spellbook(characterId, action, spellId); }

  public async swap_known_spell(characterId: string, oldSpellId: string, newSpellId: string): Promise<MCPResponse> { return this.spells.swap_known_spell(characterId, oldSpellId, newSpellId); }
  public async use_resource(characterId: string, resourceId: string, targetId?: string, amount?: number): Promise<MCPResponse> { return this.spells.use_resource(characterId, resourceId, targetId, amount); }

  // ---------------------------------------------------------------------------
  // VTT Battle Map — public surface for UI-driven operations
  // ---------------------------------------------------------------------------

  /** Removes the active battle map entirely (e.g. after combat ends). */
  public clearBattleMap(): void {
    delete (this.state as { battleMap?: unknown }).battleMap;
    delete (this.state as { lastTokenMove?: unknown }).lastTokenMove;
  }

  /** Records the most recent token movement for LLM context injection. */
  public setLastTokenMove(move: { tokenId: string; from: { x: number; y: number }; to: { x: number; y: number } }): void {
    this.state.lastTokenMove = move;
  }

  /** Replaces the full token array on the active battle map (used by UI drag-and-drop). */
  public updateBattleMapTokens(tokens: import('../types/grid').GridToken[]): void {
    if (this.state.battleMap) {
      this.state.battleMap.tokens = tokens;
    }
  }

  /** Places or updates a single token on the battle map (UI convenience). */
  public placeBattleMapToken(token: import('../types/grid').GridToken): void {
    if (this.state.battleMap) {
      this.state.battleMap = placeToken(this.state.battleMap, token);
    }
  }

  /** Marks an enemy token as dead on the map when its HP reaches 0. */
  public markBattleMapTokenDead(id: string): void {
    if (this.state.battleMap) {
      this.state.battleMap = markTokenDead(this.state.battleMap, id);
    }
  }


  public async summon_creature(casterId: string, template: string, count: number = 1): Promise<MCPResponse> {
    const char = this.party.getTarget(casterId);
    if (!char) return fail('Caster not found.');
    const { createSummonedCreature } = await import('./summoningEngine');
    const summoned: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      const creature = createSummonedCreature(template, char.id, char.level);
      if (!creature) return fail(`Unknown creature template: ${template}`);
      const enemy: Enemy = {
        id: creature.id, name: generateUniqueEnemyName(creature.name, this.state.combat?.enemies ?? []), ac: creature.ac,
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
    const { BEAST_FORMS, applyPolymorph, applyWildShape } = await import('./transformationEngine');
    const beast = BEAST_FORMS[beastFormName.toLowerCase()];
    if (!beast) return fail(`Unknown beast form: ${beastFormName}.`);
    const classDef = getClassDef(char.class);

    const isDruid = char.class === 'druid';
    if (isDruid) {
      const druidLevel = char.level;
      const maxCR = Math.max(0.25, Math.floor(druidLevel / 3));
      const crValue = beast.cr ?? 0;
      if (crValue > maxCR) {
        return fail(`Cannot wild shape into ${beast.name} (CR ${crValue}) - max CR for Druid level ${druidLevel} is ${maxCR}.`);
      }
      if (beast.beastFields?.fly && druidLevel < 8) {
        return fail(`Cannot wild shape into a flying beast at Druid level ${druidLevel} — requires level 8.`);
      }
      if (beast.beastFields?.swim && druidLevel < 4) {
        return fail(`Cannot wild shape into a swimming beast at Druid level ${druidLevel} — requires level 4.`);
      }
      const wsResource = (char.resources || []).find(r => r.id === 'wild-shape');
      if (!wsResource || wsResource.current < 1) {
        return fail(`No wild shape charges remaining (${wsResource?.current ?? 0}/${wsResource?.max ?? 2}).`);
      }
      wsResource.current -= 1;
      const transformation = applyWildShape(char, beast, Math.max(30, (druidLevel / 2) * 60));
      if (!char.runtime) char.runtime = {};
      char.runtime.transformationState = transformation;
      char.hp.max = beast.hp.max;
      char.hp.current = beast.hp.max;
      this.state.sessionLogs.push(`${char.name} uses Wild Shape to become a ${beast.name}!`);
      return {
        success: true,
        data: { character: char.name, transformedInto: beast.name, newHp: beast.hp, newAc: beast.ac, attacks: beast.attacks, chargesRemaining: wsResource },
        message: `${char.name} wild shapes into a ${beast.name}! HP: ${beast.hp}, AC: ${beast.ac}. Wild shape charges remaining: ${wsResource.current}/${wsResource.max}.`
      };
    }

    if (classDef?.spellcasting && beast.cr && beast.cr > char.level) {
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

  /**
   * Finalizes a turn by advancing game time + appending narration, collapsing an
   * action+narrate_turn pair into a single tool call. Deterministic tools pass
   * `narration`/`timePassed`; binary dice tools pass `narrationOnSuccess`/
   * `narrationOnFailure` and the engine selects the branch from the result's own
   * roll outcome (zero-hallucination). Only honored OUT of combat. No-op otherwise.
   *
   * When `deferFinalize` is true the finalize is skipped entirely — the tool
   * executes mechanically only (roll, damage, location change, etc.) with no
   * per-tool narration, time advance, condition tick, or roleplay XP. This is
   * used by the agent loop's multi-action synthesis path: when 2+ action tools
   * in one LLM response each carry inline-finalize args, deferring prevents
   * gameTime stacking and narration loss. A single synthesizing narrate_turn
   * (either explicit in the same batch, or elicited on the next iteration)
   * then advances time/ticks conditions/awards XP from the full result context.
   */
  private async maybeFinalizeTurn(args: Record<string, unknown>, baseResult: MCPResponse, deferFinalize?: boolean): Promise<MCPResponse> {
    if (deferFinalize || this.state.combat?.isActive) return baseResult;

    const hasInlineNarration = typeof args.narration === 'string' && (args.narration as string).trim() !== '';
    const hasTimePassed = args.timePassed !== undefined && args.timePassed !== null;
    const hasBranches = typeof args.narrationOnSuccess === 'string' || typeof args.narrationOnFailure === 'string';

    if (!hasInlineNarration && !hasTimePassed && !hasBranches) return baseResult;

    let narrationText = '';
    if (hasBranches) {
      const success = Boolean((baseResult.data as Record<string, unknown> | undefined)?.success);
      narrationText = success
        ? String(args.narrationOnSuccess ?? '')
        : String(args.narrationOnFailure ?? '');
    } else {
      narrationText = String(args.narration ?? '');
    }
    narrationText = sanitizeNarration(narrationText);

    const timePassed = Number(args.timePassed ?? 0) || 0;
    if (!narrationText.trim() && timePassed === 0) return baseResult;

    const xp = typeof args.xp === 'number' ? (args.xp as number) : undefined;
    const roleplay = args.roleplay === 'dialogue' || args.roleplay === 'creative' ? args.roleplay : undefined;
    const narrateResult = await this.travel.narrate_turn(narrationText, timePassed, xp, roleplay);
    if (isDebugMode) console.log(`[maybeFinalizeTurn] finalized turn: timePassed=${timePassed}, branch=${hasBranches}, gameTime=${this.state.gameTime}`);
    // IMPORTANT: the narration prose must NOT be appended to `message` — the tool result
    // becomes a visible [System:<tool>] chat log, which would duplicate the narration bubble.
    // Narration lives ONLY in data.narration (the agent loop routes it to inlineNarration).
    // Time-advancement logs (exhaustion, condition expiry, etc.) ARE surfaced here.
    const narrData = narrateResult.data as { logs?: unknown } | undefined;
    const timeLogs = Array.isArray(narrData?.logs) ? narrData.logs as string[] : [];
    return {
      success: baseResult.success,
      data: { ...baseResult.data, narration: narrationText, timeResult: narrateResult.data, timePassed },
      message: timeLogs.length > 0 ? baseResult.message + '\n' + timeLogs.join('\n') : baseResult.message,
    };
  }


  /**
   * Routes an LLM tool call by name to the appropriate sub-service, dispatching across 29 cases (28 tools + unknown default).
   * The optional `options.deferFinalize` flag skips inline-turn finalization on action tools — used by the
   * agent loop's multi-action synthesis path so that 2+ parallel finalizing tools don't each stack gameTime
   * or clobber each other's narration. A single synthesizing narrate_turn handles time/conditions/XP instead.
   */
  public async executeToolCall(name: string, args: Record<string, unknown>, options?: { deferFinalize?: boolean }): Promise<MCPResponse> {
    if (isDebugMode) {
      console.log(`[executeToolCall] Executing: ${name} with args:`, args);
    }
    try {
      if (!options?.deferFinalize && !this.state.combat?.isActive && typeof args.timePassed === 'number' && args.timePassed > 0) {
        const validation = validateTravelTimeAdvance(name, args.timePassed);
        if (!validation.ok) {
          return { success: false, data: {}, message: validation.message };
        }
      }
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
          res = await this.combat.player_attack(String(args.attackerId || ''), String(args.weaponName || ''), String(args.targetId || args.target_name || args.target || ''), args.isOffHand as boolean | undefined, args.isSneakAttack as boolean | undefined, args.sharpshooter as boolean | undefined, args.greatWeaponMaster as boolean | undefined, args.divineSmite as { slotLevel: number } | undefined); break;
        case 'move_to': {
          res = await this.travel.move_to(String(args.location_name || 'Unknown'), String(args.description || ''), args.targetId as string | undefined, args.skillCheck as unknown as { skill_name?: string; difficulty?: number; onSuccess?: unknown }, args.significance as LocationSignificance | undefined);
          res = await this.maybeFinalizeTurn(args, res, options?.deferFinalize);
          break;
        }
        case 'check_skill':
          res = await this.maybeFinalizeTurn(args, await this.travel.check_skill(String(args.skill_name || ''), Number(args.difficulty ?? 10), args.targetId as string, args.onSuccess as Record<string, unknown>), options?.deferFinalize); break;
        case 'inflict_damage':
          res = await this.inventory.inflict_damage(Number(args.amount ?? 0), (args.targetId || args.target_name) as string, args.damageType as string); break;
        case 'adjust_currency':
          res = await this.maybeFinalizeTurn(args, await this.inventory.adjust_currency(Number(args.gp ?? 0), Number(args.sp ?? 0), Number(args.cp ?? 0), args.targetId as string), options?.deferFinalize); break;
        case 'update_inventory': {
          const batchItems = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
          if (batchItems.length > 0) {
            const msgs: string[] = [];
            let anyFail = false;
            for (const it of batchItems) {
              const r = await this.inventory.update_inventory(
                String(it.item_name || ''), String(it.action || 'add') as 'add' | 'remove' | 'edit',
                Number(it.quantity ?? 1), undefined, args.targetId as string,
                it.type as unknown as InventoryItem['type'], it.rarity as unknown as InventoryItem['rarity'],
                it.description as string, it.stats as unknown as InventoryItem['stats'], undefined,
                undefined, undefined, undefined, undefined, undefined);
              msgs.push(r.message);
              if (!r.success) anyFail = true;
            }
            res = await this.maybeFinalizeTurn(args, { success: !anyFail, data: { batch: batchItems.length, character: args.targetId }, message: msgs.join('\n') }, options?.deferFinalize);
          } else {
            res = await this.maybeFinalizeTurn(args, await this.inventory.update_inventory(String(args.item_name || ''), String(args.action || 'add') as 'add' | 'remove' | 'edit', Number(args.quantity ?? 1), args.new_name as string | undefined, args.targetId as string, args.type as unknown as InventoryItem['type'], args.rarity as unknown as InventoryItem['rarity'], args.description as string, args.stats as unknown as InventoryItem['stats'], args.equipped as boolean, args.cost_gp as number | undefined, args.cost_sp as number | undefined, args.cost_cp as number | undefined, args.autoDeductMarketPrice as boolean | undefined, args.craft as boolean | undefined), options?.deferFinalize);
          }
          break;
        }
        case 'upsert_quest':
          res = await this.maybeFinalizeTurn(args, await this.content.upsert_quest(String(args.title || ''), String(args.description || ''), String(args.status || 'active') as 'active' | 'completed' | 'failed', args.difficulty as QuestDifficulty | undefined, args.reputationChanges as unknown as Array<{ faction: string; delta: number }>), options?.deferFinalize); break;
        case 'log_lore':
          res = await this.maybeFinalizeTurn(args, await this.content.log_lore(String(args.title || ''), String(args.content || ''), String(args.category || 'History')), options?.deferFinalize); break;
        case 'make_save':
          res = await this.maybeFinalizeTurn(args, await this.combat.make_save(String(args.targetId || ''), String(args.stat || 'dex'), Number(args.dc ?? 10)), options?.deferFinalize); break;
        case 'roll_death_save':
          res = await this.combat.roll_death_save(String(args.targetId || '')); break;
        case 'level_up': {
          const baseRes = this.progression.allocateStatPoints((args.stats || {}) as unknown as Partial<Record<keyof Character['stats'], number>>, args.targetId as string, (args.skills || {}) as Record<string, number>, Number(args.hpDeviation ?? 0));
          if (!baseRes.success) { res = baseRes; break; }
          const chained: string[] = [];
          const targetIdForSpells = String(args.targetId || '');
          for (const sid of (args.learnSpells as string[] || [])) {
            const r = await this.spells.manage_spellbook(targetIdForSpells, 'learn', String(sid || ''));
            chained.push(r.message);
          }
          for (const sid of (args.prepareSpells as string[] || [])) {
            const r = await this.spells.manage_spellbook(targetIdForSpells, 'prepare', String(sid || ''));
            chained.push(r.message);
          }
          res = chained.length > 0
            ? { success: true, data: { ...baseRes.data, spellsChained: chained.length }, message: baseRes.message + '\n' + chained.join('\n') }
            : baseRes;
          break;
        }
        case 'long_rest':
          res = await this.travel.long_rest(args.narration as string | undefined, args.autoAdvanceTime as boolean | undefined); break;
        case 'short_rest':
          res = await this.travel.short_rest(args.targetId as string | undefined, args.narration as string | undefined, args.autoAdvanceTime as boolean | undefined); break;
        case 'cast_spell': {
          let targetsList = (args.targets as string[]) || [];
          if (targetsList.length === 0 && (args.targetId || args.target_name)) {
            targetsList = [String(args.targetId || args.target_name)];
          }
          res = await this.spells.cast_spell(String(args.characterId || args.casterId || ''), String(args.spellId || ''), Number(args.slotLevel ?? 0), targetsList, args.targetSaveResults as Record<string, boolean> | undefined, args.reaction as boolean | undefined, args.metamagic as { option?: string } | undefined); break;
        }
        case 'spell_effect':
          res = await this.spells.spell_effect(String(args.mode || 'counter') as 'counter' | 'dispel', String(args.casterId || ''), Number(args.targetSpellLevel ?? 3), args.targetId as string); break;
        case 'manage_spellbook':
          res = await this.spells.manage_spellbook(String(args.characterId || args.targetId || ''), String(args.action || 'learn') as 'learn' | 'prepare' | 'unprepare' | 'forget' | 'finish_prep', String(args.spellId || '')); break;

        case 'use_resource':
          res = await this.spells.use_resource(String(args.characterId || args.targetId || ''), String(args.resourceId || ''), args.targetId as string, args.amount as number); break;
        case 'natural_recovery':
          res = await this.natural_recovery(String(args.characterId || ''), Array.isArray(args.selections) ? args.selections as Array<{ level: number; count: number }> : []); break;
        case 'summon_creature':
          res = await this.summon_creature(String(args.casterId || ''), String(args.creatureName || args.template || ''), Number(args.count ?? 1)); break;
        case 'teleport_creature':
          res = await this.teleport_creature(String(args.characterId || args.targetId || ''), String(args.destination || ''), Number(args.range ?? 30)); break;
        case 'polymorph_creature':
          res = await this.polymorph_creature(String(args.characterId || args.targetId || ''), String(args.newForm || args.beastForm || 'wolf'), Number(args.duration ?? 60)); break;
        case 'move_token': {
          // VTT: move a combatant token to a new grid cell.
          const tokenIdRaw = String(args.tokenId || '');
          const targetX = Number(args.x ?? 0);
          const targetY = Number(args.y ?? 0);
          if (!this.state.battleMap) {
            res = { success: false, data: {}, message: 'No active battle map. Call init_battle_map first.' };
          } else {
            // Accept character name or id
            const resolvedToken = this.state.battleMap.tokens.find(
              t => t.id === tokenIdRaw || t.name.toLowerCase() === tokenIdRaw.toLowerCase()
            );
            if (!resolvedToken) {
              res = { success: false, data: {}, message: `Token "${tokenIdRaw}" not found on battle map.` };
            } else {
              // Capture from-position before mutating
              const fromPos = { ...resolvedToken.pos };
              // Movement validation: warn if the move exceeds the creature's speed.
              const dist = distanceCells(resolvedToken.pos, { x: targetX, y: targetY });
              let speed = 30; // default medium creature
              if (resolvedToken.type === 'player') {
                const char = this.state.party.find(c => c.id === resolvedToken.id);
                if (char) speed = calculateSpeed(char);
              }
              const maxCells = Math.max(1, Math.round(speed / 5));
              let moveMsg = `${resolvedToken.name} moved to (${targetX}, ${targetY}) on the battle map.`;
              if (dist > maxCells) {
                moveMsg += ` WARNING: Movement of ${dist} cells exceeds ${resolvedToken.name}'s speed (${speed} ft = ${maxCells} cells).`;
              }
              this.state.battleMap = gridMoveToken(this.state.battleMap, resolvedToken.id, { x: targetX, y: targetY });
              const moved = this.state.battleMap.tokens.find(t => t.id === resolvedToken.id);
              res = {
                success: true,
                data: { tokenId: resolvedToken.id, name: resolvedToken.name, x: moved?.pos.x, y: moved?.pos.y },
                message: moveMsg,
              };
              // Record movement for LLM context (persists until next move or combat end)
              this.state.lastTokenMove = {
                tokenId: resolvedToken.id,
                from: fromPos,
                to: { x: targetX, y: targetY },
              };
            }
          }
          break;
        }
        case 'init_battle_map': {
          // VTT: initialise a battle map and auto-place all combatants.
          const mapWidth  = Math.min(40, Math.max(5, Number(args.width  ?? 20)));
          const mapHeight = Math.min(30, Math.max(5, Number(args.height ?? 15)));
          const mapLabel  = args.label ? String(args.label) : (this.state.party[0]?.location ?? 'Battle');
          let bmap = initBattleMap(mapWidth, mapHeight, mapLabel);
          // Auto-place party members
          bmap = autoPlaceParty(bmap, this.state.party.map(c => ({ id: c.id, name: c.name })));
          // Auto-place enemies if combat is active
          if (this.state.combat?.enemies) {
            bmap = autoPlaceEnemies(bmap, this.state.combat.enemies.filter(e => !e.isDead).map(e => ({ id: e.id, name: e.name })));
          }
          this.state.battleMap = bmap;
          res = {
            success: true,
            data: { width: mapWidth, height: mapHeight, label: mapLabel, tokenCount: bmap.tokens.length },
            message: `Battle map "${mapLabel}" initialised (${mapWidth}×${mapHeight}). ${bmap.tokens.length} tokens placed.`,
          };
          break;
        }
        case 'cast_ritual': {
          const ritualRes = await this.spells.cast_ritual(String(args.characterId || args.casterId || ''), String(args.spellId || ''));
          if (!this.state.combat?.isActive && ritualRes.success) {
            const rawRitualNarration = typeof args.narration === 'string' && (args.narration as string).trim()
              ? (args.narration as string)
              : `${String(args.characterId || args.casterId || 'The caster')} completes the ${String(args.spellId || '')} ritual.`;
            const ritualNarration = sanitizeNarration(rawRitualNarration) || rawRitualNarration;
            const ritualTime = await this.travel.narrate_turn(ritualNarration, 10);
            const ritualData = ritualTime.data as { logs?: unknown } | undefined;
            const ritualLogs = Array.isArray(ritualData?.logs) ? ritualData.logs as string[] : [];
            res = { success: true, data: { ...ritualRes.data, ...ritualTime.data, narration: ritualNarration, timeResult: ritualTime.data, timePassed: 10 }, message: ritualLogs.length > 0 ? ritualRes.message + '\n' + ritualLogs.join('\n') : ritualRes.message };
          } else {
            res = ritualRes;
          }
          break;
        }
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
          // Multiplayer per-character suggestions: if the LLM provided a
          // suggestionsByCharacter map, store it as the source of truth. Solo
          // never sends this field; the flat `suggestions` above is used.
          if (args.suggestionsByCharacter && typeof args.suggestionsByCharacter === 'object' && !Array.isArray(args.suggestionsByCharacter)) {
            const map: Record<string, string[]> = {};
            for (const [k, v] of Object.entries(args.suggestionsByCharacter as Record<string, unknown>)) {
              if (Array.isArray(v)) {
                const cleaned = v
                  .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                  .map(s => s.slice(0, 80))
                  .slice(0, 3);
                if (cleaned.length > 0) map[k] = cleaned;
              }
            }
            if (Object.keys(map).length > 0) {
              this.state.lastSuggestionsByCharacter = map;
              if (isDebugMode) console.log(`[narrate_turn] Stored per-character suggestions for ${Object.keys(map).length} characters`);
            }
          }
          res = await this.travel.narrate_turn(sanitizeNarration(String(args.narration || '')), Number(args.timePassed ?? 0), args.xp as number | undefined, args.roleplay as 'dialogue' | 'creative' | undefined); break;
        default:
          res = fail(`Unknown tool: ${name}`);
      }
      if (isDebugMode) {
        console.log(`[executeToolCall] Outcome of ${name}:`, res);
      }
      // Multiplayer attribution nudge (issue: silent party[0] default). When the
      // party has 2+ members and an actor tool was called with no actor id, the
      // action silently applied to the first party member. Stamp an in-band
      // warning onto the result message so the LLM self-corrects. No-op in solo
      // (party.length === 1) and never alters success/failure.
      const actorKeys = ACTOR_ID_ARGS[name];
      if (actorKeys && this.state.party.length > 1 && res.success) {
        const hasActor = actorKeys.some(k => {
          const v = args[k];
          return typeof v === 'string' && v.trim() !== '';
        });
        if (!hasActor && this.state.party[0]) {
          const warn = ` | WARNING: no actor id was provided, so this was applied to ${this.state.party[0].name} (the first party member). In a party, ALWAYS pass the correct ${actorKeys.join('/')} (character name or id) so the action is attributed to the right character.`;
          res = { ...res, message: res.message + warn };
        }
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
