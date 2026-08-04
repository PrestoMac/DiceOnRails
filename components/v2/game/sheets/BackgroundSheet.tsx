import React, { useState } from 'react';
import type { Character } from '../../../../types';
import PersonaField from '../../../shared/PersonaField';
import { generatePortrait } from '../../../../services/llm';
import {
  BACKGROUNDS_CATALOG,
  ALIGNMENTS,
  getBackgroundDef,
} from '../../../../utils/backgrounds';
import type { IdealEntry } from '../../../../data/backgrounds';
import Modal from '../../primitives/Modal';
import Button from '../../primitives/Button';
import Chip from '../../primitives/Chip';
import Card from '../../primitives/Card';
import Tabs from '../../primitives/Tabs';
import Tooltip from '../../primitives/Tooltip';
import EmptyState from '../../primitives/EmptyState';
import Avatar from '../../primitives/Avatar';
import { TextArea } from '../../primitives/Field';
import { cx } from '../../primitives/cx';

interface BackgroundSheetProps {
  character: Character;
  open: boolean;
  onClose: () => void;
  /** Patches character fields. When omitted, the sheet renders read-only. */
  onUpdateCharacterFields?: (partial: Partial<Character>, charId?: string) => void;
  /** Viewer id; when provided and it differs from the character's ownerId,
   *  the sheet is forced read-only (multiplayer viewer protection). */
  currentUserId?: string;
}

type TabKey = 'persona' | 'reference';

const MAX_PERSONALITY = 2;
const MAX_SINGLE = 1;

/** Read-only numbered SRD reference table for the Reference tab. */
const RefTable: React.FC<{ title: string; entries: string[] }> = ({ title, entries }) => (
  <div>
    <p className="text-[10px] uppercase font-bold text-ember-400/90 tracking-widest mb-2">{title}</p>
    <ol className="space-y-1">
      {entries.map((e, i) => (
        <li key={i} className="text-[10px] text-parchment-mute flex gap-2">
          <span className="text-parchment-faint font-mono shrink-0">{i + 1}.</span>
          <span>{e}</span>
        </li>
      ))}
    </ol>
  </div>
);

/** Emberlight V2 background & persona sheet: alignment, SRD background, personality
 *  traits / ideals / bonds / flaws (via the shared PersonaField), appearance,
 *  backstory, and portrait (re)generation. Full port of the legacy BackgroundModal.
 *  Controlled by the `character` prop — every edit commits immediately via
 *  onUpdateCharacterFields(patch, character.id). */
