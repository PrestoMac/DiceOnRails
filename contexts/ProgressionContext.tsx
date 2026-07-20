import { createContext, useContext, ReactNode } from 'react';
import { Character } from '../types';
import { useProgression, FeatChoiceOptions } from '../hooks/useProgression';
import { useGameContext } from './GameContext';

interface ProgressionContextValue {
  showLevelUpModal: boolean;
  levelUpCharacter: Character | null;
  previewHp: number;
  selectedAllocations: Partial<Record<keyof Character['stats'], number>>;
  remainingPoints: number;
  allocationError: string | null;
  handleOpenLevelUp: (characterId: string) => void;
  handleCloseLevelUp: () => void;
  handleAllocateStat: (stat: keyof Character['stats'], delta: number) => void;
  handleConfirmAllocation: (customSkillAllocations?: Record<string, number>, customHpDeviation?: number) => Promise<void>;
  handleConfirmAsiChoice: () => Promise<void>;
  handleConfirmFeatChoice: (opts: FeatChoiceOptions) => Promise<void>;
  handleAcknowledgeSubclass: () => Promise<void>;
}

const ProgressionContext = createContext<ProgressionContextValue | null>(null);

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const { currentCampaignId, syncState } = useGameContext();
  const progression = useProgression(currentCampaignId, syncState);

  const value: ProgressionContextValue = {
    showLevelUpModal: progression.showLevelUpModal,
    levelUpCharacter: progression.levelUpCharacter,
    previewHp: progression.previewHp,
    selectedAllocations: progression.selectedAllocations,
    remainingPoints: progression.remainingPoints,
    allocationError: progression.allocationError,
    handleOpenLevelUp: progression.handleOpenLevelUp,
    handleCloseLevelUp: progression.handleCloseLevelUp,
    handleAllocateStat: progression.handleAllocateStat,
    handleConfirmAllocation: progression.handleConfirmAllocation,
    handleConfirmAsiChoice: progression.handleConfirmAsiChoice,
    handleConfirmFeatChoice: progression.handleConfirmFeatChoice,
    handleAcknowledgeSubclass: progression.handleAcknowledgeSubclass,
  };

  return <ProgressionContext.Provider value={value}>{children}</ProgressionContext.Provider>;
}

export function useProgressionContext() {
  const ctx = useContext(ProgressionContext);
  if (!ctx) throw new Error('useProgressionContext must be used within ProgressionProvider');
  return ctx;
}
