export function resolveAdvantage(
  roll1: number,
  roll2: number,
  hasAdvantage: boolean,
  hasDisadvantage: boolean
): { roll: number; hadAdvantage: boolean; hadDisadvantage: boolean } {
  if (hasAdvantage && hasDisadvantage) {
    return { roll: roll1, hadAdvantage: false, hadDisadvantage: false };
  }
  if (hasAdvantage) {
    return { roll: Math.max(roll1, roll2), hadAdvantage: true, hadDisadvantage: false };
  }
  if (hasDisadvantage) {
    return { roll: Math.min(roll1, roll2), hadAdvantage: false, hadDisadvantage: true };
  }
  return { roll: roll1, hadAdvantage: false, hadDisadvantage: false };
}
