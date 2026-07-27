/**
 * tests/services/gridService.test.ts
 * Unit tests for the VTT grid service pure functions.
 * All functions are deterministic and side-effect free — easy to test with vitest.
 */

import { describe, it, expect } from 'vitest';
import {
  initBattleMap,
  placeToken,
  moveToken,
  markTokenDead,
  removeToken,
  getToken,
  distanceCells,
  distanceFeet,
  isInRange,
  tokensInRange,
  findFreeCell,
  autoPlaceParty,
  autoPlaceEnemies,
  assignTokenColor,
  buildGridContextString,
  FEET_PER_CELL,
} from '../../services/gridService';
import { BattleMap, GridToken } from '../../types/grid';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMap(width = 10, height = 8): BattleMap {
  return initBattleMap(width, height, 'Test Map');
}

const playerA: GridToken = { id: 'p1', name: 'Aria', type: 'player', pos: { x: 1, y: 1 } };
const playerB: GridToken = { id: 'p2', name: 'Theron', type: 'player', pos: { x: 2, y: 2 } };
const enemy1: GridToken  = { id: 'e1', name: 'Goblin', type: 'enemy', pos: { x: 7, y: 5 } };

// ---------------------------------------------------------------------------
// initBattleMap
// ---------------------------------------------------------------------------

