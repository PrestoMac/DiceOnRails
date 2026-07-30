import { Character, EffectKind } from '../types';
import { getClassDef, getRaceDef, getSubclassDef } from './classEngine';
import { getFeatById } from '../utils/feats';

export type SourceKind = 'race' | 'class' | 'subclass' | 'feat';

export interface EffectSource {
  source: SourceKind;
  payload: Record<string, unknown>;
}

export type HookName =
  | 'computeAc'
  | 'computeSpeed'
  | 'computeMaxHp'
  | 'onAttackRoll'
  | 'onAttackDamage'
  | 'onDamageTaken'
  | 'onSaveRoll'
  | 'onSkillCheck'
  | 'onConditionApplied'
  | 'onLongRest'
  | 'onShortRest'
  | 'onLevelUp'
  | 'onCharacterCreated';

export interface HookContext {
  readonly _hook: HookName;
}

export interface AcContext extends HookContext {
  readonly _hook: 'computeAc';
  baseAc: number;
  character: Character;
  equippedArmor: { name: string; type?: string; stats?: { acFormula?: string } } | null;
  equippedWeaponCount: number;
}

export interface SpeedContext extends HookContext {
  readonly _hook: 'computeSpeed';
  speed: number;
  character: Character;
}

export interface MaxHpContext extends HookContext {
  readonly _hook: 'computeMaxHp';
  hp: number;
  character: Character;
}

export interface AttackRollContext extends HookContext {
  readonly _hook: 'onAttackRoll';
  roll: number;
  character: Character;
  weaponName: string;
  targetId: string;
  isRanged: boolean;
}

export interface AttackDamageContext extends HookContext {
  readonly _hook: 'onAttackDamage';
  damage: number;
  character: Character;
  weaponName: string;
  isCrit: boolean;
  isRanged: boolean;
}

export interface DamageTakenContext extends HookContext {
  readonly _hook: 'onDamageTaken';
  amount: number;
  damageType: string;
  target: Character;
  source?: 'spell' | 'weapon' | 'environment';
}

export interface SaveRollContext extends HookContext {
  readonly _hook: 'onSaveRoll';
  roll: number;
  stat: string;
  character: Character;
  source?: string;
  spellContext?: { spellName?: string; isMagical?: boolean };
  hasAdvantage: boolean;
  extraModifier: number;
}

export interface SkillCheckContext extends HookContext {
  readonly _hook: 'onSkillCheck';
  roll: number;
  skillName: string;
  character: Character;
}

export interface ConditionAppliedContext extends HookContext {
  readonly _hook: 'onConditionApplied';
  condition: string;
  target: Character;
}

export interface RestContext extends HookContext {
  readonly _hook: 'onLongRest' | 'onShortRest';
  character: Character;
}

export interface LevelUpContext extends HookContext {
  readonly _hook: 'onLevelUp';
  character: Character;
  newLevel: number;
}

export interface CharacterCreatedContext extends HookContext {
  readonly _hook: 'onCharacterCreated';
  character: Character;
}

type Reducer<C extends HookContext> = (ctx: C, payload: Record<string, unknown>, character: Character) => C;

interface ReducerEntry {
  kind: EffectKind;
  reduce: Reducer<HookContext>;
}

function matchesType(targetType: string, effectType: string): boolean {
  return targetType.toLowerCase() === effectType.toLowerCase();
}

