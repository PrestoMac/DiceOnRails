import type { Enemy } from './combat';

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

export interface Currency {
  gp: number;
  sp: number;
  cp: number;
}

export interface DeathSaveStatus {
  successes: number;
  failures: number;
  isStable: boolean;
}

export interface FeatSelection {
  level: number;
  type: 'asi' | 'feat';
  featId?: string;
  statAllocations?: Partial<Record<keyof Character['stats'], number>>;
  saveStatChoice?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  skillChoices?: string[];
}

export type ResourceReset = 'short' | 'long' | 'turn' | 'level';

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

export type ClassFeatureKind =
  | 'passive'
  | 'resource'
  | 'action'
  | 'bonus-action'
  | 'reaction'
  | 'subclass'
  | 'proficiency'
  | 'spell-like';

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

export interface SubclassSummary {
  id: string;
  parentClass: string;
  name: string;
  description: string;
  features: SubclassFeature[];
}

export interface RacialTrait {
  id: string;
  name: string;
  description: string;
  kind: 'passive' | 'resource' | 'action' | 'spell-like';
  effect?: { kind: string; payload?: Record<string, unknown> };
  grantsResource?: string;
}

export type DamageType =
  | 'acid' | 'bludgeoning' | 'cold' | 'fire' | 'force'
  | 'lightning' | 'necrotic' | 'piercing' | 'poison'
  | 'psychic' | 'radiant' | 'slashing' | 'thunder';

export interface RemoveEffect {
  kind: 'acBonus';
  value: number;
}

export interface ActiveCondition {
  id: string;
  source: string;
  duration: number;
  durationUnit?: 'round' | 'minute' | 'permanent';
  saveEnd?: SaveStat;
  saveDC?: number;
  onFailedSave?: 'none' | 'half';
  onRemove?: ((target: Character | Enemy) => void) | RemoveEffect;
}

export type SaveStat = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

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

export interface RuntimeMetadata {
  concentrationStartTime?: number;
  concentrationEffectiveDuration?: number;
  transformationState?: TransformationState;
}

export interface LevelUpSummary {
  characterId: string;
  characterName: string;
  newLevel: number;
  oldLevel: number;
  hpGained: number;
  newMaxHp: number;
  statPointsGained: number;
}

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
  featChoices?: Record<string, Record<string, any>>;
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
  raging?: boolean;
  tempHp?: number;
  conditionsImmunities?: string[];
  conditions?: ActiveCondition[];
  acMinimum?: number;
  reactionAvailable?: boolean;
  reactionUsedThisTurn?: boolean;
}
