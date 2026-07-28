/**
 * Unit tests for generateUniqueEnemyName — the engine-side Roman-numeral
 * deduplication that prevents multiple enemies from sharing the same name.
 */
import { describe, it, expect } from 'vitest';
import { generateUniqueEnemyName } from '../../services/mcp/combatService';
import type { Enemy } from '../../types';

function makeEnemy(name: string): Enemy {
  return {
    id: `e-${name}`,
    name,
    ac: 10,
    hp: { current: 1, max: 1 },
    attacks: [],
    isDead: false,
  };
}

describe('generateUniqueEnemyName', () => {
  describe('no collision', () => {
    it('returns input unchanged when no enemies exist', () => {
      expect(generateUniqueEnemyName('Goblin', [])).toBe('Goblin');
    });

    it('returns input unchanged when existing enemies have different names', () => {
      expect(generateUniqueEnemyName('Goblin', [makeEnemy('Orc')])).toBe('Goblin');
    });

    it('does not match similar but distinct names (Hobgoblin vs Goblin)', () => {
      expect(generateUniqueEnemyName('Goblin', [makeEnemy('Hobgoblin')])).toBe('Goblin');
    });

    it('handles multi-word names without collision', () => {
      expect(generateUniqueEnemyName('Goblin Archer', [makeEnemy('Goblin')])).toBe('Goblin Archer');
    });
  });

  describe('first duplicate gets II', () => {
    it('appends II when one enemy with same name exists', () => {
      expect(generateUniqueEnemyName('Goblin', [makeEnemy('Goblin')])).toBe('Goblin II');
    });

    it('appends II for multi-word names', () => {
      expect(generateUniqueEnemyName('Goblin Archer', [makeEnemy('Goblin Archer')])).toBe('Goblin Archer II');
    });
  });

  describe('sequential numbering', () => {
    it('appends III when Goblin and Goblin II exist', () => {
      const existing = [makeEnemy('Goblin'), makeEnemy('Goblin II')];
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin III');
    });

    it('appends IV when I/II/III exist', () => {
      const existing = [
        makeEnemy('Goblin'),
        makeEnemy('Goblin II'),
        makeEnemy('Goblin III'),
      ];
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin IV');
    });

    it('appends X when nine numbered enemies exist', () => {
      const existing = [
        makeEnemy('Goblin'),
        makeEnemy('Goblin II'),
        makeEnemy('Goblin III'),
        makeEnemy('Goblin IV'),
        makeEnemy('Goblin V'),
        makeEnemy('Goblin VI'),
        makeEnemy('Goblin VII'),
        makeEnemy('Goblin VIII'),
        makeEnemy('Goblin IX'),
      ];
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin X');
    });

    it('falls back to Arabic beyond X', () => {
      const existing = [
        makeEnemy('Goblin'),
        makeEnemy('Goblin II'),
        makeEnemy('Goblin III'),
        makeEnemy('Goblin IV'),
        makeEnemy('Goblin V'),
        makeEnemy('Goblin VI'),
        makeEnemy('Goblin VII'),
        makeEnemy('Goblin VIII'),
        makeEnemy('Goblin IX'),
        makeEnemy('Goblin X'),
      ];
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin 11');
    });
  });

  describe('input already has a Roman suffix', () => {
    it('passes through un-taken suffixed name unchanged', () => {
      expect(generateUniqueEnemyName('Goblin III', [makeEnemy('Goblin')])).toBe('Goblin III');
    });

    it('increments past existing suffix when input collides', () => {
      expect(generateUniqueEnemyName('Goblin II', [makeEnemy('Goblin II')])).toBe('Goblin III');
    });

    it('resolves canonical base from Roman-suffixed existing enemy', () => {
      const existing = [makeEnemy('Goblin'), makeEnemy('Goblin III')];
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin IV');
    });
  });

  describe('edge cases', () => {
    it('does not fill gaps — picks next after highest (I and III exist → IV)', () => {
      const existing = [makeEnemy('Goblin'), makeEnemy('Goblin III')];
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin IV');
    });

    it('preserves the bare name when only suffixed variants exist', () => {
      expect(generateUniqueEnemyName('Goblin', [makeEnemy('Goblin II')])).toBe('Goblin');
    });

    it('handles empty string input', () => {
      expect(generateUniqueEnemyName('', [])).toBe('');
    });

    it('handles whitespace-padded input', () => {
      expect(generateUniqueEnemyName('  Goblin  ', [makeEnemy('Goblin')])).toBe('Goblin II');
    });

    it('does not treat non-Roman trailing letters as suffixes', () => {
      expect(generateUniqueEnemyName('Goblin King', [makeEnemy('Goblin King')])).toBe('Goblin King II');
    });

    it('treats dead enemies as still occupying their name slot', () => {
      const existing = [makeEnemy('Goblin')];
      existing[0].isDead = true;
      expect(generateUniqueEnemyName('Goblin', existing)).toBe('Goblin II');
    });
  });
});
