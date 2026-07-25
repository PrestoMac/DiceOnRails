import React, { useState, useEffect, useCallback } from 'react';
import SetupWizard from './components/SetupWizard';
import SplashScreen from './components/SplashScreen';
import AuthScreen from './components/AuthScreen';
import CampaignDashboard from './components/CampaignDashboard';
import WizardShell from './components/creation/WizardShell';
import StartModeScreen from './components/StartModeScreen';
import QuickStartFlow from './components/QuickStartFlow';
import SettingsModal from './components/SettingsModal';
import CampaignModal from './components/CampaignModal';
import MobileLayout from './components/layouts/MobileLayout';
import DesktopLayout from './components/layouts/DesktopLayout';
import DiceRollModal from './components/DiceRollModal';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AppStage, StartingLocation } from './types';
import { generateStartingLocations, generateAtmosphere } from './services/llm';
import { getEnv } from './utils/envHelper';
import { mcpServer } from './services/mcpService';
import { initAudio } from './services/audioService';
import { buildChatCompletionUrl, buildChatCompletionHeaders, resolveProvider, resolveRequestModel } from './services/llmClient';
import { useAtmospherePrewarm } from './hooks/useAtmospherePrewarm';
import { ANONYMOUS_CAMPAIGN_ID } from './utils/campaign';

import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { UIProvider, useUIContext } from './contexts/UIContext';
import { GameProvider, useGameContext } from './contexts/GameContext';
import { ProgressionProvider } from './contexts/ProgressionContext';
import { CampaignProvider, useCampaignContext } from './contexts/CampaignContext';
import { ActionsProvider, useActionsContext } from './contexts/ActionsContext';
import ErrorBoundary from './components/ErrorBoundary';
import { useOnboarding } from './hooks/useOnboarding';
import OnboardingTour from './components/onboarding/OnboardingTour';
import CompendiumModal from './components/CompendiumModal';

const QueueNotification: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
    <div className="bg-yellow-600 text-stone-950 px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 border-2 border-yellow-400">
      <i className="fas fa-flag animate-bounce"></i><span className="font-bold uppercase tracking-wider text-sm">{message}</span>
    </div>
  </div>
);

/** Root application component. Shows setup wizard when VITE_SETUP_MODE is true, otherwise orchestrates the splash screen, auth, dashboard, character creation, and the main game layout with all context providers. */
const App: React.FC = () => {
  if (import.meta.env.VITE_SETUP_MODE === 'true') return <SetupWizard />;

  useEffect(() => { initAudio(); }, []);

  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) return <SplashScreen onComplete={() => setShowSplash(false)} />;

  return (
    <AuthProvider>
      <UIProvider>
        <GameProvider>
          <ProgressionProvider>
            <CampaignProvider>
              <ActionsProvider>
                <AppContent />
              </ActionsProvider>
            </CampaignProvider>
          </ProgressionProvider>
        </GameProvider>
      </UIProvider>
    </AuthProvider>
  );
};

