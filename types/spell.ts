import type { DamageType, SaveStat } from './character';

/** The eight schools of magic in D&D 5e. */
export type SpellSchool =
  | 'abjuration' | 'conjuration' | 'divination' | 'enchantment'
  | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';

/** The spellcasting progression archetype for a class. */
export type SpellTradition = 'full' | 'half' | 'pact' | 'third' | 'none';

/** Describes how a spell changes when cast at a higher level. */
export interface SpellScaling {
  atSlotLevel: number;
  damageDice?: string;
  bonusDice?: string;
  notes?: string;
}

/** A complete spell definition including casting parameters, damage, and scaling. */
export interface SpellDefinition {
  id: string;
  name: string;
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  school: SpellSchool;
  castingTime: 'action' | 'bonus' | 'reaction' | 'minute' | '10 minutes' | '1 hour' | 'ritual';
  range: string;
  components: { verbal: boolean; somatic?: boolean; material?: string };
  duration: string;
  description: string;
  classes: string[];
  damage?: { dice: string; type: DamageType };
  healing?: string;
  attackRoll?: boolean;
  save?: { stat: SaveStat; onSuccess: 'none' | 'half' };
  scaling?: SpellScaling[];
  requiresConcentration: boolean;
  ritual?: boolean;
  aoe?: { shape: 'sphere' | 'cube' | 'cone' | 'line' | 'cylinder' | 'wall'; size: number };
  tags: string[];
  condition?: {
    type: string;
    saveTo?: SaveStat;
    saveDC?: number;
    onFailedSave?: 'none' | 'half';
    duration?: number;
  };
  hpPoolDice?: string;
  hpPoolCondition?: string;
  cantripScaling?: { atLevel: number; bonusDice: string }[];
  autoHit?: boolean;
  dartCount?: number;
  secondaryDamage?: { dice: string; type: DamageType }[];
  shortDescription?: string;
  parsedDuration?: {
    value: number;
    unit: 'round' | 'minute' | 'permanent';
  };
  durationScaling?: Array<{
    atSlotLevel: number;
    value: number;
  }>;
}

/** A profile defining how a class handles spellcasting (tradition, ability, slots, pact magic). */
export interface SpellcastingProfile {
  tradition: SpellTradition;
  ability: 'int' | 'wis' | 'cha';
  prepMode: 'known' | 'prepared' | 'pact';
  ritualCasting: boolean;
  cantripsKnown: number[];
  spellsKnown?: number[];
  spellSlots?: number[][];
  pactMagic?: {
    slots: number[];
    slotLevels: number[];
  };
}
