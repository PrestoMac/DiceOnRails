import { Character, GameState } from '../../types';
import { formatGameTime } from '../../utils/timeUtils';
import { ensureGameStateFields } from './stateService';

/** Service interface for managing party members and resource lookups. */
export interface PartyService {
  setCharacter(character: Character): void;
  joinParty(character: Character): void;
  getTarget(id?: string): Character | undefined;
  getResource(uri: string): unknown;
}

/** Creates a new PartyService instance operating on the given GameState. */
export function createPartyService(state: GameState): PartyService {
  return {
    setCharacter(character: Character) {
      this.joinParty(character);
    },

    joinParty(character: Character) {
      const existingIdx = state.party.findIndex(c => c.id === character.id);
      if (!character.hitDice) {
        character.hitDice = { current: character.level, max: character.level };
      }
      if (character.class) character.class = character.class.toLowerCase();
      if (character.race) character.race = character.race.toLowerCase();
      character.feats ??= [];
      character.featSelections ??= [];
      character.featChoices ??= {};
      character.pendingFeatChoice ??= false;
      character.resources ??= [];
      character.knownSpells ??= [];
      character.preparedSpells ??= [];
      character.racialTraits ??= [];
      character.unlockedSubclassFeatures ??= [];
      character.pendingSubclassFeature ??= false;
      if (existingIdx > -1) {
        state.party[existingIdx] = character;
      } else {
        state.party.push(character);
        state.sessionLogs.push(`${character.name} has joined the party.`);
      }
    },

    getTarget(id?: string): Character | undefined {
      if (!id) return state.party[0];
      return state.party.find(c => c.id === id || c.name.toLowerCase() === id.toLowerCase());
    },

    getResource(uri: string): unknown {
      if (uri.startsWith('campaign://character/')) {
        return state.party;
      }
      if (uri === 'campaign://world/current_location') {
        const loc = state.party[0]?.location || 'Unknown';
        return { location: loc, description: state.worldDescription };
      }
      if (uri === 'campaign://logs/session_summary') return state.sessionLogs;
      if (uri === 'campaign://journal/quests') return state.quests;
      if (uri === 'campaign://journal/lore') return state.lore;
      if (uri === 'campaign://world/factions') {
        return { factions: state.factionReputations ?? {}, lastUpdated: state.gameTime };
      }
      if (uri === 'campaign://world/time') {
        ensureGameStateFields(state);
        const info = formatGameTime(state.gameTime ?? 0);
        const sinceRest = state.lastLongRestTime != null
          ? Math.max(0, Math.floor(((state.gameTime as number) - state.lastLongRestTime) / 60))
          : 0;
        return { ...info, gameTime: state.gameTime, hoursSinceLastRest: sinceRest };
      }
      return undefined;
    },
  };
}
