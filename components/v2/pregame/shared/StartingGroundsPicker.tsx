import React from 'react';
import type { StartingLocation } from '../../../../types';
import Button from '../../primitives/Button';
import EmptyState from '../../primitives/EmptyState';
import { cx } from '../../primitives/cx';

interface StartingGroundsPickerProps {
  locations: StartingLocation[];
  isGenerating: boolean;
  genFailed: boolean;
  selected: StartingLocation | null;
  onSelect: (loc: StartingLocation) => void;
  onReroll: () => void;
  isRerolling?: boolean;
  onRetry?: () => void;
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  heroSummary?: React.ReactNode;
}

/**
 * Shared starting-location picker: loading / failure / grid + preview + reroll & confirm actions.
 * Selection identity is by array INDEX (same-render object reference), never by name.
 */
const StartingGroundsPicker: React.FC<StartingGroundsPickerProps> = ({
  locations,
  isGenerating,
  genFailed,
  selected,
  onSelect,
  onReroll,
  isRerolling = false,
  onRetry,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  heroSummary,
}) => {
  const selectedIndex = selected ? locations.indexOf(selected) : -1;

  if (isGenerating) {
    return (
      <div className="flex flex-col gap-5">
        {heroSummary}
        <div className="flex flex-col items-center justify-center text-center gap-4 py-16">
          <i className="fas fa-dice-d20 fa-spin text-5xl text-ember-400" aria-hidden="true" />
          <p className="font-narration italic text-parchment-mute text-sm">
            Summoning possible starting grounds…
          </p>
          {onRetry && (
            <Button variant="ghost" size="sm" icon="fa-rotate" onClick={onRetry} className="mt-2">
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (genFailed || locations.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {heroSummary}
        <EmptyState
          compact
          icon="fa-map"
          title="The mists did not part"
          body="We could not summon your starting grounds. Steel yourself and try again."
          ctaLabel={onRetry ? 'Retry' : undefined}
          ctaIcon="fa-rotate"
          onCta={onRetry}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {heroSummary}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {locations.map((loc, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={`${idx}-${loc.name}`}
              type="button"
              onClick={() => onSelect(loc)}
              className={cx(
                'p-3.5 rounded-xl border-2 text-left transition-all duration-150 cursor-pointer',
                isSelected
                  ? 'border-ember-500/70 bg-ember-500/10'
                  : 'border-white/[0.08] bg-obsidian-900/50 hover:border-white/20 hover:bg-obsidian-900/80',
              )}
            >
              <h3 className={cx('font-display font-semibold text-sm tracking-wide', isSelected ? 'text-ember-300' : 'text-parchment')}>
                {loc.name}
              </h3>
              <p className="text-[11px] text-parchment-mute mt-1 leading-snug line-clamp-2">{loc.description}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-obsidian-950/70 animate-fade-in">
          {selected.atmosphereUrl ? (
            <img src={selected.atmosphereUrl} alt={selected.name} className="w-full h-40 object-cover" />
          ) : (
            <div className="w-full h-40 flex items-center justify-center bg-obsidian-900/60">
              <i className="fas fa-image text-3xl text-parchment-faint/40" aria-hidden="true" />
            </div>
          )}
          <div className="p-4 text-left">
            <h3 className="font-display text-lg font-bold text-ember-400 tracking-wide">{selected.name}</h3>
            <p className="mt-2 text-xs text-parchment-dim leading-relaxed">{selected.description}</p>
            {selected.introHook && (
              <blockquote className="mt-3 border-l-2 border-ember-500/70 pl-3 font-narration italic text-sm text-ember-200/80 leading-relaxed">
                &ldquo;{selected.introHook}&rdquo;
              </blockquote>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <Button
          variant="ghost"
          icon="fa-rotate"
          loading={isRerolling}
          disabled={isRerolling || isGenerating}
          onClick={onReroll}
        >
          Reroll
        </Button>
        <Button className="flex-1" icon="fa-flag-checkered" disabled={confirmDisabled ?? !selected} onClick={() => onConfirm?.()}>
          {confirmLabel ?? 'Begin Your Chronicle'}
        </Button>
      </div>
    </div>
  );
};

export default StartingGroundsPicker;
