import { createContext, useContext, ReactNode, useCallback } from 'react';
import { Character, MessageRole } from '../types';
import { useGameActions } from '../hooks/useGameActions';
import { useGameContext } from './GameContext';
import { useAuthContext } from './AuthContext';
import { useUIContext } from './UIContext';
import { useProgressionContext } from './ProgressionContext';
import { mcpServer } from '../services/mcpService';

interface ActionsContextValue {
  handleSendMessage: (text: string, isRetry?: boolean) => Promise<void>;
  handleRewind: () => Promise<void>;
  handleExecuteBatch: () => Promise<void>;
  handleCharacterCreated: (character: Character) => void;
  handleResolveEnemyTurn: () => Promise<void>;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

export function ActionsProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthContext();
  const { settings, handleTriggerDiceRoll } = useUIContext();
  const {
    gameState, setGameState, messages, setMessages,
    currentCampaignId, myCharacterId, isLoading, setIsLoading,
    syncState, performAtmosphereUpdate, setStage,
    setViewingCharacterId, setMyCharacterId, isNewCampaign,
    campaignName, setIsNewCampaign, getSenderName
  } = useGameContext();
  const { handleCloseLevelUp } = useProgressionContext();

  const gameActions = useGameActions(
    gameState, setGameState, messages, setMessages,
    currentCampaignId, userId, myCharacterId, settings, setIsLoading,
    handleCloseLevelUp,
    syncState, performAtmosphereUpdate, setStage, setViewingCharacterId,
    setMyCharacterId, isNewCampaign, campaignName, setIsNewCampaign,
    getSenderName, handleTriggerDiceRoll
  );

  const handleResolveEnemyTurn = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const result = await mcpServer.resolveAllPendingEnemyTurns();
      if (result.attackResults?.length > 0 && handleTriggerDiceRoll) {
        for (const atk of result.attackResults) {
          await handleTriggerDiceRoll({
            characterName: atk.enemy || 'Enemy',
            rollType: 'attack',
            label: `${atk.enemy}'s Attack vs ${atk.target}`,
            rollResult: atk.roll,
            modifier: (atk.attackRoll || 0) - (atk.roll || 0),
            sides: 20,
            difficulty: atk.targetAc,
            success: atk.isHit,
            isCritical: atk.isCritical,
            isFumble: atk.isFumble,
          });
        }
      }
      if (result.messages.length > 0) {
        const systemMessages = result.messages.map((msg: string, i: number) => ({
          id: `enemy-turn-${Date.now()}-${i}`,
          role: MessageRole.SYSTEM,
          text: `[System:enemy_turn] ${msg}`,
          timestamp: Date.now()
        }));
        setMessages((prev: any[]) => [...prev, ...systemMessages]);
      }
      syncState();
    } catch (e) {
      console.error('[Resolve Enemy Turn] Failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, setIsLoading, setMessages, syncState, handleTriggerDiceRoll]);

  const value: ActionsContextValue = {
    ...gameActions,
    handleResolveEnemyTurn,
  };

  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export function useActionsContext() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActionsContext must be used within ActionsProvider');
  return ctx;
}
