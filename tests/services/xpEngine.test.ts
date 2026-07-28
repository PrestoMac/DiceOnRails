import { describe, it, expect } from 'vitest';
import {
  computeXp,
  awardXpToParty,
  formatXpAwardLine,
} from '../../services/xpEngine';
import { Character, GameState } from '../../types';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'hero-1',
    name: 'Hero',
    class: 'Fighter',
    race: 'Human',
    level: 1,
    hp: { current: 12, max: 12 },
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    location: 'Tavern',
    experience: 0,
    experienceToNextLevel: 300,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 1, max: 1 },
    ...overrides,
  };
}

function makeState(party: Character[], overrides: Partial<GameState> = {}): GameState {
  return {
    party,
    worldDescription: '',
    sessionLogs: [],
    quests: [],
    lore: [],
    ...overrides,
  };
}

describe('xpEngine — computeXp', () => {
  describe('combat trigger', () => {
    it('prefers explicit enemy.xp when provided', () => {
      expect(computeXp('combat', { xp: 450, cr: 1 })).toBe(450);
    });
    it('respects explicit xp=0 (no fallthrough to CR)', () => {
      expect(computeXp('combat', { xp: 0, cr: 5 })).toBe(0);
    });
    it('falls back to CR table when xp absent', () => {
      expect(computeXp('combat', { cr: 1 })).toBe(200);
      expect(computeXp('combat', { cr: 5 })).toBe(1800);
      expect(computeXp('combat', { cr: 10 })).toBe(5900);
    });
    it('handles fractional CRs', () => {
      expect(computeXp('combat', { cr: 0.125 })).toBe(25);
      expect(computeXp('combat', { cr: 0.25 })).toBe(50);
      expect(computeXp('combat', { cr: 0.5 })).toBe(100);
    });
    it('returns 10 when neither xp nor cr provided', () => {
      expect(computeXp('combat', {})).toBe(10);
    });
    it('interpolates for CRs beyond the table', () => {
      const high = computeXp('combat', { cr: 30 });
      expect(high).toBe(155000);
    });
  });

  describe('skill trigger', () => {
    it('awards by DC bracket', () => {
      expect(computeXp('skill', { dc: 5 })).toBe(5);
      expect(computeXp('skill', { dc: 10 })).toBe(15);
      expect(computeXp('skill', { dc: 15 })).toBe(35);
      expect(computeXp('skill', { dc: 20 })).toBe(75);
      expect(computeXp('skill', { dc: 25 })).toBe(150);
    });
    it('doubles on nat 20', () => {
      expect(computeXp('skill', { dc: 15, nat20: true })).toBe(70);
      expect(computeXp('skill', { dc: 25, nat20: true })).toBe(300);
    });
    it('does not double without nat 20', () => {
      expect(computeXp('skill', { dc: 15, nat20: false })).toBe(35);
    });
    it('defaults dc to 10 when omitted', () => {
      expect(computeXp('skill', {})).toBe(15);
    });
  });

  describe('explore trigger', () => {
    it('awards 25 for minor significance', () => {
      expect(computeXp('explore', { significance: 'minor' })).toBe(25);
    });
    it('awards 50 for major significance', () => {
      expect(computeXp('explore', { significance: 'major' })).toBe(50);
    });
    it('awards 100 for landmark significance', () => {
      expect(computeXp('explore', { significance: 'landmark' })).toBe(100);
    });
    it('defaults to 100 (landmark tier) when significance omitted', () => {
      expect(computeXp('explore', {})).toBe(100);
    });
  });

  describe('quest trigger', () => {
    it('awards by difficulty bracket', () => {
      expect(computeXp('quest', { difficulty: 'trivial' })).toBe(50);
      expect(computeXp('quest', { difficulty: 'easy' })).toBe(100);
      expect(computeXp('quest', { difficulty: 'medium' })).toBe(200);
      expect(computeXp('quest', { difficulty: 'hard' })).toBe(400);
      expect(computeXp('quest', { difficulty: 'deadly' })).toBe(800);
    });
    it('defaults to easy (100) when difficulty omitted', () => {
      expect(computeXp('quest', {})).toBe(100);
    });
  });

  describe('lore trigger', () => {
    it('awards flat 10', () => {
      expect(computeXp('lore', {})).toBe(10);
    });
  });

  describe('roleplay trigger', () => {
    it('passes through amounts within range', () => {
      expect(computeXp('roleplay', { amount: 3 })).toBe(3);
      expect(computeXp('roleplay', { amount: 1 })).toBe(1);
      expect(computeXp('roleplay', { amount: 10 })).toBe(10);
    });
    it('clamps below minimum to 1', () => {
      expect(computeXp('roleplay', { amount: 0 })).toBe(1);
      expect(computeXp('roleplay', { amount: -10 })).toBe(1);
    });
    it('clamps above maximum to 10', () => {
      expect(computeXp('roleplay', { amount: 50 })).toBe(10);
      expect(computeXp('roleplay', { amount: 9999 })).toBe(10);
    });
    it('defaults to 1 when amount omitted', () => {
      expect(computeXp('roleplay', {})).toBe(1);
    });
    it('rounds fractional amounts', () => {
      expect(computeXp('roleplay', { amount: 7.6 })).toBe(8);
    });
  });
});

