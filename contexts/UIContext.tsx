import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppSettings } from '../types';
import { useSettings } from '../hooks/useSettings';

interface DiceRollData {
  id: number;
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
  handleTriggerDiceRoll: (data: Record<string, unknown>) => Promise<void>;
  diceRollData: DiceRollData | null;
  clearDiceRoll: () => void;
  isCompendiumOpen: boolean;
  setCompendiumOpen: (open: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

/** Provides UI context (settings, mobile detection, dice roll overlay) to the component tree. */
export function UIProvider({ children }: { children: ReactNode }) {
  const { settings, settingsOpen, setSettingsOpen, saveSettings } = useSettings();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [diceRollData, setDiceRollData] = useState<DiceRollData | null>(null);
  const [isCompendiumOpen, setCompendiumOpen] = useState(false);
  const rollIdRef = useRef(0);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const handleTriggerDiceRoll = useCallback((rollData: Record<string, unknown>) =>
    new Promise<void>(resolve => setDiceRollData({ id: ++rollIdRef.current, isOpen: true, ...rollData, resolver: resolve })), []);

  const clearDiceRoll = useCallback(() => {
    diceRollData?.resolver?.();
    setDiceRollData(null);
  }, [diceRollData]);

  return (
    <UIContext.Provider value={{
      settings, settingsOpen, setSettingsOpen, saveSettings,
      isMobile, handleTriggerDiceRoll, diceRollData, clearDiceRoll,
      isCompendiumOpen, setCompendiumOpen
    }}>
      {children}
    </UIContext.Provider>
  );
}

/** Returns the UI context value. Must be used within a UIProvider. */
export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext must be used within UIProvider');
  return ctx;
}
