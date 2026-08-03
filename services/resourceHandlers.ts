import { GameState, MCPResponse } from '../types';
import { cryptoRoll } from '../utils/random';
import { getMod, getProficiencyBonus } from './classEngine';
import { fail, fuzzyMatchEntity } from './mcp/_shared';
import { parseDiceFormula } from '../utils/dice';
import { rollDice } from './diceEngine';
import { breakConcentration as engineBreakConcentration } from './spellcastingEngine';
import type { SpellcastingDeps } from './mcp/spellcastingService';
import { applyCondition } from './conditionEngine';

export interface ResourceHandlerContext {
  state: GameState;
  deps: SpellcastingDeps;
}

export type ResourceHandler = (
  ctx: ResourceHandlerContext,
  characterId: string,
  targetId?: string,
  amount?: number
) => Promise<MCPResponse>;

export const RESOURCE_HANDLERS: Record<string, ResourceHandler> = {
  'second-wind': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    const heal = cryptoRoll(10) + char.level;
    char.hp.current = Math.min(char.hp.max, char.hp.current + heal);
    return { success: true, data: { healed: heal }, message: `Second Wind restored ${heal} HP.` };
  },

  rage: async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    engineBreakConcentration(char, 'incapacitated');
    char.raging = true;
    const rageBonus = char.level >= 16 ? 4 : char.level >= 9 ? 3 : 2;
    return { success: true, data: { raging: true, rageBonus }, message: `Entered rage. +${rageBonus} melee damage, resistance to B/P/S, advantage on STR checks/saves. While raging you can't cast or concentrate on spells.` };
  },

  'lay-on-hands-pool': async (ctx, characterId, targetId, amount) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (!targetId || !amount) return fail('Lay on Hands requires a targetId and amount.');
    const target = ctx.deps.getTarget(targetId);
    if (!target) return fail('Target not found.');
    const healed = Math.min(amount, target.hp.max - target.hp.current);
    target.hp.current = Math.min(target.hp.max, target.hp.current + healed);
    return { success: true, data: { healed }, message: `Lay on Hands healed ${healed} HP for ${target.name}.` };
  },

  'breath-weapon': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    const conMod = getMod(char.stats.con);
    const profBonus = getProficiencyBonus(char);
    const dc = 8 + conMod + profBonus;
    const dmgDice = char.level >= 16 ? '5d6' : char.level >= 11 ? '4d6' : char.level >= 6 ? '3d6' : '2d6';
    const parsed = parseDiceFormula(dmgDice);
    const damage = rollDice(parsed.count, parsed.sides);
    const ancestryDmgTypes: Record<string, string> = { black: 'acid', blue: 'lightning', brass: 'fire', bronze: 'lightning', copper: 'acid', gold: 'fire', green: 'poison', red: 'fire', silver: 'cold', white: 'cold' };
    const dmgType = ancestryDmgTypes[char.draconicAncestry || 'red'] || 'fire';
    char.draconicDamageType = dmgType;
    return { success: true, data: { saveDC: dc, damage: { total: damage, type: dmgType } }, message: `Breath weapon used. DEX save DC ${dc}, ${dmgDice} ${dmgType} damage on fail, half on success.` };
  },

  ki: async (ctx, characterId, targetId, _amount) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');

    const normalized = String(targetId || '').toLowerCase().trim().replace(/[_\s]+/g, '-');
    const subAction = ['flurry-of-blows', 'patient-defense', 'step-of-the-wind'].includes(normalized) ? normalized : 'stunning-strike';

    if (subAction === 'flurry-of-blows') {
      return { success: true, data: { flurryOfBlows: true }, message: `${char.name} uses Flurry of Blows (1 Ki)! You can make two unarmed strikes as a bonus action.` };
    }
    if (subAction === 'patient-defense') {
      applyCondition(char, { id: 'dodging', source: char.id, duration: 1 });
      return { success: true, data: { patientDefense: true }, message: `${char.name} uses Patient Defense (1 Ki)! You take the Dodge action as a bonus action (attacks against you have disadvantage).` };
    }
    if (subAction === 'step-of-the-wind') {
      return { success: true, data: { stepOfTheWind: true }, message: `${char.name} uses Step of the Wind (1 Ki)! You take the Dash or Disengage action as a bonus action, and your jump distance is doubled.` };
    }

    if (!targetId) return fail('Stunning Strike requires a targetId.');
    const enemy = ctx.state.combat?.enemies?.find(e => fuzzyMatchEntity(e, targetId));
    if (!enemy) return fail(`Target "${targetId}" not found in combat.`);
    if (enemy.isDead) return fail(`${enemy.name} is already defeated.`);
    const wisMod = getMod(char.stats.wis);
    const profBonus = getProficiencyBonus(char);
    const dc = 8 + profBonus + wisMod;
    const saveResult = await ctx.deps.make_save(enemy.id, 'con', dc);
    const saved = saveResult.data && typeof saveResult.data === 'object' ? (saveResult.data as Record<string, unknown>).success === true : true;
    if (saved) {
      return { success: true, data: { stunned: false, dc }, message: `${enemy.name} made the CON save (DC ${dc}) and resisted Stunning Strike.` };
    }
    applyCondition(enemy, { id: 'stunning-strike-' + Date.now(), source: char.id, duration: 1 });
    return { success: true, data: { stunned: true, dc }, message: `${enemy.name} failed the CON save (DC ${dc}) and is STUNNED until the end of your next turn.` };
  },

  'bardic-inspiration': async (ctx, characterId, targetId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (!targetId) return fail('Bardic Inspiration requires a targetId.');
    const target = ctx.deps.getTarget(targetId);
    if (!target) return fail('Target not found.');
    const dieSize = char.level >= 15 ? 12 : char.level >= 10 ? 10 : char.level >= 5 ? 8 : 6;
    if (!target.inspirationDice) target.inspirationDice = [];
    target.inspirationDice.push({ sourceCharId: char.id, dieSize });
    return { success: true, data: { dieSize, target: target.name }, message: `${char.name} grants a Bardic Inspiration die (d${dieSize}) to ${target.name}.` };
  },

  'channel-divinity': async (ctx, characterId, targetId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (targetId) {
      const enemy = ctx.state.combat?.enemies?.find(e => fuzzyMatchEntity(e, targetId));
      if (!enemy) return fail(`Target "${targetId}" not found in combat.`);
      if (enemy.isDead) return fail(`${enemy.name} is already defeated.`);
      if (enemy.type !== 'undead') return fail(`${enemy.name} is not undead — Turn Undead only affects undead creatures.`);
      const wisMod = getMod(char.stats.wis);
      const profBonus = getProficiencyBonus(char);
      const dc = 8 + profBonus + wisMod;
      const saveResult = await ctx.deps.make_save(enemy.id, 'wis', dc);
      const saved = saveResult.data && typeof saveResult.data === 'object' ? (saveResult.data as Record<string, unknown>).success === false : true;
      if (saved) {
        return { success: true, data: { turned: false, dc }, message: `${enemy.name} made the WIS save (DC ${dc}) and resisted Turn Undead.` };
      }
      applyCondition(enemy, { id: 'turned-' + Date.now(), source: char.id, duration: 10, durationUnit: 'minute' });
      return { success: true, data: { turned: true, dc }, message: `${enemy.name} failed the WIS save (DC ${dc}) and is TURNED for 1 minute or until it takes damage.` };
    }
    const crLimit = char.level >= 17 ? 4 : char.level >= 14 ? 3 : char.level >= 11 ? 2 : char.level >= 8 ? 1 : char.level >= 5 ? 0.5 : 0;
    return { success: true, data: { crLimit }, message: `Channel Divinity: Destroy Undead. CR ≤ ${crLimit} undead within 30 ft are destroyed instantly.` };
  },

  'hellish-rebuke': async (ctx, characterId, targetId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (!targetId) return fail('Hellish Rebuke requires a targetId.');
    const target = ctx.deps.getTarget(targetId);
    const enemy = ctx.state.combat?.enemies?.find(e => fuzzyMatchEntity(e, targetId));
    const actualTarget = target ?? enemy;
    if (!actualTarget) return fail(`Target "${targetId}" not found.`);
    const chaMod = getMod(char.stats.cha);
    const damage = rollDice(3, 10);
    const saveDC = char.level >= 5 ? (8 + getProficiencyBonus(char) + chaMod) : undefined;
    if (saveDC && enemy) {
      await ctx.deps.make_save(enemy.id, 'dex', saveDC);
    }
    const result = await ctx.deps.inflict_damage(damage, actualTarget.id, 'fire', { skipTargetDerivedReductions: true });
    return { success: true, data: { damage, saveDC }, message: `Hellish Rebuke deals ${damage} fire damage to ${actualTarget.name}.${result.message ? ' ' + result.message : ''}` };
  },

  'wild-shape': async (ctx, characterId, _targetId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (char.class !== 'druid') return fail('Only Druids can use Wild Shape.');
    const druidLevel = char.level;
    const maxCR = Math.max(0.25, Math.floor(druidLevel / 3));
    const flyAvailable = druidLevel >= 8;
    const swimAvailable = druidLevel >= 4;
    return {
      success: true,
      data: { ready: true, maxCR, flyAvailable, swimAvailable },
      message: `Wild Shape ready (max CR ${maxCR}, fly: ${flyAvailable ? 'yes' : 'L8+'}, swim: ${swimAvailable ? 'yes' : 'L4+'}). Choose a beast form by calling polymorph_creature with the form name.`
    };
  },

  'sorcery-points': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    return { success: true, data: { ready: true, metamagicOptions: char.metamagicOptions }, message: `Sorcery Points ready. Use the 'metamagic' parameter on cast_spell to apply metamagic.` };
  },

  'action-surge': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    return { success: true, data: { extraAction: true }, message: `${char.name} takes an extra action (Action Surge)! Attack again, cast a second spell, or take another action.` };
  },

  indomitable: async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    return { success: true, data: { rerollSave: true }, message: `${char.name} uses Indomitable! Reroll the most recent failed saving throw.` };
  },

  'divine-sense': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    return { success: true, data: { detectType: ['celestial', 'fiend', 'undead'], range: 60 }, message: `${char.name} uses Divine Sense for 1 minute. Detects celestial, fiend, or undead within 60 ft that are not behind total cover.` };
  },

  /**
   * Info-only handler. Actual slot recovery for Arcane Recovery happens via
   * the dedicated arcane_recovery tool / ArcaneRecoveryModal → travelService.arcane_recovery().
   * This handler is called by use_resource for informational purposes only.
   */
  'arcane-recovery': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (char.class !== 'wizard') return fail('Only Wizards can use Arcane Recovery.');
    const maxLevels = Math.ceil(char.level / 2);
    return { success: true, data: { maxLevels }, message: `Arcane Recovery ready. Choose up to ${maxLevels} combined spell slot levels (max level 5). Use the Arcane Recovery button on the character sheet.` };
  },

  'relentless-endurance': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (char.hp.current > 0) return fail(`${char.name} must be at 0 HP to use Relentless Endurance.`);
    char.hp.current = 1;
    return { success: true, data: { revived: true }, message: `${char.name} endures! Drops to 1 HP instead of 0 HP. Once per long rest.` };
  },

  /**
   * Info-only handler. Actual slot recovery for Natural Recovery happens via
   * the dedicated natural_recovery tool / NaturalRecoveryModal → travelService.natural_recovery().
   * This handler is called by use_resource for informational purposes only.
   */
  'natural-recovery': async (ctx, characterId) => {
    const char = ctx.deps.getTarget(characterId);
    if (!char) return fail('Character not found.');
    if (char.class !== 'druid') return fail('Only Druids can use Natural Recovery.');
    const maxLevels = Math.ceil(char.level / 2);
    return { success: true, data: { maxLevels }, message: `Natural Recovery ready. The druid can recover up to ${maxLevels} combined spell slot levels during a short rest. Use the natural recovery action to select which slots to restore.` };
  },
};
