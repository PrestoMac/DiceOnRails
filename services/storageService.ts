import { SavedGameData, Campaign, GameState, Message, AppStage } from '../types';
import { isDebugMode } from '../utils/debug';
import { supabase } from './supabaseClient';
import { getRewindGeneration } from './rewindGeneration';
import { ANONYMOUS_CAMPAIGN_ID, isSyncableCampaign } from '../utils/campaign';

const LS_KEY = 'diceonrails_game_data';
const CAMPAIGNS_TABLE = 'campaigns';

/** Builds a SavedGameData structure from campaign fields. */
function buildSaveData(id: string, name: string, gameState: GameState, messages: Message[], timestamp: number, hostId?: string): SavedGameData {
    return {
        version: '2.0',
        campaignId: id,
        campaignName: name,
        hostId,
        gameState,
        messages,
        stage: AppStage.PLAY,
        timestamp,
    };
}

/** Storage service managing campaign persistence to Supabase (for named campaigns) and localStorage (for anonymous play). */
export const storageService = {
    /** Subscribes to real-time updates on a Supabase campaign row, returning an unsubscribe function. */
    subscribeToCampaign(campaignId: string, onUpdate: (data: unknown) => void) {
        const channel = supabase
            .channel(`campaign-${campaignId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
                (payload) => onUpdate(payload.new),
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    },

    /** Fetches the current game_state for a campaign from Supabase. Returns null on error or if not found. Used by batch execution to preserve queue items added by other players during processing. */
    async fetchGameState(campaignId: string): Promise<GameState | null> {
        try {
            const { data, error } = await supabase
                .from(CAMPAIGNS_TABLE)
                .select('game_state')
                .eq('id', campaignId)
                .single();
            if (error || !data) return null;
            return data.game_state as GameState;
        } catch {
            return null;
        }
    },

    /** Fetches the current messages array for a campaign from Supabase. Used by
     *  the multiplayer batch processor to capture pending messages other players
     *  added during the click race window. Returns null on error or if not found. */
    async fetchMessages(campaignId: string): Promise<Message[] | null> {
        try {
            const { data, error } = await supabase
                .from(CAMPAIGNS_TABLE)
                .select('messages')
                .eq('id', campaignId)
                .single();
            if (error || !data) return null;
            return (data.messages as Message[] | null | undefined) ?? null;
        } catch {
            return null;
        }
    },

    /** Checks whether a campaign is currently being processed by another player. Fail-open: returns false on error so a Supabase outage doesn't block gameplay. */
    async isCampaignProcessing(campaignId: string): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from(CAMPAIGNS_TABLE)
                .select('game_state')
                .eq('id', campaignId)
                .single();
            if (error || !data) return false;
            return (data.game_state as GameState)?.isProcessing === true;
        } catch {
            return false;
        }
    },

    /** Persists game state for a campaign: localStorage for anonymous play, Supabase (coalesced via microtask) for syncable campaigns. */
    syncCampaignState(campaignId: string, gameState: GameState, messages?: Message[]): Promise<void> {
        if (campaignId === ANONYMOUS_CAMPAIGN_ID) {
            const data: SavedGameData = {
                version: '1.0',
                campaignId: ANONYMOUS_CAMPAIGN_ID,
                campaignName: 'Local Campaign',
                gameState,
                messages: messages ?? [],
                stage: AppStage.PLAY,
                timestamp: Date.now(),
            };
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(data));
            } catch (e) {
                if (isDebugMode) console.warn('[storageService] anonymous localStorage write failed:', e);
            }
            return Promise.resolve();
        }
        const payload: Record<string, unknown> = { game_state: { ...gameState, _rewindGeneration: getRewindGeneration() } };
        if (messages) payload.messages = messages;
        enqueueSync(campaignId, payload);
        return Promise.resolve();
    },

    /** Creates a new campaign record in Supabase, returning the campaign ID or an error. */
    async createCampaign(userId: string, name: string, gameState: GameState, specificId?: string): Promise<{ campaignId?: string; error?: string }> {
        try {
            const payload: Record<string, unknown> = { host_id: userId, name, game_state: gameState, messages: [] };
            if (specificId) payload.id = specificId;
            const { data, error } = await supabase.from(CAMPAIGNS_TABLE).insert(payload).select().single();
            if (error) return { error: error.message };
            return { campaignId: data.id };
        } catch (e: unknown) {
            return { error: (e as Error).message };
        }
    },

    /** Loads all campaigns for a user from Supabase (new + legacy format), sorted by last played time. */
    async loadCampaigns(userId?: string): Promise<{ campaigns?: Campaign[]; error?: string }> {
        if (!userId) return { campaigns: [] };

        try {
            const { data: newCampaigns, error: newError } = await supabase
                .from(CAMPAIGNS_TABLE)
                .select('id, name, created_at, game_state')
                .or(`host_id.eq.${userId},game_state->party.cs.[{"ownerId": "${userId}"}]`)
                .order('created_at', { ascending: false });

            if (newError) throw newError;

            const { data: legacySaves, error: legacyError } = await supabase
                .from('game_saves')
                .select('*')
                .eq('user_id', userId);

            if (legacyError && isDebugMode) console.warn('Legacy saves query failed (may be expected if table does not exist):', legacyError.message);

            const list: Campaign[] = [];

            if (newCampaigns) {
                list.push(...newCampaigns.map((row: Record<string, unknown>) => ({
                    id: row.id,
                    name: row.name,
                    createdAt: new Date(row.created_at).getTime(),
                    lastPlayed: new Date(row.created_at).getTime(),
                    characterName: row.game_state?.party?.[0]?.name || "Unknown Party",
                    stage: AppStage.PLAY,
                })));
            }

            if (legacySaves) {
                list.push(...legacySaves.map((row: Record<string, unknown>) => ({
                    id: row.id,
                    name: `[LEGACY] ${row.name || 'Untitled'}`,
                    createdAt: new Date(row.created_at).getTime(),
                    lastPlayed: new Date(row.updated_at || row.created_at).getTime(),
                    characterName: row.game_state?.character?.name || "Legacy Hero",
                    stage: AppStage.PLAY,
                })));
            }

            list.sort((a, b) => b.lastPlayed - a.lastPlayed);
            return { campaigns: list };
        } catch (e: unknown) {
            return { error: (e as Error).message };
        }
    },

    /** Loads a game from Supabase (by campaign ID) or falls back to localStorage for anonymous/local saves. */
    async loadGame(userId?: string, campaignId?: string): Promise<{ data?: SavedGameData; error?: string }> {
        if (userId && isSyncableCampaign(campaignId)) {
            try {
                const { data, error } = await supabase
                    .from(CAMPAIGNS_TABLE)
                    .select('*')
                    .eq('id', campaignId)
                    .single();

                if (error) {
                    if (error.code === 'PGRST116') {
                        const { data: legacyData } = await supabase
                            .from('game_saves')
                            .select('*')
                            .eq('id', campaignId)
                            .single();

                        if (legacyData) {
                            const oldState = legacyData.game_state;
                            const party = oldState.character ? [oldState.character] : [];
                            if (party[0] && !party[0].ownerId) party[0].ownerId = userId;
                            return {
                                data: buildSaveData(
                                    legacyData.id, legacyData.name,
                                    { ...oldState, party },
                                    legacyData.messages || [],
                                    new Date(legacyData.updated_at || legacyData.created_at).getTime(),
                                    userId,
                                ),
                            };
                        }
                    }
                    if (isDebugMode) console.error('Supabase load error:', error);
                    return { error: error.message };
                }

                if (data) {
                    return {
                        data: buildSaveData(
                            data.id, data.name, data.game_state, data.messages,
                            new Date(data.created_at).getTime(),
                            data.host_id as string | undefined,
                        ),
                    };
                }
                return { data: undefined };
            } catch (e: unknown) {
                return { error: (e as Error).message };
            }
        }

        const saved = localStorage.getItem(LS_KEY);
        if (!saved) return { data: undefined };
        try {
            return { data: JSON.parse(saved) };
        } catch {
            return { error: 'Failed to parse local save' };
        }
    },

    /** Saves game data to Supabase (for named campaigns) or localStorage (for anonymous). */
    async saveGame(data: SavedGameData, userId?: string, campaignId?: string): Promise<{ error?: string }> {
        if (userId && isSyncableCampaign(campaignId)) {
            try {
                await this.syncCampaignState(campaignId, data.gameState, data.messages);
                return {};
            } catch (e: unknown) {
                return { error: (e as Error).message };
            }
        }
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        return {};
    },

    /** Deletes a campaign from Supabase by ID (host-only) or clears the local save. */
    async deleteCampaign(userId?: string, campaignId?: string): Promise<{ error?: string }> {
        if (!userId || !campaignId) {
            localStorage.removeItem(LS_KEY);
            return {};
        }
        const { error } = await supabase
            .from(CAMPAIGNS_TABLE)
            .delete()
            .eq('id', campaignId)
            .eq('host_id', userId);
        if (error) return { error: error.message };
        return {};
    },

    /** Renames a campaign in Supabase, verifying host ownership. */
    async renameCampaign(userId: string, campaignId: string, newName: string): Promise<{ error?: string }> {
        try {
            const { error } = await supabase
                .from(CAMPAIGNS_TABLE)
                .update({ name: newName })
                .eq('id', campaignId)
                .eq('host_id', userId);
            if (error) return { error: error.message };
            return {};
        } catch (e: unknown) {
            return { error: (e as Error).message };
        }
    },

    /** Clears the local-storage save data. */
    async clearLocalSave() {
        localStorage.removeItem(LS_KEY);
    },
};

const pendingPayloads = new Map<string, Record<string, unknown>>();
let flushScheduled = false;
let inflight = false;

/** Queues a campaign sync payload, coalescing multiple updates within the same microtask into a single Supabase UPDATE. */
function enqueueSync(campaignId: string, payload: Record<string, unknown>) {
    pendingPayloads.set(campaignId, { ...(pendingPayloads.get(campaignId) || {}), ...payload });
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(drain);
}

/** Drains all queued sync payloads, sending batched Supabase UPDATE queries. */
async function drain() {
    flushScheduled = false;
    if (inflight || pendingPayloads.size === 0) return;
    inflight = true;
    const batch = Array.from(pendingPayloads.entries());
    pendingPayloads.clear();
    try {
        await Promise.all(batch.map(([id, payload]) =>
            supabase.from('campaigns').update(payload).eq('id', id),
        ));
    } catch (e) {
        if (isDebugMode) console.warn('[StorageQueue] drain error:', e);
    } finally {
        inflight = false;
        if (pendingPayloads.size > 0) {
            flushScheduled = true;
            queueMicrotask(drain);
        }
    }
}
