import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppSettings } from '../types';
import { useSettings } from '../hooks/useSettings';

interface DiceRollData {
  isOpen: boolean;
  characterName: string;
  skillName?: string;
  rollType?: 'skill' | 'attack' | 'damage' | 'save' | 'death_save' | 'initiative';
  label?: string;
  rollResult: number;
  modifier: number;
  skillRank?: number;
  difficulty?: number;
  success?: boolean;
  xpGained?: number;
  sides?: number;
  isCritical?: boolean;
  isFumble?: boolean;
  resolver?: () => void;
  count?: number;
  results?: number[];
}

interface UIContextValue {
  settings: AppSettings;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  saveSettings: (s: AppSettings) => void;
  isMobile: boolean;
  handleTriggerDiceRoll: (data: any) => Promise<void>;
  diceRollData: DiceRollData | null;
  clearDiceRoll: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const { settings, settingsOpen, setSettingsOpen, saveSettings } = useSettings();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [diceRollData, setDiceRollData] = useState<DiceRollData | null>(null);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const handleTriggerDiceRoll = useCallback((rollData: any) =>
    new Promise<void>(resolve => setDiceRollData({ isOpen: true, ...rollData, resolver: resolve })), []);

  const clearDiceRoll = useCallback(() => {
    diceRollData?.resolver?.();
    setDiceRollData(null);
  }, [diceRollData]);

  return (
    <UIContext.Provider value={{
      settings, settingsOpen, setSettingsOpen, saveSettings,
      isMobile, handleTriggerDiceRoll, diceRollData, clearDiceRoll
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext must be used within UIProvider');
  return ctx;
}
