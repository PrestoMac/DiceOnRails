import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameContext } from '../../contexts/GameContext';
import { useActionsContext } from '../../contexts/ActionsContext';
import { useProgressionContext } from '../../contexts/ProgressionContext';
import { useUIContext } from '../../contexts/UIContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppStage, Character, InventoryItem } from '../../types';
import { isSyncableCampaign } from '../../utils/campaign';
import ChatLog from '../ChatLog';
import ActionQueuePanel from '../ActionQueuePanel';
import InputArea from '../InputArea';
import CharacterSheet from '../CharacterSheet';
import Journal from '../Journal';
import LevelUpModal from '../LevelUpModal';
import CombatTracker from '../CombatTracker';
import ActivityBell from '../shared/ActivityBell';
import HpBar from '../shared/HpBar';
import { useActivityTracking } from '../../hooks/useActivityTracking';
import { useOnboarding } from '../../hooks/useOnboarding';
import { calculateAc } from '../../services/classEngine';
import { formatGameTime } from '../../utils/timeUtils';
import { mcpServer } from '../../services/mcpService';

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

  const [mobileTab, setMobileTab] = useState<'adventure'|'character'|'journal'>('adventure');
  const [isAtmosphereExpanded, setIsAtmosphereExpanded] = useState(false);

  useEffect(() => {
    setIsAtmosphereExpanded(false);
  }, [gameState.currentAtmosphereUrl]);

  const [showQueue, setShowQueue] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (el) setIsScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  const charToShow = gameState.party.find((c: Character) => c.id === viewingCharacterId) || gameState.party[0];
  const isMultiplayer = gameState.party.length > 1;
  const handleBackOrReset = () => userId ? confirm('Return to dashboard?') && setStage(AppStage.DASHBOARD) : confirm('Are you sure you want to reset the game? All progress will be lost.') && resetGame();
  const queueLen = gameState.actionQueue?.length || 0;
  const { recentActivity } = useActivityTracking(gameState, messages, userId);

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
      {gameState.combat?.isActive && <CombatTracker combat={gameState.combat} party={gameState.party} isMobile />}
      <div className="flex-1 overflow-hidden relative flex flex-col pb-16 min-h-0">
        {mobileTab==='adventure'&&<>
          {settings.enableAtmosphere&&<div className="w-full h-32 relative shrink-0 border-b border-stone-800 bg-stone-900">
            {gameState.currentAtmosphereUrl?<img src={gameState.currentAtmosphereUrl} alt="Atmosphere" className="w-full h-full object-cover opacity-70" onClick={()=>setIsAtmosphereExpanded(true)}/>:<div className="w-full h-full flex items-center justify-center text-stone-700"><i className="fas fa-compass text-2xl"></i></div>}
            <div className="absolute bottom-2 left-3 flex items-center gap-2"><div className="bg-stone-950/70 backdrop-blur-sm px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-stone-800/50"><i className="fas fa-eye text-amber-600/60 text-[10px]"></i><span className="fantasy-font text-stone-300 text-xs tracking-widest uppercase text-shadow-sm leading-tight line-clamp-2">{gameState.party[0]?.location||"Unknown"}</span></div></div>
          </div>}
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto relative"><ChatLog messages={messages} settings={settings} onRewind={handleRewind} onUndo={handleUndo} isProcessing={isLoading} scrollRef={chatScrollRef} onScrollChange={setIsScrolledUp} disableInternalScroll showWelcomeChips={onboarding.shouldShowWelcomeChips} onPrefillInput={(text) => { onboarding.markWelcomeSeen(); handleSendMessage(text); }} suggestions={settings.enableSuggestions ? gameState.lastSuggestions : undefined} onPickSuggestion={(text) => handleSendMessage(text)} onDismissSuggestion={() => { mcpServer.setLastSuggestions([]); syncState(); }} /></div>
          <button
            onClick={()=>{if(chatScrollRef.current)chatScrollRef.current.scrollTop=chatScrollRef.current.scrollHeight;}}
            className={`absolute right-3 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-stone-800/80 hover:bg-amber-700/70 text-stone-400 hover:text-amber-300 shadow-lg border border-stone-700/40 hover:border-amber-600/50 transition-all duration-300 flex items-center justify-center ${isScrolledUp?'opacity-100 scale-100':'opacity-0 scale-75 pointer-events-none'}`}
            title="Jump to latest message"
          >
            <i className="fas fa-arrow-down text-xs"></i>
          </button>
          {isMultiplayer&&showQueue&&<div className="absolute inset-0 z-30 flex flex-col" style={{top:'0'}}><div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={()=>setShowQueue(false)}></div><div className="h-[70vh] bg-stone-900 border-t border-stone-800 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"><div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 shrink-0"><span className="text-xs uppercase font-bold tracking-widest text-stone-400">Action Queue</span><button onClick={()=>setShowQueue(false)} className="p-1 hover:bg-stone-800 rounded text-stone-500 hover:text-stone-300 transition-colors"><i className="fas fa-chevron-down text-sm"></i></button></div><div className="flex-1 overflow-y-auto p-2"><ActionQueuePanel queue={gameState.actionQueue||[]} userId={userId} onRemove={handleRemoveQueueItem} onUpdate={handleUpdateQueueItem} onReorder={handleReorderQueue} onExecute={handleExecuteBatch} isProcessing={gameState.isProcessing}/></div></div></div>}
          {isMultiplayer && <div className="p-2 border-t border-stone-800 bg-stone-900 flex gap-2 overflow-x-auto">
            <button onClick={()=>setShowQueue(!showQueue)} className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all ${showQueue?'bg-amber-900 border-amber-700 text-amber-100':'bg-stone-800 border-stone-700 text-stone-400'}${queueLen>0?' animate-glow-pulse':''}`}><i className="fas fa-layer-group mr-1"></i> Queue ({queueLen})</button>
          </div>}
          {charToShow&&!showQueue&&<HpStatusBar character={charToShow} />}
          {!showQueue&&<InputArea onSendMessage={handleSendMessage} onQueueAction={(t: string, ty: 'action'|'dialogue') => handleEnqueueAction(t, ty)} onResolveEnemyTurn={handleResolveEnemyTurn} isLoading={isLoading||gameState.isProcessing===true} combat={gameState.combat} character={charToShow} isMultiplayer={isMultiplayer} onArcaneRecovery={(id, sel) => handleArcaneRecovery(id, sel)} onManageSpellbook={handleManageSpellbook} onSwapKnownSpell={handleConfirmSpellSwap}/>}
        </>}
        {mobileTab==='character'&&<div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isMultiplayer && <div className="flex gap-2 overflow-x-auto pb-2 mb-2">{gameState.party.map((char: Character) => <button key={char.id} onClick={() => setViewingCharacterId(char.id)} className={`p-2 rounded text-xs whitespace-nowrap ${viewingCharacterId===char.id?'bg-amber-700 text-white':'bg-stone-800 text-stone-400'}`}>{char.name}{char.id===myCharacterId?' (You)':''}</button>)}</div>}
          {charToShow?<CharacterSheet character={charToShow} onUpdateInventory={handleUpdateInventory} onLevelUp={handleOpenLevelUp} onSendMessage={handleSendMessage} onTriggerDiceRoll={handleTriggerDiceRoll} isProcessing={gameState.isProcessing} currentUserId={userId} isHost={!!userId && userId === hostId} onUpdateCharacterFields={handleUpdateCharacterFields} onManageSpellbook={handleManageSpellbook} onSwapKnownSpell={handleConfirmSpellSwap} isCombatActive={gameState.combat?.isActive}/>:<div className="text-stone-500 text-center mt-10">No characters in party.</div>}
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
      {isAtmosphereExpanded&&gameState.currentAtmosphereUrl&&<div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300" onClick={()=>setIsAtmosphereExpanded(false)}>
        <button className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-stone-900/50 rounded-full text-white" onClick={e=>{e.stopPropagation();setIsAtmosphereExpanded(false);}}><i className="fas fa-times"></i></button>
        <img src={gameState.currentAtmosphereUrl} alt="Atmosphere Fullscreen" className="w-full max-h-[70vh] object-contain rounded-lg border border-stone-800"/>
        <p className="mt-4 text-stone-500 italic fantasy-font text-center">{gameState.worldDescription}</p>
      </div>}
      {showLevelUpModal&&levelUpCharacter&&<LevelUpModal character={levelUpCharacter} selectedAllocations={selectedAllocations} remainingPoints={remainingPoints} previewHp={previewHp} error={allocationError} onAllocate={handleAllocateStat} onConfirm={handleConfirmAllocation} onCancel={handleCloseLevelUp} onConfirmAsi={handleConfirmAsiChoice} onConfirmFeat={handleConfirmFeatChoice} onAcknowledgeSubclass={handleAcknowledgeSubclass}/>}
    </div>
  );
};

export default MobileLayout;