const BackgroundSheet: React.FC<BackgroundSheetProps> = ({ character, open, onClose, onUpdateCharacterFields, currentUserId }) => {
  const [tab, setTab] = useState<TabKey>('persona');
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);

  const ownerMismatch =
    currentUserId !== undefined && character.ownerId !== undefined && character.ownerId !== currentUserId;
  const readOnly = !onUpdateCharacterFields || ownerMismatch;
  const update = (patch: Partial<Character>) => {
    if (readOnly) return;
    onUpdateCharacterFields?.(patch, character.id);
  };

  const handleGeneratePortrait = async () => {
    if (readOnly || isGeneratingPortrait) return;
    setIsGeneratingPortrait(true);
    try {
      const url = await generatePortrait(character);
      if (url) update({ portraitUrl: url });
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  const bgDef = getBackgroundDef(character.background);
  const idealTexts: string[] = bgDef ? bgDef.ideals.map((i: IdealEntry) => i.text) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={character.name}
      subtitle="Background & Persona"
      icon="fa-id-card"
      size="lg"
    >
      <div className="space-y-4">
        {/* Portrait header */}
        <div className="flex items-center gap-4">
          <Avatar name={character.name} src={character.portraitUrl} size="lg" ring="ember" />
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="text-[10px] uppercase font-bold text-parchment-faint tracking-widest">Portrait</p>
            <Button
              variant="arcane"
              size="sm"
              icon="fa-image"
              loading={isGeneratingPortrait}
              disabled={readOnly}
              onClick={handleGeneratePortrait}
            >
              {isGeneratingPortrait ? 'Generating...' : character.portraitUrl ? 'Regenerate' : 'Generate'}
            </Button>
            <p className="text-[9px] text-parchment-faint italic">Seeded from appearance (or name + race + class)</p>
          </div>
          {readOnly && (
            <Chip color="neutral" icon="fa-eye" className="ml-auto uppercase">Read Only</Chip>
          )}
        </div>

        <Tabs
          items={[
            { key: 'persona', label: 'Persona', icon: 'fa-id-card' },
            { key: 'reference', label: 'Reference', icon: 'fa-book-open' },
          ]}
          active={tab}
          onChange={key => setTab(key as TabKey)}
        />

        {tab === 'persona' && (
          <>
            {/* Background quick-select */}
            <div>
              <p className="text-[10px] uppercase font-bold text-parchment-faint tracking-widest mb-2">Background</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => update({ background: '' })}
                  disabled={readOnly}
                  className={cx(
                    'px-2 py-1 rounded border text-[10px] font-bold transition-all',
                    !character.background
                      ? 'border-ember-500/60 bg-ember-500/10 text-ember-300'
                      : 'border-white/[0.08] bg-obsidian-900/40 text-parchment-mute hover:border-white/25',
                    readOnly && 'cursor-default opacity-60',
                  )}
                >
                  None
                </button>
                {BACKGROUNDS_CATALOG.map(bg => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => update({ background: bg.id })}
                    disabled={readOnly}
                    className={cx(
                      'px-2 py-1 rounded border text-[10px] font-bold transition-all',
                      character.background === bg.id
                        ? 'border-ember-500/60 bg-ember-500/10 text-ember-300'
                        : 'border-white/[0.08] bg-obsidian-900/40 text-parchment-mute hover:border-white/25',
                      readOnly && 'cursor-default opacity-60',
                    )}
                  >
                    {bg.name}
                  </button>
                ))}
              </div>
              {bgDef && (
                <Card accent="ember" className="mt-2 !p-2.5">
                  <p className="text-[10px] font-bold text-ember-300">{bgDef.feature.name}</p>
                  <p className="text-[9px] text-parchment-faint italic">Roleplay feature (flavor only)</p>
                </Card>
              )}
            </div>

            {/* Alignment 3x3 grid */}
            <div>
              <p className="text-[10px] uppercase font-bold text-parchment-faint tracking-widest mb-2">Alignment</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ALIGNMENTS.map(a => {
                  const active = character.alignment === a.id;
                  return (
                    <Tooltip key={a.id} content={a.description} side="top" disabled={!a.description}>
                      <button
                        type="button"
                        onClick={() => update({ alignment: active ? '' : a.id })}
                        disabled={readOnly}
                        className={cx(
                          'py-2 px-1 rounded-lg border-2 text-center transition-all',
                          active
                            ? 'border-ember-500/60 bg-ember-500/10'
                            : 'border-white/[0.08] bg-obsidian-900/40 hover:border-white/25',
                          readOnly && 'cursor-default opacity-70',
                        )}
                      >
                        <div className="text-[10px] font-bold text-parchment">{a.short}</div>
                        <div className="text-[8px] text-parchment-faint leading-tight">{a.name.replace(/ (Good|Neutral|Evil)/, '')}</div>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            {/* SRD trait tables (shared PersonaField, theme-neutral) */}
            <div className="space-y-2">
              <PersonaField title="Personality Traits" hint={`SRD suggests ${MAX_PERSONALITY}`} dieSize={8} values={character.personalityTraits || []} table={bgDef?.personalityTraits || []} onChange={v => update({ personalityTraits: v })} max={MAX_PERSONALITY} readOnly={readOnly} />
              <PersonaField title="Ideals" hint="What drives you" dieSize={6} values={character.ideals || []} table={idealTexts} onChange={v => update({ ideals: v })} max={MAX_SINGLE} readOnly={readOnly} />
              <PersonaField title="Bonds" hint="Your ties to the world" dieSize={6} values={character.bonds || []} table={bgDef?.bonds || []} onChange={v => update({ bonds: v })} max={MAX_SINGLE} readOnly={readOnly} />
              <PersonaField title="Flaws" hint="Your weakness" dieSize={6} values={character.flaws || []} table={bgDef?.flaws || []} onChange={v => update({ flaws: v })} max={MAX_SINGLE} readOnly={readOnly} />
            </div>

            {/* Appearance + backstory */}
            <div className={cx(readOnly && 'opacity-70')}>
              <TextArea
                label="Appearance"
                value={character.appearance || ''}
                onChange={v => update({ appearance: v })}
                rows={2}
                maxLength={300}
                showCount
                placeholder="Physical description — build, eyes, scars, dress..."
              />
            </div>
            <div className={cx(readOnly && 'opacity-70')}>
              <TextArea
                label="Backstory"
                value={character.backstory || ''}
                onChange={v => update({ backstory: v })}
                rows={3}
                maxLength={500}
                showCount
                placeholder="Where did you come from? What set you on this path?"
              />
            </div>
          </>
        )}

        {tab === 'reference' && (
          <>
            {bgDef ? (
              <div className="space-y-4">
                <Card>
                  <h3 className="text-ember-400 font-bold font-display text-lg">{bgDef.name}</h3>
                  <p className="text-[10px] text-parchment-mute italic mb-2">{bgDef.description}</p>
                  <p className="text-[10px] font-bold text-ember-300 mt-2">{bgDef.feature.name}</p>
                  <p className="text-[10px] text-parchment-mute leading-relaxed mt-1">{bgDef.feature.description}</p>
                </Card>
                <RefTable title="Personality Traits (d8)" entries={bgDef.personalityTraits} />
                <RefTable title="Ideals (d6)" entries={bgDef.ideals.map(i => `[${i.alignment}] ${i.text}`)} />
                <RefTable title="Bonds (d6)" entries={bgDef.bonds} />
                <RefTable title="Flaws (d6)" entries={bgDef.flaws} />
              </div>
            ) : (
              <EmptyState
                compact
                icon="fa-book-open"
                title="No background selected"
                body="Select a background on the Persona tab to view its SRD trait tables here."
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default BackgroundSheet;
