import type { ActiveCondition } from './character';

export interface EnemyAttack {
  name: string;
  toHit: number;
  damageDice: string;
  damageType: string;
  description?: string;
}

export interface Enemy {
  id: string;
  name: string;
  size?: string;
  type?: string;
  ac: number;
  hp: { current: number; max: number };
  stats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: EnemyAttack[];
  cr?: number;
  xp?: number;
  isDead: boolean;
  specialAbilities?: string[];
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionsImmunities?: string[];
  conditions?: ActiveCondition[];
  summonDurationRemaining?: number;
  summonExpired?: boolean;
  tempHp?: number;
  summonFields?: { duration: number; ownerId: string };
  beastFields?: { speed: number };
}

export interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  type: 'player' | 'enemy';
  isDead: boolean;
  hasActedThisTurn: boolean;
  activeConditions?: string[];
  rawRoll?: number;
  modifier?: number;
  conditionsResolvedThisTurn?: boolean;
}

export interface CombatState {
  isActive: boolean;
  round: number;
  turnIndex: number;
  initiative: InitiativeEntry[];
  enemies: Enemy[];
  activeDoTs?: Array<{
    id: string;
    spellId: string;
    casterId: string;
    targetIds: string[];
    damageFormula: string;
    damageType: string;
    addsAbilityMod: boolean;
    saveStat?: string;
    saveDC?: number;
    remainingRounds?: number | null;
    slotLevel: number;
  }>;
}
