import React, { useCallback, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AppStage, StartingLocation } from '../../types';
import { useAuthContext } from '../../contexts/AuthContext';
import { useUIContext } from '../../contexts/UIContext';
import { useGameContext } from '../../contexts/GameContext';
import { useCampaignContext } from '../../contexts/CampaignContext';
import { useActionsContext } from '../../contexts/ActionsContext';
import { useOnboarding } from '../../hooks/useOnboarding';
import { useAtmospherePrewarm } from '../../hooks/useAtmospherePrewarm';
import useNativeDialogInterception from '../../hooks/v2/useNativeDialogInterception';
import { generateStartingLocations, generateAtmosphere } from '../../services/llm';
import { getEnv } from '../../utils/envHelper';
import { mcpServer } from '../../services/mcpService';
import { authService } from '../../services/authService';
import { buildChatCompletionUrl, buildChatCompletionHeaders, resolveProvider, resolveRequestModel } from '../../services/llmClient';
import { ANONYMOUS_CAMPAIGN_ID } from '../../utils/campaign';
import ErrorBoundary from '../ErrorBoundary';
import { ToastProviderV2, useToastV2 } from './primitives/Toast';
import Modal from './primitives/Modal';
import Button from './primitives/Button';
import ConfirmDialog from './primitives/ConfirmDialog';
import { TextField } from './primitives/Field';
import AuthScreen from './pregame/AuthScreen';
import HallScreen from './pregame/HallScreen';
import PathScreen from './pregame/PathScreen';
import QuickStartScreen from './pregame/QuickStartScreen';
import ForgeScreen from './forge/ForgeScreen';
import GameScreen from './game/GameScreen';
import SettingsSheet from './game/sheets/SettingsSheet';
import CompendiumSheet from './game/sheets/CompendiumSheet';
import DiceOverlay from './game/DiceOverlay';
import TourOverlay from './game/TourOverlay';

/** V2 create-campaign dialog (replaces the legacy CampaignModal, create mode). */
const CreateCampaignModal: React.FC<{ open: boolean; onConfirm: (name: string) => void; onCancel: () => void }> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <Modal open={open} onClose={onCancel} title="New Chronicle" icon="fa-feather-pointed" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <TextField
          value={name}
          onChange={setName}
          placeholder="Name your chronicle…"
          icon="fa-book"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" icon="fa-plus" disabled={!name.trim()}>
            Begin
          </Button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * Emberlight V2 stage router — replaces the legacy AppContent. Ports every
 * behavior 1:1 (auth-stage sync, campaign loaders, atmosphere prewarm, tour
 * auto-launch, LLM warmup ping, global modals) onto the V2 screen set.
 */
