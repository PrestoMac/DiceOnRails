import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameContext } from '../../contexts/GameContext';
import { useActionsContext } from '../../contexts/ActionsContext';
import { useProgressionContext } from '../../contexts/ProgressionContext';
import { useUIContext } from '../../contexts/UIContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppStage, Character, InventoryItem } from '../../types';
import { isSyncableCampaign } from '../../utils/campaign';
import ChatLog from '../ChatLog';
import InputArea from '../InputArea';
import CharacterSheet from '../CharacterSheet';
import Journal from '../Journal';
import LevelUpModal from '../LevelUpModal';
import CombatTracker from '../CombatTracker';
import BattleMapPanel from '../BattleMapPanel';
import ActivityBell from '../shared/ActivityBell';
import HpBar from '../shared/HpBar';
import TypingIndicator from '../shared/TypingIndicator';
import { useActivityTracking } from '../../hooks/useActivityTracking';
import { useOnboarding } from '../../hooks/useOnboarding';
import { usePresence } from '../../hooks/usePresence';
import { calculateAc } from '../../services/classEngine';
import { formatGameTime } from '../../utils/timeUtils';
import { mcpServer } from '../../services/mcpService';
import { pickSuggestionsForCharacter } from '../../services/llm/suggestions';
import { initBattleMap, autoPlaceParty, autoPlaceEnemies } from '../../services/gridService';

/** Compact HP/AC status bar displayed below the chat area on mobile. */
const HpStatusBar: React.FC<{ character: Character }> = ({ character }) => (
  <div className="px-3 py-1.5 bg-stone-900/90 border-t border-stone-800 flex items-center justify-between text-[10px] backdrop-blur-md">
    <div className="flex items-center gap-2">
      <span className="text-stone-500">HP:</span>
      <span className="font-mono text-stone-300">{character.hp.current}/{character.hp.max}</span>
      <HpBar current={character.hp.current} max={character.hp.max} width="w-16" height="h-1.5" />
    </div>
    <div className="flex items-center gap-1 bg-stone-950 px-1.5 py-0.5 rounded border border-stone-800">
      <i className="fas fa-shield-halved text-stone-500 text-[8px]"></i>
      <span className="text-stone-400">AC:</span>
      <span className="font-mono font-bold text-amber-500">{calculateAc(character, character.inventory?.find((i: InventoryItem) => i.equipped && i.type === 'armor') || null)}</span>
    </div>
  </div>
);

