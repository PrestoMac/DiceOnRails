import React, { useState, useMemo } from 'react';
import type { Character } from '../../../../types';
import { getClassDef } from '../../../../services/classEngine';
import Modal from '../../primitives/Modal';
import Button from '../../primitives/Button';
import IconButton from '../../primitives/IconButton';
import { cx } from '../../primitives/cx';

export type RecoveryKind = 'arcane' | 'natural';

interface RecoverySheetProps {
  kind: RecoveryKind;
  character: Character;
  open: boolean;
  onClose: () => void;
  onConfirm: (characterId: string, selections: Array<{ level: number; count: number }>) => void;
}

const MAX_SLOT_LEVEL = 5;

const KIND_META: Record<RecoveryKind, { title: string; icon: string; accentText: string }> = {
  arcane: {
    title: 'Arcane Recovery',
    icon: 'fa-hat-wizard',
    accentText: 'text-arcane-300',
  },
  natural: {
    title: 'Natural Recovery',
    icon: 'fa-leaf',
    accentText: 'text-verdant-400',
  },
};

/** Emberlight V2 unified short-rest slot-recovery sheet — merges the legacy
 *  ArcaneRecoveryModal (wizard) and NaturalRecoveryModal (Circle of the Land
 *  druid), which were byte-identical apart from title/icon/class wording.
 *  Slot levels 1-5 are shown only for pools that actually exist on the
 *  character (`spell-slot-N` resources); total selection is bounded by
 *  ceil(level / 2) summed slot levels. */
const RecoverySheet: React.FC<RecoverySheetProps> = ({ kind, character, open, onClose, onConfirm }) => {
  const meta = KIND_META[kind];
  const maxLevels = useMemo(() => Math.ceil(character.level / 2), [character.level]);

  const initialSlots = useMemo(() => {
    const slots: Record<number, { max: number; current: number }> = {};
    for (let i = 1; i <= MAX_SLOT_LEVEL; i++) {
      const res = character.resources?.find(r => r.id === `spell-slot-${i}`);
      if (res) slots[i] = { max: res.max, current: res.current };
    }
    return slots;
  }, [character.resources]);

  const [allocations, setAllocations] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const level of Object.keys(initialSlots)) {
      init[Number(level)] = 0;
    }
    return init;
  });

  const totalAllocated = useMemo(() =>
    Object.entries(allocations).reduce((sum, [level, count]) => sum + Number(level) * count, 0),
    [allocations]
  );

  const canRecover = totalAllocated > 0 && totalAllocated <= maxLevels;

  const handleChange = (level: number, delta: number) => {
    setAllocations(prev => {
      const slot = initialSlots[level];
      if (!slot) return prev;
      const current = prev[level] ?? 0;
      const next = Math.max(0, Math.min(current + delta, slot.max - slot.current));
      const newTotal = Object.entries({ ...prev, [level]: next })
        .reduce((sum, [l, c]) => sum + Number(l) * c, 0);
      if (newTotal > maxLevels) return prev;
      return { ...prev, [level]: next };
    });
  };

  const resetAllocations = () => {
    setAllocations(() => {
      const init: Record<number, number> = {};
      for (const level of Object.keys(initialSlots)) init[Number(level)] = 0;
      return init;
    });
  };

  const handleConfirm = () => {
    const selections = Object.entries(allocations)
      .filter(([, count]) => count > 0)
      .map(([level, count]) => ({ level: Number(level), count }));
    if (selections.length > 0) {
      onConfirm(character.id, selections);
      resetAllocations();
      onClose();
    }
  };

  const handleClose = () => {
    resetAllocations();
    onClose();
  };

  const hasSlots = Object.keys(initialSlots).length > 0;
  const className = getClassDef(character.class)?.name ?? character.class;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={meta.title}
      subtitle={`Level ${character.level} ${className}`}
      icon={meta.icon}
      size="sm"
      footer={(
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button variant={kind === 'arcane' ? 'arcane' : 'verdant'} size="sm" onClick={handleConfirm} disabled={!canRecover}>
            Recover Slots
          </Button>
        </div>
      )}
    >
      {/* Capacity bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs uppercase tracking-wider text-parchment-mute">Recovery Capacity</span>
        <span className={cx('font-mono text-sm font-bold', totalAllocated > maxLevels ? 'text-blood-400' : meta.accentText)}>
          {totalAllocated} / {maxLevels} levels
        </span>
      </div>

      <div className="space-y-2">
        {!hasSlots && (
          <p className="text-sm text-parchment-mute text-center py-4">No spell slots available.</p>
        )}
        {Object.entries(initialSlots).map(([levelStr, slot]) => {
          const level = Number(levelStr);
          const alloc = allocations[level] ?? 0;
          const canIncrement = slot.current + alloc < slot.max && totalAllocated + level <= maxLevels;
          const canDecrement = alloc > 0;
          return (
            <div key={level} className="flex items-center justify-between bg-obsidian-950/80 rounded-lg px-3 py-2 border border-white/[0.08]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-parchment w-16">Level {level}</span>
                <span className="text-xs text-parchment-faint font-mono">
                  {slot.current}/{slot.max} remaining
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconButton
                  icon="fa-minus"
                  variant="subtle"
                  size="sm"
                  tip={canDecrement ? 'Recover one fewer' : 'Nothing allocated'}
                  onClick={() => handleChange(level, -1)}
                  disabled={!canDecrement}
                />
                <span className={cx('font-mono text-sm font-bold w-5 text-center', meta.accentText)}>{alloc}</span>
                <IconButton
                  icon="fa-plus"
                  variant="subtle"
                  size="sm"
                  tip={canIncrement ? 'Recover one more' : 'Slot full or capacity reached'}
                  onClick={() => handleChange(level, 1)}
                  disabled={!canIncrement}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default RecoverySheet;
