import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, MessageRole, RollData } from '../../../types';
import type { AppSettings } from '../../../types';
import { cx } from '../primitives/cx';
import Avatar from '../primitives/Avatar';
import Chip from '../primitives/Chip';
import IconButton from '../primitives/IconButton';
import RollCardV2 from './RollCardV2';
import { parseLegacyRolls, type LegacyRoll } from './legacyRolls';
import { formatMessageText } from './format';

interface MessageBubbleProps {
  message: Message;
  settings: AppSettings;
  isLastUserMessage: boolean;
  portraitUrl?: string;
  showAvatar: boolean;
  isProcessing: boolean;
  onUndo?: () => void;
  onRewind?: () => void;
  onSpeak?: (text: string, id: string) => void;
  isSpeaking: boolean;
  onRollClick?: (roll: RollData) => void;
  isPendingOwner?: boolean;
  onRemovePending?: (id: string) => void;
}

const LEGACY_KIND_CLASS: Record<LegacyRoll['kind'], string> = {
  success: 'border-verdant-600/40 bg-verdant-950/25 text-verdant-300',
  failure: 'border-blood-600/40 bg-blood-950/25 text-blood-300',
  neutral: 'border-ember-600/30 bg-obsidian-900/80 text-ember-300',
};

const LegacyRollBadge: React.FC<{ roll: LegacyRoll }> = ({ roll }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px]',
      LEGACY_KIND_CLASS[roll.kind],
    )}
  >
    <i className="fas fa-dice-d20 text-[9px]" aria-hidden="true" />
    <span className="font-bold">{roll.label}</span>
    <span className="text-parchment-dim">{roll.detail}</span>
  </span>
);

