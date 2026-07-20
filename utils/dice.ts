export function parseDiceFormula(dice: string): { count: number; sides: number; bonus: number } {
  const match = dice.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/);
  if (!match) return { count: 1, sides: 6, bonus: 0 };
  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2]),
    bonus: match[3] && match[4] ? (match[3] === '+' ? parseInt(match[4]) : -parseInt(match[4])) : 0
  };
}
