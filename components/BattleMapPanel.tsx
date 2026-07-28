/**
 * components/BattleMapPanel.tsx
 * VTT Battle Map — renders a canvas-based tactical grid with draggable tokens.
 * Zero new npm packages: uses plain HTML5 Canvas API + React.
 *
 * Features:
 * - Plain dark tactical grid background
 * - Colour-coded player (gold) and enemy (red) tokens with initials
 * - Drag-and-drop token repositioning (mouse events only)
 * - Current-turn highlight ring
 * - Dead token greying with ✕
 * - GM toolbar: grid size, clear map
 * - Multiplayer-safe: token moves call onTokenMove → syncs via GameState
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import { BattleMap, GridToken, GridPosition, Character, CombatState } from '../types';
import { distanceFeet } from '../services/gridService';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BattleMapPanelProps {
  battleMap: BattleMap;
  party: Character[];
  combat: CombatState | undefined;
  currentTurnId?: string;       // id of the combatant whose turn it is
  isHost: boolean;              // only hosts can drag tokens / use GM toolbar
  isProcessing: boolean;
  onTokenMove: (tokenId: string, x: number, y: number) => void;
  onClearMap: () => void;
  onInitMap: (width: number, height: number) => void;
}

// ---------------------------------------------------------------------------
// Rendering constants
// ---------------------------------------------------------------------------

const MIN_CELL = 18;
const MAX_CELL = 80;
const FONT_SCALE = 0.48;        // initials font as fraction of cellSize
const TOKEN_RADIUS_SCALE = 0.38;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function cellToCanvas(
  pos: GridPosition,
  cellSize: number,
): { cx: number; cy: number } {
  return {
    cx: pos.x * cellSize + cellSize / 2,
    cy: pos.y * cellSize + cellSize / 2,
  };
}

function canvasToCell(
  px: number,
  py: number,
  cellSize: number,
  map: BattleMap,
): GridPosition {
  return {
    x: Math.max(0, Math.min(map.width  - 1, Math.floor(px / cellSize))),
    y: Math.max(0, Math.min(map.height - 1, Math.floor(py / cellSize))),
  };
}

// ---------------------------------------------------------------------------
// Token tooltip (distance readout on hover)
// ---------------------------------------------------------------------------

interface TooltipInfo {
  name: string;
  hp?: string;
  distances: string[];
  px: number;
  py: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const BattleMapPanel: React.FC<BattleMapPanelProps> = ({
  battleMap,
  party,
  combat,
  currentTurnId,
  isHost,
  isProcessing,
  onTokenMove,
  onClearMap,
  onInitMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute cell size dynamically to fit the container
  const [cellSize, setCellSize] = useState(battleMap.cellSize || 40);

  // Drag state
  const dragging = useRef<{ tokenId: string; startPos: GridPosition } | null>(null);
  const [dragOverCell, setDragOverCell] = useState<GridPosition | null>(null);

  // Tooltip
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // GM settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingWidth,  setPendingWidth]  = useState(String(battleMap.width));
  const [pendingHeight, setPendingHeight] = useState(String(battleMap.height));

  // ---------------------------------------------------------------------------
  // Resize observer — recompute cell size when container changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth  - 2;   // 1px border each side
      const h = el.clientHeight - 2;
      const byCols = Math.floor(w / battleMap.width);
      const byRows = Math.floor(h / battleMap.height);
      const size   = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.min(byCols, byRows)));
      setCellSize(size);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [battleMap.width, battleMap.height]);

  // ---------------------------------------------------------------------------
  // Build HP lookup maps for tooltips
  // ---------------------------------------------------------------------------

  const partyHpMap = useMemo(() => {
    const m = new Map<string, string>();
    party.forEach(c => m.set(c.id, `${c.hp.current}/${c.hp.max}`));
    return m;
  }, [party]);

  const enemyHpMap = useMemo(() => {
    const m = new Map<string, string>();
    (combat?.enemies || []).forEach(e => m.set(e.id, `${e.hp.current}/${e.hp.max}`));
    return m;
  }, [combat]);

  // ---------------------------------------------------------------------------
  // Canvas drawing
  // ---------------------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = battleMap.width  * cellSize;
    const H = battleMap.height * cellSize;
    canvas.width  = W;
    canvas.height = H;

    // --- Background ---
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1c1a14');
    grad.addColorStop(1, '#0d0c0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // --- Grid lines ---
    ctx.strokeStyle = 'rgba(160,130,80,0.18)';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x <= battleMap.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, H);
      ctx.stroke();
    }
    for (let y = 0; y <= battleMap.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(W, y * cellSize);
      ctx.stroke();
    }

    // --- Drag hover highlight ---
    if (dragOverCell) {
      ctx.fillStyle = 'rgba(251,191,36,0.18)';
      ctx.fillRect(
        dragOverCell.x * cellSize + 1,
        dragOverCell.y * cellSize + 1,
        cellSize - 2,
        cellSize - 2,
      );
    }

    // --- Tokens ---
    const baseRadius = cellSize * TOKEN_RADIUS_SCALE;
    const baseFontSize = Math.max(8, Math.round(cellSize * FONT_SCALE));

    for (const token of battleMap.tokens) {
      const size = token.size ?? 1;
      const radius = baseRadius * (size > 1 ? Math.min(2.2, 1 + (size - 1) * 0.4) : 1);
      const fontSize = baseFontSize * (size > 1 ? 1.2 : 1);
      const { cx, cy } = cellToCanvas(token.pos, cellSize);
      const isCurrentTurn = token.id === currentTurnId;
      const isDead = token.isDead;
      const color = token.color ?? (token.type === 'player' ? '#f59e0b' : '#ef4444');

      // Pulse ring for current turn
      if (isCurrentTurn && !isDead) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Token body
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (isDead) {
        ctx.fillStyle = 'rgba(80,80,80,0.6)';
        ctx.strokeStyle = '#555';
      } else {
        ctx.fillStyle = color + 'cc'; // slight transparency
        ctx.strokeStyle = color;
      }
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Initials or ✕
      ctx.fillStyle = isDead ? '#888' : '#fff';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isDead ? '✕' : getInitials(token.name), cx, cy);

      // Size indicator dot for Large+ creatures
      if (size > 1) {
        ctx.beginPath();
        ctx.arc(cx + radius - 3, cy - radius + 3, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    }
  }, [battleMap, cellSize, currentTurnId, dragOverCell]);

  useEffect(() => { draw(); }, [draw]);

  // ---------------------------------------------------------------------------
  // Mouse event handlers
  // ---------------------------------------------------------------------------

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>): { px: number; py: number } => {
    if (!canvasRef.current) return { px: 0, py: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  const tokenAtPos = (px: number, py: number): GridToken | undefined => {
    const radius = cellSize * TOKEN_RADIUS_SCALE;
    return battleMap.tokens.find(t => {
      const { cx, cy } = cellToCanvas(t.pos, cellSize);
      return Math.hypot(px - cx, py - cy) <= radius;
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isHost || isProcessing) return;
    const { px, py } = getCanvasPos(e);
    const token = tokenAtPos(px, py);
    if (token) {
      dragging.current = { tokenId: token.id, startPos: token.pos };
      e.currentTarget.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = getCanvasPos(e);
    if (dragging.current) {
      const cell = canvasToCell(px, py, cellSize, battleMap);
      setDragOverCell(cell);
      return;
    }
    // Tooltip on hover
    const token = tokenAtPos(px, py);
    if (token) {
      const hp = partyHpMap.get(token.id) ?? enemyHpMap.get(token.id);
      const aliveFoes = battleMap.tokens.filter(t => t.id !== token.id && !t.isDead);
      const distances = aliveFoes.map(f => {
        const ft = distanceFeet(token.pos, f.pos);
        return `→ ${f.name}: ${ft} ft`;
      }).slice(0, 4);
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      setTooltip({ name: token.name, hp: hp ? `HP ${hp}` : undefined, distances, px: e.clientX - rect.left, py: e.clientY - rect.top });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const { px, py } = getCanvasPos(e);
    const cell = canvasToCell(px, py, cellSize, battleMap);
    onTokenMove(dragging.current.tokenId, cell.x, cell.y);
    dragging.current = null;
    setDragOverCell(null);
    e.currentTarget.style.cursor = 'default';
  };

  const handleMouseLeave = () => {
    if (dragging.current) {
      dragging.current = null;
      setDragOverCell(null);
    }
    setTooltip(null);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canvasW = battleMap.width  * cellSize;
  const canvasH = battleMap.height * cellSize;

  return (
    <div className="flex flex-col h-full bg-stone-950 border border-stone-800 rounded-lg overflow-hidden">
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800 bg-stone-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-xs">🗺</span>
          <span className="text-stone-300 text-xs font-bold uppercase tracking-wider">
            {battleMap.label || 'Battle Map'}
          </span>
          <span className="text-stone-600 text-[10px]">
            {battleMap.width}×{battleMap.height} · {battleMap.tokens.filter(t => !t.isDead).length} tokens
          </span>
        </div>
        {isHost && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Grid settings"
              className="p-1.5 rounded hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors"
            >
              <i className="fas fa-sliders-h text-xs" />
            </button>
            <button
              onClick={onClearMap}
              title="Remove battle map"
              className="p-1.5 rounded hover:bg-red-900/40 text-stone-500 hover:text-red-400 transition-colors"
            >
              <i className="fas fa-trash text-xs" />
            </button>
          </div>
        )}
      </div>

      {/* GM Settings panel */}
      {isHost && settingsOpen && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-stone-800 bg-stone-900/40 text-xs shrink-0">
          <span className="text-stone-500 uppercase tracking-wide font-bold">Grid</span>
          <label className="flex items-center gap-1 text-stone-400">
            W
            <input
              type="number" min={5} max={40} value={pendingWidth}
              onChange={e => setPendingWidth(e.target.value)}
              className="w-12 px-1 py-0.5 bg-stone-800 border border-stone-700 rounded text-stone-200 text-center"
            />
          </label>
          <label className="flex items-center gap-1 text-stone-400">
            H
            <input
              type="number" min={5} max={30} value={pendingHeight}
              onChange={e => setPendingHeight(e.target.value)}
              className="w-12 px-1 py-0.5 bg-stone-800 border border-stone-700 rounded text-stone-200 text-center"
            />
          </label>
          <button
            onClick={() => {
              const w = Math.min(40, Math.max(5, parseInt(pendingWidth, 10) || 20));
              const h = Math.min(30, Math.max(5, parseInt(pendingHeight, 10) || 15));
              onInitMap(w, h);
              setSettingsOpen(false);
            }}
            className="px-2 py-0.5 rounded bg-amber-700/60 hover:bg-amber-600/80 text-amber-100 font-bold uppercase tracking-wide transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        style={{ background: 'radial-gradient(ellipse at center, #1a1814 0%, #0a0906 100%)' }}
      >
        <div
          style={{ width: canvasW, height: canvasH, position: 'relative', margin: 'auto' }}
        >
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            style={{
              cursor: isHost && !isProcessing ? 'crosshair' : 'default',
              display: 'block',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{
                position: 'absolute',
                left: tooltip.px + 12,
                top:  tooltip.py - 10,
                pointerEvents: 'none',
                zIndex: 30,
              }}
              className="bg-stone-900/95 border border-stone-700 rounded px-2 py-1.5 text-[10px] text-stone-300 shadow-xl min-w-[120px] max-w-[200px]"
            >
              <div className="font-bold text-amber-400 mb-0.5">{tooltip.name}</div>
              {tooltip.hp && <div className="text-stone-400 mb-0.5">{tooltip.hp}</div>}
              {tooltip.distances.map((d, i) => (
                <div key={i} className="text-stone-500">{d}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t border-stone-800 bg-stone-900/40 text-[10px] text-stone-500 shrink-0">
        <div className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          Players
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600/70" />
          Enemies
        </div>
        {isHost && (
          <span className="ml-auto italic">Drag tokens to reposition</span>
        )}
        <span className="text-stone-700">1 cell = 5 ft</span>
      </div>
    </div>
  );
};

export default BattleMapPanel;
