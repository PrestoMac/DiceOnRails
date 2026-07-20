import React from 'react';
import { Message, MessageRole } from '../../types';
import DiceRollCard from '../DiceRollCard';
import ReactMarkdown from 'react-markdown';

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
const SKILL_ROLL_RE = /\[Roll:\s*(\d+),\s*Stat Mod:\s*([+-]?\d+),\s*Skill Rank:\s*\+(\d+)\]/;
const SKILL_RESULT_RE = /(.+?):\s*(SUCCESS|FAILURE)\s*\(Total\s*(\d+)\s*vs\s*DC\s*(\d+)\)/;

/** Extracts structured attack and skill roll results from raw message text using regex patterns. */
export function parseRolls(text: string): ParsedRoll[] {
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
    const [, count, sides, roll, mod] = attackMatch;
    const dieRoll = parseInt(roll);
    const modifier = parseInt(mod);
    const total = dieRoll + modifier;
    const totalHits = /\bHIT\b/i.test(text);
    const totalMiss = /\bMISS\b/i.test(text);
    const isNat20 = dieRoll === 20;
    const isNat1 = dieRoll === 1;
    const acMatch = text.match(/vs\s*AC\s*(\d+)/);
    const dc = acMatch ? parseInt(acMatch[1]) : undefined;
    const success = isNat20 || isNat1 ? !isNat1 : totalHits ? true : totalMiss ? false : undefined;

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

  return rolls;
}

const ROLL_STYLES = {
  success: { accent: 'text-emerald-400', border: 'border-emerald-600/40', bg: 'bg-emerald-950/30', badge: 'bg-emerald-800/60 text-emerald-300' },
  failure: { accent: 'text-red-400', border: 'border-red-600/40', bg: 'bg-red-950/30', badge: 'bg-red-800/60 text-red-300' },
  neutral: { accent: 'text-amber-400', border: 'border-amber-600/40', bg: 'bg-amber-950/30', badge: 'bg-stone-700 text-stone-300' },
} as const;

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
        {roll.modifier !== undefined && roll.modifier !== 0 && <><span className="text-stone-600">+</span><span className="text-stone-400">{roll.modifier}</span></>}
        {roll.skillRank !== undefined && roll.skillRank > 0 && <><span className="text-stone-600">+</span><span className="text-stone-400">{roll.skillRank}</span></>}
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

/** Props for the MessageBubble component. */
export interface MessageBubbleProps {
  msg: Message;
  playingMessageId: string | null;
  isProcessing?: boolean;
  onRewind?: () => void;
  onSpeech: (msg: Message) => void;
  messages: Message[];
}

const MSG_STYLES: Record<MessageRole, string> = {
  [MessageRole.USER]: 'bg-stone-800 border-r-4 border-amber-600 text-stone-200 shadow-lg',
  [MessageRole.TOOL]: 'bg-black/60 border border-stone-800/50 text-stone-400 text-xs font-mono shadow-sm',
  [MessageRole.SYSTEM]: 'bg-red-950/15 border-l-4 border-red-700/60 text-stone-300 font-sans text-sm shadow-sm',
  [MessageRole.MODEL]: 'text-stone-300 fantasy-font text-lg leading-relaxed bg-stone-900/20 hover:bg-stone-900/30 shadow-inner shadow-stone-950/20',
};

/** Renders a single chat message with role-based styling, roll cards, speech playback, and rewind button. */
const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, playingMessageId, isProcessing, onRewind, onSpeech, messages }) => {
  const rolls = parseRolls(msg.text);
  const cleanedText = rolls.reduce((t, r) => t.replace(r.raw, '').replace(/\s+/g, ' ').trim(), msg.text)
    .replace(/\s*,?\s*\(\s*\)/g, '')
    .trim();

  const formatMessageText = (text: string, role: MessageRole) => {
    if (role === MessageRole.SYSTEM) {
      return text.replace(/^\[System:[a-zA-Z0-9_-]+\]\s*/i, '');
    }
    return text;
  };

  return (
    <div className={`flex flex-col ${msg.role === MessageRole.USER ? 'items-end' : 'items-start'}`}>
      <div className={`group relative max-w-[85%] rounded-lg p-4 transition-all duration-300 ${MSG_STYLES[msg.role]}`}>
        {msg.role === MessageRole.MODEL && <button onClick={() => onSpeech(msg)} className={`absolute -right-12 top-2 p-2.5 rounded-full transition-all duration-300 ${playingMessageId === msg.id ? 'text-amber-500 animate-pulse bg-amber-900/30 ring-2 ring-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.4)]' : 'text-stone-600 hover:text-amber-600 opacity-0 group-hover:opacity-100 bg-stone-900/40 hover:scale-110'}`} title={playingMessageId === msg.id ? "Silence Narrator" : "Hear Narration"}><i className={`fas ${playingMessageId === msg.id ? 'fa-volume-xmark' : 'fa-volume-high'} text-sm`}></i></button>}
        {msg.role === MessageRole.SYSTEM && <div className="flex items-center gap-2 mb-1 text-stone-500 uppercase text-[10px] font-bold tracking-widest border-b border-red-800/50 pb-1"><i className="fas fa-triangle-exclamation text-red-700"></i> System</div>}
        {msg.role === MessageRole.TOOL && <div className="flex items-center gap-2 mb-1 text-stone-500 uppercase text-[10px] font-bold tracking-widest border-b border-stone-800/50 pb-1"><i className="fas fa-terminal text-emerald-900"></i> System Log</div>}
        <div className="markdown-content text-stone-300 leading-relaxed"><ReactMarkdown>{formatMessageText(cleanedText || msg.text, msg.role)}</ReactMarkdown></div>
        {msg.rollData ? (
          <div className="mt-2">
            <DiceRollCard {...msg.rollData} />
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
        {msg.role === MessageRole.USER && msg.id === [...messages].reverse().find(m => m.role === MessageRole.USER)?.id && onRewind && <button onClick={e => { e.stopPropagation(); onRewind(); }} disabled={isProcessing} className={`ml-1 p-1.5 rounded-full transition-all duration-300 ${isProcessing ? 'text-stone-700 cursor-not-allowed' : 'text-stone-500 hover:text-amber-400 hover:bg-stone-800/60'}`} title="Retry — rewinds game state and reprocesses"><i className="fas fa-redo text-[10px]"></i></button>}
      </div>
    </div>
  );
};

export default MessageBubble;
