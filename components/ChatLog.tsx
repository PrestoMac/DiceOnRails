import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Message, MessageRole, AppSettings } from '../types';
import DiceRollCard from './DiceRollCard';
import { speakText, stopSpeaking } from '../services/audioService';
import ReactMarkdown from 'react-markdown';
import { isDebugMode } from '../utils/debug';
import WelcomeChips from './onboarding/WelcomeChips';

interface ParsedRoll {
  type: 'attack' | 'skill';
  dieFace?: string;
  dieRoll?: number;
  modifier?: number;
  skillRank?: number;
  total: number;
  dc?: number;
  success?: boolean;
  label?: string;
  raw: string;
}

const ATTACK_ROLL_RE = /\((\d+)d(\d+)\s+Roll:\s*(\d+)\s*\+\s*Mod:\s*([+-]?\d+)\)/g;
const ENEMY_ATTACK_RE = /\(Rolled\s*(\d+)\s*vs\s*AC\s*(\d+)\)/g;
const SKILL_ROLL_RE = /\[Roll:\s*(\d+),\s*Stat Mod:\s*([+-]?\d+),\s*Skill Rank:\s*\+(\d+)\]/;
const SKILL_RESULT_RE = /(.+?):\s*(SUCCESS|FAILURE)\s*\(Total\s*(\d+)\s*vs\s*DC\s*(\d+)\)/;

function parseRolls(text: string): ParsedRoll[] {
  const rolls: ParsedRoll[] = [];

  const skillMatch = text.match(SKILL_RESULT_RE);
  const skillBracket = text.match(SKILL_ROLL_RE);
  if (skillMatch && skillBracket) {
    const [, label, result, total, dc] = skillMatch;
    const [, roll, mod, rank] = skillBracket;
    rolls.push({
      type: 'skill',
      dieFace: 'd20',
      dieRoll: parseInt(roll),
      modifier: parseInt(mod),
      skillRank: parseInt(rank),
      total: parseInt(total),
      dc: parseInt(dc),
      success: result === 'SUCCESS',
      label: label.trim(),
      raw: skillMatch[0],
    });
  }

  let attackMatch;
  ATTACK_ROLL_RE.lastIndex = 0;
  while ((attackMatch = ATTACK_ROLL_RE.exec(text)) !== null) {
    const [, , sides, roll, mod] = attackMatch;
    const dieRoll = parseInt(roll);
    const modifier = parseInt(mod);
    const total = dieRoll + modifier;
    const textBefore = text.substring(0, attackMatch.index);
    const lastHit = textBefore.lastIndexOf('**HIT**');
    const lastMiss = textBefore.lastIndexOf('**MISS**');
    const hit = lastHit > lastMiss;
    const miss = lastMiss > lastHit;
    const isNat20 = dieRoll === 20;
    const isNat1 = dieRoll === 1;
    const acMatch = text.match(/vs\s*AC\s*(\d+)/);
    const dc = acMatch ? parseInt(acMatch[1]) : undefined;
    const success = isNat20 || isNat1 ? !isNat1 : hit ? true : miss ? false : undefined;

    rolls.push({
      type: 'attack',
      dieFace: `d${sides}`,
      dieRoll,
      modifier,
      total,
      dc,
      success,
      raw: attackMatch[0],
    });
  }

  // Enemy attack text format: "(Rolled N vs AC M)" — defense-in-depth for
  // prose-only messages that lack structured rollData.
  let enemyMatch;
  ENEMY_ATTACK_RE.lastIndex = 0;
  while ((enemyMatch = ENEMY_ATTACK_RE.exec(text)) !== null) {
    const [, rollStr, acStr] = enemyMatch;
    const dieRoll = parseInt(rollStr);
    const dc = parseInt(acStr);
    const textBefore = text.substring(0, enemyMatch.index);
    const lastHit = textBefore.lastIndexOf('**HIT**');
    const lastMiss = textBefore.lastIndexOf('**MISS**');
    const hit = lastHit > lastMiss;
    const miss = lastMiss > lastHit;
    const isNat20 = dieRoll === 20;
    const isNat1 = dieRoll === 1;
    const success = isNat20 || isNat1 ? !isNat1 : hit ? true : miss ? false : undefined;
    rolls.push({
      type: 'attack',
      dieFace: 'd20',
      dieRoll,
      modifier: 0,
      total: dieRoll,
      dc,
      success,
      raw: enemyMatch[0],
    });
  }

  return rolls;
}

