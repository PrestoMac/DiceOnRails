import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message, MessageRole } from '../../../types';
import type { AppSettings } from '../../../types';
import { speakText, stopSpeaking } from '../../../services/audioService';
import { isDebugMode } from '../../../utils/debug';
import { cx } from '../primitives/cx';
import { Z } from '../primitives/layers';
import IconButton from '../primitives/IconButton';
import Chip from '../primitives/Chip';
import EmptyState from '../primitives/EmptyState';
import { TextField } from '../primitives/Field';
import { useToastV2 } from '../primitives/Toast';
import MessageBubble from './MessageBubble';
import SystemLogGroup from './SystemLogGroup';
import WelcomePanel from './WelcomePanel';
import SuggestionStrip from './SuggestionStrip';
import BatchBar from './BatchBar';
import { buildReplayData } from './replay';

/** Exact props contract for the Emberlight V2 chat column. */
export interface ChatColumnProps {
  messages: Message[];
  settings: AppSettings;
  isProcessing: boolean;
  isMultiplayer: boolean;
  myCharacterId: string | null;
  portraitMap: Record<string, string>;
  showWelcomeChips: boolean;
  onPickWelcome: (text: string) => void;
  onRewind: () => void;
  onUndo: () => void;
  onProcessBatch: () => void;
  onRemovePendingMessage: (id: string) => void;
  onTriggerDiceRoll: (data: Record<string, unknown>) => Promise<void>;
  atmosphereUrl?: string | null;
  onExpandAtmosphere?: () => void;
  worldDescription?: string;
  /* Suggestion strip + batch bar pass-throughs. */
  suggestions: string[];
  onPickSuggestion: (text: string) => void;
  onDismissSuggestions?: () => void;
  pendingCount: number;
}

type FilterType = 'all' | 'narration' | 'player' | 'system';

const FILTER_OPTIONS: Array<{ key: FilterType; label: string; icon: string; match: MessageRole[] }> = [
  { key: 'all', label: 'All', icon: 'fa-layer-group', match: [MessageRole.MODEL, MessageRole.USER, MessageRole.SYSTEM, MessageRole.TOOL] },
  { key: 'narration', label: 'Narration', icon: 'fa-feather-pointed', match: [MessageRole.MODEL] },
  { key: 'player', label: 'Player', icon: 'fa-user', match: [MessageRole.USER] },
  { key: 'system', label: 'System', icon: 'fa-gear', match: [MessageRole.SYSTEM, MessageRole.TOOL] },
];

type ChatItem =
  | { kind: 'message'; message: Message }
  | { kind: 'tools'; id: string; messages: Message[] };

/** Groups consecutive TOOL messages into a single collapsible log block. */
function groupToolMessages(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (!msg) {
      i += 1;
      continue;
    }
    if (msg.role !== MessageRole.TOOL) {
      items.push({ kind: 'message', message: msg });
      i += 1;
      continue;
    }
    const run: Message[] = [msg];
    let j = i + 1;
    while (j < messages.length && messages[j]?.role === MessageRole.TOOL) {
      const next = messages[j];
      if (next) run.push(next);
      j += 1;
    }
    if (run.length >= 2) {
      items.push({ kind: 'tools', id: `tools-${msg.id}`, messages: run });
    } else {
      items.push({ kind: 'message', message: msg });
    }
    i = j;
  }
  return items;
}

