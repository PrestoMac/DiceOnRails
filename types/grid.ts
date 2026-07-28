/**
 * VTT Grid Map types — Phase 1 of the Virtual Tabletop integration.
 * All fields are optional-friendly so existing saves are never broken.
 * Tokens are the authority for positions; Character and Enemy are unchanged.
 */

/** A 2D coordinate on the battle grid. Origin (0,0) is top-left. */
export interface GridPosition {
  x: number; // column index (0-based)
  y: number; // row index (0-based)
}

/** A token on the battle map — represents a player, enemy, or NPC. */
export interface GridToken {
  /** Matches Character.id or Enemy.id (or a free-form NPC id). */
  id: string;
  name: string;
  type: 'player' | 'enemy' | 'npc';
  pos: GridPosition;
  /** Grid squares occupied on each side (default 1 = Medium; Large = 2, Huge = 3). */
  size?: number;
  isDead?: boolean;
  /** Display color override in hex (e.g. '#ef4444'). Auto-assigned if omitted. */
  color?: string;
}

/** Terrain cell kinds that block movement or create difficult terrain. */
export type TerrainKind = 'wall' | 'difficult' | 'water' | 'pit' | 'lava';

/** An obstacle or special-terrain cell on the map. */
export interface TerrainCell {
  x: number;
  y: number;
  kind: TerrainKind;
}

/**
 * The full battle map state stored in GameState.battleMap.
 * Lives/dies with the encounter — cleared when not in use.
 */
export interface BattleMap {
  /** Grid columns (width). */
  width: number;
  /** Grid rows (height). */
  height: number;
  /** Pixels per cell when rendered. Affects canvas drawing only, not game distances. */
  cellSize: number;
  /** All tokens currently on the map. */
  tokens: GridToken[];
  /** Optional terrain obstacles for future phases. */
  terrain?: TerrainCell[];
  /** Human-readable label for the location (e.g. "Goblin Cave — Chamber 3"). */
  label?: string;
}
