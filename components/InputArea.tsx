import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CombatState, Character } from '../types';
import { isDebugMode } from '../utils/debug';
import { SPELLS_BY_ID } from '../utils/spells';
import { CLASSES_BY_ID } from '../utils/classes';
import { SKILLS_LIST } from '../constants';
import Tooltip from './ui/Tooltip';
import ArcaneRecoveryModal from './ArcaneRecoveryModal';
import SpellbookModal from './SpellbookModal';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  fillText: string;
  tooltip?: string;
  category: 'spell' | 'weapon' | 'feature' | 'rest' | 'skill' | 'item' | 'death';
  badge?: string;
  customStyle?: string;
}

interface InputAreaProps {
  onSendMessage: (text: string) => void;
  onResolveEnemyTurn?: () => void;
  isLoading: boolean;
  combat?: CombatState;
  character?: Character | null;
  onScrollToBottom?: () => void;
  showScrollButton?: boolean;
  /** Optional typing-indicator onChange hook (used in multiplayer so other players see "is writing…"). */
  onInputChanged?: (value: string) => void;
  onArcaneRecovery?: (characterId: string, selections: Array<{ level: number; count: number }>) => void;
  /** Spellbook management for casters (prepare/unprepare + known-caster swaps). */
  onManageSpellbook?: (characterId: string, action: 'prepare' | 'unprepare' | 'learn' | 'forget' | 'finish_prep', spellId: string) => Promise<boolean>;

  onSwapKnownSpell?: (characterId: string, oldSpellId: string, newSpellId: string) => Promise<boolean>;
}

const SCHOOL_ICONS: Record<string, string> = {
  evocation: 'fa-fire', abjuration: 'fa-shield', conjuration: 'fa-wand-sparkles',
  divination: 'fa-eye', enchantment: 'fa-heart', illusion: 'fa-cloud',
  necromancy: 'fa-skull', transmutation: 'fa-flask',
};

const CATEGORY_STYLES: Record<string, string> = {
  spell: 'bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 hover:bg-indigo-800/50 hover:border-indigo-600/50 hover:text-indigo-200',
  weapon: 'bg-red-900/40 text-red-300 border border-red-800/50 hover:bg-red-800/50 hover:border-red-600/50 hover:text-red-200',
  feature: 'bg-amber-900/40 text-amber-300 border border-amber-800/50 hover:bg-amber-800/50 hover:border-amber-600/50 hover:text-amber-200',
  rest: 'bg-stone-800/60 text-stone-300 border border-stone-700 hover:bg-stone-700/60 hover:border-amber-700 hover:text-amber-400',
  skill: 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-800/50 hover:border-emerald-600/50 hover:text-emerald-200',
  item: 'bg-teal-900/40 text-teal-300 border border-teal-800/50 hover:bg-teal-800/50 hover:border-teal-600/50 hover:text-teal-200',
  death: 'bg-red-950/50 text-red-400 border border-red-900 hover:bg-red-900/50 hover:border-red-700 hover:text-red-300 animate-pulse',
};

const QUICK_BTN = "px-2.5 py-1 rounded text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer select-none";
const DISABLED_STYLE = "bg-stone-900/50 text-stone-600 border border-stone-800/40 cursor-not-allowed opacity-50";

const QuickActionBtn: React.FC<{ action: QuickAction; locked: boolean; onClick: () => void; extraTitle?: string }> = ({ action, locked, onClick, extraTitle }) => (
  <button type="button" disabled={locked} onClick={onClick} className={`${QUICK_BTN} ${locked ? DISABLED_STYLE : (action.customStyle || CATEGORY_STYLES[action.category])}`} title={extraTitle || action.fillText}>
    <i className={`fas ${action.icon} text-[9px]`}></i> {action.label}
    {action.badge && (
      <span className="text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-tighter bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 ml-0.5 inline-flex items-center gap-0.5">
        <i className="fas fa-sparkles text-[7px]"></i> {action.badge}
      </span>
    )}
  </button>
);

