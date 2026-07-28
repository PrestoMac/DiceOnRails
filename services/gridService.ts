/**
 * services/gridService.ts
 * Pure functions for the VTT battle map grid system.
 * No side-effects on external state — all functions are deterministic and testable.
 * Follows the existing deep-clone (JSON.parse/JSON.stringify) pattern for mutations.
 */

import { BattleMap, GridPosition, GridToken } from '../types/grid';
import { GameState } from '../types/game';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Feet per grid cell (standard D&D 5e). */
export const FEET_PER_CELL = 5;

/** Token palette — assigned in order when no color override is provided. */
const PLAYER_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316'];
const ENEMY_COLORS  = ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'];

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fresh BattleMap with sensible defaults.
 * @param width  Grid columns (default 20)
 * @param height Grid rows (default 15)
 * @param label  Optional display label
 */
export function initBattleMap(
  width = 20,
  height = 15,
  label?: string,
): BattleMap {
  return {
    width,
    height,
    cellSize: 40,
    tokens: [],
    terrain: [],
    label,
  };
}

/**
 * Auto-assigns a display color for a new token based on its type and the
 * number of existing tokens of that type (cycles through the palette).
 */
export function assignTokenColor(map: BattleMap, type: GridToken['type']): string {
  if (type === 'player') {
    const count = map.tokens.filter(t => t.type === 'player').length;
    return PLAYER_COLORS[count % PLAYER_COLORS.length];
  }
  const count = map.tokens.filter(t => t.type !== 'player').length;
  return ENEMY_COLORS[count % ENEMY_COLORS.length];
}

// ---------------------------------------------------------------------------
// Token CRUD
// ---------------------------------------------------------------------------

/**
 * Adds or replaces a token on the map. Returns a new BattleMap (immutable pattern).
 * If a token with the same id already exists it is replaced.
 */
export function placeToken(map: BattleMap, token: GridToken): BattleMap {
  const color = token.color ?? assignTokenColor(map, token.type);
  const newToken: GridToken = { ...token, color };
  const existing = map.tokens.findIndex(t => t.id === token.id);
  const tokens = existing >= 0
    ? [...map.tokens.slice(0, existing), newToken, ...map.tokens.slice(existing + 1)]
    : [...map.tokens, newToken];
  return { ...map, tokens };
}

/**
 * Moves a token to a new grid cell. Clamps to map bounds.
 * No-op (returns same map reference) if token id is not found.
 */
export function moveToken(map: BattleMap, id: string, newPos: GridPosition): BattleMap {
  const idx = map.tokens.findIndex(t => t.id === id);
  if (idx < 0) return map;
  const clamped: GridPosition = {
    x: Math.max(0, Math.min(map.width  - 1, newPos.x)),
    y: Math.max(0, Math.min(map.height - 1, newPos.y)),
  };
  const updated = { ...map.tokens[idx], pos: clamped };
  return {
    ...map,
    tokens: [...map.tokens.slice(0, idx), updated, ...map.tokens.slice(idx + 1)],
  };
}

/**
 * Marks a token as dead (greys it out on the map). Does NOT remove it so
 * players can still see where enemies fell.
 */
export function markTokenDead(map: BattleMap, id: string): BattleMap {
  const idx = map.tokens.findIndex(t => t.id === id);
  if (idx < 0) return map;
  const updated = { ...map.tokens[idx], isDead: true };
  return {
    ...map,
    tokens: [...map.tokens.slice(0, idx), updated, ...map.tokens.slice(idx + 1)],
  };
}

/** Removes a token from the map entirely. */
export function removeToken(map: BattleMap, id: string): BattleMap {
  return { ...map, tokens: map.tokens.filter(t => t.id !== id) };
}

/** Returns the token for the given id, or undefined. */
export function getToken(map: BattleMap, id: string): GridToken | undefined {
  return map.tokens.find(t => t.id === id);
}

// ---------------------------------------------------------------------------
// Distance & range
// ---------------------------------------------------------------------------

/**
 * Chebyshev distance between two grid positions (D&D diagonal = 1 square).
 * This is the correct metric for D&D 5e movement on a grid.
 */
export function distanceCells(a: GridPosition, b: GridPosition): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Distance in feet between two positions. */
export function distanceFeet(a: GridPosition, b: GridPosition): number {
  return distanceCells(a, b) * FEET_PER_CELL;
}

/**
 * Returns true if the token at sourceId can reach targetId within rangeFt feet.
 * Returns false if either token is not on the map.
 */
export function isInRange(map: BattleMap, sourceId: string, targetId: string, rangeFt: number): boolean {
  const src = getToken(map, sourceId);
  const tgt = getToken(map, targetId);
  if (!src || !tgt) return false;
  return distanceFeet(src.pos, tgt.pos) <= rangeFt;
}

/**
 * Returns all tokens within rangeFt of the source token (excluding itself and dead tokens).
 */
export function tokensInRange(map: BattleMap, sourceId: string, rangeFt: number): GridToken[] {
  const src = getToken(map, sourceId);
  if (!src) return [];
  return map.tokens.filter(t =>
    t.id !== sourceId &&
    !t.isDead &&
    distanceFeet(src.pos, t.pos) <= rangeFt,
  );
}

// ---------------------------------------------------------------------------
// Auto-placement helpers
// ---------------------------------------------------------------------------

