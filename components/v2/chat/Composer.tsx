import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CombatState, Character } from '../../../types';
import { isDebugMode } from '../../../utils/debug';
import { cx } from '../primitives/cx';
import Avatar from '../primitives/Avatar';
import Button from '../primitives/Button';
import IconButton from '../primitives/IconButton';
import Tooltip from '../primitives/Tooltip';
import QuickActionsSheet from './QuickActionsSheet';
import EnemyTurnBar from './EnemyTurnBar';

interface SpeechRecognitionResult {
  results: Array<Array<{ transcript: string }>>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionResult) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface ComposerProps {
  onSendMessage: (text: string) => void;
  onResolveEnemyTurn?: () => void;
  isLoading: boolean;
  combat?: CombatState;
  character?: Character | null;
  onInputChanged?: (value: string) => void;
  /** Accepted for parity with the old InputArea API. Recovery/spellbook modals
   *  are owned by the parent (ChatColumn/layout) — the Composer only invokes
   *  the simple opener callbacks below. */
  onArcaneRecovery?: (characterId: string, selections: Array<{ level: number; count: number }>) => void;
  onNaturalRecovery?: (characterId: string, selections: Array<{ level: number; count: number }>) => void;
  placeholder?: string;
  /** Simple openers — the actual modals live outside this component. */
  onOpenArcaneRecovery?: () => void;
  onOpenNaturalRecovery?: () => void;
  onOpenSpellbook?: () => void;
}

const MAX_TEXTAREA_PX = 7 * 24 + 20; // ~7 lines + padding