/** Chat input area with quick-action buttons (spells, weapons, features, rests), speech-to-text, and submit controls. */
const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, onResolveEnemyTurn, isLoading, combat, character, onInputChanged, onArcaneRecovery, onManageSpellbook, onSwapKnownSpell }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  // Ref mirror so the speech-recognition effect (mount-only deps) can read the
  // latest onInputChanged without re-subscribing to the SpeechRecognition API.
  const onInputChangedRef = React.useRef(onInputChanged);
  onInputChangedRef.current = onInputChanged;
  const [recognition, setRecognition] = useState<{ continuous: boolean; interimResults: boolean; lang: string; onresult: (e: unknown) => void; onerror: (e: unknown) => void; onend: () => void; start: () => void; abort: () => void } | null>(null);
  const [showArcaneRecovery, setShowArcaneRecovery] = useState(false);
  const [showSpellbook, setShowSpellbook] = useState(false);
  const isEnemyTurn = combat?.isActive && (combat.initiative[combat.turnIndex]?.type === 'enemy');
  const effectivelyLocked = isLoading || isEnemyTurn;

  const arcaneRecoveryAvailable = useMemo(() => {
    if (!character || character.class !== 'wizard') return false;
    const pool = character.resources?.find(r => r.id === 'arcane-recovery');
    return pool ? pool.current > 0 : true;
  }, [character]);

  /** Spellbook management available for any caster, locked during combat. */
  const spellbookAvailable = useMemo(() => {
    if (!character || !onManageSpellbook) return false;
    const cls = CLASSES_BY_ID[character.class];
    return !!cls?.spellcasting && !combat?.isActive;
  }, [character, onManageSpellbook, combat?.isActive]);

  const quickActions = useMemo<QuickAction[]>(() => {
    if (!character) return [];
    const actions: QuickAction[] = [];

    const spellIds = new Set<string>([
      ...(character.preparedSpells || []),
      ...(character.knownSpells || []),
    ]);
    for (const spellId of spellIds) {
      const spell = SPELLS_BY_ID[spellId];
      if (!spell) continue;
      const levelLabel = spell.level === 0 ? 'Cantrip' : `${spell.level}${spell.level === 1 ? 'st' : spell.level === 2 ? 'nd' : spell.level === 3 ? 'rd' : 'th'}-level`;
      const damageStr = spell.damage ? `${spell.damage.dice} ${spell.damage.type}` : '';
      const healStr = spell.healing ? `Heals ${spell.healing}` : '';
      const saveStr = spell.save ? `DC save ${spell.save.stat.toUpperCase()} (${spell.save.onSuccess})` : '';
      const atkStr = spell.attackRoll ? 'Spell attack' : '';
      const concStr = spell.requiresConcentration ? 'Concentration' : '';
      const extras = [damageStr, healStr, saveStr, atkStr, concStr].filter(Boolean).join(', ');
      const shortDesc = spell.shortDescription || spell.description;

      const isRitual = !!spell.ritual;
      const isPrepared = (character.preparedSpells || []).includes(spellId);
      const isPreparedCaster = CLASSES_BY_ID[character.class]?.spellcasting?.prepMode === 'prepared';
      const isUnpreparedRitual = isRitual && isPreparedCaster && !isPrepared;

      let customStyle: string | undefined;
      let badge: string | undefined;

      if (isRitual) {
        badge = 'Ritual';
        if (isUnpreparedRitual) {
          customStyle = 'bg-indigo-950/70 text-indigo-300 border border-indigo-700/80 hover:bg-indigo-900/80 hover:text-indigo-100 shadow-sm shadow-indigo-950/60';
        } else {
          customStyle = 'bg-indigo-900/50 text-indigo-200 border border-indigo-600/70 hover:bg-indigo-800/60 hover:text-white shadow-sm shadow-indigo-950/60';
        }
      }

      const ritualNote = isRitual
        ? isUnpreparedRitual
          ? ` [Ritual — Unprepared. ${character.class === 'wizard' ? 'Wizards can cast rituals directly from their spellbook without preparing!' : 'Prepare this spell to cast it.'}]`
          : ' [Ritual — 10 min cast time, costs 0 slots]'
        : '';

      actions.push({
        id: `spell-${spellId}`,
        label: spell.name,
        icon: SCHOOL_ICONS[spell.school] || 'fa-hat-wizard',
        fillText: isUnpreparedRitual && character.class === 'wizard' ? `Cast ${spell.name} as a ritual` : `Cast ${spell.name}`,
        tooltip: `${spell.name} — ${levelLabel}${ritualNote}. ${spell.school.charAt(0).toUpperCase() + spell.school.slice(1)}. ${spell.castingTime}, ${spell.range}${extras ? `. ${extras}` : ''}. ${shortDesc.slice(0, 120)}${shortDesc.length > 120 ? '...' : ''}`,
        category: 'spell',
        badge,
        customStyle,
      });
    }


    const equippedWeapons = (character.inventory || []).filter(
      i => i.equipped && i.type === 'weapon'
    );
    for (const w of equippedWeapons) {
      const dmg = w.stats?.damage ? `${w.stats.damage} ${w.stats.damageType || ''}` : '';
      const props = w.stats?.properties?.length ? w.stats.properties.join(', ') : '';
      actions.push({
        id: `weapon-${w.name}`,
        label: w.name,
        icon: 'fa-crosshairs',
        fillText: `Attack with ${w.name}`,
        tooltip: `${w.name}${dmg ? ` — ${dmg}` : ''}${props ? `. Properties: ${props}` : ''}${w.description ? `. ${w.description.slice(0, 100)}` : ''}`,
        category: 'weapon',
      });
    }

    const classDef = CLASSES_BY_ID[character.class];
    if (classDef) {
      for (const feat of classDef.features) {
        if (feat.level > character.level || feat.kind !== 'resource') continue;
        if (feat.id === 'arcane-recovery') continue; // handled by dedicated modal button
        actions.push({
          id: `feature-${feat.id}`,
          label: feat.name,
          icon: 'fa-bolt',
          fillText: `Use ${feat.name}`,
          tooltip: `${feat.name} (Level ${feat.level}, ${feat.kind.replace('-', ' ')}). ${feat.description.slice(0, 150)}${feat.description.length > 150 ? '...' : ''}`,
          category: 'feature',
        });
      }
    }

    // Skills: top 3-4 trained skills (or class-recommended defaults)
    const trainedSkills = Object.entries(character.skills ?? {})
      .filter(([, rank]) => (rank ?? 0) > 0)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(0, 4);
    for (const [skillName] of trainedSkills) {
      const def = SKILLS_LIST.find(s => s.name === skillName);
      actions.push({
        id: `skill-${skillName}`,
        label: def?.label ?? skillName,
        icon: 'fa-dice-d20',
        fillText: `I roll a ${def?.label ?? skillName} check`,
        tooltip: `${def?.label ?? skillName} (${def?.stat?.toUpperCase() || ''}) — ${def?.description ?? ''}`,
        category: 'skill',
      });
    }

    // Inventory shortcuts: any potion
    const potions = (character.inventory || []).filter(i => i.type === 'potion');
    for (const p of potions.slice(0, 3)) {
      const heal = p.stats?.healing ? `Heals ${p.stats.healing}` : '';
      actions.push({
        id: `item-${p.name}`,
        label: p.name,
        icon: 'fa-flask',
        fillText: `Drink ${p.name}`,
        tooltip: `${p.name}${heal ? ` — ${heal}` : ''}${p.description ? `. ${p.description.slice(0, 100)}` : ''}`,
        category: 'item',
      });
    }

    // Death save button when at 0 HP
    if (character.hp.current === 0) {
      actions.push({
        id: 'death-save',
        label: 'Death Save',
        icon: 'fa-skull',
        fillText: 'I roll a death saving throw',
        tooltip: 'Roll d20 (no modifier). 10+ = success, 1 = 2 failures, 9 or less = failure. 3 successes = stable, 3 failures = death.',
        category: 'death',
      });
    }

    return actions;
  }, [character]);

  useEffect(() => {
    const SR = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
      rec.onresult = (e: { results: Array<Array<{ transcript: string }>> }) => {
        const transcript = e.results[0][0].transcript;
        // Functional update ensures we join onto the latest input value even
        // though this effect captures the mount-time closure.
        setInput(p => {
          const joined = p ? `${p} ${transcript}` : transcript;
          onInputChangedRef.current?.(joined);
          return joined;
        });
        setIsListening(false);
      };
      rec.onerror = (e: { error: string }) => { if (isDebugMode) console.error("Speech recognition error", e.error); setIsListening(false); };
      rec.onend = () => setIsListening(false);
      setRecognition(rec);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognition) { alert("Speech recognition is not supported in this browser."); return; }
    if (isListening) { recognition.stop(); } else { setIsListening(true); recognition.start(); }
  }, [recognition, isListening]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Clear typing indicator on send: setInput('') alone doesn't fire onChange,
    // so we must explicitly notify the parent that the input is now empty.
    // Otherwise the remote "is writing…" chip lingers until the 2.5s/5s
    // auto-clear timers fire.
    if (input.trim() && !effectivelyLocked) {
      onSendMessage(input.trim());
      setInput('');
      onInputChanged?.('');
      if (isListening) recognition.stop();
    }
  };

  const btnCls = (disabled: boolean, accent = false, danger = false) =>
    disabled ? 'bg-stone-800 text-stone-600 cursor-not-allowed' :
    danger ? 'bg-red-800 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 border border-red-700/50 animate-pulse' :
    accent ? 'bg-amber-700 hover:bg-amber-600 text-white shadow-lg shadow-amber-900/20' :
    'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700';

  return (
    <div className="border-t border-stone-800 p-4 bg-stone-950/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto mb-3" data-tour="quick-actions">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase font-bold text-stone-600 tracking-widest">Quick Actions</span>
          <div className="flex-1 h-px bg-stone-800"></div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent" style={{ scrollbarWidth: 'thin' }}>
          {arcaneRecoveryAvailable && onArcaneRecovery && (
            <Tooltip content={`Arcane Recovery: recover up to ${Math.ceil((character?.level ?? 1) / 2)} levels of spell slots. Once per long rest.`} side="top">
              <QuickActionBtn action={{ id: 'arcane-recovery', label: 'Arcane Recovery', icon: 'fa-hat-wizard', fillText: '', category: 'feature' }} locked={effectivelyLocked} onClick={() => setShowArcaneRecovery(true)} extraTitle="Choose spell slots to recover" />
            </Tooltip>
          )}
          {spellbookAvailable && (
            <Tooltip content="Manage Spells: prepare/unprepare spells (prepared casters) or swap a known spell (known casters with a pending level-up swap). Locked in combat." side="top">
              <QuickActionBtn action={{ id: 'manage-spells', label: 'Manage Spells', icon: 'fa-book', fillText: '', category: 'feature' }} locked={effectivelyLocked} onClick={() => setShowSpellbook(true)} extraTitle="Open spellbook" />
            </Tooltip>
          )}
          {quickActions.map(action => (
            <Tooltip key={action.id} content={action.tooltip} side="top">
              <QuickActionBtn action={action} locked={effectivelyLocked} onClick={() => { setInput(action.fillText); onInputChanged?.(action.fillText); }} />
            </Tooltip>
          ))}
          <Tooltip content="Short Rest (1h): spend Hit Dice to recover HP. Refreshes Fighter Second Wind, Warlock pact slots, and other short-rest resources. No automatic HP." side="top">
            <QuickActionBtn action={{ id: 'shortrest', label: 'Short Rest', icon: 'fa-campground', fillText: '/shortrest', category: 'rest' }} locked={effectivelyLocked} onClick={() => { setInput('/shortrest'); onInputChanged?.('/shortrest'); }} extraTitle="Pre-fill Short Rest command" />
          </Tooltip>
          <Tooltip content="Long Rest (8h, 24h cooldown): restores all HP, half of Hit Dice, all spell slots (except Warlock pact slots), and reduces exhaustion by 1 level. Must have ≥1 HP." side="top">
            <QuickActionBtn action={{ id: 'longrest', label: 'Long Rest', icon: 'fa-bed', fillText: '/longrest', category: 'rest' }} locked={effectivelyLocked} onClick={() => { setInput('/longrest'); onInputChanged?.('/longrest'); }} extraTitle="Pre-fill Long Rest command" />
          </Tooltip>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-3">
        <div className="flex items-center gap-2 container mx-auto">
          <div className="w-9 h-9 rounded-full overflow-hidden border border-amber-700/40 bg-stone-900 flex items-center justify-center shrink-0" title={character?.name || 'Adventurer'}>
            {character?.portraitUrl ? (
              <img src={character.portraitUrl} alt={character?.name || ''} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-amber-600/80">{(character?.name || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="relative flex-1">
          <input type="text" value={input} onChange={e => { setInput(e.target.value); onInputChanged?.(e.target.value); }}
            placeholder={isEnemyTurn ? "The enemy is acting..." : isLoading ? "The GM is narrating..." : "What do you do, adventurer?"}
            disabled={effectivelyLocked}
            className={`w-full bg-stone-900 border rounded-lg px-4 py-3 pr-12 text-stone-100 focus:outline-none transition-all fantasy-font text-lg ${
              isEnemyTurn ? 'border-red-900/50 focus:border-red-700' : 'border-stone-800 focus:border-amber-700'
            }`}
          />
          <button type="button" onClick={toggleListening} disabled={effectivelyLocked} className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${isListening ? 'text-red-500 bg-red-900/20 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.3)]' : 'text-stone-500 hover:text-amber-500 hover:bg-stone-800'}`} title={isListening ? "Stop Listening" : "Speak Action"}><i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone-lines'}`}></i></button>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {isEnemyTurn && onResolveEnemyTurn && (
            <button type="button" onClick={onResolveEnemyTurn} disabled={isLoading} className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30 border border-amber-500/50 animate-pulse" title="Let the engine resolve the enemy's turn automatically">
              <i className="fas fa-bolt"></i> Resolve Turn
            </button>
          )}
          <button type="submit" disabled={effectivelyLocked || !input.trim()} className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${btnCls(effectivelyLocked || !input.trim(), !isEnemyTurn, isEnemyTurn)}`}>
            {isLoading ? <i className="fas fa-spinner animate-spin"></i> :
             isEnemyTurn ? <i className="fas fa-shield-halved"></i> :
             <i className="fas fa-feather-pointed"></i>}
            <span className="hidden md:inline">{isEnemyTurn ? 'Enemy\'s Turn' : 'Act Now'}</span>
          </button>
        </div>
      </form>
      {isListening && <div className="max-w-4xl mx-auto mt-2 text-center"><span className="text-[10px] text-amber-600 uppercase font-bold tracking-[0.2em] animate-pulse">The scrolls are listening...</span></div>}
      {isEnemyTurn && (
        <div className="max-w-4xl mx-auto mt-2 text-center flex flex-col gap-0.5">
          <span className="text-[10px] text-red-500 uppercase font-bold tracking-[0.2em] animate-pulse">⚔️ Enemy Turn Active</span>
          <span className="text-[9px] text-stone-500 font-sans">Wait for GM response, or click "Resolve Turn" to roll for enemy actions.</span>
        </div>
      )}
      {character && onArcaneRecovery && (
        <ArcaneRecoveryModal
          character={character}
          isOpen={showArcaneRecovery}
          onClose={() => setShowArcaneRecovery(false)}
          onRecover={(selections) => onArcaneRecovery(character.id, selections)}
        />
      )}
      {character && onManageSpellbook && (
        <SpellbookModal
          character={character}
          isOpen={showSpellbook}
          onClose={() => setShowSpellbook(false)}
          onManageSpellbook={onManageSpellbook}
          onSwapKnownSpell={onSwapKnownSpell}
          isCombatActive={!!combat?.isActive}
        />
      )}
    </div>
  );
};

export default InputArea;

