import { SaveStat } from '../types';
import { SPELLS_BY_ID } from './spells';

const STAT_ALIASES: Record<string, SaveStat> = {
  strength: 'str', str: 'str', st: 'str',
  dexterity: 'dex', dex: 'dex', dx: 'dex',
  constitution: 'con', con: 'con', cn: 'con',
  intelligence: 'int', int: 'int', in: 'int',
  wisdom: 'wis', wis: 'wis', ws: 'wis',
  charisma: 'cha', cha: 'cha', ch: 'cha',
};

export function normalizeStat(input: string): SaveStat {
  return STAT_ALIASES[input.toLowerCase().trim()] ?? 'dex';
}

export function normalizeSpellId(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '-').trim();
}

export function lookupSpell(input: string) {
  return SPELLS_BY_ID[normalizeSpellId(input)];
}