/** Primary mobile layout with 3-tab navigation (adventure/character/journal), queue drawer, and bottom nav bar. */
const MobileLayout: React.FC = () => {
  const {
    stage, currentCampaignId, hostId, gameState, messages,
    isLoading, myCharacterId, viewingCharacterId, setViewingCharacterId,
    setStage, resetGame, handleUpdateInventory, handleUpdateCharacterFields,
    syncState,
  } = useGameContext();
  const { handleSendMessage, handleUndo, handleRewind, handleProcessBatch, handleRemovePendingMessage, handleResolveEnemyTurn, handleArcaneRecovery, handleManageSpellbook, handleSwapKnownSpell } = useActionsContext();
  const {
    showLevelUpModal, levelUpCharacter, selectedAllocations, remainingPoints,
    previewHp, allocationError, handleOpenLevelUp, handleCloseLevelUp,
    handleAllocateStat, handleConfirmAllocation, handleConfirmAsiChoice,
    handleConfirmFeatChoice, handleAcknowledgeSubclass
  } = useProgressionContext();
  const { settings, setSettingsOpen, handleTriggerDiceRoll, setCompendiumOpen } = useUIContext();
  const { userId, handleLogout } = useAuthContext();
  const onboarding = useOnboarding();

  const [mobileTab, setMobileTab] = useState<'adventure'|'character'|'journal'>('adventure');
  const myCharacter = gameState.party.find(c => c.id === myCharacterId) ?? gameState.party[0];
  const myLocation = myCharacter?.location;
  const myAtmosphereUrl = (myLocation && gameState.locationImages?.[myLocation]) || gameState.currentAtmosphereUrl;

  useEffect(() => {
    setIsAtmosphereExpanded(false);
  }, [myAtmosphereUrl]);

  const [showQueue, setShowQueue] = useState(false);
  void showQueue; void setShowQueue; // legacy state retained for ref stability; queue UI removed
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (el) setIsScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  const charToShow = gameState.party.find((c: Character) => c.id === viewingCharacterId) || gameState.party[0];
  const isMultiplayer = gameState.party.length > 1;
  // Per-character display identity (see DesktopLayout for rationale). Solo
  const isHost = !!userId && userId === hostId;
  const handleBackOrReset = () => userId ? confirm('Return to dashboard?') && setStage(AppStage.DASHBOARD) : confirm('Are you sure you want to reset the game? All progress will be lost.') && resetGame();
  const { recentActivity } = useActivityTracking(gameState, messages, userId);

  // Multiplayer presence (typing indicators). Skipped for solo / anonymous hot-seat.
  const myCharacterForPresence = isMultiplayer ? (charToShow ?? gameState.party[0]) : undefined;
  const { typingUsers, setTyping } = usePresence(currentCampaignId, userId, isMultiplayer, myCharacterForPresence);

  // --- VTT Battle Map handlers ---

  const handleTokenMove = useCallback((tokenId: string, x: number, y: number) => {
    mcpServer.updateBattleMapTokens(
      (gameState.battleMap?.tokens ?? []).map(t =>
        t.id === tokenId ? { ...t, pos: { x, y } } : t
      )
    );
    syncState();
  }, [gameState.battleMap, syncState]);

  const handleClearMap = useCallback(() => {
    if (!confirm('Remove the battle map?')) return;
    mcpServer.clearBattleMap();
    syncState();
  }, [syncState]);

  const handleInitMap = useCallback((width: number, height: number) => {
    let bmap = initBattleMap(width, height, myLocation ?? 'Battle');
    bmap = autoPlaceParty(bmap, gameState.party.map(c => ({ id: c.id, name: c.name })));
    if (gameState.combat?.enemies) {
      bmap = autoPlaceEnemies(bmap, gameState.combat.enemies.filter(e => !e.isDead).map(e => ({ id: e.id, name: e.name })));
    }
    mcpServer.updateBattleMapTokens(bmap.tokens);
    const state = mcpServer.getFullState();
    if (state.battleMap) {
      state.battleMap.width  = bmap.width;
      state.battleMap.height = bmap.height;
      state.battleMap.tokens = bmap.tokens;
    }
    syncState();
  }, [gameState, syncState]);

  const currentTurnId = (() => {
    if (!gameState.combat?.isActive) return undefined;
    return gameState.combat.initiative[gameState.combat.turnIndex]?.id;
  })();

  return (
    <div className="flex flex-col h-screen w-full relative overflow-hidden bg-stone-950">
      <header className="h-14 min-h-[56px] border-b border-stone-800 bg-stone-950/90 backdrop-blur-md flex items-center justify-between px-4 z-20">
        <h1 className="fantasy-font text-xl font-bold text-amber-600 tracking-tight">Dice<span className="text-stone-100">OnRails</span></h1>
          {typeof gameState.gameTime === 'number' && !isNaN(gameState.gameTime) && (() => {
            const info = formatGameTime(gameState.gameTime);
            return (
              <span className="text-[10px] text-stone-500 ml-auto">{info.period}</span>
            );
          })()}
        <div className="flex items-center gap-3">
          <button onClick={handleBackOrReset} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors"><i className={`fas ${userId?'fa-arrow-left':'fa-undo'} text-lg`}></i></button>
          <button onClick={handleLogout} className="p-2 hover:bg-stone-900 rounded-lg text-stone-400 transition-colors"><i className="fas fa-sign-out-alt text-lg"></i></button>
          {stage===AppStage.PLAY&&isSyncableCampaign(currentCampaignId)&&<button onClick={()=>{navigator.clipboard.writeText(currentCampaignId);alert("Campaign ID copied to clipboard!");}} className="p-2 hover:bg-stone-900 rounded-lg text-amber-600 transition-colors"><i className="fas fa-link text-lg"></i></button>}
          <ActivityBell activities={recentActivity} />
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-sm shadow-green-900 animate-pulse"></div>
        </div>
      </header>
      {gameState.combat?.isActive && <CombatTracker combat={gameState.combat} party={gameState.party} isMobile isHost={isHost} hasBattleMap={!!gameState.battleMap} onToggleBattleMap={() => { if (!gameState.battleMap) handleInitMap(20, 15); else setMapPanelOpen(p => !p); }} />}
      {/* VTT Battle Map panel on Mobile */}
      {gameState.battleMap && mobileTab === 'adventure' && (
        <div className="relative z-10 border-b border-stone-800 shrink-0" style={{ height: mapPanelOpen ? '260px' : 'auto' }}>
          <button
            onClick={() => setMapPanelOpen(p => !p)}
            className="w-full flex items-center gap-2 px-3 py-1.5 bg-stone-900/80 hover:bg-stone-900 border-b border-stone-800 text-[10px] uppercase tracking-wider font-bold text-stone-500 hover:text-amber-500 transition-colors"
          >
            <span>🗺</span>
            <span>Battle Map</span>
            <i className={`fas fa-chevron-${mapPanelOpen ? 'up' : 'down'} ml-auto`} />
          </button>
          {mapPanelOpen && (
            <div style={{ height: '220px' }}>
              <BattleMapPanel
                battleMap={gameState.battleMap}
                party={gameState.party}
                combat={gameState.combat}
                currentTurnId={currentTurnId}
                isHost={isHost}
                isProcessing={isLoading || !!gameState.isProcessing}
                onTokenMove={handleTokenMove}
                onClearMap={handleClearMap}
                onInitMap={handleInitMap}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-hidden relative flex flex-col pb-16 min-h-0">
        {mobileTab==='adventure'&&<>
          {settings.enableAtmosphere&&<div className="w-full h-32 relative shrink-0 border-b border-stone-800 bg-stone-900">
            {myAtmosphereUrl?<img src={myAtmosphereUrl} alt="Atmosphere" className="w-full h-full object-cover opacity-70" onClick={()=>setIsAtmosphereExpanded(true)}/>:<div className="w-full h-full flex items-center justify-center text-stone-700"><i className="fas fa-compass text-2xl"></i></div>}
            <div className="absolute bottom-2 left-3 flex items-center gap-2"><div className="bg-stone-950/70 backdrop-blur-sm px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-stone-800/50"><i className="fas fa-eye text-amber-600/60 text-[10px]"></i><span className="fantasy-font text-stone-300 text-xs tracking-widest uppercase text-shadow-sm leading-tight line-clamp-2">{myLocation||"Unknown"}</span></div></div>
          </div>}
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto relative"><ChatLog messages={messages} settings={settings} onRewind={handleRewind} onUndo={handleUndo} isProcessing={isLoading} scrollRef={chatScrollRef} onScrollChange={setIsScrolledUp} disableInternalScroll showWelcomeChips={onboarding.shouldShowWelcomeChips} onPrefillInput={(text) => { onboarding.markWelcomeSeen(); handleSendMessage(text); }} suggestions={settings.enableSuggestions && !gameState.isProcessing ? pickSuggestionsForCharacter(gameState, myCharacterId) : undefined} onPickSuggestion={(text) => handleSendMessage(text)} onDismissSuggestion={() => { if (myCharacterId && gameState.lastSuggestionsByCharacter) { const updated = { ...gameState.lastSuggestionsByCharacter }; delete updated[myCharacterId]; mcpServer.setLastSuggestionsByCharacter(updated); } else { mcpServer.setLastSuggestions([]); } syncState(); }} portraitMap={gameState.party.reduce((m, c) => { if (c.portraitUrl) m[c.id] = c.portraitUrl; return m; }, {} as Record<string, string>)} isMultiplayer={isMultiplayer} myCharacterId={myCharacterId} pendingCount={messages.filter(m => m.pending).length} onProcessBatch={handleProcessBatch} onRemovePendingMessage={handleRemovePendingMessage} /></div>
          <button
            onClick={()=>{if(chatScrollRef.current)chatScrollRef.current.scrollTop=chatScrollRef.current.scrollHeight;}}
            className={`absolute right-3 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-stone-800/80 hover:bg-amber-700/70 text-stone-400 hover:text-amber-300 shadow-lg border border-stone-700/40 hover:border-amber-600/50 transition-all duration-300 flex items-center justify-center ${isScrolledUp?'opacity-100 scale-100':'opacity-0 scale-75 pointer-events-none'}`}
            title="Jump to latest message"
          >
            <i className="fas fa-arrow-down text-xs"></i>
          </button>
          {isMultiplayer && typingUsers.length > 0 && <TypingIndicator users={typingUsers} />}
          {charToShow&&<HpStatusBar character={charToShow} />}
          <InputArea onSendMessage={handleSendMessage} onResolveEnemyTurn={handleResolveEnemyTurn} isLoading={isLoading||gameState.isProcessing===true} combat={gameState.combat} character={charToShow} onInputChanged={(v)=>setTyping(v.length>0)} onArcaneRecovery={(id, sel) => handleArcaneRecovery(id, sel)} onManageSpellbook={handleManageSpellbook} onSwapKnownSpell={handleSwapKnownSpell}/>
        </>}
        {mobileTab==='character'&&<div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isMultiplayer && <div className="flex gap-2 overflow-x-auto pb-2 mb-2">{gameState.party.map((char: Character) => <button key={char.id} onClick={() => setViewingCharacterId(char.id)} className={`p-2 rounded text-xs whitespace-nowrap ${viewingCharacterId===char.id?'bg-amber-700 text-white':'bg-stone-800 text-stone-400'}`}>{char.name}{char.id===myCharacterId?' (You)':''}</button>)}</div>}
          {charToShow?<CharacterSheet character={charToShow} onUpdateInventory={handleUpdateInventory} onLevelUp={handleOpenLevelUp} onSendMessage={handleSendMessage} onTriggerDiceRoll={handleTriggerDiceRoll} isProcessing={gameState.isProcessing} currentUserId={userId} isHost={!!userId && userId === hostId} onUpdateCharacterFields={handleUpdateCharacterFields} onManageSpellbook={handleManageSpellbook} onSwapKnownSpell={handleSwapKnownSpell} isCombatActive={gameState.combat?.isActive}/>:<div className="text-stone-500 text-center mt-10">No characters in party.</div>}
        </div>}
        {mobileTab==='journal'&&<div className="flex-1 overflow-y-auto p-4 custom-scrollbar"><Journal quests={gameState.quests} lore={gameState.lore}/></div>}
      </div>
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-stone-950 border-t border-stone-800 flex justify-around items-center z-30 pb-safe">
        {[{key:'adventure' as const,icon:'fa-scroll',label:'Adventure'},{key:'character' as const,icon:'fa-user-shield',label:'Hero'},{key:'journal' as const,icon:'fa-book-skull',label:'Journal'}].map(({key,icon,label})=>(
          <button key={key} onClick={()=>setMobileTab(key)} className={`flex flex-col items-center gap-1 p-2 transition-colors ${mobileTab===key?'text-amber-500':'text-stone-600'} relative`}>
            <div className="relative"><i className={`fas ${icon} text-lg`}></i>{key==='journal'&&gameState.quests.some((q: { status: string })=>q.status==='active')&&<span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-600 border border-stone-950 animate-pulse"></span>}</div>
            <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
          </button>
        ))}
        <button onClick={() => setCompendiumOpen(true)} className="flex flex-col items-center gap-1 p-2 transition-colors text-stone-600 hover:text-amber-400">
          <i className="fas fa-book-open text-lg"></i>
          <span className="text-[10px] uppercase font-bold tracking-wider">Compendium</span>
        </button>
        <button onClick={()=>setSettingsOpen(true)} className="flex flex-col items-center gap-1 p-2 transition-colors text-stone-600 hover:text-stone-400"><i className="fas fa-cog text-lg"></i><span className="text-[10px] uppercase font-bold tracking-wider">Settings</span></button>
      </nav>
      {isAtmosphereExpanded&&myAtmosphereUrl&&<div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300" onClick={()=>setIsAtmosphereExpanded(false)}>
        <button className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-stone-900/50 rounded-full text-white" onClick={e=>{e.stopPropagation();setIsAtmosphereExpanded(false);}}><i className="fas fa-times"></i></button>
        <img src={myAtmosphereUrl} alt="Atmosphere Fullscreen" className="w-full max-h-[70vh] object-contain rounded-lg border border-stone-800"/>
        <p className="mt-4 text-stone-500 italic fantasy-font text-center">{gameState.worldDescription}</p>
      </div>}
      {showLevelUpModal&&levelUpCharacter&&<LevelUpModal character={levelUpCharacter} selectedAllocations={selectedAllocations} remainingPoints={remainingPoints} previewHp={previewHp} error={allocationError} onAllocate={handleAllocateStat} onConfirm={handleConfirmAllocation} onCancel={handleCloseLevelUp} onConfirmAsi={handleConfirmAsiChoice} onConfirmFeat={handleConfirmFeatChoice} onAcknowledgeSubclass={handleAcknowledgeSubclass}/>}
    </div>
  );
};

export default MobileLayout;
