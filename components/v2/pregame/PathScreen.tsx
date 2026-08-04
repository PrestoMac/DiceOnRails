import React from 'react';
import Screen from '../primitives/Screen';
import Button from '../primitives/Button';
import Chip from '../primitives/Chip';
import { cx } from '../primitives/cx';

interface PathScreenProps {
  onQuickStart: () => void;
  onCustom: () => void;
  onBack: () => void;
}

type Accent = 'ember' | 'arcane';

const ACCENT: Record<Accent, { card: string; well: string; titleHover: string }> = {
  ember: {
    card: 'hover:border-ember-500/50 hover:shadow-[0_0_45px_rgba(238,155,46,0.12)]',
    well: 'bg-ember-500/10 border-ember-500/30 text-ember-400',
    titleHover: 'group-hover:text-ember-300',
  },
  arcane: {
    card: 'hover:border-arcane-500/50 hover:shadow-[0_0_45px_rgba(139,124,246,0.12)]',
    well: 'bg-arcane-500/10 border-arcane-500/30 text-arcane-300',
    titleHover: 'group-hover:text-arcane-300',
  },
};

const ChoiceCard: React.FC<{
  icon: string;
  title: string;
  chip: string;
  description: string;
  ctaLabel: string;
  accent: Accent;
  onChoose: () => void;
}> = ({ icon, title, chip, description, ctaLabel, accent, onChoose }) => (
  <div
    className={cx(
      'group flex flex-col items-center text-center p-6 md:p-8 bg-obsidian-900/70 border-2 border-white/[0.06] rounded-2xl transition-all duration-300',
      ACCENT[accent].card,
    )}
  >
    <div
      className={cx(
        'w-16 h-16 md:w-20 md:h-20 rounded-2xl border flex items-center justify-center mb-4 transition-transform duration-500 group-hover:scale-110',
        ACCENT[accent].well,
      )}
    >
      <i className={cx('fas text-2xl md:text-3xl', icon)} aria-hidden="true" />
    </div>
    <Chip color={accent} className="mb-3">
      {chip}
    </Chip>
    <h2 className={cx('font-display text-2xl md:text-3xl font-bold text-parchment tracking-wide mb-3 transition-colors', ACCENT[accent].titleHover)}>
      {title}
    </h2>
    <p className="text-xs md:text-sm text-parchment-mute leading-relaxed mb-6 max-w-xs">{description}</p>
    <Button
      variant={accent === 'ember' ? 'primary' : 'arcane'}
      block
      icon={icon}
      onClick={onChoose}
      className="mt-auto"
    >
      {ctaLabel}
    </Button>
  </div>
);

/** Decision screen before character creation: Quick Start (preset hero) vs Custom Forge (full wizard). */
const PathScreen: React.FC<PathScreenProps> = ({ onQuickStart, onCustom, onBack }) => (
  <Screen dots center>
    <div className="absolute top-4 left-4 md:top-6 md:left-6">
      <Button variant="ghost" size="sm" icon="fa-arrow-left" onClick={onBack}>
        Back
      </Button>
    </div>
    <div className="w-full max-h-[100dvh] overflow-y-auto v2-scrollbar px-4 py-12">
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center animate-fade-in">
        <div className="text-center mb-8 md:mb-12">
          <p className="font-display text-parchment-faint text-[11px] uppercase tracking-[0.25em] mb-2">
            A new chronicle begins
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-ember-500 tracking-tight mb-3">
            Choose Your Path
          </h1>
          <p className="text-parchment-mute text-sm md:text-base max-w-xl mx-auto">
            Will you step into the world as a seasoned hero, or forge your own from nothing?
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">
          <ChoiceCard
            icon="fa-bolt"
            chip="Recommended"
            title="Quick Start"
            description="Pick from pre-made level-1 heroes — stats, skills, and gear already chosen — and roll into your story in seconds."
            ctaLabel="Choose Quick Start"
            accent="ember"
            onChoose={onQuickStart}
          />
          <ChoiceCard
            icon="fa-feather-pointed"
            chip="Full control"
            title="Custom Forge"
            description="Walk every choice yourself: race, class, ability scores, skills, feats, spells, gear, and persona."
            ctaLabel="Choose Custom Forge"
            accent="arcane"
            onChoose={onCustom}
          />
        </div>
      </div>
    </div>
  </Screen>
);

export default PathScreen;
