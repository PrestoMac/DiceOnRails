import { SaveStat } from '../types';

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
