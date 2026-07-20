import { describe, it, expect } from 'vitest';
import { getExhaustionPenalty, parseExhaustionLevel } from '../../services/conditionEngine';
import { makeCharacter } from '../helpers/characters';

describe('exhaustionEngine', () => {
  describe('getExhaustionPenalty', () => {
    it('returns 0 for level 0 (no exhaustion conditions)', () => {
      const char = makeCharacter();
      expect(getExhaustionPenalty(char)).toBe(0);
    });

    it('returns penalty equal to exhaustion level for level 1', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-1', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(1);
    });

    it('returns penalty equal to exhaustion level for level 2', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-2', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(2);
    });

    it('returns penalty equal to exhaustion level for level 3', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-3', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(3);
    });

    it('returns penalty equal to exhaustion level for level 4', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-4', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(4);
    });

    it('returns penalty equal to exhaustion level for level 5', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-5', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(5);
    });

    it('returns penalty equal to exhaustion level for level 6', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-6', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(6);
    });

    it('returns penalty equal to exhaustion level for level 7', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-7', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(7);
    });

    it('returns penalty equal to exhaustion level for level 8', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-8', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(8);
    });

    it('returns penalty equal to exhaustion level for level 9', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-9', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(9);
    });

    it('returns penalty equal to exhaustion level for level 10', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-10', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(10);
    });

    it('returns highest penalty when multiple exhaustion conditions exist', () => {
      const char = makeCharacter({
        conditions: [
          { id: 'exhaustion-3', source: 'fatigue', duration: Infinity },
          { id: 'exhaustion-5', source: 'fatigue', duration: Infinity },
        ],
      });
      expect(getExhaustionPenalty(char)).toBe(5);
    });

    it('returns 0 for empty conditions array', () => {
      const char = makeCharacter({ conditions: [] });
      expect(getExhaustionPenalty(char)).toBe(0);
    });

    it('returns 0 for undefined conditions', () => {
      const char = makeCharacter({ conditions: undefined });
      expect(getExhaustionPenalty(char)).toBe(0);
    });

    it('ignores invalid exhaustion IDs like exhaustion-xyz', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-xyz', source: 'fatigue', duration: Infinity }] });
      expect(getExhaustionPenalty(char)).toBe(0);
    });

    it('ignores non-exhaustion conditions', () => {
      const char = makeCharacter({
        conditions: [
          { id: 'blinded', source: 'spell', duration: 1 },
          { id: 'poisoned', source: 'spell', duration: 1 },
        ],
      });
      expect(getExhaustionPenalty(char)).toBe(0);
    });
  });

  describe('parseExhaustionLevel', () => {
    it('returns same value as getExhaustionPenalty for level 0', () => {
      const char = makeCharacter();
      expect(parseExhaustionLevel(char)).toBe(getExhaustionPenalty(char));
    });

    it('returns same value as getExhaustionPenalty for level 5', () => {
      const char = makeCharacter({ conditions: [{ id: 'exhaustion-5', source: 'fatigue', duration: Infinity }] });
      expect(parseExhaustionLevel(char)).toBe(getExhaustionPenalty(char));
    });

    it('returns same value as getExhaustionPenalty for multiple conditions', () => {
      const char = makeCharacter({
        conditions: [
          { id: 'exhaustion-2', source: 'fatigue', duration: Infinity },
          { id: 'exhaustion-8', source: 'fatigue', duration: Infinity },
        ],
      });
      expect(parseExhaustionLevel(char)).toBe(getExhaustionPenalty(char));
    });
  });
});
