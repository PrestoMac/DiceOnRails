export { SPELLS_CATALOG } from '../data/spells';
import { SPELLS_CATALOG } from '../data/spells';
import { SpellDefinition } from '../types';

export function parseDuration(duration: string): { value: number; unit: 'round' | 'minute' | 'permanent' } | undefined {
  const d = duration.toLowerCase().trim();

  if (d === 'instantaneous') return undefined;

  const roundMatch = d.match(/^(\d+)\s*round/);
  if (roundMatch) return { value: parseInt(roundMatch[1]), unit: 'round' };

  const minuteMatch = d.match(/^(?:up to\s+)?(\d+)\s*minute/);
  if (minuteMatch) return { value: parseInt(minuteMatch[1]), unit: 'minute' };

  const hourMatch = d.match(/^(?:up to\s+)?(\d+)\s*hour/);
  if (hourMatch) return { value: parseInt(hourMatch[1]) * 60, unit: 'minute' };

  const dayMatch = d.match(/^(\d+)\s*day/);
  if (dayMatch) return { value: parseInt(dayMatch[1]) * 1440, unit: 'minute' };

  if (d.includes('until dispelled') || d === 'special') return { value: 0, unit: 'permanent' };

  return undefined;
}

export const SPELLS_BY_ID: Record<string, SpellDefinition> =
  Object.fromEntries(SPELLS_CATALOG.map(s => [s.id, s]));

export function getSpellsForClass(classId: string): SpellDefinition[] {
  return SPELLS_CATALOG.filter(s => s.classes.includes(classId));
}
