/**
 * Parses a dice formula string (e.g. "2d6+3") into its components.
 * @param dice - The dice formula string.
 * @returns An object with count, sides, and bonus. **Note:** if the regex fails to match (e.g. "abc", "d20", "3d"), this silently returns `{ count: 1, sides: 6, bonus: 0 }` — there is no error signal for malformed input.
 */
export function parseDiceFormula(dice: string): { count: number; sides: number; bonus: number } {
  const match = dice.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/);
  if (!match) return { count: 1, sides: 6, bonus: 0 };
  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2]),
    bonus: match[3] && match[4] ? (match[3] === '+' ? parseInt(match[4]) : -parseInt(match[4])) : 0
  };
}

export interface ParsedDamageRoll {
  count: number;
  sides: number;
  flatBonus: number;
}

export function parseDamageDice(diceStr: string): ParsedDamageRoll | null {
  const m = diceStr.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!m) return null;
  return {
    count: parseInt(m[1], 10),
    sides: parseInt(m[2], 10),
    flatBonus: parseInt(m[3] || '0', 10),
  };
}

export function rollDamage(parsed: ParsedDamageRoll, dieRoller: (sides: number) => number): number {
  let total = 0;
  for (let i = 0; i < parsed.count; i++) total += dieRoller(parsed.sides);
  return total + parsed.flatBonus;
}