const ROLL_STYLES = {
  success: { accent: 'text-emerald-400', border: 'border-emerald-600/40', bg: 'bg-emerald-950/30', badge: 'bg-emerald-800/60 text-emerald-300' },
  failure: { accent: 'text-red-400', border: 'border-red-600/40', bg: 'bg-red-950/30', badge: 'bg-red-800/60 text-red-300' },
  neutral: { accent: 'text-amber-400', border: 'border-amber-600/40', bg: 'bg-amber-950/30', badge: 'bg-stone-700 text-stone-300' },
} as const;

const ModBadge: React.FC<{ value: number }> = ({ value }) => (
  <>
    <span className="text-stone-600">+</span>
    <span className="text-stone-400">{value}</span>
  </>
);

const RollCard: React.FC<{ roll: ParsedRoll }> = ({ roll }) => {
  const dcLabel = roll.type === 'attack' ? 'AC' : 'DC';
  const isNat20 = roll.dieRoll === 20;
  const isNat1 = roll.dieRoll === 1;
  const style = roll.success === true ? ROLL_STYLES.success : roll.success === false ? ROLL_STYLES.failure : ROLL_STYLES.neutral;

  return (
    <div className={`inline-flex items-center gap-3 px-3 py-2 mt-2 rounded-lg border ${style.border} ${style.bg} backdrop-blur-sm text-sm font-mono`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${style.accent} bg-stone-900/60 border border-stone-700/50 shadow-inner`}>
        {roll.dieFace}
      </div>

      {roll.label && (
        <span className="text-stone-500 text-xs uppercase tracking-wider font-bold max-w-[120px] truncate">
          {roll.label}
        </span>
      )}

      <div className="flex items-center gap-1.5 text-xs">
        <span className={`${isNat20 ? 'text-amber-400 font-bold' : isNat1 ? 'text-red-400 font-bold' : 'text-stone-300'}`}>
          {roll.dieRoll}
        </span>
        {roll.modifier !== undefined && roll.modifier !== 0 && <ModBadge value={roll.modifier} />}
        {roll.skillRank !== undefined && roll.skillRank > 0 && <ModBadge value={roll.skillRank} />}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-stone-600">=</span>
        <span className={`font-bold text-base ${style.accent}`}>{roll.total}</span>
      </div>

      {roll.dc !== undefined && (
        <div className="text-stone-600 text-xs">
          vs {dcLabel} {roll.dc}
        </div>
      )}

      {roll.success !== undefined && (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${style.badge}`}>
          <i className={`fas ${roll.success ? 'fa-check' : 'fa-xmark'} mr-1 text-[8px]`}></i>
          {roll.success
            ? (roll.type === 'attack' ? 'Hit' : 'Pass')
            : (roll.type === 'attack' ? 'Miss' : 'Fail')}
        </span>
      )}
    </div>
  );
};

interface ChatLogProps {
  messages: Message[];
  settings: AppSettings;
  onRewind?: () => void;
  onUndo?: () => void;
  isProcessing?: boolean;
  onExpandAtmosphere?: () => void;
  atmosphereUrl?: string | null;
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScrollChange?: (scrolledUp: boolean) => void;
  disableInternalScroll?: boolean;
  /** Called when the user picks an example prompt from the welcome chips. */
  onPrefillInput?: (text: string) => void;
  /** Whether to show the welcome chips empty state (first session only). */
  showWelcomeChips?: boolean;
  /** Suggested action pills rendered inside the chat area after the last narration. */
  suggestions?: string[];
  /** Called when the user clicks a suggestion pill. */
  onPickSuggestion?: (text: string) => void;
  /** Called when the user dismisses the suggestion pills. */
  onDismissSuggestion?: () => void;
}

