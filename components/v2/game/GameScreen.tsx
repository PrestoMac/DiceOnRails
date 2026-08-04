import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppStage } from '../../../types';
import useGameViewModel from '../../../hooks/v2/useGameViewModel';
import { cx } from '../primitives/cx';
import { Z } from '../primitives/layers';
import HpBar from '../primitives/HpBar';
import IconButton from '../primitives/IconButton';
import ConfirmDialog from '../primitives/ConfirmDialog';
import ChatColumn from '../chat/ChatColumn';
import Composer from '../chat/Composer';
import TypingStrip from '../chat/TypingStrip';
import { buildReplayData } from '../chat/replay';
import TopBar from './TopBar';
import CombatBanner from './CombatBanner';
import MapOverlay from './MapOverlay';
import CharacterPanel from './panels/CharacterPanel';
import JournalPanel from './panels/JournalPanel';
import PartyPanel from './panels/PartyPanel';
import LevelUpSheet from './sheets/LevelUpSheet';
import RecoverySheet from './sheets/RecoverySheet';
import type { RecoveryKind } from './sheets/RecoverySheet';
import SpellbookSheet from './sheets/SpellbookSheet';

type DockTab = 'character' | 'journal' | 'party';
type MobileTab = 'adventure' | 'character' | 'journal' | 'party';
type ConfirmKind = 'logout' | 'back' | 'clearMap' | null;

const DOCK_MIN = 280;
const DOCK_MAX = 520;

/**
 * Emberlight V2 game screen — the single responsive shell that replaces the
 * legacy DesktopLayout/MobileLayout pair. Every derivation and engine handler
 * comes from `useGameViewModel`; this component owns only local chrome state
 * (dock tab/width, mobile tab, overlay visibility, confirm dialogs).
 */