const AppContent: React.FC = () => {
  const { userId, setUserId, handleLogout } = useAuthContext();
  const {
    stage, gameState, messages, isLoading,
    isNewCampaign, setStage,
    currentCampaignId, setCurrentCampaignId, loadGameData, syncState,
    queueNotification
  } = useGameContext();
  const { settings, settingsOpen, setSettingsOpen, saveSettings, isMobile, diceRollData, clearDiceRoll, isCompendiumOpen, setCompendiumOpen } = useUIContext();
  const { campaigns, showCreateModal, setShowCreateModal, loadCampaigns, handleCreateNewCampaign, handleConfirmCreateCampaign, handleJoinCampaign, handleDeleteCampaign, handleRenameCampaign } = useCampaignContext();
  const { handleCharacterCreated, resetContextState } = useActionsContext();
  const onboarding = useOnboarding();

  // Campaign-switch wrapper: synchronously clears the LLM context manager state
  // (ctxRef in useGameActions) before handleJoinCampaign runs its engine reset
  // (mcpServer.reset + resetRewindGeneration) and loads the new campaign. Order-
  // independent thanks to resetContextState's self-contained hydration.
  const handleSelectCampaign = (id: string) => {
    resetContextState();
    handleJoinCampaign(id, loadGameData);
  };
  const handleJoinCampaignWrapped = (id: string) => {
    resetContextState();
    handleJoinCampaign(id, loadGameData, true);
  };
  const handleConfirmCreateCampaignWrapped = (name: string) => {
    resetContextState();
    handleConfirmCreateCampaign(name);
  };

  const handleGenerateStartingLocations = useCallback(async (charInfo: { name: string; race: string; class: string }): Promise<StartingLocation[]> => {
    const apiKey = getEnv("VITE_LLM_API_KEY");
    if (!apiKey) return [];
    const locs = await generateStartingLocations(charInfo, apiKey);
    return Promise.all(
      locs.map(async (loc) => {
        const url = await generateAtmosphere(`${loc.name}: ${loc.description}`);
        return { ...loc, atmosphereUrl: url || undefined };
      })
    );
  }, []);

  const handleSetStartingLocation = useCallback((location: StartingLocation) => {
    mcpServer.setStartingLocation(location);
    syncState();
  }, [syncState]);

  const handleAuthComplete = (uid?: string) => {
    setUserId(uid);
    if (uid) { setStage(AppStage.DASHBOARD); } else { setCurrentCampaignId(ANONYMOUS_CAMPAIGN_ID); loadGameData(undefined, ANONYMOUS_CAMPAIGN_ID); }
  };

  useEffect(() => {
    if (userId && stage === AppStage.AUTH) setStage(AppStage.DASHBOARD);
    // Anonymous players have no userId by design — don't bounce them back to AUTH.
    else if (!userId && stage !== AppStage.AUTH && currentCampaignId !== ANONYMOUS_CAMPAIGN_ID) setStage(AppStage.AUTH);
  }, [userId, stage, setStage, currentCampaignId]);

  useEffect(() => {
    if (stage === AppStage.DASHBOARD && userId) loadCampaigns();
  }, [stage, userId, loadCampaigns]);

  useAtmospherePrewarm(
    gameState,
    settings,
    stage === AppStage.PLAY
  );

  useEffect(() => {
    if (stage !== AppStage.PLAY) return;
    if (onboarding.shouldAutoLaunchTour && !onboarding.tourActive) {
      onboarding.launchTour();
    }
  }, [stage, onboarding.shouldAutoLaunchTour, onboarding.tourActive, onboarding.launchTour]);

  useEffect(() => {
    if (stage !== AppStage.PLAY) return;
    const apiKey = getEnv('VITE_LLM_API_KEY');
    if (!apiKey) return;
    const apiBase = getEnv('VITE_LLM_API_BASE');
    const provider = resolveProvider(undefined, apiBase);
    const url = buildChatCompletionUrl(provider, apiBase);
    const headers = buildChatCompletionHeaders(provider, apiKey);
    const model = resolveRequestModel(getEnv('VITE_LLM_MODEL') ?? 'deepseek/deepseek-v4-flash', apiBase);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    fetch(url, { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }), signal: controller.signal }).catch(() => {});
    return () => { controller.abort(); clearTimeout(t); };
  }, [stage]);

  if (stage === AppStage.AUTH) return <AuthScreen onComplete={handleAuthComplete} />;

  const getContent = () => {
    if (stage === AppStage.DASHBOARD) {
      return <CampaignDashboard campaigns={campaigns} onSelectCampaign={handleSelectCampaign} onCreateNew={handleCreateNewCampaign} onDeleteCampaign={handleDeleteCampaign} onRenameCampaign={handleRenameCampaign} onJoinCampaign={handleJoinCampaignWrapped} onOpenSettings={() => setSettingsOpen(true)} onLogout={handleLogout} loading={isLoading} />;
    }
    if (stage === AppStage.START_MODE) {
      return <StartModeScreen onQuickStart={() => setStage(AppStage.QUICK_START)} onCustom={() => setStage(AppStage.CREATION)} />;
    }
    if (stage === AppStage.QUICK_START) {
      return <QuickStartFlow onComplete={handleCharacterCreated} onGenerateStartingLocations={handleGenerateStartingLocations} onSetStartingLocation={handleSetStartingLocation} onSwitchToCustom={() => setStage(AppStage.CREATION)} />;
    }
    if (stage === AppStage.CREATION) {
      // When joining an existing party (!isNewCampaign), default the wizard's level to
      // the party's max level so the new member isn't underpowered.
      const joinDefaultLevel = !isNewCampaign && gameState.party.length > 0
        ? Math.max(...gameState.party.map(c => c.level))
        : undefined;
      return <WizardShell onComplete={handleCharacterCreated} isNewCampaign={isNewCampaign} defaultLevel={joinDefaultLevel} campaignStartingLocation={gameState.startingLocation} onGenerateStartingLocations={isNewCampaign ? handleGenerateStartingLocations : undefined} onSetStartingLocation={handleSetStartingLocation} />;
    }
    return <ErrorBoundary>{isMobile ? <MobileLayout key={currentCampaignId} /> : <DesktopLayout key={currentCampaignId} />}</ErrorBoundary>;
  };

  return (
    <div className="flex h-screen w-full bg-stone-950 overflow-hidden relative">
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage:'radial-gradient(#444 1px, transparent 1px)', backgroundSize:'40px 40px'}}></div>
      {getContent()}
      {queueNotification && <QueueNotification message={queueNotification} />}
      {settingsOpen && <SettingsModal settings={settings} userId={userId} messages={messages} gameState={gameState} onSave={saveSettings} onClose={() => setSettingsOpen(false)} onReplayOnboarding={() => { setSettingsOpen(false); onboarding.resetOnboarding(); }} />}
      {showCreateModal && <CampaignModal mode="create" isOpen={true} onConfirm={handleConfirmCreateCampaignWrapped} onCancel={() => setShowCreateModal(false)} />}
      {diceRollData?.isOpen && (
        <DiceRollModal
          key={diceRollData.id}
          characterName={diceRollData.characterName}
          rollType={diceRollData.rollType ?? 'skill'}
          label={diceRollData.label ?? diceRollData.skillName ?? 'Check'}
          rollResult={diceRollData.rollResult}
          modifier={diceRollData.modifier}
          skillRank={diceRollData.skillRank}
          difficulty={diceRollData.difficulty}
          success={diceRollData.success}
          xpGained={diceRollData.xpGained}
          sides={diceRollData.sides ?? 20}
          isCritical={diceRollData.isCritical}
          isFumble={diceRollData.isFumble}
          count={diceRollData.count}
          results={diceRollData.results}
          onClose={clearDiceRoll}
        />
      )}
      <Analytics /><SpeedInsights />
      {stage === AppStage.PLAY && (
        <OnboardingTour
          active={onboarding.tourActive}
          combatActive={gameState.combat?.isActive}
          multiplayer={gameState.party.length > 1}
          onDismiss={onboarding.dismissTour}
        />
      )}
      <CompendiumModal isOpen={isCompendiumOpen} onClose={() => setCompendiumOpen(false)} />
    </div>
  );
};

export default App;
