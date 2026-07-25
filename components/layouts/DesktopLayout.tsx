import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameContext } from '../../contexts/GameContext';
import { useActionsContext } from '../../contexts/ActionsContext';
import { useProgressionContext } from '../../contexts/ProgressionContext';
import { useUIContext } from '../../contexts/UIContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppStage } from '../../types';
import { isSyncableCampaign } from '../../utils/campaign';
import ChatLog from '../ChatLog';
import ActionQueuePanel from '../ActionQueuePanel';
import InputArea from '../InputArea';
import CharacterSheet from '../CharacterSheet';
import Journal from '../Journal';
import LevelUpModal from '../LevelUpModal';
import CombatTracker from '../CombatTracker';
import ActivityBell from '../shared/ActivityBell';
import AtmosphereOverlay from '../shared/AtmosphereOverlay';
import { useActivityTracking } from '../../hooks/useActivityTracking';
import { useOnboarding } from '../../hooks/useOnboarding';
import { formatGameTime } from '../../utils/timeUtils';
import { mcpServer } from '../../services/mcpService';

/** Primary desktop layout with resizable sidebar, chat log, input area, and full header controls. */
const DesktopLayout: React.FC = () => {
  const {
    stage, currentCampaignId, campaignName, hostId, gameState, messages,
    isLoading, myCharacterId, viewingCharacterId, setViewingCharacterId,
    setStage, resetGame, handleUpdateInventory, handleUpdateCharacterFields,
    handleEnqueueAction, handleRemoveQueueItem, handleUpdateQueueItem,
    handleReorderQueue, syncState,
  } = useGameContext();
  const { handleSendMessage, handleUndo, handleRewind, handleExecuteBatch, handleResolveEnemyTurn, handleArcaneRecovery, handleManageSpellbook } = useActionsContext();
  const {
    showLevelUpModal, levelUpCharacter, selectedAllocations, remainingPoints,
    previewHp, allocationError, handleOpenLevelUp, handleCloseLevelUp,
    handleAllocateStat, handleConfirmAllocation, handleConfirmAsiChoice,
    handleConfirmFeatChoice, handleAcknowledgeSubclass, handleConfirmSpellSwap
  } = useProgressionContext();
  const { settings, setSettingsOpen, handleTriggerDiceRoll, setCompendiumOpen } = useUIContext();
  const { userId, handleLogout } = useAuthContext();
  const onboarding = useOnboarding();

  const [tab, setTab] = useState<'character' | 'journal'>('character');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isDragging, setIsDragging] = useState(false);
  const [isAtmosphereExpanded, setIsAtmosphereExpanded] = useState(false);

  useEffect(() => {
    setIsAtmosphereExpanded(false);
  }, [gameState.currentAtmosphereUrl]);

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [hasScrollOverflow, setHasScrollOverflow] = useState(false);
  const [, setIsChatScrolledUp] = useState(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const fontScale = 0.625 + (sidebarWidth / 520) * 0.5;

  const { recentActivity } = useActivityTracking(gameState, messages, userId);

  const checkSidebarOverflow = useCallback(() => {
    const el = sidebarScrollRef.current;
    if (el) setHasScrollOverflow(el.scrollHeight > el.clientHeight + 4);
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => setSidebarWidth(Math.min(520, Math.max(200, dragStartWidth.current + (e.clientX - dragStartX.current))));
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    checkSidebarOverflow();
    const el = sidebarScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkSidebarOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkSidebarOverflow, tab]);

  const charToShow = gameState.party.find(c => c.id === viewingCharacterId) || gameState.party[0];
  const isMultiplayer = gameState.party.length > 1;
  const handleBackOrReset = () => userId ? confirm('Return to dashboard?') && setStage(AppStage.DASHBOARD) : confirm('Are you sure you want to reset the game? All progress will be lost.') && resetGame();

  return (<>
    <aside style={{ width: sidebarOpen ? sidebarWidth : 0 }} data-tour="character-sheet" className={`bg-stone-950/90 backdrop-blur-xl border-r border-stone-800 flex flex-col overflow-hidden relative z-20 ${isDragging ? '' : 'transition-all duration-300'}`}>
      <div className="flex border-b border-stone-800" style={{ fontSize: `${fontScale}rem` }}>
        <button onClick={() => setTab('character')} className={`flex-1 py-3 uppercase font-bold tracking-widest transition-all ${tab === 'character' ? 'bg-amber-900/20 text-amber-500' : 'text-stone-600 hover:text-stone-400'}`}>Character</button>
        <button onClick={() => setTab('journal')} data-tour="journal" className={`flex-1 py-3 uppercase font-bold tracking-widest transition-all relative ${tab === 'journal' ? 'bg-amber-900/20 text-amber-500' : 'text-stone-600 hover:text-stone-400'}`}>Journal{gameState.quests.some(q => q.status === 'active') && <span className="absolute top-2 right-4 h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />}</button>
      </div>
      <div ref={sidebarScrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative" style={{ padding: `${Math.max(12, sidebarWidth * 0.075)}px`, fontSize: `${fontScale}rem` }}>
        {tab === 'character' ? <div className="flex flex-col h-full">
          {isMultiplayer && <div className="flex gap-2 overflow-x-auto pb-2 mb-2 shrink-0">{gameState.party.map(char => <button key={char.id} onClick={() => setViewingCharacterId(char.id)} className={`p-2 rounded whitespace-nowrap transition-colors ${viewingCharacterId === char.id ? 'bg-amber-700 text-white' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'}`}>{char.name}{char.id === myCharacterId ? ' (You)' : ''}</button>)}</div>}
          {charToShow ? <CharacterSheet character={charToShow} onUpdateInventory={handleUpdateInventory} onLevelUp={handleOpenLevelUp} onSendMessage={handleSendMessage} onTriggerDiceRoll={handleTriggerDiceRoll} isProcessing={gameState.isProcessing} currentUserId={userId} isHost={!!userId && userId === hostId} onUpdateCharacterFields={handleUpdateCharacterFields} onManageSpellbook={handleManageSpellbook} onSwapKnownSpell={handleConfirmSpellSwap} isCombatActive={gameState.combat?.isActive} /> : <div className="text-stone-500 text-center mt-10">No characters in party.</div>}
        </div> : <Journal quests={gameState.quests} lore={gameState.lore} />}
        {hasScrollOverflow && <div className="sticky bottom-0 left-0 right-0 h-12 -mt-12 pointer-events-none bg-gradient-to-t from-stone-950/95 via-stone-950/60 to-transparent z-10" />}
      </div>
      {isMultiplayer && <div className={`border-t border-stone-800 bg-stone-900/40 transition-all duration-300 ${isQueueOpen ? 'h-1/3' : 'h-auto'} flex flex-col`} style={{ fontSize: `${fontScale}rem` }} data-tour="queue">
        <ActionQueuePanel queue={gameState.actionQueue || []} userId={userId} onRemove={handleRemoveQueueItem} onUpdate={handleUpdateQueueItem} onReorder={handleReorderQueue} onExecute={handleExecuteBatch} isProcessing={gameState.isProcessing} isCollapsed={!isQueueOpen} onToggleCollapse={() => setIsQueueOpen(!isQueueOpen)} />
      </div>}
      {sidebarOpen && <div onMouseDown={handleDragStart} className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-amber-600/40 transition-colors z-30" />}
    </aside>
    <main className="flex-1 flex flex-col relative">
      <AtmosphereOverlay url={gameState.currentAtmosphereUrl} enabled={settings.enableAtmosphere} />
      <header className="h-16 border-b border-stone-800 bg-stone-950/80 backdrop-blur-md flex items-center justify-between px-6 z-10 relative">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors"><i className={`fas ${sidebarOpen ? 'fa-indent' : 'fa-outdent'} text-xl`} /></button>
          {settings.enableAtmosphere && gameState.party[0]?.location && <div className="flex items-center gap-2">
            <i className="fas fa-location-dot text-amber-600/60 text-xs" />
            <span className="fantasy-font text-stone-300 text-sm tracking-widest uppercase">{gameState.party[0].location}</span>
          </div>}
          {typeof gameState.gameTime === 'number' && !isNaN(gameState.gameTime) && (() => {
            const info = formatGameTime(gameState.gameTime);
            return (
              <span className="text-[10px] text-stone-500 ml-2 uppercase tracking-wider">
                {info.time} — {info.period}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleBackOrReset} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors" title={userId ? "Return to Dashboard" : "Reset Game"}><i className={`fas ${userId ? 'fa-arrow-left' : 'fa-undo'} text-xl`} /></button>
          <button onClick={() => setCompendiumOpen(true)} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors group" title="Open Compendium"><i className="fas fa-book-open text-xl group-hover:text-amber-500 transition-colors" /></button>
          <button onClick={() => setSettingsOpen(true)} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors group" title="Settings"><i className="fas fa-cog text-xl group-hover:rotate-90 transition-transform duration-500" /></button>
          <button onClick={handleLogout} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors"><i className="fas fa-sign-out-alt text-xl" /></button>
          {stage === AppStage.PLAY && isSyncableCampaign(currentCampaignId) && <div className="flex items-center gap-2 bg-stone-900/50 px-3 py-1.5 rounded-lg border border-stone-800"><span className="text-[10px] uppercase font-bold tracking-wider text-stone-500">Share Campaign</span><span className="text-xs text-stone-300 truncate max-w-[140px]">{campaignName || currentCampaignId}</span><button onClick={() => { navigator.clipboard.writeText(currentCampaignId); alert("Campaign ID copied to clipboard!"); }} className="text-amber-600 hover:text-amber-500 transition-colors"><i className="fas fa-copy" /></button></div>}
          <ActivityBell activities={recentActivity} />
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-sm shadow-green-900 animate-pulse" />
        </div>
      </header>
      {gameState.combat?.isActive && <div className="relative z-10" data-tour="combat-tracker"><CombatTracker combat={gameState.combat} party={gameState.party} /></div>}
      <div className="flex-1 flex flex-col relative z-10 min-h-0">
        <ChatLog
          messages={messages}
          settings={settings}
          onRewind={handleRewind}
          onUndo={handleUndo}
          isProcessing={isLoading}
          onExpandAtmosphere={() => setIsAtmosphereExpanded(true)}
          atmosphereUrl={gameState.currentAtmosphereUrl}
          scrollRef={chatScrollRef}
          onScrollChange={setIsChatScrolledUp}
          showWelcomeChips={onboarding.shouldShowWelcomeChips}
          onPrefillInput={(text) => { onboarding.markWelcomeSeen(); handleSendMessage(text); }}
          suggestions={settings.enableSuggestions ? gameState.lastSuggestions : undefined}
          onPickSuggestion={(text) => handleSendMessage(text)}
          onDismissSuggestion={() => { mcpServer.setLastSuggestions([]); syncState(); }}
        />
      </div>
      <div className="relative z-10 shrink-0">
        <InputArea onSendMessage={handleSendMessage} onQueueAction={handleEnqueueAction} onResolveEnemyTurn={handleResolveEnemyTurn} isLoading={isLoading || gameState.isProcessing} combat={gameState.combat} character={charToShow} isMultiplayer={isMultiplayer} onArcaneRecovery={(id, sel) => handleArcaneRecovery(id, sel)} onManageSpellbook={handleManageSpellbook} onSwapKnownSpell={handleConfirmSpellSwap} />
      </div>
    </main>
    {isAtmosphereExpanded && gameState.currentAtmosphereUrl && <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 md:p-12 animate-in fade-in zoom-in-95 duration-300" onClick={() => setIsAtmosphereExpanded(false)}>
      <div className="absolute top-8 right-8 flex items-center gap-4"><span className="fantasy-font text-stone-400 text-lg tracking-widest uppercase opacity-80 hidden md:block">{gameState.party[0]?.location || "Unknown"}</span><button className="w-12 h-12 flex items-center justify-center bg-stone-900/50 hover:bg-stone-800 rounded-full text-stone-400 hover:text-white transition-all" onClick={e => { e.stopPropagation(); setIsAtmosphereExpanded(false); }}><i className="fas fa-times text-2xl" /></button></div>
      <div className="w-full max-w-6xl aspect-square md:aspect-video rounded-xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-stone-800" onClick={e => e.stopPropagation()}><img src={gameState.currentAtmosphereUrl} alt="Atmosphere Fullscreen" className="w-full h-full object-cover" /></div>
      <p className="mt-8 text-stone-500 italic fantasy-font text-xl text-center max-w-2xl px-4">{gameState.worldDescription}</p>
    </div>}
    {showLevelUpModal && levelUpCharacter && <LevelUpModal character={levelUpCharacter} selectedAllocations={selectedAllocations} remainingPoints={remainingPoints} previewHp={previewHp} error={allocationError} onAllocate={handleAllocateStat} onConfirm={handleConfirmAllocation} onCancel={handleCloseLevelUp} onConfirmAsi={handleConfirmAsiChoice} onConfirmFeat={handleConfirmFeatChoice} onAcknowledgeSubclass={handleAcknowledgeSubclass} />}
  </>);
};

export default DesktopLayout;