function getAcFormulaValue(formula: string, character: Character): number {
  const dexMod = character.stats?.dex ? Math.floor((character.stats.dex - 10) / 2) : 0;
  const conMod = character.stats?.con ? Math.floor((character.stats.con - 10) / 2) : 0;
  const wisMod = character.stats?.wis ? Math.floor((character.stats.wis - 10) / 2) : 0;

  const normalized = formula.toUpperCase().replace(/\s+/g, '');
  if (normalized === '10+DEX') return 10 + dexMod;
  if (normalized === '10+DEX+CON') return 10 + dexMod + conMod;
  if (normalized === '10+DEX+WIS') return 10 + dexMod + wisMod;
  if (normalized === '13+DEX') return 13 + dexMod;

  const parts = normalized.split('+');
  let ac = parseInt(parts[0]) || 10;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === 'DEX') ac += dexMod;
    else if (parts[i] === 'CON') ac += conMod;
    else if (parts[i] === 'WIS') ac += wisMod;
  }
  return ac;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HOOK_REGISTRY: Record<HookName, ReducerEntry[]> = {
  computeAc: [
    {
      kind: 'ac-formula',
      reduce: (ctx, payload, character) => {
        const acCtx = ctx as unknown as AcContext;
        const formula = (payload.formula as string) || '';
        const ac = getAcFormulaValue(formula, character);
        if (ac > acCtx.baseAc) {
          acCtx.baseAc = ac;
        }
        return ctx;
      },
    },
    {
      kind: 'dual-wielder-ac',
      reduce: (ctx, payload) => {
        const acCtx = ctx as unknown as AcContext;
        if (acCtx.equippedWeaponCount >= 2) {
          acCtx.baseAc += (payload.bonus as number) || 1;
        }
        return ctx;
      },
    },
  ],
  computeSpeed: [
    {
      kind: 'speed-bonus',
      reduce: (ctx, payload) => {
        const spdCtx = ctx as unknown as SpeedContext;
        spdCtx.speed += (payload.bonus as number) || 0;
        return ctx;
      },
    },
  ],
  computeMaxHp: [
    {
      kind: 'hp-per-level',
      reduce: (ctx, payload, character) => {
        const hpCtx = ctx as unknown as MaxHpContext;
        hpCtx.hp += (payload.amount as number) * character.level;
        return ctx;
      },
    },
  ],
  onAttackRoll: [
    {
      kind: 'reroll-ones',
      reduce: (ctx) => {
        const atkCtx = ctx as unknown as AttackRollContext;
        if (atkCtx.roll === 1) {
          atkCtx.roll = Math.floor(Math.random() * 20) + 1;
        }
        return ctx;
      },
    },
    {
      kind: 'crit-range',
      reduce: (ctx, payload) => {
        const atkCtx = ctx as unknown as AttackRollContext;
        const minCrit = (payload.min as number) || 20;
        if (atkCtx.roll >= minCrit) {
          (atkCtx as unknown as Record<string, unknown>)._critRangeExpanded = true;
        }
        return ctx;
      },
    },
  ],
  onAttackDamage: [
    {
      kind: 'damage-bonus',
      reduce: (ctx, payload, character) => {
        const dmgCtx = ctx as unknown as AttackDamageContext;
        const condition = payload.condition as string | undefined;
        if (condition === 'raging' && !character.raging) return ctx;
        if (condition === 'always') { /* unconditional */ }
        if (condition && condition !== 'raging' && condition !== 'always') return ctx;
        const bonusExpr = (payload.amount as string) || '0';
        const diceMatch = bonusExpr.match(/^(\d+)d(\d+)$/);
        if (diceMatch) {
          let sum = 0;
          for (let i = 0; i < parseInt(diceMatch[1]); i++) {
            sum += Math.floor(Math.random() * parseInt(diceMatch[2])) + 1;
          }
          dmgCtx.damage += sum;
        } else {
          const bonus = parseInt(bonusExpr);
          if (!isNaN(bonus)) {
            dmgCtx.damage += bonus;
          }
        }
        return ctx;
      },
    },
    {
      kind: 'crit-bonus-dice',
      reduce: (ctx, payload) => {
        const dmgCtx = ctx as unknown as AttackDamageContext;
        if (!dmgCtx.isCrit) return ctx;
        const count = (payload.count as number) || 1;
        const asExtras = dmgCtx as unknown as Record<string, unknown>;
        const extraDice: number[] = (asExtras._extraCritDice as number[]) || [];
        for (let i = 0; i < count; i++) {
          extraDice.push(Math.floor(Math.random() * 20) + 1);
        }
        asExtras._extraCritDice = extraDice;
        return ctx;
      },
    },
  ],
  onDamageTaken: [
    {
      kind: 'damage-immunity',
      reduce: (ctx, payload) => {
        const dmgCtx = ctx as unknown as DamageTakenContext;
        if (matchesType(dmgCtx.damageType, (payload.type as string) || '')) {
          dmgCtx.amount = 0;
        }
        return ctx;
      },
    },
    {
      kind: 'damage-resistance',
      reduce: (ctx, payload) => {
        const dmgCtx = ctx as unknown as DamageTakenContext;
        if (dmgCtx.amount > 0 && matchesType(dmgCtx.damageType, (payload.type as string) || '')) {
          dmgCtx.amount = Math.floor(dmgCtx.amount / 2);
        }
        return ctx;
      },
    },
    {
      kind: 'damage-vulnerability',
      reduce: (ctx, payload) => {
        const dmgCtx = ctx as unknown as DamageTakenContext;
        if (dmgCtx.amount > 0 && matchesType(dmgCtx.damageType, (payload.type as string) || '')) {
          dmgCtx.amount *= 2;
        }
        return ctx;
      },
    },
  ],
  onSaveRoll: [
    {
      kind: 'advantage-on-save',
      reduce: (ctx, payload) => {
        const saveCtx = ctx as unknown as SaveRollContext;
        const against = (payload.against as string) || '';
        const stat = (payload.stat as string) || '';
        if (stat && saveCtx.stat.toLowerCase() !== stat.toLowerCase()) return ctx;
        if (against === 'poison') {
          saveCtx.hasAdvantage = true;
        } else if (against === 'magic') {
          if (saveCtx.spellContext?.isMagical) {
            saveCtx.hasAdvantage = true;
          }
        } else if (against === 'charmed' && saveCtx.spellContext?.isMagical) {
          saveCtx.hasAdvantage = true;
        } else if (against === 'frightened') {
          saveCtx.hasAdvantage = true;
        } else if (against === 'seen-effect') {
          saveCtx.hasAdvantage = true;
        }
        return ctx;
      },
    },
    {
      kind: 'save-proficiency',
      reduce: (ctx, payload, character) => {
        const saveCtx = ctx as unknown as SaveRollContext;
        const saveStat = (payload.saveStat as string) || '';
        if (!saveStat || saveCtx.stat.toLowerCase() === saveStat.toLowerCase()) {
          const profBonus = Math.floor((character.level - 1) / 4) + 2;
          saveCtx.extraModifier += profBonus;
        }
        return ctx;
      },
    },
  ],
  onSkillCheck: [
    {
      kind: 'reroll-ones',
      reduce: (ctx) => {
        const skillCtx = ctx as unknown as SkillCheckContext;
        if (skillCtx.roll === 1) {
          skillCtx.roll = Math.floor(Math.random() * 20) + 1;
        }
        return ctx;
      },
    },
  ],
  onConditionApplied: [
    {
      kind: 'condition-immunity',
      reduce: (ctx, payload) => {
        const condCtx = ctx as unknown as ConditionAppliedContext;
        if (condCtx.condition.toLowerCase() === ((payload.condition as string) || '').toLowerCase()) {
          (condCtx as unknown as Record<string, unknown>)._blocked = true;
        }
        return ctx;
      },
    },
  ],
  onLongRest: [],
  onShortRest: [],
  onLevelUp: [],
  onCharacterCreated: [
    {
      kind: 'skill-proficiency',
      reduce: (ctx, payload, character) => {
        const vals = (payload.skills as string[]) || [];
        if (!character.skills) character.skills = {};
        for (const skill of vals) {
          if (character.skills[skill] === undefined) character.skills[skill] = 1;
          else character.skills[skill] = (character.skills[skill] || 0) + 1;
        }
        return ctx;
      },
    },
    {
      kind: 'armor-proficiency',
      reduce: (ctx, _payload, character) => {
        if (!character.inventory) return ctx;
        return ctx;
      },
    },
    {
      kind: 'language',
      reduce: (ctx, payload, character) => {
        const langs = (payload.languages as string[]) || [];
        if (!character.languages) character.languages = [];
        for (const lang of langs) {
          if (!character.languages.includes(lang)) character.languages.push(lang);
        }
        return ctx;
      },
    },
  ],
};

