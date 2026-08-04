import React, { useState, useEffect } from 'react';
import SetupScreen from './components/v2/pregame/SetupScreen';
import LandingScreen from './components/v2/pregame/LandingScreen';
import AppShellV2 from './components/v2/AppShellV2';
import { ToastProviderV2 } from './components/v2/primitives/Toast';
import { initAudio } from './services/audioService';

import { AuthProvider } from './contexts/AuthContext';
import { UIProvider } from './contexts/UIContext';
import { GameProvider } from './contexts/GameContext';
import { ProgressionProvider } from './contexts/ProgressionContext';
import { CampaignProvider } from './contexts/CampaignContext';
import { ActionsProvider } from './contexts/ActionsContext';

/**
 * Root application component. Shows the V2 setup screen when VITE_SETUP_MODE
 * is true, otherwise the V2 landing splash, then the provider stack (order is
 * load-bearing) around the AppShellV2 stage router. The legacy AppContent and
 * pre-V2 screens remain in the tree as un-imported dead code for reference.
 */
const App: React.FC = () => {
  if (import.meta.env.VITE_SETUP_MODE === 'true') {
    return (
      <ToastProviderV2>
        <SetupScreen />
      </ToastProviderV2>
    );
  }

  useEffect(() => {
    initAudio();
    console.log('🔹 [DiceOnRails] App mounted. Build time:', import.meta.env.VITE_BUILD_TIME || 'dev');
  }, []);

  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) return <LandingScreen onComplete={() => setShowSplash(false)} />;

  return (
    <AuthProvider>
      <UIProvider>
        <GameProvider>
          <ProgressionProvider>
            <CampaignProvider>
              <ActionsProvider>
                <AppShellV2 />
              </ActionsProvider>
            </CampaignProvider>
          </ProgressionProvider>
        </GameProvider>
      </UIProvider>
    </AuthProvider>
  );
};

export default App;
