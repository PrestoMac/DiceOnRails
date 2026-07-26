import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Character } from '../types';
import PersonaField from './shared/PersonaField';
import TabButton from './shared/TabButton';
import Tooltip from './ui/Tooltip';
import { generatePortrait } from '../services/llm';
import {
  BACKGROUNDS_CATALOG,
  ALIGNMENTS,
  getBackgroundDef,
  IdealEntry,
} from '../utils/backgrounds';

interface BackgroundModalProps {
  character: Character;
  isOpen: boolean;
  onClose: () => void;
  /** Patches character fields. When omitted, the modal renders read-only. */
  onUpdateCharacterFields?: (partial: Partial<Character>, charId?: string) => void;
}

type Tab = 'persona' | 'reference';

const MAX_PERSONALITY = 2;
const MAX_SINGLE = 1;

/** Modal for viewing/editing a character's SRD 5.1 background & persona
 *  (alignment, personality traits, ideals, bonds, flaws, appearance, backstory).
 *  Mirrors the SpellbookModal isOpen+createPortal pattern. Controlled by the
 *  character prop — every edit commits immediately via onUpdateCharacterFields. */
const BackgroundModal: React.FC<BackgroundModalProps> = ({ character, isOpen, onClose, onUpdateCharacterFields }) => {
  const [tab, setTab] = useState<Tab>('persona');
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  if (!isOpen) return null;

  const readOnly = !onUpdateCharacterFields;
  const update = (patch: Partial<Character>) => onUpdateCharacterFields?.(patch, character.id);

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4"
      onClick={onClose}
    >
      <div
        className="bg-stone-900 border border-stone-700 rounded-xl w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scrollbar shadow-2xl relative animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-amber-500 fantasy-font tracking-widest uppercase">{character.name}</h2>
            <p className="text-[10px] text-stone-500 uppercase tracking-wider">Background & Persona</p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 transition-colors" title="Close">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          <TabButton active={tab === 'persona'} onClick={() => setTab('persona')} icon="fa-id-card">Persona</TabButton>
          <TabButton active={tab === 'reference'} onClick={() => setTab('reference')} icon="fa-book-open">Reference</TabButton>
        </div>

        <div className="px-6 py-4 space-y-4">
          {tab === 'persona' && (
            <>
              {/* Portrait */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-amber-700/50 bg-stone-900 flex items-center justify-center shrink-0 shadow-lg">
                  {character.portraitUrl ? (
                    <img src={character.portraitUrl} alt={character.name} className="w-full h-full object-cover" />
                  ) : (
                    <i className="fas fa-user text-xl text-stone-600"></i>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Portrait</p>
                  <button
                    type="button"
                    onClick={handleGeneratePortrait}
                    disabled={readOnly || isGeneratingPortrait}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-700/50 bg-amber-900/20 hover:bg-amber-900/40 text-amber-400 text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <i className={`fas ${isGeneratingPortrait ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-[9px]`}></i>
                    {isGeneratingPortrait ? 'Generating...' : character.portraitUrl ? 'Regenerate' : 'Generate'}
                  </button>
                  <p className="text-[9px] text-stone-600 italic">Seeded from appearance (or name + race + class)</p>
                </div>
              </div>

              {/* Background quick-select */}
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-2">Background</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => !readOnly && update({ background: '' })}
                    disabled={readOnly}
                    className={`px-2 py-1 rounded border text-[10px] font-bold transition-all ${!character.background ? 'border-amber-600 bg-amber-900/20 text-amber-400' : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-600'} ${readOnly ? 'cursor-default opacity-60' : ''}`}
                  >
                    None
                  </button>
                  {BACKGROUNDS_CATALOG.map(bg => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => !readOnly && update({ background: bg.id })}
                      disabled={readOnly}
                      className={`px-2 py-1 rounded border text-[10px] font-bold transition-all ${character.background === bg.id ? 'border-amber-600 bg-amber-900/20 text-amber-400' : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-600'} ${readOnly ? 'cursor-default opacity-60' : ''}`}
                    >
                      {bg.name}
                    </button>
                  ))}
                </div>
                {bgDef && (
                  <div className="mt-2 bg-amber-950/10 border border-amber-900/30 rounded-lg p-2.5">
                    <p className="text-[10px] font-bold text-amber-400">{bgDef.feature.name}</p>
                    <p className="text-[9px] text-stone-500 italic">Roleplay feature (flavor only)</p>
                  </div>
                )}
              </div>

              {/* Alignment grid */}
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-2">Alignment</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALIGNMENTS.map(a => {
                    const active = character.alignment === a.id;
                    return (
                      <Tooltip key={a.id} content={a.description} side="top">
                        <button
                          type="button"
                          onClick={() => !readOnly && update({ alignment: active ? '' : a.id })}
                          disabled={readOnly}
                          className={`py-2 px-1 rounded-lg border-2 text-center transition-all ${active ? 'border-amber-600 bg-amber-900/20' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'} ${readOnly ? 'cursor-default' : ''}`}
                        >
                          <div className="text-[10px] font-bold text-stone-200">{a.short}</div>
                          <div className="text-[8px] text-stone-500 leading-tight">{a.name.replace(/ (Good|Neutral|Evil)/, '')}</div>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>

              {/* Trait fields */}
              <div className="space-y-2">
                <PersonaField title="Personality Traits" hint={`SRD suggests ${MAX_PERSONALITY}`} dieSize={8} values={character.personalityTraits || []} table={bgDef?.personalityTraits || []} onChange={v => update({ personalityTraits: v })} max={MAX_PERSONALITY} readOnly={readOnly} />
                <PersonaField title="Ideals" hint="What drives you" dieSize={6} values={character.ideals || []} table={idealTexts} onChange={v => update({ ideals: v })} max={MAX_SINGLE} readOnly={readOnly} />
                <PersonaField title="Bonds" hint="Your ties to the world" dieSize={6} values={character.bonds || []} table={bgDef?.bonds || []} onChange={v => update({ bonds: v })} max={MAX_SINGLE} readOnly={readOnly} />
                <PersonaField title="Flaws" hint="Your weakness" dieSize={6} values={character.flaws || []} table={bgDef?.flaws || []} onChange={v => update({ flaws: v })} max={MAX_SINGLE} readOnly={readOnly} />
              </div>

              {/* Appearance */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Appearance</label>
                <textarea
                  value={character.appearance || ''}
                  onChange={e => update({ appearance: e.target.value })}
                  disabled={readOnly}
                  rows={2}
                  maxLength={300}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-stone-300 focus:border-amber-600 outline-none resize-none placeholder-stone-700 disabled:opacity-60"
                  placeholder="Physical description — build, eyes, scars, dress..."
                />
              </div>

              {/* Backstory */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Backstory</label>
                <textarea
                  value={character.backstory || ''}
                  onChange={e => update({ backstory: e.target.value })}
                  disabled={readOnly}
                  rows={3}
                  maxLength={500}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-stone-300 focus:border-amber-600 outline-none resize-none placeholder-stone-700 disabled:opacity-60"
                  placeholder="Where did you come from? What set you on this path?"
                />
              </div>
            </>
          )}

          {tab === 'reference' && (
            <>
              {bgDef ? (
                <div className="space-y-4">
                  <div className="bg-stone-900/60 border border-stone-800 rounded-lg p-4">
                    <h3 className="text-amber-500 font-bold fantasy-font text-lg">{bgDef.name}</h3>
                    <p className="text-[10px] text-stone-400 italic mb-2">{bgDef.description}</p>
                    <p className="text-[10px] font-bold text-amber-400 mt-2">{bgDef.feature.name}</p>
                    <p className="text-[10px] text-stone-400 leading-relaxed mt-1">{bgDef.feature.description}</p>
                  </div>
                  <RefTable title="Personality Traits (d8)" entries={bgDef.personalityTraits} />
                  <RefTable title="Ideals (d6)" entries={bgDef.ideals.map(i => `[${i.alignment}] ${i.text}`)} />
                  <RefTable title="Bonds (d6)" entries={bgDef.bonds} />
                  <RefTable title="Flaws (d6)" entries={bgDef.flaws} />
                </div>
              ) : (
                <div className="text-center py-8">
                  <i className="fas fa-book-open text-3xl text-stone-700 mb-2"></i>
                  <p className="text-xs text-stone-500">Select a background on the Persona tab to view its SRD trait tables here.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Read-only numbered reference table for the modal's Reference tab. */
const RefTable: React.FC<{ title: string; entries: string[] }> = ({ title, entries }) => (
  <div>
    <p className="text-[10px] uppercase font-bold text-amber-700 tracking-widest mb-2">{title}</p>
    <ol className="space-y-1">
      {entries.map((e, i) => (
        <li key={i} className="text-[10px] text-stone-400 flex gap-2">
          <span className="text-stone-600 font-mono shrink-0">{i + 1}.</span>
          <span>{e}</span>
        </li>
      ))}
    </ol>
  </div>
);

export default BackgroundModal;