type FilterType = 'all' | 'narration' | 'player' | 'system';

const FILTER_OPTIONS: { key: FilterType; label: string; icon: string; match: MessageRole[] }[] = [
  { key: 'all', label: 'All', icon: 'fa-layer-group', match: [MessageRole.MODEL, MessageRole.USER, MessageRole.SYSTEM, MessageRole.TOOL] },
  { key: 'narration', label: 'Narration', icon: 'fa-feather-pointed', match: [MessageRole.MODEL] },
  { key: 'player', label: 'Player', icon: 'fa-user', match: [MessageRole.USER] },
  { key: 'system', label: 'System', icon: 'fa-gear', match: [MessageRole.SYSTEM, MessageRole.TOOL] },
];

const MSG_STYLES: Record<MessageRole, string> = {
  [MessageRole.USER]: 'bg-stone-800 border-r-4 border-amber-600 text-stone-200 shadow-lg',
  [MessageRole.TOOL]: 'bg-black/60 border border-stone-800/50 text-stone-400 text-xs font-mono shadow-sm',
  [MessageRole.SYSTEM]: 'bg-red-950/15 border-l-4 border-red-700/60 text-stone-300 font-sans text-sm shadow-sm',
  [MessageRole.MODEL]: 'text-stone-300 fantasy-font text-lg leading-relaxed bg-stone-900/20 hover:bg-stone-900/30 shadow-inner shadow-stone-950/20',
};

const EXPORT_BTN_CLASS = 'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800/80 hover:text-amber-400 transition-colors text-left';
const EXPORT_ICON_CLASS = 'text-xs w-5 text-center text-stone-500';