/** The full Emberlight V2 chat column: toolbar, message stream, suggestions, batch bar. */
const ChatColumn: React.FC<ChatColumnProps> = ({
  messages,
  settings,
  isProcessing,
  isMultiplayer,
  myCharacterId,
  portraitMap,
  showWelcomeChips,
  onPickWelcome,
  onRewind,
  onUndo,
  onProcessBatch,
  onRemovePendingMessage,
  onTriggerDiceRoll,
  atmosphereUrl,
  onExpandAtmosphere,
  worldDescription,
  suggestions,
  onPickSuggestion,
  onDismissSuggestions,
  pendingCount,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const prevMessageIds = useRef<Set<string>>(new Set());
  const mounted = useRef(false);
  const { toast } = useToastV2();

  const lastUserMessageId = useMemo(
    () => [...messages].reverse().find((m) => m.role === MessageRole.USER)?.id,
    [messages],
  );

  /* Triple-rAF mount scroll — waits for layout + entrance animations. */
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || !scrollRef.current) return;
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Auto-scroll on new messages — only while the user is near the bottom. */
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  /* Stop any in-flight narration audio on unmount. */
  useEffect(() => () => stopSpeaking(), []);

  /* Dice roll modal auto-trigger for newly-arrived messages carrying rollData.
   * Runs on every client (local + remote via realtime). Skips initial-load
   * messages (mounted ref). 4s stagger prevents modal overlap. */
  useEffect(() => {
    const currentIds = new Set(messages.map((m) => m.id));
    if (!mounted.current) {
      prevMessageIds.current = currentIds;
      mounted.current = true;
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let delay = 0;
    for (const msg of messages) {
      if (prevMessageIds.current.has(msg.id)) continue;
      const rolls = msg.rollData ? (Array.isArray(msg.rollData) ? msg.rollData : [msg.rollData]) : [];
      for (const roll of rolls) {
        const t = setTimeout(() => onTriggerDiceRoll(buildReplayData(roll)), delay);
        timers.push(t);
        delay += 4000;
      }
    }
    prevMessageIds.current = currentIds;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [messages, onTriggerDiceRoll]);

  /* Export popover outside-click close. */
  useEffect(() => {
    if (!showExport) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExport]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const scrolled = scrollHeight - scrollTop - clientHeight > 200;
    userScrolledUpRef.current = scrolled;
    setIsScrolledUp(scrolled);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userScrolledUpRef.current = false;
    setIsScrolledUp(false);
  }, []);

  const filteredMessages = useMemo(
    () =>
      messages.filter((msg) => {
        const matchesFilter =
          activeFilter === 'all' || FILTER_OPTIONS.find((f) => f.key === activeFilter)?.match.includes(msg.role);
        if (!matchesFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return msg.text.toLowerCase().includes(q) || (msg.senderName?.toLowerCase().includes(q) ?? false);
      }),
    [messages, activeFilter, searchQuery],
  );

  const chatItems = useMemo(() => groupToolMessages(filteredMessages), [filteredMessages]);

  /* ── TTS replay (ported from old ChatLog.handleSpeech) ─────────────────── */
  const handleSpeak = useCallback(
    async (text: string, id: string) => {
      if (playingMessageId === id) {
        stopSpeaking();
        setPlayingMessageId(null);
        return;
      }
      stopSpeaking();
      try {
        setPlayingMessageId(id);
        const cleanText = text
          .replace(/\*\*/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/`{1,3}.*?`{1,3}/g, '')
          .replace(/dice roll:|check:|success:|failure:/gi, '')
          .trim();
        if (!cleanText) {
          setPlayingMessageId(null);
          return;
        }
        const ok = await speakText(cleanText, settings);
        if (!ok && isDebugMode) console.error('Speech engine encountered a resistance check.');
      } catch (e) {
        if (isDebugMode) console.error("Narrator's voice was silenced by magic:", e);
      } finally {
        setPlayingMessageId(null);
      }
    },
    [playingMessageId, settings],
  );

  /* ── Export (copy / download) — ported from old ChatLog ────────────────── */
  const formatMessageForExport = (msg: Message): string => {
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const roleLabel =
      msg.senderName ||
      (msg.role === MessageRole.USER
        ? 'You'
        : msg.role === MessageRole.MODEL
          ? 'Narrator'
          : msg.role === MessageRole.SYSTEM
            ? 'System'
            : 'Log');
    const cleanText =
      msg.role === MessageRole.SYSTEM || msg.role === MessageRole.TOOL
        ? msg.text.replace(/^\[System:[a-zA-Z0-9_-]+\]\s*/i, '')
        : msg.text;
    return `[${time}] ${roleLabel}:\n${cleanText}\n`;
  };
  const exportText = () => filteredMessages.map(formatMessageForExport).join('\n---\n\n');

  const copyAllToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      toast('Copied to clipboard', 'success');
    } catch {
      toast('Failed to copy', 'error');
    }
    setShowExport(false);
  };

  const downloadAsTxt = () => {
    const blob = new Blob([exportText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diceonrails-log-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded log file', 'success');
    setShowExport(false);
  };

  const isFiltering = searchQuery.trim() !== '' || activeFilter !== 'all';

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
      {/* Toolbar */}
      <div className={cx('flex items-center justify-between px-4 md:px-6 pt-3 pb-1.5 gap-2 shrink-0', Z.content)}>
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={showSearch ? 'fa-xmark' : 'fa-magnifying-glass'}
            variant={showSearch ? 'primary' : 'ghost'}
            tip={showSearch ? 'Close search' : 'Search chat'}
            onClick={() => {
              if (showSearch) {
                setSearchQuery('');
                setActiveFilter('all');
              }
              setShowSearch(!showSearch);
            }}
          />
          {showSearch && (
            <span className="font-display text-[10px] uppercase font-semibold tracking-[0.2em] text-parchment-mute ml-1">
              Search
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {atmosphereUrl && onExpandAtmosphere && (
            <IconButton icon="fa-up-right-and-down-left-from-center" tip="View full scene" onClick={onExpandAtmosphere} />
          )}
          <div className="relative" ref={exportRef}>
            <IconButton
              icon="fa-file-arrow-down"
              tip="Export chat log"
              onClick={() => setShowExport((v) => !v)}
            />
            {showExport && (
              <div
                className={cx(
                  'absolute right-0 top-full mt-1.5 w-52 rounded-lg bg-obsidian-850 border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in',
                  Z.menu,
                )}
              >
                <button
                  type="button"
                  onClick={copyAllToClipboard}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-parchment-dim hover:bg-white/[0.04] hover:text-ember-300 transition-colors text-left cursor-pointer"
                >
                  <i className="fas fa-copy text-xs w-5 text-center text-parchment-faint" aria-hidden="true" /> Copy all
                </button>
                <button
                  type="button"
                  onClick={downloadAsTxt}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-parchment-dim hover:bg-white/[0.04] hover:text-ember-300 transition-colors text-left cursor-pointer"
                >
                  <i className="fas fa-file-lines text-xs w-5 text-center text-parchment-faint" aria-hidden="true" /> Download as .txt
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search / filter panel */}
      {showSearch && (
        <div className="px-4 md:px-6 pb-2 shrink-0">
          <div className="bg-obsidian-900/60 border border-white/[0.06] rounded-lg p-3 space-y-2.5">
            <TextField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search messages..."
              icon="fa-magnifying-glass"
              autoFocus
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTER_OPTIONS.map((opt) => (
                <Chip
                  key={opt.key}
                  icon={opt.icon}
                  color="ember"
                  active={activeFilter === opt.key}
                  onClick={() => setActiveFilter(opt.key)}
                >
                  {opt.label}
                </Chip>
              ))}
              {isFiltering && (
                <span className="ml-auto text-[10px] text-parchment-faint tabular-nums">
                  {filteredMessages.length}/{messages.length} shown
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto v2-scrollbar px-4 md:px-6 py-6 space-y-7"
      >
        {messages.length === 0 &&
          (showWelcomeChips ? (
            <WelcomePanel onPick={onPickWelcome} />
          ) : (
            <EmptyState
              icon="fa-dice-d20"
              title="The table is quiet…"
              body={worldDescription ?? 'Send your first action below to begin the tale.'}
            />
          ))}

        {messages.length > 0 && filteredMessages.length === 0 && (
          <EmptyState
            icon="fa-filter-circle-xmark"
            title="No messages match your search"
            compact
          />
        )}

        {chatItems.map((item) => {
          if (item.kind === 'tools') {
            return <SystemLogGroup key={item.id} messages={item.messages} />;
          }
          const msg = item.message;
          const showAvatar =
            msg.role === MessageRole.USER && !!msg.characterId && !!portraitMap[msg.characterId];
          const portraitUrl = msg.characterId ? portraitMap[msg.characterId] : undefined;
          const isPendingOwner =
            isMultiplayer &&
            msg.pending === true &&
            !!myCharacterId &&
            msg.characterId === myCharacterId &&
            !isProcessing;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              settings={settings}
              isLastUserMessage={msg.id === lastUserMessageId}
              portraitUrl={portraitUrl}
              showAvatar={showAvatar}
              isProcessing={isProcessing}
              onUndo={onUndo}
              onRewind={onRewind}
              onSpeak={handleSpeak}
              isSpeaking={playingMessageId === msg.id}
              onRollClick={(roll) => {
                void onTriggerDiceRoll(buildReplayData(roll));
              }}
              isPendingOwner={isPendingOwner}
              onRemovePending={onRemovePendingMessage}
            />
          );
        })}

        {isProcessing && (
          <div className="flex flex-col items-start animate-fade-in">
            <div className="rounded-xl px-4 py-3 bg-obsidian-900/60 border border-white/[0.05]">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="font-narration italic text-lg text-parchment-mute">The Fates are deciding…</span>
              </div>
            </div>
          </div>
        )}

        {/* Jump-to-latest */}
        <div className={cx('sticky bottom-2 left-0 right-0 flex justify-end px-2 pointer-events-none', Z.menu)}>
          <IconButton
            icon="fa-arrow-down"
            tip="Jump to latest message"
            onClick={jumpToBottom}
            className={cx(
              'shadow-lg shadow-obsidian-950/60 bg-obsidian-800/90 border border-white/10 rounded-full transition-all duration-200',
              isScrolledUp ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-75 pointer-events-none',
            )}
          />
        </div>
      </div>

      {/* Below the stream: suggestions, then the multiplayer batch bar. */}
      <SuggestionStrip
        suggestions={suggestions}
        onPick={onPickSuggestion}
        onDismissAll={onDismissSuggestions}
      />
      {isMultiplayer && !isProcessing && (
        <BatchBar pendingCount={pendingCount} onProcessBatch={onProcessBatch} />
      )}
    </div>
  );
};

export default ChatColumn;