/** Chat composer: auto-growing textarea, quick actions sheet, speech-to-text, enemy-turn lock. */
const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  onResolveEnemyTurn,
  isLoading,
  combat,
  character,
  onInputChanged,
  placeholder,
  onOpenArcaneRecovery,
  onOpenNaturalRecovery,
  onOpenSpellbook,
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognitionLike | null>(null);
  const recognitionSupported = recognition !== null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ref mirror: the mount-only speech-recognition effect reads the latest
  // onInputChanged without re-subscribing to the SpeechRecognition API.
  const onInputChangedRef = useRef(onInputChanged);
  onInputChangedRef.current = onInputChanged;
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  const isEnemyTurn = !!(combat?.isActive && combat.initiative[combat.turnIndex]?.type === 'enemy');
  const effectivelyLocked = isLoading || isEnemyTurn;

  /* Speech recognition setup (mount-only; ported from old InputArea). */
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e: SpeechRecognitionResult) => {
      const transcript = e.results[0][0].transcript;
      setInput((p) => {
        const joined = p ? `${p} ${transcript}` : transcript;
        onInputChangedRef.current?.(joined);
        return joined;
      });
      setIsListening(false);
    };
    rec.onerror = (e: { error: string }) => {
      if (isDebugMode) console.error('Speech recognition error', e.error);
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    setRecognition(rec);
    return () => {
      if (isListeningRef.current) rec.stop();
    };
    // Mount-only subscription: latest callbacks are read via refs above.
  }, []);

  /* Auto-grow the textarea up to ~7 lines. */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, MAX_TEXTAREA_PX);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_TEXTAREA_PX ? 'auto' : 'hidden';
  }, [input]);

  const toggleListening = useCallback(() => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognition.start();
    }
  }, [recognition, isListening]);

  const submit = useCallback(() => {
    if (!input.trim() || effectivelyLocked) return;
    onSendMessage(input.trim());
    setInput('');
    // setInput('') alone doesn't fire onChange — explicitly clear the remote
    // typing indicator or the "is writing…" chip lingers on other clients.
    onInputChanged?.('');
    if (isListening && recognition) recognition.stop();
  }, [input, effectivelyLocked, onSendMessage, onInputChanged, isListening, recognition]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline. (Native-IME safe.)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    onInputChanged?.(e.target.value);
  };

  const handlePickAction = (fillText: string) => {
    setInput(fillText);
    onInputChanged?.(fillText);
    textareaRef.current?.focus();
  };

  const resolvedPlaceholder = isEnemyTurn
    ? 'The enemy is acting...'
    : isLoading
      ? 'The GM is narrating...'
      : placeholder ?? 'What do you do, adventurer? (Enter to send — Shift+Enter for a new line)';

  const mic = useMemo(
    () => (
      <Tooltip
        content={recognitionSupported ? (isListening ? 'Stop listening' : 'Speak action') : 'Speech recognition unavailable'}
        disabled={false}
      >
        <IconButton
          icon={isListening ? 'fa-microphone' : 'fa-microphone-lines'}
          variant={isListening ? 'danger' : 'ghost'}
          tip={isListening ? 'Stop listening' : 'Speak action'}
          disabled={effectivelyLocked || !recognitionSupported}
          onClick={toggleListening}
          className={isListening ? 'animate-pulse' : undefined}
          aria-label="Speak action"
        />
      </Tooltip>
    ),
    [isListening, effectivelyLocked, recognitionSupported, toggleListening],
  );

  return (
    <div className="bg-obsidian-950/85 backdrop-blur-md border-t border-white/[0.06] px-3 pt-2.5 pb-3">
      <div className="max-w-4xl mx-auto">
        {isEnemyTurn &&
          (onResolveEnemyTurn ? (
            <EnemyTurnBar onResolve={onResolveEnemyTurn} />
          ) : (
            <p className="mb-2 text-center font-display text-[10px] uppercase font-semibold tracking-[0.2em] text-blood-300 animate-pulse">
              Enemy Turn Active
            </p>
          ))}

        <div className="flex items-end gap-2">
          <Avatar
            name={character?.name ?? 'Adventurer'}
            src={character?.portraitUrl || null}
            size="md"
            ring="ember"
            className="mb-0.5 shrink-0"
          />

          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              data-tour="chat-input"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={resolvedPlaceholder}
              disabled={effectivelyLocked}
              className={cx(
                'w-full bg-obsidian-900 border rounded-xl px-4 py-3 font-narration text-lg text-parchment placeholder:text-parchment-faint focus:outline-none transition-colors resize-none v2-scrollbar disabled:opacity-60',
                isEnemyTurn
                  ? 'border-blood-700/50 focus:border-blood-500'
                  : 'border-white/10 focus:border-ember-500/60',
              )}
            />
          </div>

          {mic}
          <IconButton
            icon="fa-dice-d20"
            variant="subtle"
            tip="Quick actions"
            disabled={effectivelyLocked}
            onClick={() => setShowQuickActions(true)}
            data-tour="quick-actions"
          />
          <Button
            onClick={submit}
            disabled={effectivelyLocked || !input.trim()}
            loading={isLoading}
            icon={isEnemyTurn ? 'fa-shield-halved' : 'fa-paper-plane'}
            aria-label={isEnemyTurn ? "Enemy's Turn" : 'Act Now'}
            className={isEnemyTurn ? 'animate-pulse' : undefined}
          >
            {isEnemyTurn ? 'Wait' : 'Send'}
          </Button>
        </div>

        {isListening && (
          <div className="mt-2 text-center">
            <span className="font-display text-[10px] uppercase font-semibold tracking-[0.2em] text-ember-400 animate-pulse">
              The scrolls are listening…
            </span>
          </div>
        )}
      </div>

      <QuickActionsSheet
        open={showQuickActions}
        onClose={() => setShowQuickActions(false)}
        character={character}
        combatActive={!!combat?.isActive}
        onPick={handlePickAction}
        onArcaneRecovery={onOpenArcaneRecovery}
        onNaturalRecovery={onOpenNaturalRecovery}
        onManageSpellbook={onOpenSpellbook}
      />
    </div>
  );
};

export default Composer;