describe('initBattleMap', () => {
  it('creates a map with the specified dimensions', () => {
    const map = initBattleMap(20, 15, 'Dungeon');
    expect(map.width).toBe(20);
    expect(map.height).toBe(15);
    expect(map.label).toBe('Dungeon');
    expect(map.tokens).toHaveLength(0);
    expect(map.isGenerating).toBe(false);
  });

  it('defaults to 20×15 when no args given', () => {
    const map = initBattleMap();
    expect(map.width).toBe(20);
    expect(map.height).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// placeToken / getToken
// ---------------------------------------------------------------------------

describe('placeToken', () => {
  it('adds a token to an empty map', () => {
    const map = placeToken(makeMap(), playerA);
    expect(map.tokens).toHaveLength(1);
    expect(getToken(map, 'p1')).toBeDefined();
    expect(getToken(map, 'p1')!.name).toBe('Aria');
  });

  it('replaces a token with the same id', () => {
    let map = placeToken(makeMap(), playerA);
    const updated = { ...playerA, pos: { x: 3, y: 3 } };
    map = placeToken(map, updated);
    expect(map.tokens).toHaveLength(1);
    expect(getToken(map, 'p1')!.pos).toEqual({ x: 3, y: 3 });
  });

  it('auto-assigns a color when not provided', () => {
    const map = placeToken(makeMap(), { id: 'p1', name: 'X', type: 'player', pos: { x: 0, y: 0 } });
    expect(getToken(map, 'p1')!.color).toBeTruthy();
  });

  it('preserves provided color', () => {
    const map = placeToken(makeMap(), { ...playerA, color: '#ff0000' });
    expect(getToken(map, 'p1')!.color).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// moveToken
// ---------------------------------------------------------------------------

describe('moveToken', () => {
  it('moves a token to the target cell', () => {
    let map = placeToken(makeMap(), playerA);
    map = moveToken(map, 'p1', { x: 5, y: 3 });
    expect(getToken(map, 'p1')!.pos).toEqual({ x: 5, y: 3 });
  });

  it('clamps to map bounds', () => {
    let map = placeToken(makeMap(10, 8), playerA);
    map = moveToken(map, 'p1', { x: 99, y: 99 });
    expect(getToken(map, 'p1')!.pos).toEqual({ x: 9, y: 7 }); // clamped to max
  });

  it('is a no-op for unknown id', () => {
    const map = placeToken(makeMap(), playerA);
    const same = moveToken(map, 'unknown', { x: 5, y: 5 });
    expect(same).toBe(map); // same reference
  });
});

// ---------------------------------------------------------------------------
// markTokenDead / removeToken
// ---------------------------------------------------------------------------

describe('markTokenDead', () => {
  it('marks token as dead without removing it', () => {
    let map = placeToken(makeMap(), enemy1);
    map = markTokenDead(map, 'e1');
    expect(getToken(map, 'e1')!.isDead).toBe(true);
    expect(map.tokens).toHaveLength(1);
  });
});

describe('removeToken', () => {
  it('removes token from the map', () => {
    let map = placeToken(makeMap(), playerA);
    map = removeToken(map, 'p1');
    expect(map.tokens).toHaveLength(0);
    expect(getToken(map, 'p1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Distance functions
// ---------------------------------------------------------------------------

describe('distanceCells (Chebyshev)', () => {
  it('orthogonal distance', () => {
    expect(distanceCells({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
  });

  it('diagonal counts as 1 per step', () => {
    expect(distanceCells({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3);
  });

  it('mixed diagonal/orthogonal', () => {
    expect(distanceCells({ x: 0, y: 0 }, { x: 4, y: 2 })).toBe(4);
  });

  it('same cell = 0', () => {
    expect(distanceCells({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe('distanceFeet', () => {
  it('converts cells to feet', () => {
    expect(distanceFeet({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(6 * FEET_PER_CELL);
  });
});

// ---------------------------------------------------------------------------
// isInRange / tokensInRange
// ---------------------------------------------------------------------------

describe('isInRange', () => {
  it('returns true when within range', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA, pos: { x: 0, y: 0 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 1, y: 0 } }); // 5 ft away
    expect(isInRange(map, 'p1', 'e1', 5)).toBe(true);
  });

  it('returns false when out of range', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA, pos: { x: 0, y: 0 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 5, y: 0 } }); // 25 ft away
    expect(isInRange(map, 'p1', 'e1', 5)).toBe(false);
  });

  it('returns false if token not found', () => {
    const map = placeToken(makeMap(), playerA);
    expect(isInRange(map, 'p1', 'nonexistent', 60)).toBe(false);
  });
});

describe('tokensInRange', () => {
  it('returns nearby living tokens', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA, pos: { x: 5, y: 5 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 6, y: 5 } }); // 5 ft
    map = placeToken(map, { ...playerB, pos: { x: 9, y: 9 } }); // far away
    const nearby = tokensInRange(map, 'p1', 5);
    expect(nearby.map(t => t.id)).toContain('e1');
    expect(nearby.map(t => t.id)).not.toContain('p2');
  });

  it('excludes dead tokens', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA, pos: { x: 5, y: 5 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 6, y: 5 }, isDead: true });
    expect(tokensInRange(map, 'p1', 30)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findFreeCell
// ---------------------------------------------------------------------------

describe('findFreeCell', () => {
  it('returns the target cell if empty', () => {
    const map = makeMap();
    expect(findFreeCell(map, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
  });

  it('finds adjacent cell when target is occupied', () => {
    let map = placeToken(makeMap(), { ...playerA, pos: { x: 3, y: 3 } });
    const pos = findFreeCell(map, { x: 3, y: 3 });
    expect(pos).not.toEqual({ x: 3, y: 3 });
  });
});

// ---------------------------------------------------------------------------
// autoPlaceParty / autoPlaceEnemies
// ---------------------------------------------------------------------------

describe('autoPlaceParty', () => {
  it('places each party member at a unique position', () => {
    const map = autoPlaceParty(makeMap(20, 15), [
      { id: 'p1', name: 'Aria' },
      { id: 'p2', name: 'Theron' },
    ]);
    expect(map.tokens).toHaveLength(2);
    const positions = map.tokens.map(t => `${t.pos.x},${t.pos.y}`);
    expect(new Set(positions).size).toBe(2); // all unique
  });
});

describe('autoPlaceEnemies', () => {
  it('places enemies on the right side of the map', () => {
    const map = autoPlaceEnemies(makeMap(20, 15), [
      { id: 'e1', name: 'Goblin' },
      { id: 'e2', name: 'Orc' },
    ]);
    expect(map.tokens).toHaveLength(2);
    map.tokens.forEach(t => {
      expect(t.type).toBe('enemy');
      expect(t.pos.x).toBeGreaterThan(10); // right half
    });
  });
});

// ---------------------------------------------------------------------------
// assignTokenColor
// ---------------------------------------------------------------------------

describe('assignTokenColor', () => {
  it('returns a hex colour for players', () => {
    const map = makeMap();
    const color = assignTokenColor(map, 'player');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('cycles through palette for multiple tokens', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA });
    map = placeToken(map, { ...playerB });
    const c1 = assignTokenColor(map, 'player');
    // There should be 3 player tokens already so we get the 3rd colour
    expect(c1).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// buildGridContextString
// ---------------------------------------------------------------------------

describe('buildGridContextString', () => {
  it('includes map dimensions in the header', () => {
    let map = makeMap(20, 15);
    map.label = 'Dungeon';
    map = placeToken(map, { ...playerA, pos: { x: 3, y: 7 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 12, y: 7 } });
    const ctx = buildGridContextString(map);
    expect(ctx).toContain('20×15');
    expect(ctx).toContain('Dungeon');
  });

  it('includes player and enemy tokens', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA, pos: { x: 0, y: 0 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 5, y: 0 } });
    const ctx = buildGridContextString(map);
    expect(ctx).toContain('Aria');
    expect(ctx).toContain('Goblin');
    expect(ctx).toContain('25 ft'); // 5 cells * 5 ft
  });

  it('returns melee advisory when adjacent', () => {
    let map = makeMap();
    map = placeToken(map, { ...playerA, pos: { x: 0, y: 0 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 1, y: 0 } }); // 5ft
    const ctx = buildGridContextString(map);
    expect(ctx).toContain('MELEE');
  });

  it('returns long-range advisory when far apart', () => {
    let map = makeMap(20, 15);
    map = placeToken(map, { ...playerA, pos: { x: 0,  y: 0 } });
    map = placeToken(map, { ...enemy1,  pos: { x: 15, y: 0 } }); // 75ft
    const ctx = buildGridContextString(map);
    expect(ctx).toContain('LONG RANGE');
  });

  it('omits distances section when fewer than 2 tokens', () => {
    let map = makeMap();
    map = placeToken(map, playerA);
    const ctx = buildGridContextString(map);
    expect(ctx).not.toContain('DISTANCES');
  });
});
