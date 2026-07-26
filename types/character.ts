/** Represents an item in a character's inventory, including equipment and consumables. */
export interface InventoryItem {
  name: string;
  quantity: number;
  id?: string;
  type?: 'weapon' | 'armor' | 'potion' | 'shield' | 'gear' | 'other';
  rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary';
  description?: string;
  weight?: number;
  cost?: string;
  equipped?: boolean;
  stats?: {
    damage?: string;
    damageType?: string;
    healing?: string;
    acBonus?: number;
    acFormula?: string;
    properties?: string[];
    strengthReq?: number;
    stealthDisadv?: boolean;
  };
}

/** Represents a character's currency holdings in gold, silver, and copper pieces. */
export interface Currency {
  gp: number;
  sp: number;
  cp: number;
}

/** Tracks death saving throw progress (successes/failures) and stability state. */
export interface DeathSaveStatus {
  successes: number;
  failures: number;
  isStable: boolean;
}

/** Records a feat or ASI (Ability Score Improvement) choice made at a given level. */
export interface FeatSelection {
  level: number;
  type: 'asi' | 'feat';
  featId?: string;
  statAllocations?: Partial<Record<keyof Character['stats'], number>>;
  saveStatChoice?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  skillChoices?: string[];
}

/** The recharge cadence for a resource pool (short rest, long rest, turn, or level-up). */
export type ResourceReset = 'short' | 'long' | 'turn' | 'level';

/** A tracked resource (e.g. ki points, rage, spell slots) with a current/max and reset trigger. */
export interface ResourcePool {
  id: string;
  name: string;
  current: number;
  max: number;
  resetOn: ResourceReset;
  source: 'class' | 'subclass' | 'feat' | 'race';
  sourceId: string;
  icon?: string;
}

/** Categorizes the activation mechanism of a class feature. */
export type ClassFeatureKind =
  | 'passive'
  | 'resource'
  | 'action'
  | 'bonus-action'
  | 'reaction'
  | 'subclass'
  | 'proficiency'
  | 'spell-like';

/** A feature granted by a character class at a specific level. */
export interface ClassFeature {
  id: string;
  name: string;
  description: string;
  level: number;
  kind: ClassFeatureKind;
  effect?: { kind: string; payload?: Record<string, unknown> };
  grantsResource?: string;
  choice?: {
    label: string;
    options: { id: string; label: string; description?: string }[];
    multi?: boolean;
    count?: number;
  };
}

/** A feature granted by a character subclass at a specific level. */
export interface SubclassFeature {
  id: string;
  name: string;
  description: string;
  level: number;
  kind: ClassFeatureKind;
  effect?: { kind: string; payload?: Record<string, unknown> };
  grantsResource?: string;
  choice?: ClassFeature['choice'];
}

/** Summary of a subclass including its parent class and features. */
export interface SubclassSummary {
  id: string;
  parentClass: string;
  name: string;
  description: string;
  features: SubclassFeature[];
}

/** A trait granted by a character's race. */
export interface RacialTrait {
  id: string;
  name: string;
  description: string;
  kind: 'passive' | 'resource' | 'action' | 'spell-like';
  effect?: { kind: string; payload?: Record<string, unknown> };
  grantsResource?: string;
}

/** The 13 damage types available in D&D 5e. */
export type DamageType =
  | 'acid' | 'bludgeoning' | 'cold' | 'fire' | 'force'
  | 'lightning' | 'necrotic' | 'piercing' | 'poison'
  | 'psychic' | 'radiant' | 'slashing' | 'thunder';

/** Describes a numeric effect to be removed (e.g. an AC bonus). */
export interface RemoveEffect {
  kind: 'acBonus';
  value: number;
}

/** A condition or ongoing effect applied to a character or enemy. */
export interface ActiveCondition {
  id: string;
  source: string;
  duration: number;
  durationUnit?: 'round' | 'minute' | 'permanent';
  saveEnd?: SaveStat;
  saveDC?: number;
  onFailedSave?: 'none' | 'half';
  onRemove?: RemoveEffect;
}