export function getEffects(character: Character, effectKind: string): EffectSource[] {
  const results: EffectSource[] = [];

  const race = getRaceDef(character.race);
  for (const traitId of character.racialTraits || []) {
    const trait = race?.traits.find(t => t.id === traitId);
    if (trait?.effect?.kind === effectKind) {
      results.push({ source: 'race', payload: (trait.effect.payload || {}) as Record<string, unknown> });
    }
  }

  const classDef = getClassDef(character.class);
  for (const feat of classDef?.features || []) {
    if (feat.level <= character.level && feat.effect?.kind === effectKind) {
      results.push({ source: 'class', payload: (feat.effect.payload || {}) as Record<string, unknown> });
    }
  }

  const subclass = character.subclassId
    ? getSubclassDef(character.class, character.subclassId)
    : character.sorcerousOrigin
      ? getSubclassDef(character.class, character.sorcerousOrigin)
      : undefined;
  for (const feat of subclass?.features || []) {
    if (feat.level <= character.level && feat.effect?.kind === effectKind) {
      results.push({ source: 'subclass', payload: (feat.effect.payload || {}) as Record<string, unknown> });
    }
  }

  for (const featId of character.feats || []) {
    const featDef = getFeatById(featId);
    if (featDef?.effect?.kind === effectKind) {
      results.push({ source: 'feat', payload: (featDef.effect.payload || {}) as Record<string, unknown> });
    }
  }

  return results;
}

export function applyEffects<C extends HookContext>(
  character: Character,
  hook: HookName,
  ctx: C
): C {
  const entries = HOOK_REGISTRY[hook];
  if (!entries) return ctx;

  let result = ctx;
  for (const entry of entries) {
    const sources = getEffects(character, entry.kind);
    for (const src of sources) {
      result = entry.reduce(result, src.payload, character) as C;
    }
  }
  return result;
}
