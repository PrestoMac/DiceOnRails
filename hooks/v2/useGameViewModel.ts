import { useCallback, useMemo } from 'react';
import { useGameContext } from '../../contexts/GameContext';
import { useActionsContext } from '../../contexts/ActionsContext';
import { useProgressionContext } from '../../contexts/ProgressionContext';
import { useUIContext } from '../../contexts/UIContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { useOnboarding } from '../useOnboarding';
import { usePresence } from '../usePresence';
import { useActivityTracking } from '../useActivityTracking';
import { mcpServer } from '../../services/mcpService';
import { pickSuggestionsForCharacter } from '../../services/llm/suggestions';
import { initBattleMap, autoPlaceParty, autoPlaceEnemies } from '../../services/gridService';
import { calculateSpeed } from '../../services/classEngine';
import { authService } from '../../services/authService';
import type { Character } from '../../types';

/**
 * The deduplicated brain of the V2 game screen. Centralizes every derivation and
 * handler that the legacy DesktopLayout/MobileLayout pair used to copy-paste
 * (~300 lines → consumed once here). Pure consumer of the six contexts — no
 * engine state lives here.
 */
export function useGameViewModel() {
  const game = useGameContext();
  const actions = useActionsContext();
  const progression = useProgressionContext();
  const ui = useUIContext();
  const auth = useAuthContext();
  const onboarding = useOnboarding();

  const { gameState, messages, myCharacterId, viewingCharacterId, currentCampaignId, hostId, syncState } = game;
  const { userId } = auth;

  const myCharacter = gameState.party.find((c) => c.id === myCharacterId) ?? gameState.party[0];
  const charToShow =
    gameState.party.find((c) => c.id === viewingCharacterId) || myCharacter;
  const myLocation = myCharacter?.location;
  const myAtmosphereUrl =
    (myLocation && gameState.locationImages?.[myLocation]) || gameState.currentAtmosphereUrl;

  const isMultiplayer = gameState.party.length > 1;
  const isHost = !!userId && userId === hostId;
  const isSyncable = !!userId && currentCampaignId !== 'anonymous';

  const portraitMap = useMemo(
    () =>
      gameState.party.reduce((m, c) => {
        if (c.portraitUrl) m[c.id] = c.portraitUrl;
        return m;
      }, {} as Record<string, string>),
    [gameState.party],
  );

  const pendingCount = useMemo(() => messages.filter((m) => m.pending).length, [messages]);
  const isProcessing = game.isLoading || !!gameState.isProcessing;

  const suggestions =
    ui.settings.enableSuggestions && !gameState.isProcessing
      ? pickSuggestionsForCharacter(gameState, myCharacterId ?? undefined)
      : undefined;

  const dismissSuggestions = useCallback(() => {
    if (myCharacterId && gameState.lastSuggestionsByCharacter) {
      const updated = { ...gameState.lastSuggestionsByCharacter };
      delete updated[myCharacterId];
      mcpServer.setLastSuggestionsByCharacter(updated);
    } else {
      mcpServer.setLastSuggestions([]);
    }
    syncState();
  }, [myCharacterId, gameState.lastSuggestionsByCharacter, syncState]);

  // --- Multiplayer presence (typing indicators) — mirrors legacy wiring exactly.
  const myCharacterForPresence = isMultiplayer ? (charToShow ?? gameState.party[0]) : undefined;
  const { typingUsers, setTyping } = usePresence(currentCampaignId, userId, isMultiplayer, myCharacterForPresence as Character | undefined);

  const { recentActivity } = useActivityTracking(gameState, messages, userId);

  // --- VTT Battle Map ---
  const currentTurnId = gameState.combat?.isActive
    ? gameState.combat.initiative[gameState.combat.turnIndex]?.id
    : undefined;

  const battleMapSpeeds = useMemo(() => {
    const speeds: Record<string, number> = {};
    gameState.party.forEach((c) => {
      speeds[c.id] = calculateSpeed(c);
    });
    gameState.combat?.enemies.forEach((e) => {
      if (!e.isDead) speeds[e.id] = e.beastFields?.speed ?? 30;
    });
    return speeds;
  }, [gameState.party, gameState.combat]);

  const handleTokenMove = useCallback(
    (tokenId: string, x: number, y: number) => {
      const token = gameState.battleMap?.tokens.find((t) => t.id === tokenId);
      const fromPos = token ? { ...token.pos } : undefined;
      mcpServer.updateBattleMapTokens(
        (gameState.battleMap?.tokens ?? []).map((t) => (t.id === tokenId ? { ...t, pos: { x, y } } : t)),
      );
      if (fromPos) {
        mcpServer.setLastTokenMove({ tokenId, from: fromPos, to: { x, y } });
      }
      syncState();
    },
    [gameState.battleMap, syncState],
  );

  /** Removes the battle map. Caller (MapOverlay) must ConfirmDialog first. */
  const clearMap = useCallback(() => {
    mcpServer.clearBattleMap();
    syncState();
  }, [syncState]);

  const initMap = useCallback(
    (width: number, height: number) => {
      let bmap = initBattleMap(width, height, myLocation ?? 'Battle');
      bmap = autoPlaceParty(bmap, gameState.party.map((c) => ({ id: c.id, name: c.name })));
      if (gameState.combat?.enemies) {
        bmap = autoPlaceEnemies(
          bmap,
          gameState.combat.enemies.filter((e) => !e.isDead).map((e) => ({ id: e.id, name: e.name })),
        );
      }
      mcpServer.updateBattleMapTokens(bmap.tokens);
      const state = mcpServer.getFullState();
      if (state.battleMap) {
        state.battleMap.width = bmap.width;
        state.battleMap.height = bmap.height;
        state.battleMap.tokens = bmap.tokens;
      }
      syncState();
    },
    [gameState, myLocation, syncState],
  );

  /** V2 logout with its own ConfirmDialog upstream — bypasses the old hook's native confirm(). */
  const signOut = useCallback(async () => {
    await authService.signOut();
    auth.setUserId(undefined);
  }, [auth]);

  return {
    game,
    actions,
    progression,
    ui,
    auth,
    onboarding,
    myCharacter,
    charToShow,
    myLocation,
    myAtmosphereUrl,
    portraitMap,
    isMultiplayer,
    isHost,
    isSyncable,
    isProcessing,
    pendingCount,
    suggestions,
    dismissSuggestions,
    typingUsers,
    setTyping,
    recentActivity,
    currentTurnId,
    battleMapSpeeds,
    handleTokenMove,
    clearMap,
    initMap,
    signOut,
  };
}

export type GameViewModel = ReturnType<typeof useGameViewModel>;

export default useGameViewModel;