/** An ability score used for saving throws. */
export type SaveStat = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** Tracks a polymorphed or wild-shaped character's original form and transformation details. */
export interface TransformationState {
  originalForm: {
    stats: Character['stats'];
    hp: { current: number; max: number };
    ac: number;
    attacks: unknown[];
  } | null;
  transformedInto: string | null;
  transformationType: 'polymorph' | 'wild-shape' | 'true-polymorph' | null;
  duration: number;
  casterId: string;
}

/** Runtime-only metadata attached to a character (e.g. concentration timers, transformation state). */
export interface RuntimeMetadata {
  concentrationStartTime?: number;
  concentrationEffectiveDuration?: number;
  concentrationStartRound?: number;
  transformationState?: TransformationState;
}

/** Summary of changes applied when a character levels up. */
export interface LevelUpSummary {
  characterId: string;
  characterName: string;
  newLevel: number;
  oldLevel: number;
  hpGained: number;
  newMaxHp: number;
  statPointsGained: number;
}

/** A full player character with stats, inventory, class, race, and all game-relevant fields. */
export interface Character {
  id: string;
  ownerId?: string;
  name: string;
  class: string;
  race: string;
  level: number;
  hp: {
    current: number;
    max: number;
  };
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  inventory: InventoryItem[];
  currency: Currency;
  location: string;
  experience: number;
  experienceToNextLevel: number;
  unusedStatPoints: number;
  maxHpBonus: number;
  hitDice: { current: number; max: number };
  skills?: Record<string, number>;
  unusedSkillPoints?: number;
  deathSaves?: DeathSaveStatus;
  feats?: string[];
  pendingFeatChoice?: boolean;
  featSelections?: FeatSelection[];
  featChoices?: Record<string, Record<string, unknown>>;
  subclassId?: string;
  resources?: ResourcePool[];
  knownSpells?: string[];
  preparedSpells?: string[];
  racialTraits?: string[];
  acBonus?: number;
  speedBonus?: number;
  concentrationSpellId?: string;
  runtime?: RuntimeMetadata;
  draconicAncestry?: string;
  draconicDamageType?: DamageType;
  halfElfStatChoices?: ('str'|'dex'|'con'|'int'|'wis'|'cha')[];
  backstory?: string;
  /** Background & persona — SRD 5.1 narrative fields (no mechanical effects).
   *  All public to the LLM (never stripped by withoutPrivateNotes). */
  alignment?: string;
  background?: string;
  personalityTraits?: string[];
  ideals?: string[];
  bonds?: string[];
  flaws?: string[];
  appearance?: string;
  bonusSkillProficiencies?: string[];
  fightingStyle?: string;
  divineDomain?: string;
  sorcerousOrigin?: string;
  warlockPatron?: string;
  arcaneTradition?: string;
  metamagicOptions?: string[];
  sneakAttackDice?: number;
  unlockedSubclassFeatures?: number[];
  pendingSubclassFeature?: boolean;
  /** Tasha's-style "swap one known spell on level-up" flag. Set true by
   *  awardExperience when a known caster (bard/sorcerer/warlock/ranger)
   *  gains a level. Consumed (set false) by swap_known_spell. */
  pendingSpellSwap?: boolean;
  /** 2024-style "replace one cantrip on long-rest" flag. Set true by
   *  long_rest for all spellcasting characters. Consumed (set false) by
   *  swap_known_spell when swapping a cantrip. */
  cantripSwapAvailable?: boolean;
  raging?: boolean;
  tempHp?: number;
  conditionsImmunities?: string[];
  conditions?: ActiveCondition[];
  acMinimum?: number;
  reactionAvailable?: boolean;
  reactionUsedThisTurn?: boolean;
  /** Personal journal/notes, private-by-convention to the character's owner. Not
   *  fed into the LLM context. UI renders it only for the owning player. */
  notes?: string;
  /** GM/host-only notes. Private-by-convention to the campaign host. Not fed
   *  into the LLM context. UI renders it only when the viewer is the host. */
  gmNotes?: string;
  /** URL of an auto-generated character portrait (ImageRouter). Empty/undefined
   *  means no portrait yet (placeholder shown). Never fed into the LLM context. */
  portraitUrl?: string;
}