describe('xpEngine — awardXpToParty', () => {
  it('awards flat amount to every party member (no split)', () => {
    const a = makeCharacter({ id: 'a', name: 'Aria' });
    const b = makeCharacter({ id: 'b', name: 'Bran' });
    const state = makeState([a, b]);

    const result = awardXpToParty(state, 100);

    expect(result.amount).toBe(100);
    expect(state.party[0].experience).toBe(100);
    expect(state.party[1].experience).toBe(100);
    expect(result.reports).toHaveLength(2);
  });

  it('does not split — solo gets full amount (no +25% buff)', () => {
    const solo = makeCharacter({ id: 'solo', name: 'Lone' });
    const state = makeState([solo]);

    awardXpToParty(state, 200);

    expect(state.party[0].experience).toBe(200);
  });

  it('detects level-ups and pushes to sessionLogs', () => {
    const hero = makeCharacter({ experience: 290, experienceToNextLevel: 300 });
    const state = makeState([hero]);

    const result = awardXpToParty(state, 50);

    expect(result.anyLevelUp).toBe(true);
    expect(result.levelUpSummaries).toHaveLength(1);
    expect(result.levelUpSummaries[0].newLevel).toBe(2);
    expect(state.sessionLogs).toHaveLength(1);
    expect(state.sessionLogs[0]).toContain('reached level 2');
  });

  it('reports level-up lines for leveled members', () => {
    const hero = makeCharacter({ experience: 290, experienceToNextLevel: 300, name: 'Aria' });
    const state = makeState([hero]);

    const result = awardXpToParty(state, 50);

    expect(result.reports[0]).toContain('leveled up to 2');
  });

  it('reports plain XP lines for non-leveled members', () => {
    const hero = makeCharacter({ name: 'Aria' });
    const state = makeState([hero]);

    const result = awardXpToParty(state, 50);

    expect(result.reports[0]).toBe('Aria +50 XP');
  });

  it('handles empty party gracefully', () => {
    const state = makeState([]);
    const result = awardXpToParty(state, 100);
    expect(result.reports).toHaveLength(0);
    expect(result.anyLevelUp).toBe(false);
  });

  it('handles mixed party (some level up, some do not)', () => {
    const low = makeCharacter({ id: 'low', name: 'Rookie', experience: 0 });
    const high = makeCharacter({ id: 'high', name: 'Vet', experience: 290, experienceToNextLevel: 300 });
    const state = makeState([low, high]);

    const result = awardXpToParty(state, 50);

    expect(result.anyLevelUp).toBe(true);
    expect(result.levelUpSummaries).toHaveLength(1);
    expect(result.reports).toHaveLength(2);
  });
});

describe('xpEngine — formatXpAwardLine', () => {
  it('formats a combat line', () => {
    const state = makeState([makeCharacter({ name: 'Aria' })]);
    const result = awardXpToParty(state, 200);
    const line = formatXpAwardLine('combat', result);
    expect(line).toContain('Combat XP');
    expect(line).toContain('200 XP each');
    expect(line).toContain('Aria +200 XP');
  });

  it('appends LEVEL UP when a member leveled', () => {
    const state = makeState([makeCharacter({ name: 'Aria', experience: 290, experienceToNextLevel: 300 })]);
    const result = awardXpToParty(state, 50);
    const line = formatXpAwardLine('skill', result);
    expect(line).toContain('LEVEL UP!');
  });

  it('does not append LEVEL UP when no one leveled', () => {
    const state = makeState([makeCharacter({ name: 'Aria' })]);
    const result = awardXpToParty(state, 10);
    const line = formatXpAwardLine('lore', result);
    expect(line).not.toContain('LEVEL UP');
    expect(line).toContain('Lore XP');
  });
});