/**
 * Finds a free cell near a given position by spiraling outward.
 * Used when auto-placing tokens to avoid stacking.
 */
export function findFreeCell(map: BattleMap, near: GridPosition): GridPosition {
  const occupied = new Set(map.tokens.map(t => `${t.pos.x},${t.pos.y}`));
  if (!occupied.has(`${near.x},${near.y}`)) return near;
  for (let r = 1; r <= Math.max(map.width, map.height); r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only ring
        const cx = Math.max(0, Math.min(map.width  - 1, near.x + dx));
        const cy = Math.max(0, Math.min(map.height - 1, near.y + dy));
        const key = `${cx},${cy}`;
        if (!occupied.has(key)) return { x: cx, y: cy };
      }
    }
  }
  return near; // fallback — overlap if map is truly full
}

/**
 * Auto-places player tokens in a defensive cluster in the centre-left of the map,
 * and enemy tokens in a cluster on the centre-right.
 * Called by start_combat when no explicit positions are provided.
 */
export function autoPlaceParty(map: BattleMap, partyIds: { id: string; name: string }[]): BattleMap {
  let current = map;
  const cx = Math.floor(map.width  / 3);
  const cy = Math.floor(map.height / 2);
  partyIds.forEach((p, i) => {
    const base: GridPosition = { x: cx, y: cy + i - Math.floor(partyIds.length / 2) };
    const pos = findFreeCell(current, base);
    const token: GridToken = { id: p.id, name: p.name, type: 'player', pos };
    current = placeToken(current, token);
  });
  return current;
}

export function autoPlaceEnemies(map: BattleMap, enemyIds: { id: string; name: string }[]): BattleMap {
  let current = map;
  const cx = Math.floor((map.width * 2) / 3);
  const cy = Math.floor(map.height / 2);
  enemyIds.forEach((e, i) => {
    const base: GridPosition = { x: cx, y: cy + i - Math.floor(enemyIds.length / 2) };
    const pos = findFreeCell(current, base);
    const token: GridToken = { id: e.id, name: e.name, type: 'enemy', pos };
    current = placeToken(current, token);
  });
  return current;
}

// ---------------------------------------------------------------------------
// LLM context serialisation
// ---------------------------------------------------------------------------

/**
 * Serialises the battle map into a compact, human-readable string for injection
 * into the LLM context (agentLoop contextParts). The LLM uses this to reason
 * about distances, ranges, and tactical positioning.
 *
 * Example output:
 * ```
 * BATTLE MAP "Goblin Cave" (20×15 grid, 1 cell = 5 ft):
 *   [A] Aria (player) @ (5,7)
 *   [B] Theron (player) @ (4,8)
 *   [E1] Goblin Archer (enemy) @ (12,3)
 *   [E2] Goblin Warrior (enemy) @ (11,4)
 * DISTANCES (ft):
 *   Aria → Goblin Archer: 35 ft  |  Aria → Goblin Warrior: 30 ft
 *   Theron → Goblin Archer: 40 ft  |  Theron → Goblin Warrior: 30 ft
 * ```
 */
export function buildGridContextString(map: BattleMap, _state?: GameState): string {
  const label = map.label ? ` "${map.label}"` : '';
  const lines: string[] = [
    `BATTLE MAP${label} (${map.width}×${map.height} grid, 1 cell = ${FEET_PER_CELL} ft):`,
  ];

  const alive = map.tokens.filter(t => !t.isDead);
  const labelMap = new Map<string, string>();

  // Token listing
  const players = alive.filter(t => t.type === 'player');
  const others  = alive.filter(t => t.type !== 'player');

  players.forEach((t, i) => {
    const lbl = String.fromCharCode(65 + i); // A, B, C…
    labelMap.set(t.id, lbl);
    lines.push(`  [${lbl}] ${t.name} (player) @ (${t.pos.x},${t.pos.y})`);
  });
  others.forEach((t, i) => {
    const lbl = `E${i + 1}`;
    labelMap.set(t.id, lbl);
    lines.push(`  [${lbl}] ${t.name} (enemy) @ (${t.pos.x},${t.pos.y})`);
  });

  if (alive.length < 2) return lines.join('\n');

  // Distance table (players vs enemies only to keep it brief)
  const distLines: string[] = [];
  for (const player of players) {
    const parts: string[] = [];
    for (const enemy of others) {
      const ft = distanceFeet(player.pos, enemy.pos);
      parts.push(`${player.name} → ${enemy.name}: ${ft} ft`);
    }
    if (parts.length) distLines.push('  ' + parts.join('  |  '));
  }
  if (distLines.length) {
    lines.push('DISTANCES (ft):');
    lines.push(...distLines);
  }

  // Range advisories
  const advisories: string[] = [];
  for (const player of players) {
    for (const enemy of others) {
      const ft = distanceFeet(player.pos, enemy.pos);
      if (ft <= 5)  advisories.push(`${player.name} is in MELEE range of ${enemy.name}`);
      else if (ft <= 30) advisories.push(`${player.name} is within SHORT RANGE of ${enemy.name} (${ft} ft)`);
      else               advisories.push(`${player.name} is at LONG RANGE from ${enemy.name} (${ft} ft — ranged or spell required)`);
    }
  }
  if (advisories.length) {
    lines.push('RANGE:');
    advisories.forEach(a => lines.push('  ' + a));
  }

  return lines.join('\n');
}
