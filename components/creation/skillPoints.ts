import { ClassDefinition } from '../../utils/classes';

/**
 * Total skill points a character receives at the given level under this system's
 * house rule: `skillChoices.count * 2` at level 1, plus 3 per level thereafter
 * (4 per level for Rogues). Single source of truth shared by the wizard shell,
 * the Skills step, and the preset builder.
 */
export function computeSkillBudget(classDef: ClassDefinition, level: number): number {
  const base = classDef.skillChoices.count * 2;
  const perLevel = classDef.name === 'Rogue' ? 4 : 3;
  return base + (level - 1) * perLevel;
}

/** Remaining skill points after subtracting the sum of all allocated ranks. */
export function computeRemainingSkillPoints(
  classDef: ClassDefinition,
  level: number,
  allocatedSkills: Record<string, number>,
): number {
  const spent = Object.values(allocatedSkills).reduce((s, v) => s + v, 0);
  return computeSkillBudget(classDef, level) - spent;
}