/** Renders one chat message in the Emberlight V2 voice: narration prose, player bubbles, system cards, or isolated tool logs. */
const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  // `settings` is accepted for API parity (TTS voice config) — the actual
  // speak/cleanup pipeline is owned by ChatColumn, which calls onSpeak.
  isLastUserMessage,
  portraitUrl,
  showAvatar,
  isProcessing,
  onUndo,
  onRewind,
  onSpeak,
  isSpeaking,
  onRollClick,
  isPendingOwner = false,
  onRemovePending,
}) => {
  const isPending = message.pending === true;
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const rolls: RollData[] = message.rollData
    ? Array.isArray(message.rollData)
      ? message.rollData
      : [message.rollData]
    : [];
  const legacy = rolls.length === 0 ? parseLegacyRolls(message.text) : { rolls: [], strippedText: message.text };
  const rawDisplay = message.rollData ? message.text : legacy.strippedText || message.text;
  const displayText = formatMessageText(rawDisplay, message.role);

  const rollsBlock = rolls.length > 0 ? (
    <div className={cx('mt-2', rolls.length > 1 ? 'flex flex-col gap-2' : '')}>
      {rolls.map((rd, i) => (
        <RollCardV2 key={`${rd.type}-${i}`} roll={rd} onClick={onRollClick ? () => onRollClick(rd) : undefined} />
      ))}
    </div>
  ) : legacy.rolls.length > 0 ? (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {legacy.rolls.map((r, i) => (
        <LegacyRollBadge key={i} roll={r} />
      ))}
    </div>
  ) : null;

  /* ── MODEL narration ─────────────────────────────────────────────────── */
  if (message.role === MessageRole.MODEL) {
    return (
      <div className="group relative max-w-[92%] animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5 select-none" aria-hidden="true">
          <span className="h-px w-6 bg-gradient-to-r from-transparent to-ember-500/50" />
          <i className="fas fa-gem text-[9px] text-ember-500/70" />
          <span className="h-px w-6 bg-gradient-to-l from-transparent to-ember-500/50" />
        </div>
        <div className="markdown-content font-narration text-lg leading-relaxed text-parchment">
          <ReactMarkdown>{displayText}</ReactMarkdown>
        </div>
        {rollsBlock}
        {onSpeak && (
          <IconButton
            icon={isSpeaking ? 'fa-volume-xmark' : 'fa-volume-high'}
            tip={isSpeaking ? 'Silence the narrator' : 'Hear narration'}
            variant={isSpeaking ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onSpeak(message.text, message.id)}
            className={cx(
              'absolute -right-11 top-1 transition-opacity duration-200',
              isSpeaking ? 'opacity-100 animate-pulse' : 'opacity-0 group-hover:opacity-100',
            )}
          />
        )}
      </div>
    );
  }

  /* ── SYSTEM notice card ──────────────────────────────────────────────── */
  if (message.role === MessageRole.SYSTEM) {
    return (
      <div className="max-w-[92%] rounded-xl bg-blood-950/25 border border-blood-800/40 border-l-2 border-l-blood-500/70 px-4 py-3 animate-fade-in">
        <div className="flex items-center gap-2 pb-1.5 mb-2 border-b border-blood-800/40 font-display text-[10px] uppercase tracking-[0.18em] text-blood-400 font-semibold">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> System
        </div>
        <div className="markdown-content text-sm text-parchment-dim leading-relaxed">
          <ReactMarkdown>{displayText}</ReactMarkdown>
        </div>
        {rollsBlock}
      </div>
    );
  }

  /* ── Isolated TOOL entry (consecutive TOOLs are grouped by SystemLogGroup) ── */
  if (message.role === MessageRole.TOOL) {
    return (
      <div className="max-w-[92%] rounded-lg bg-obsidian-950/60 border border-white/[0.05] px-3 py-2 animate-fade-in">
        <div className="flex items-center gap-2 font-display text-[9px] uppercase tracking-[0.18em] text-verdant-600 font-semibold">
          <i className="fas fa-terminal" aria-hidden="true" /> System Log
        </div>
        <div className="mt-1 font-mono text-xs text-parchment-mute leading-relaxed whitespace-pre-wrap">
          {displayText}
        </div>
      </div>
    );
  }

  /* ── USER bubble ─────────────────────────────────────────────────────── */
  const bubble = (
    <div className="flex flex-col items-end max-w-[85%]">
      <div
        className={cx(
          'group relative rounded-xl px-4 py-3 shadow-md transition-all duration-300',
          isPending
            ? 'bg-obsidian-850 border-2 border-dashed border-ember-500/60'
            : 'bg-obsidian-800 border border-white/[0.06] border-r-2 border-r-ember-500',
        )}
      >
        {isPending && (
          <Chip
            color="ember"
            icon="fa-hourglass-half"
            className="absolute -top-3 left-3 shadow-md shadow-obsidian-950/60"
          >
            Pending
          </Chip>
        )}
        <div className="markdown-content text-parchment leading-relaxed">
          <ReactMarkdown>{displayText}</ReactMarkdown>
        </div>
        {rollsBlock}
      </div>
      <div className="flex items-center gap-2 mt-1.5 px-1">
        {message.senderName && (
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ember-400/80">
            {message.senderName}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-tight text-parchment-faint">{time}</span>
        {isPending && isPendingOwner && onRemovePending && (
          <IconButton
            icon="fa-xmark"
            size="sm"
            variant="danger"
            tip="Remove pending input"
            onClick={(e) => {
              e.stopPropagation();
              onRemovePending(message.id);
            }}
          />
        )}
        {!isPending && isLastUserMessage && (onUndo || onRewind) && (
          <>
            {onUndo && (
              <IconButton
                icon="fa-rotate-left"
                size="sm"
                tip="Undo — revert last turn"
                disabled={isProcessing}
                onClick={onUndo}
              />
            )}
            {onRewind && (
              <IconButton
                icon="fa-clock-rotate-left"
                size="sm"
                tip="Retry — reverts game state and reprocesses"
                disabled={isProcessing}
                onClick={onRewind}
              />
            )}
          </>
        )}
      </div>
    </div>
  );

  if (showAvatar) {
    return (
      <div className="flex flex-row items-start gap-2.5 justify-end animate-fade-in">
        {bubble}
        <Avatar
          name={message.senderName ?? '?'}
          src={portraitUrl ?? null}
          size="sm"
          ring="ember"
          className="mt-1"
        />
      </div>
    );
  }
  return <div className="flex flex-col items-end animate-fade-in">{bubble}</div>;
};

export default MessageBubble;