const GameScreen: React.FC = () => {
  const vm = useGameViewModel();
  const { game, actions, progression, ui, auth, onboarding } = vm;
  const { gameState, messages } = game;

  const [dockTab, setDockTab] = useState<DockTab>('character');
  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(340);
  const [mobileTab, setMobileTab] = useState<MobileTab>('adventure');
  const [atmosphereExpanded, setAtmosphereExpanded] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [recoveryKind, setRecoveryKind] = useState<RecoveryKind | null>(null);
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind>(null);

  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const isCombatActive = !!gameState.combat?.isActive;
  const hasBattleMap = !!gameState.battleMap;
  const activeQuests = gameState.quests.filter((q) => q.status === 'active').length;
  const typingCharacterIds = new Set(vm.typingUsers.map((u) => u.characterId));

  /* ---------------- Dice roll modal auto-trigger ----------------
   * Lives HERE (not in ChatColumn) because GameScreen renders once while
   * ChatColumn is dual-mounted (desktop + mobile CSS toggles). Watching
   * messages here ensures each roll fires exactly one popup, not two. */
  const diceSeenIds = useRef<Set<string>>(new Set());
  const diceMounted = useRef(false);

  useEffect(() => {
    const currentIds = new Set(messages.map((m) => m.id));
    if (!diceMounted.current) {
      diceSeenIds.current = currentIds;
      diceMounted.current = true;
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let delay = 0;
    for (const msg of messages) {
      if (diceSeenIds.current.has(msg.id)) continue;
      const rolls = msg.rollData ? (Array.isArray(msg.rollData) ? msg.rollData : [msg.rollData]) : [];
      for (const roll of rolls) {
        const t = setTimeout(() => void ui.handleTriggerDiceRoll(buildReplayData(roll)), delay);
        timers.push(t);
        delay += 4000;
      }
    }
    diceSeenIds.current = currentIds;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [messages, ui.handleTriggerDiceRoll]);

  // Collapse the lightbox whenever the scene image changes.
  useEffect(() => {
    setAtmosphereExpanded(false);
  }, [vm.myAtmosphereUrl]);

  /* ---------------- Dock resize (desktop) ---------------- */
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startX: e.clientX, startWidth: dockWidth };
      setDragging(true);
    },
    [dockWidth],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const d = dragState.current;
      if (!d) return;
      setDockWidth(Math.min(DOCK_MAX, Math.max(DOCK_MIN, d.startWidth + (e.clientX - d.startX))));
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  /* ---------------- Chrome handlers ---------------- */
  const handleBack = () => {
    if (auth.userId) game.setStage(AppStage.DASHBOARD);
    else game.resetGame();
  };

  const handleToggleBattleMap = () => {
    if (!hasBattleMap) {
      vm.initMap(20, 15);
      setMapOpen(true);
    } else {
      setMapOpen((v) => !v);
    }
  };

  const pickWelcome = (text: string) => {
    onboarding.markWelcomeSeen();
    void actions.handleSendMessage(text);
  };

  /* ---------------- Shared sub-trees ---------------- */
  const characterPanel = vm.charToShow ? (
    <CharacterPanel
      character={vm.charToShow}
      onUpdateInventory={game.handleUpdateInventory}
      onLevelUp={progression.handleOpenLevelUp}
      onSendMessage={(text) => void actions.handleSendMessage(text)}
      onTriggerDiceRoll={ui.handleTriggerDiceRoll}
      isProcessing={gameState.isProcessing}
      currentUserId={auth.userId}
      isHost={vm.isHost}
      onUpdateCharacterFields={game.handleUpdateCharacterFields}
      onManageSpellbook={actions.handleManageSpellbook}
      onSwapKnownSpell={actions.handleSwapKnownSpell}
      isCombatActive={isCombatActive}
    />
  ) : (
    <div className="p-6 text-center text-sm text-parchment-mute">No characters in party.</div>
  );

  const journalPanel = <JournalPanel quests={gameState.quests} lore={gameState.lore} />;

  const partyPanel = (
    <PartyPanel
      party={gameState.party}
      viewingCharacterId={game.viewingCharacterId}
      onViewCharacter={(id) => game.setViewingCharacterId(id)}
      myCharacterId={game.myCharacterId}
      typingCharacterIds={typingCharacterIds}
    />
  );

  const chatColumn = (
    <ChatColumn
      messages={messages}
      settings={ui.settings}
      isProcessing={vm.isProcessing}
      isMultiplayer={vm.isMultiplayer}
      myCharacterId={game.myCharacterId}
      portraitMap={vm.portraitMap}
      showWelcomeChips={onboarding.shouldShowWelcomeChips}
      onPickWelcome={pickWelcome}
      onRewind={() => void actions.handleRewind()}
      onUndo={() => void actions.handleUndo()}
      onProcessBatch={() => void actions.handleProcessBatch()}
      onRemovePendingMessage={(id) => void actions.handleRemovePendingMessage(id)}
      onTriggerDiceRoll={ui.handleTriggerDiceRoll}
      atmosphereUrl={vm.myAtmosphereUrl}
      onExpandAtmosphere={() => setAtmosphereExpanded(true)}
      worldDescription={gameState.worldDescription}
      suggestions={vm.suggestions ?? []}
      onPickSuggestion={(text) => void actions.handleSendMessage(text)}
      onDismissSuggestions={vm.dismissSuggestions}
      pendingCount={vm.pendingCount}
    />
  );

  const composer = (
    <Composer
      onSendMessage={(text) => void actions.handleSendMessage(text)}
      onResolveEnemyTurn={() => void actions.handleResolveEnemyTurn()}
      isLoading={vm.isProcessing}
      combat={gameState.combat}
      character={vm.charToShow}
      onInputChanged={(v) => vm.setTyping(v.length > 0)}
      onOpenArcaneRecovery={() => setRecoveryKind('arcane')}
      onOpenNaturalRecovery={() => setRecoveryKind('natural')}
      onOpenSpellbook={() => setSpellbookOpen(true)}
    />
  );

  /** Dimmed full-bleed scene image behind the chat track (local player's location). */
  const atmosphereBackdrop = ui.settings.enableAtmosphere && vm.myAtmosphereUrl ? (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <img
        key={vm.myAtmosphereUrl}
        src={vm.myAtmosphereUrl}
        alt=""
        className="h-full w-full object-cover opacity-20 animate-fade-in"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-obsidian-950/80 via-transparent to-obsidian-950/80" />
    </div>
  ) : null;

  const dockTabButton = (key: DockTab, label: string, icon: string, tour?: string, badge?: number) => (
    <button
      key={key}
      type="button"
      data-tour={tour}
      onClick={() => setDockTab(key)}
      className={cx(
        'relative flex-1 py-3 font-display text-[11px] font-bold uppercase tracking-[0.18em] transition-colors cursor-pointer',
        dockTab === key
          ? 'bg-ember-500/10 text-ember-400 shadow-[inset_0_-2px_0_0_rgba(238,155,46,0.7)]'
          : 'text-parchment-faint hover:text-parchment-dim',
      )}
    >
      <i className={cx('fas mr-1.5 text-[10px]', icon)} aria-hidden="true" />
      {label}
      {badge != null && badge > 0 && (
        <span className="absolute right-3 top-2 h-1.5 w-1.5 rounded-full bg-ember-500 animate-pulse" aria-hidden="true" />
      )}
    </button>
  );

  const mobileTabButton = (key: MobileTab, label: string, icon: string, badge?: boolean) => (
    <button
      key={key}
      type="button"
      onClick={() => setMobileTab(key)}
      className={cx(
        'relative flex flex-col items-center gap-1 p-2 transition-colors cursor-pointer',
        mobileTab === key ? 'text-ember-400' : 'text-parchment-faint hover:text-parchment-dim',
      )}
    >
      <span className="relative">
        <i className={cx('fas text-lg', icon)} aria-hidden="true" />
        {badge && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-obsidian-950 bg-ember-500 animate-pulse" aria-hidden="true" />
        )}
      </span>
      <span className="font-display text-[9px] font-bold uppercase tracking-[0.16em]">{label}</span>
    </button>
  );

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-obsidian-950 font-body text-parchment">
      <div className="pointer-events-none absolute inset-0 bg-grain" aria-hidden="true" />

      {/* ============ Desktop dock ============ */}
      <aside
        data-tour="character-sheet"
        style={{ width: dockOpen ? dockWidth : 0 }}
        className={cx(
          'relative hidden md:flex flex-col overflow-hidden border-r border-white/[0.06] bg-obsidian-950/95 backdrop-blur-xl',
          Z.dock,
          dragging ? '' : 'transition-all duration-300',
        )}
      >
        <div className="flex shrink-0 border-b border-white/[0.06]">
          {dockTabButton('character', 'Hero', 'fa-user-shield', 'character-sheet')}
          {dockTabButton('journal', 'Journal', 'fa-book-skull', 'journal', activeQuests)}
          {vm.isMultiplayer && dockTabButton('party', 'Party', 'fa-users')}
        </div>
        <div className="min-h-0 flex-1">
          {dockTab === 'character' && characterPanel}
          {dockTab === 'journal' && journalPanel}
          {dockTab === 'party' && vm.isMultiplayer && partyPanel}
        </div>
        {dockOpen && (
          <div
            onMouseDown={onDragStart}
            className="absolute right-0 top-0 z-30 h-full w-1.5 cursor-col-resize transition-colors hover:bg-ember-500/40"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}
      </aside>

      {/* ============ Main column ============ */}
      <main className={cx('relative flex min-w-0 flex-1 flex-col', Z.content)}>
        <TopBar
          locationLabel={vm.myLocation}
          gameTimeMinutes={gameState.gameTime}
          campaignName={game.campaignName}
          shareId={vm.isSyncable ? game.currentCampaignId : undefined}
          recentActivity={vm.recentActivity}
          onBack={() => setConfirming('back')}
          backIcon={auth.userId ? 'fa-arrow-left' : 'fa-rotate-left'}
          backTip={auth.userId ? 'Return to the Hall' : 'Reset game'}
          onOpenCompendium={() => ui.setCompendiumOpen(true)}
          onOpenSettings={() => ui.setSettingsOpen(true)}
          onLogout={() => setConfirming('logout')}
          showLogout={!!auth.userId}
          leading={
            <IconButton
              icon={dockOpen ? 'fa-indent' : 'fa-outdent'}
              tip={dockOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={() => setDockOpen((v) => !v)}
              className="hidden md:inline-flex"
            />
          }
        />

        {isCombatActive && gameState.combat && (
          <CombatBanner
            combat={gameState.combat}
            party={gameState.party}
            isHost={vm.isHost}
            hasBattleMap={hasBattleMap}
            onToggleBattleMap={handleToggleBattleMap}
          />
        )}

        {/* ----- Desktop: chat ----- */}
        <div className="relative hidden min-h-0 flex-1 flex-col md:flex">
          {atmosphereBackdrop}
          <div className={cx('relative flex min-h-0 flex-1 flex-col', Z.content)}>
            {chatColumn}
            {vm.isMultiplayer && vm.typingUsers.length > 0 && <TypingStrip users={vm.typingUsers} />}
            {composer}
          </div>
        </div>

        {/* ----- Mobile: tabbed content ----- */}
        <div className="relative min-h-0 flex-1 flex-col pb-16 md:hidden flex">
          {mobileTab === 'adventure' && (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {atmosphereBackdrop}
              <div className={cx('relative flex min-h-0 flex-1 flex-col', Z.content)}>
                {chatColumn}
                {vm.isMultiplayer && vm.typingUsers.length > 0 && <TypingStrip users={vm.typingUsers} />}
                {vm.charToShow && (
                  <div className="shrink-0 border-t border-white/[0.05] bg-obsidian-950/70 px-4 py-2">
                    <HpBar current={vm.charToShow.hp.current} max={vm.charToShow.hp.max} height="sm" showNumbers />
                  </div>
                )}
                {composer}
              </div>
            </div>
          )}
          {mobileTab === 'character' && <div className="min-h-0 flex-1">{characterPanel}</div>}
          {mobileTab === 'journal' && <div className="min-h-0 flex-1">{journalPanel}</div>}
          {mobileTab === 'party' && vm.isMultiplayer && <div className="min-h-0 flex-1">{partyPanel}</div>}
        </div>

        {/* ----- Mobile bottom nav ----- */}
        <nav className={cx('fixed bottom-0 left-0 right-0 flex h-16 items-center justify-around border-t border-white/[0.06] bg-obsidian-950 pb-safe md:hidden', Z.nav)}>
          {mobileTabButton('adventure', 'Adventure', 'fa-scroll')}
          {mobileTabButton('character', 'Hero', 'fa-user-shield')}
          {mobileTabButton('journal', 'Journal', 'fa-book-skull', activeQuests > 0)}
          {vm.isMultiplayer && mobileTabButton('party', 'Party', 'fa-users')}
        </nav>
      </main>

      {/* ============ Battle map slide-over ============ */}
      {gameState.battleMap && (
        <MapOverlay
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          panelProps={{
            battleMap: gameState.battleMap,
            party: gameState.party,
            combat: gameState.combat,
            currentTurnId: vm.currentTurnId,
            isHost: vm.isHost,
            isProcessing: vm.isProcessing,
            myCharacterId: game.myCharacterId ?? undefined,
            speeds: vm.battleMapSpeeds,
            onTokenMove: vm.handleTokenMove,
            onClearMap: () => setConfirming('clearMap'),
            onInitMap: vm.initMap,
          }}
        />
      )}

      {/* ============ Atmosphere lightbox ============ */}
      {atmosphereExpanded && vm.myAtmosphereUrl && (
        <div
          className={cx('fixed inset-0 flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-2xl animate-fade-in md:p-12', Z.modal)}
          onClick={() => setAtmosphereExpanded(false)}
          role="dialog"
          aria-label="Scene artwork fullscreen"
        >
          <div className="absolute right-6 top-6 flex items-center gap-4">
            <span className="hidden font-display text-sm uppercase tracking-[0.2em] text-parchment-mute md:block">
              {vm.myLocation ?? 'Unknown'}
            </span>
            <IconButton
              icon="fa-xmark"
              tip="Close"
              onClick={(e) => {
                e.stopPropagation();
                setAtmosphereExpanded(false);
              }}
            />
          </div>
          <div
            className="w-full max-w-6xl overflow-hidden rounded-xl border border-white/[0.08] shadow-[0_0_100px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={vm.myAtmosphereUrl} alt="Scene artwork fullscreen" className="aspect-square w-full object-cover md:aspect-video" />
          </div>
          {gameState.worldDescription && (
            <p className="mt-6 max-w-2xl px-4 text-center font-narration text-lg italic text-parchment-mute">
              {gameState.worldDescription}
            </p>
          )}
        </div>
      )}

      {/* ============ Sheets & dialogs ============ */}
      {progression.showLevelUpModal && progression.levelUpCharacter && (
        <LevelUpSheet
          character={progression.levelUpCharacter}
          selectedAllocations={progression.selectedAllocations}
          remainingPoints={progression.remainingPoints}
          previewHp={progression.previewHp}
          error={progression.allocationError}
          onAllocate={progression.handleAllocateStat}
          onConfirm={progression.handleConfirmAllocation}
          onCancel={progression.handleCloseLevelUp}
          onConfirmAsi={progression.handleConfirmAsiChoice}
          onConfirmFeat={progression.handleConfirmFeatChoice}
          onAcknowledgeSubclass={progression.handleAcknowledgeSubclass}
          onConfirmInvocations={progression.handleConfirmInvocations}
          onConfirmFightingStyleTwo={progression.handleConfirmFightingStyleTwo}
        />
      )}

      {vm.charToShow && (
        <>
          <RecoverySheet
            kind={recoveryKind ?? 'arcane'}
            character={vm.charToShow}
            open={recoveryKind !== null}
            onClose={() => setRecoveryKind(null)}
            onConfirm={(id, sel) => {
              const run = recoveryKind === 'natural' ? actions.handleNaturalRecovery : actions.handleArcaneRecovery;
              void run(id, sel);
              setRecoveryKind(null);
            }}
          />
          <SpellbookSheet
            character={vm.charToShow}
            open={spellbookOpen}
            onClose={() => setSpellbookOpen(false)}
            onManageSpellbook={actions.handleManageSpellbook}
            onSwapKnownSpell={actions.handleSwapKnownSpell}
            isCombatActive={isCombatActive}
          />
        </>
      )}

      <ConfirmDialog
        open={confirming === 'logout'}
        title="Leave the table?"
        body="You will be signed out. Your chronicle is saved and waiting for your return."
        confirmLabel="Sign Out"
        danger
        onConfirm={() => {
          setConfirming(null);
          void vm.signOut();
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'back'}
        title={auth.userId ? 'Return to the Hall?' : 'Reset the game?'}
        body={
          auth.userId
            ? 'Your place in the story is saved. You can resume this campaign from the Hall of Chronicles.'
            : 'All progress in this anonymous campaign will be lost. This cannot be undone.'
        }
        confirmLabel={auth.userId ? 'Return' : 'Reset Game'}
        danger={!auth.userId}
        onConfirm={() => {
          setConfirming(null);
          handleBack();
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'clearMap'}
        title="Remove the battle map?"
        body="Token positions will be lost. Combat continues without the grid."
        confirmLabel="Remove Map"
        danger
        onConfirm={() => {
          setConfirming(null);
          setMapOpen(false);
          vm.clearMap();
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
};

export default GameScreen;