/** Renders the scrollable message history with search, filter, export, speech playback, rewind, and roll-highlighting cards. */
const ChatLog: React.FC<ChatLogProps> = ({ messages, settings, onRewind, onUndo, isProcessing, onExpandAtmosphere, atmosphereUrl, scrollRef: externalScrollRef, onScrollChange, disableInternalScroll, onPrefillInput, showWelcomeChips, suggestions, onPickSuggestion, onDismissSuggestion }) => {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef || internalScrollRef;
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastUserMessageId = [...messages].reverse().find(m => m.role === MessageRole.USER)?.id;

  useEffect(() => {
    let cancelled = false;
    const scroll = () => {
      if (cancelled || !scrollRef.current) return;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(scroll);
      });
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [messages]);
  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => { if (showSearchBar && searchInputRef.current) searchInputRef.current.focus(); }, [showSearchBar]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const scrolled = scrollHeight - scrollTop - clientHeight > 200;
    setIsScrolledUp(scrolled);
    onScrollChange?.(scrolled);
  }, [onScrollChange]);

  const filteredMessages = messages.filter(msg => {
    const matchesFilter = activeFilter === 'all' || FILTER_OPTIONS.find(f => f.key === activeFilter)?.match.includes(msg.role);
    if (!matchesFilter) return false;
    if (!searchQuery.trim()) return true;
    return msg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (msg.senderName && msg.senderName.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const jumpToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const showToast = (message: string) => {
    setExportToast(message);
    setTimeout(() => setExportToast(null), 2500);
  };

  const formatMessageForExport = (msg: Message): string => {
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const roleLabel = msg.senderName || (msg.role === MessageRole.USER ? 'You' : msg.role === MessageRole.MODEL ? 'Narrator' : msg.role === MessageRole.SYSTEM ? 'System' : 'Log');
    const cleanText = formatMessageText(msg.text, msg.role);
    return `[${time}] ${roleLabel}:\n${cleanText}\n`;
  };

  const copyAllToClipboard = async () => {
    const logText = filteredMessages.map(formatMessageForExport).join('\n---\n\n');
    try {
      await navigator.clipboard.writeText(logText);
      showToast('Copied to clipboard');
    } catch { showToast('Failed to copy'); }
    setShowExportMenu(false);
  };

  const downloadAsTxt = () => {
    const logText = filteredMessages.map(formatMessageForExport).join('\n---\n\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diceonrails-log-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded log file');
    setShowExportMenu(false);
  };

  const handleSpeech = async (message: Message) => {
    if (playingMessageId === message.id) { stopSpeaking(); setPlayingMessageId(null); return; }
    stopSpeaking();
    try {
      setPlayingMessageId(message.id);
      const cleanText = message.text.replace(/\*\*/g, '').replace(/\[.*?\]/g, '').replace(/`{1,3}.*?`{1,3}/g, '').replace(/dice roll:|check:|success:|failure:/gi, '').trim();
      if (!cleanText) { setPlayingMessageId(null); return; }
      if (!(await speakText(cleanText, settings)) && isDebugMode) console.error("Speech engine encountered a resistance check.");
    } catch (e) { if (isDebugMode) console.error("Narrator's voice was silenced by magic:", e); }
    finally { setPlayingMessageId(null); }
  };

  const formatMessageText = (text: string, role: MessageRole) => {
    if (role === MessageRole.SYSTEM || role === MessageRole.TOOL) {
      return text.replace(/^\[System:[a-zA-Z0-9_-]+\]\s*/i, '');
    }
    return text;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
      {exportToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-800/90 text-amber-100 text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none transition-opacity">
          <i className="fas fa-check-circle"></i> {exportToast}
        </div>
      )}

      <div className="flex items-center justify-between px-4 md:px-8 pt-3 pb-1 gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setShowSearchBar(!showSearchBar); if (showSearchBar) { setSearchQuery(''); setActiveFilter('all'); } }}
            className={`p-2 rounded-lg transition-all duration-200 ${showSearchBar ? 'bg-amber-800/30 text-amber-500' : 'text-stone-600 hover:text-stone-400 hover:bg-stone-800/40'}`}
            title={showSearchBar ? 'Close search' : 'Search chat'}
          >
            <i className={`fas ${showSearchBar ? 'fa-xmark' : 'fa-magnifying-glass'} text-sm`}></i>
          </button>
          {showSearchBar && <span className="text-[10px] uppercase tracking-widest text-stone-600 font-bold ml-1">Search</span>}
        </div>

        <div className="flex items-center gap-1">
          {atmosphereUrl && onExpandAtmosphere && (
            <button
              onClick={onExpandAtmosphere}
              className="p-2 rounded-lg text-stone-600 hover:text-amber-500 hover:bg-stone-800/40 transition-all duration-200"
              title="View full scene"
            >
              <i className="fas fa-expand-arrows-alt text-sm"></i>
            </button>
          )}
          <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => { setShowExportMenu(!showExportMenu); }}
            className="p-2 rounded-lg text-stone-600 hover:text-stone-400 hover:bg-stone-800/40 transition-all duration-200"
            title="Export chat log"
          >
            <i className="fas fa-download text-sm"></i>
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-stone-900 border border-stone-700/60 rounded-lg shadow-xl z-40 overflow-hidden">
              <button onClick={copyAllToClipboard} className={EXPORT_BTN_CLASS}>
                <i className={`fas fa-copy ${EXPORT_ICON_CLASS}`}></i> Copy all
              </button>
              <button onClick={downloadAsTxt} className={EXPORT_BTN_CLASS}>
                <i className={`fas fa-file-lines ${EXPORT_ICON_CLASS}`}></i> Download as .txt
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {showSearchBar && (
        <div className="px-4 md:px-8 pb-2 shrink-0">
          <div className="bg-stone-900/50 border border-stone-700/40 rounded-lg p-3 space-y-2.5">
            <div className="relative">
              <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 text-xs"></i>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full bg-stone-800/60 border border-stone-700/40 rounded-md py-2 pl-9 pr-8 text-sm text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-700/50 focus:ring-1 focus:ring-amber-800/30 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400">
                  <i className="fas fa-xmark text-xs"></i>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setActiveFilter(opt.key)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    activeFilter === opt.key
                      ? 'bg-amber-800/40 text-amber-400 ring-1 ring-amber-700/50'
                      : 'bg-stone-800/40 text-stone-500 hover:text-stone-300 hover:bg-stone-700/40'
                  }`}
                >
                  <i className={`fas ${opt.icon} text-[8px]`}></i>
                  {opt.label}
                </button>
              ))}
              {(searchQuery || activeFilter !== 'all') && (
                <span className="ml-auto text-[10px] text-stone-600 tabular-nums">
                  {filteredMessages.length}/{messages.length} shown
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={externalScrollRef || internalScrollRef} onScroll={handleScroll} className={`flex-1 p-4 md:p-8 space-y-8 ${disableInternalScroll ? '' : 'overflow-y-auto'}`}>
        {messages.length === 0 && (
          showWelcomeChips && onPrefillInput ? (
            <WelcomeChips onPick={onPrefillInput} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-stone-600 space-y-4">
              <i className="fas fa-dragon text-6xl opacity-20"></i>
              <p className="fantasy-font italic text-lg tracking-wide">The chronicles await your first move...</p>
            </div>
          )
        )}

        {messages.length > 0 && filteredMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-stone-600 space-y-3">
            <i className="fas fa-filter-circle-xmark text-4xl opacity-30"></i>
            <p className="text-sm italic">No messages match your search</p>
          </div>
        )}

        {filteredMessages.map(msg => {
          const rolls = parseRolls(msg.text);
          const cleanedText = rolls.reduce((t, r) => t.replace(r.raw, '').replace(/\s+/g, ' ').trim(), msg.text)
            .replace(/\s*,?\s*\(\s*\)/g, '')
            .trim();

          return (
          <div key={msg.id} className={`flex flex-col ${msg.role === MessageRole.USER ? 'items-end' : 'items-start'}`}>
            <div className={`group relative max-w-[85%] rounded-lg p-4 transition-all duration-300 ${MSG_STYLES[msg.role]}`}>
              {msg.role === MessageRole.MODEL && <button onClick={() => handleSpeech(msg)} className={`absolute -right-12 top-2 p-2.5 rounded-full transition-all duration-300 ${playingMessageId === msg.id ? 'text-amber-500 animate-pulse bg-amber-900/30 ring-2 ring-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.4)]' : 'text-stone-600 hover:text-amber-600 opacity-0 group-hover:opacity-100 bg-stone-900/40 hover:scale-110'}`} title={playingMessageId === msg.id ? "Silence Narrator" : "Hear Narration"}><i className={`fas ${playingMessageId === msg.id ? 'fa-volume-xmark' : 'fa-volume-high'} text-sm`}></i></button>}
              {msg.role === MessageRole.SYSTEM && <div className="flex items-center gap-2 mb-1 text-stone-500 uppercase text-[10px] font-bold tracking-widest border-b border-red-800/50 pb-1"><i className="fas fa-triangle-exclamation text-red-700"></i> System</div>}
              {msg.role === MessageRole.TOOL && <div className="flex items-center gap-2 mb-1 text-stone-500 uppercase text-[10px] font-bold tracking-widest border-b border-stone-800/50 pb-1"><i className="fas fa-terminal text-emerald-900"></i> System Log</div>}
              <div className="markdown-content text-stone-300 leading-relaxed"><ReactMarkdown>{formatMessageText(cleanedText || msg.text, msg.role)}</ReactMarkdown></div>
          {msg.rollData ? (
            <div className={`mt-2 ${(Array.isArray(msg.rollData) ? msg.rollData : [msg.rollData]).length > 1 ? 'flex flex-col gap-2' : ''}`}>
              {(Array.isArray(msg.rollData) ? msg.rollData : [msg.rollData]).map((rd, i) => <DiceRollCard key={i} {...rd} />)}
            </div>
          ) : rolls.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-1">
              {rolls.map((roll, i) => <RollCard key={i} roll={roll} />)}
            </div>
          ) : null}
            </div>
            <div className="flex items-center gap-2 mt-2 px-1">
              {msg.senderName && <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600/80">{msg.senderName}</span>}
              <span className="text-[10px] uppercase tracking-tighter text-stone-700">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {msg.role === MessageRole.USER && msg.id === lastUserMessageId && (onUndo || onRewind) && <>
                {onUndo && <button onClick={e => { e.stopPropagation(); onUndo(); }} disabled={isProcessing} className={`ml-1 p-1.5 rounded-full transition-all duration-300 ${isProcessing ? 'text-stone-700 cursor-not-allowed' : 'text-stone-500 hover:text-amber-400 hover:bg-stone-800/60'}`} title="Undo — revert last turn"><i className="fas fa-undo text-[10px]"></i></button>}
                {onRewind && <button onClick={e => { e.stopPropagation(); onRewind(); }} disabled={isProcessing} className={`ml-1 p-1.5 rounded-full transition-all duration-300 ${isProcessing ? 'text-stone-700 cursor-not-allowed' : 'text-stone-500 hover:text-amber-400 hover:bg-stone-800/60'}`} title="Retry — reverts game state and reprocesses"><i className="fas fa-redo text-[10px]"></i></button>}
              </>}
            </div>
          </div>
          );
        })}

        {suggestions && suggestions.length > 0 && onPickSuggestion && (
          <div className="flex flex-col items-start pt-1 pb-2 w-full">
            <div className="max-w-[85%] w-full space-y-1">
              <p className="text-[9px] uppercase font-bold text-amber-600/70 tracking-widest mb-1">Suggested actions</p>
              {suggestions.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  onClick={() => onPickSuggestion(s)}
                  className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all bg-stone-900/60 border border-stone-800 hover:bg-amber-950/30 hover:border-amber-700/50 hover:text-amber-300 text-stone-300 group cursor-pointer"
                >
                  <i className="fas fa-bolt text-[10px] text-amber-600/60 group-hover:text-amber-400 shrink-0"></i>
                  <span className="flex-1 leading-snug">{s}</span>
                  <i className="fas fa-arrow-right text-[10px] text-stone-700 group-hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"></i>
                </button>
              ))}
              {onDismissSuggestion && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDismissSuggestion(); }}
                  className="text-[10px] text-stone-600 hover:text-stone-400 transition-colors pt-0.5"
                >
                  <i className="fas fa-times mr-1"></i>Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col items-start">
            <div className="rounded-lg p-4 text-stone-300 fantasy-font text-lg leading-relaxed bg-stone-900/20 shadow-inner shadow-stone-950/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="text-stone-500 text-sm italic">The Fates are deciding...</span>
              </div>
            </div>
          </div>
        )}
        {!disableInternalScroll && (
          <div className="sticky bottom-2 left-0 right-0 flex justify-end px-3 pointer-events-none z-40">
            <button
              onClick={jumpToBottom}
              className={`w-9 h-9 rounded-full bg-stone-800/80 hover:bg-amber-700/70 text-stone-400 hover:text-amber-300 shadow-lg border border-stone-700/40 hover:border-amber-600/50 transition-all duration-300 flex items-center justify-center pointer-events-auto ${isScrolledUp ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}
              title="Jump to latest message"
            >
              <i className="fas fa-arrow-down text-xs"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatLog;
