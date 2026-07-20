export * from './llm';

export * from './llmClient';
export * from './streamingClient';
export * from './mcpService';

export {
  rollDice, rollDiceWithAdvantage, calculateModifier,
  rollAttackRoll, rollDamage, rollSkillCheck, rollSavingThrow, rollDeathSave,
} from './diceEngine';

export {
  addEnemyToCombat, initializeCombat, advanceToNextTurn, selectBestTarget,
  resolveEnemySingleAttack, resolveEnemySingleTurn, resolveAllEnemyTurns,
  checkVictoryConditions, useCharacterReaction, updateCombatantDeathStatus,
  getCurrentCombatActor, makeSavingThrow,
} from './combatEngine';

export * from './inventoryEngine';

export {
  hasFeat, getFeat, getAlertInitiativeBonus, getResilientStat,
  getResilientSaveBonus, getShieldMasterSaveBonus, getDeathSaveBonus,
  getMobileSpeedBonus, getAthleteSpeedBonus, getSpeedBonus,
  getToughHpBonus, getMaxHp, getDualWielderAcBonus,
} from './featsService';

export * from './conditionEngine';

export * from './spellcastingEngine';

export * from './classEngine';

export {
  getXpForLevel, calculateXPToNextLevel, calculateHPGainForLevelUp,
  awardExperience, applyStatAllocation, getProgressionContext,
} from './progressionService';

export * from './summoningEngine';
export * from './teleportationEngine';
export * from './transformationEngine';

export * from './auditor';
export * from './storageService';
export * from './authService';
export * from './audioService';
export * from './supabaseClient';
