import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CombatState, Character } from '../types';
import { isDebugMode } from '../utils/debug';
import { SPELLS_BY_ID } from '../utils/spells';
import { CLASSES_BY_ID } from '../utils/classes';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  fillText: string;
  category: 'spell' | 'weapon' | 'feature' | 'rest';
}

interface InputAreaProps {
  onSendMessage: (text: string) => void;
  onQueueAction?: (text: string, type: 'action' | 'dialogue') => void;
  onResolveEnemyTurn?: () => void;
  isLoading: boolean;
  combat?: CombatState;
  character?: Character | null;
  onScrollToBottom?: () => void;
  showScrollButton?: boolean;
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
};

const QUICK_BTN = 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all shrink-0';
const DISABLED_STYLE = 'bg-stone-800/50 text-stone-600 cursor-not-allowed';

/** Chat input area with quick-action buttons (spells, weapons, features, rests), speech-to-text, and queue/submit controls. */
const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, onQueueAction, onResolveEnemyTurn, isLoading, combat, character, onScrollToBottom, showScrollButton }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const isEnemyTurn = combat?.isActive && (combat.initiative[combat.turnIndex]?.type === 'enemy');
  const effectivelyLocked = isLoading || isEnemyTurn;

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
      actions.push({
        id: `spell-${spellId}`,
        label: spell.name,
        icon: SCHOOL_ICONS[spell.school] || 'fa-hat-wizard',
        fillText: `Cast ${spell.name}`,
        category: 'spell',
      });
    }

    const equippedWeapons = (character.inventory || []).filter(
      i => i.equipped && i.type === 'weapon'
    );
    for (const w of equippedWeapons) {
      actions.push({
        id: `weapon-${w.name}`,
        label: w.name,
        icon: 'fa-crosshairs',
        fillText: `Attack with ${w.name}`,
        category: 'weapon',
      });
    }

    const classDef = CLASSES_BY_ID[character.class];
    if (classDef) {
      for (const feat of classDef.features) {
        if (feat.level > character.level || feat.kind !== 'resource') continue;
        actions.push({
          id: `feature-${feat.id}`,
          label: feat.name,
          icon: 'fa-bolt',
          fillText: `Use ${feat.name}`,
          category: 'feature',
        });
      }
    }

    return actions;
  }, [character]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
      rec.onresult = (e: any) => { setInput(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript); setIsListening(false); };
      rec.onerror = (e: any) => { if (isDebugMode) console.error("Speech recognition error", e.error); setIsListening(false); };
      rec.onend = () => setIsListening(false);
      setRecognition(rec);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognition) { alert("Speech recognition is not supported in this browser."); return; }
    isListening ? recognition.stop() : (setIsListening(true), recognition.start());
  }, [recognition, isListening]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !effectivelyLocked) { onSendMessage(input.trim()); setInput(''); if (isListening) recognition.stop(); }
  };

  const handleQueueClick = (type: 'action' | 'dialogue') => {
    if (input.trim() && !effectivelyLocked && onQueueAction) { onQueueAction(input.trim(), type); setInput(''); if (isListening) recognition.stop(); }
  };

  const btnCls = (disabled: boolean, accent = false, danger = false) =>
    disabled ? 'bg-stone-800 text-stone-600 cursor-not-allowed' :
    danger ? 'bg-red-800 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 border border-red-700/50 animate-pulse' :
    accent ? 'bg-amber-700 hover:bg-amber-600 text-white shadow-lg shadow-amber-900/20' :
    'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700';

  return (
    <div className="border-t border-stone-800 p-4 bg-stone-950/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase font-bold text-stone-600 tracking-widest">Quick Actions</span>
          <div className="flex-1 h-px bg-stone-800"></div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent" style={{ scrollbarWidth: 'thin' }}>
          {quickActions.map(action => (
            <QuickActionBtn key={action.id} action={action} locked={effectivelyLocked} onClick={() => setInput(action.fillText)} />
          ))}
          <QuickActionBtn action={{ id: 'shortrest', label: 'Short Rest', icon: 'fa-campground', fillText: '/shortrest', category: 'rest' }} locked={effectivelyLocked} onClick={() => setInput('/shortrest')} extraTitle="Pre-fill Short Rest command" />
          <QuickActionBtn action={{ id: 'longrest', label: 'Long Rest', icon: 'fa-bed', fillText: '/longrest', category: 'rest' }} locked={effectivelyLocked} onClick={() => setInput('/longrest')} extraTitle="Pre-fill Long Rest command" />
        </div>
      </div>
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-3">
        <div className="relative flex-1 container mx-auto">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            placeholder={isEnemyTurn ? "The enemy is acting..." : isLoading ? "The GM is narrating..." : "What do you do, adventurer?"}
            disabled={effectivelyLocked}
            className={`w-full bg-stone-900 border rounded-lg px-4 py-3 pr-12 text-stone-100 focus:outline-none transition-all fantasy-font text-lg ${
              isEnemyTurn ? 'border-red-900/50 focus:border-red-700' : 'border-stone-800 focus:border-amber-700'
            }`}
          />
          <button type="button" onClick={toggleListening} disabled={effectivelyLocked} className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${isListening ? 'text-red-500 bg-red-900/20 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.3)]' : 'text-stone-500 hover:text-amber-500 hover:bg-stone-800'}`} title={isListening ? "Stop Listening" : "Speak Action"}><i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone-lines'}`}></i></button>
        </div>
        <div className="flex gap-2 justify-end">
          {onQueueAction && <>
            <button type="button" onClick={() => handleQueueClick('action')} disabled={effectivelyLocked || !input.trim()} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${btnCls(effectivelyLocked || !input.trim())}`} title="Add to queue as Action"><i className="fas fa-plus"></i> Queue Action</button>
            <button type="button" onClick={() => handleQueueClick('dialogue')} disabled={effectivelyLocked || !input.trim()} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${btnCls(effectivelyLocked || !input.trim())}`} title="Add to queue as Dialogue"><i className="fas fa-quote-left"></i> Queue Dialogue</button>
          </>}
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
    </div>
  );
};

const QuickActionBtn: React.FC<{ action: QuickAction; locked: boolean; onClick: () => void; extraTitle?: string }> = ({ action, locked, onClick, extraTitle }) => (
  <button type="button" disabled={locked} onClick={onClick} className={`${QUICK_BTN} ${locked ? DISABLED_STYLE : CATEGORY_STYLES[action.category]}`} title={extraTitle || action.fillText}>
    <i className={`fas ${action.icon} text-[9px]`}></i> {action.label}
  </button>
);

export default InputArea;