const AppShellInner: React.FC = () => {
  const { userId, setUserId } = useAuthContext();
  const {
    stage, gameState, messages, isLoading,
    isNewCampaign, setStage,
    currentCampaignId, setCurrentCampaignId, loadGameData, syncState,
    campaignName,
  } = useGameContext();
  const { settings, settingsOpen, setSettingsOpen, saveSettings, diceRollData, clearDiceRoll, isCompendiumOpen, setCompendiumOpen } = useUIContext();
  const { campaigns, showCreateModal, setShowCreateModal, loadCampaigns, handleCreateNewCampaign, handleConfirmCreateCampaign, handleJoinCampaign, handleDeleteCampaign, handleRenameCampaign } = useCampaignContext();
  const { handleCharacterCreated, resetContextState } = useActionsContext();
  const onboarding = useOnboarding();
  const { toast } = useToastV2();
  useNativeDialogInterception(toast);

  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Campaign-switch wrappers: synchronously clear the LLM context manager state
  // (ctxRef in useGameActions) before the join/create flows run their engine
  // reset. Ported verbatim from the legacy AppContent.
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

  const handleGenerateStartingLocations = useCallback(async (charInfo: { name: string; race: string; class: string }, signal?: AbortSignal): Promise<StartingLocation[]> => {
    const apiKey = getEnv('VITE_LLM_API_KEY');
    if (!apiKey) return [];
    const locs = await generateStartingLocations(charInfo, apiKey, undefined, undefined, undefined, signal);
    return Promise.all(
      locs.map(async (loc) => {
        const url = await generateAtmosphere(`${loc.name}: ${loc.description}`);
        return { ...loc, atmosphereUrl: url || undefined };
      }),
    );
  }, []);

  const handleSetStartingLocation = useCallback((location: StartingLocation) => {
    mcpServer.setStartingLocation(location);
    syncState();
  }, [syncState]);

  const handleAuthComplete = (uid?: string) => {
    setUserId(uid);
    if (uid) {
      setStage(AppStage.DASHBOARD);
    } else {
      setCurrentCampaignId(ANONYMOUS_CAMPAIGN_ID);
      loadGameData(undefined, ANONYMOUS_CAMPAIGN_ID);
    }
  };

  /** Escape hatch out of the START_MODE/QUICK_START/CREATION flow. */
  const handleLeaveFlow = () => {
    if (userId) setStage(AppStage.DASHBOARD);
    else setStage(AppStage.AUTH);
  };

  const handleSignOut = async () => {
    await authService.signOut();
    setUserId(undefined);
  };

  useEffect(() => {
    if (userId && stage === AppStage.AUTH) setStage(AppStage.DASHBOARD);
    // Anonymous players have no userId by design — don't bounce them back to AUTH.
    else if (!userId && stage !== AppStage.AUTH && currentCampaignId !== ANONYMOUS_CAMPAIGN_ID) setStage(AppStage.AUTH);
  }, [userId, stage, setStage, currentCampaignId]);

  useEffect(() => {
    if (stage === AppStage.DASHBOARD && userId) loadCampaigns();
  }, [stage, userId, loadCampaigns]);

  useAtmospherePrewarm(gameState, settings, stage === AppStage.PLAY);

  useEffect(() => {
    if (stage !== AppStage.PLAY) return;
    if (onboarding.shouldAutoLaunchTour && !onboarding.tourActive) {
      onboarding.launchTour();
    }
  }, [stage, onboarding.shouldAutoLaunchTour, onboarding.tourActive, onboarding.launchTour]);

  // SettingsSheet "Replay the tour" dispatches this window event.
  useEffect(() => {
    const onReplay = () => {
      setSettingsOpen(false);
      onboarding.resetOnboarding();
    };
    window.addEventListener('dor:replay-tour', onReplay);
    return () => window.removeEventListener('dor:replay-tour', onReplay);
  }, [onboarding, setSettingsOpen]);

  // LLM warmup ping on entering PLAY (keeps the provider connection hot).
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
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [stage]);

  if (stage === AppStage.AUTH) {
    return (
      <>
        <AuthScreen onComplete={handleAuthComplete} />
        <Analytics />
        <SpeedInsights />
      </>
    );
  }

  const getContent = () => {
    if (stage === AppStage.DASHBOARD) {
      return (
        <HallScreen
          campaigns={campaigns}
          loading={isLoading}
          userId={userId}
          onSelectCampaign={handleSelectCampaign}
          onCreateNew={handleCreateNewCampaign}
          onDeleteCampaign={handleDeleteCampaign}
          onRenameCampaign={handleRenameCampaign}
          onJoinCampaign={handleJoinCampaignWrapped}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={() => setConfirmSignOut(true)}
        />
      );
    }
    if (stage === AppStage.START_MODE) {
      return (
        <PathScreen
          onQuickStart={() => setStage(AppStage.QUICK_START)}
          onCustom={() => setStage(AppStage.CREATION)}
          onBack={handleLeaveFlow}
        />
      );
    }
    if (stage === AppStage.QUICK_START) {
      return (
        <QuickStartScreen
          onComplete={handleCharacterCreated}
          onGenerateStartingLocations={handleGenerateStartingLocations}
          onSetStartingLocation={handleSetStartingLocation}
          onSwitchToCustom={() => setStage(AppStage.CREATION)}
          isNewCampaign={isNewCampaign}
          campaignStartingLocation={gameState.startingLocation}
          campaignName={campaignName}
          onBack={() => setStage(AppStage.START_MODE)}
        />
      );
    }
    if (stage === AppStage.CREATION) {
      // When joining an existing party (!isNewCampaign), default the wizard's level
      // to the party's max level so the new member isn't underpowered.
      const joinDefaultLevel =
        !isNewCampaign && gameState.party.length > 0
          ? Math.max(...gameState.party.map((c) => c.level))
          : undefined;
      return (
        <ForgeScreen
          onComplete={handleCharacterCreated}
          isNewCampaign={isNewCampaign}
          defaultLevel={joinDefaultLevel}
          campaignStartingLocation={gameState.startingLocation ?? undefined}
          onGenerateStartingLocations={isNewCampaign ? handleGenerateStartingLocations : undefined}
          onSetStartingLocation={handleSetStartingLocation}
          onBack={() => setStage(AppStage.START_MODE)}
        />
      );
    }
    return (
      <ErrorBoundary>
        <GameScreen key={currentCampaignId} />
      </ErrorBoundary>
    );
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-obsidian-950">
      {getContent()}

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          userId={userId}
          messages={messages}
          gameState={gameState}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <CreateCampaignModal
        open={showCreateModal}
        onConfirm={handleConfirmCreateCampaignWrapped}
        onCancel={() => setShowCreateModal(false)}
      />
      <CompendiumSheet open={isCompendiumOpen} onClose={() => setCompendiumOpen(false)} />

      {diceRollData?.isOpen && (
        <DiceOverlay
          key={diceRollData.id}
          isOpen={true}
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

      {stage === AppStage.PLAY && (
        <TourOverlay
          active={onboarding.tourActive}
          combatActive={gameState.combat?.isActive}
          multiplayer={gameState.party.length > 1}
          onDismiss={(dontShowAgain) => {
            if (dontShowAgain) onboarding.dismissTour();
            else onboarding.stopTour();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmSignOut}
        title="Leave the table?"
        body="You will be signed out. Your chronicles are saved and waiting for your return."
        confirmLabel="Sign Out"
        danger
        onConfirm={() => {
          setConfirmSignOut(false);
          void handleSignOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />

      <Analytics />
      <SpeedInsights />
    </div>
  );
};

/** Root V2 shell: toast provider + native-dialog interception + stage router. */
const AppShellV2: React.FC = () => (
  <ToastProviderV2>
    <AppShellInner />
  </ToastProviderV2>
);

export default AppShellV2;
