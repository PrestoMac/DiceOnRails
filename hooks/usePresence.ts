import { useEffect, useRef, useState, useCallback } from 'react';
import type { Character } from '../types';
import { supabase } from '../services/supabaseClient';
import { isSyncableCampaign } from '../utils/campaign';
import { isDebugMode } from '../utils/debug';

/** A user currently typing in a multiplayer campaign chat. */
export interface TypingUser {
  userId: string;
  characterId: string;
  name: string;
  portraitUrl?: string;
}

/** Profile payload this client broadcasts via Supabase Presence. */
interface PresenceProfile {
  userId: string;
  characterId: string;
  name: string;
  portraitUrl?: string;
  isTyping: boolean;
  lastActive: number;
}

const TYPING_TIMEOUT_MS = 2500;
const PRESENCE_KEY = 'typing';

/**
 * Multiplayer typing-indicator hook built on Supabase Presence.
 *
 * Presence is ephemeral and broadcast-only: it does NOT touch the campaigns
 * table, requires no migrations, and survives no restarts — perfect for "is
 * writing…" indicators. Each client tracks a profile `{ userId, characterId,
 * name, portraitUrl, isTyping, lastActive }`. Typing is announced on input
 * (debounced via timeout) and auto-clears after `TYPING_TIMEOUT_MS` of
 * silence, plus a hard 2× safety timeout.
 *
 * Returns `{ typingUsers, setTyping }` where `typingUsers` excludes the local
 * user (you never see your own indicator) and prunes stale (>2× timeout)
 * entries defensively.
 *
 * No-op for solo (`isMultiplayer=false`) or anonymous campaigns — returns
 * an empty list and a no-op setter.
 */
export function usePresence(
  campaignId: string | undefined,
  userId: string | undefined,
  isMultiplayer: boolean,
  myCharacter?: Character,
): { typingUsers: TypingUser[]; setTyping: (isTyping: boolean) => void } {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const profileRef = useRef<PresenceProfile | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the local profile we broadcast. Recomputed when identity changes.
  const buildProfile = useCallback((isTyping: boolean): PresenceProfile | null => {
    if (!userId || !myCharacter) return null;
    return {
      userId,
      characterId: myCharacter.id,
      name: myCharacter.name,
      portraitUrl: myCharacter.portraitUrl,
      isTyping,
      lastActive: Date.now(),
    };
  }, [userId, myCharacter]);

  // Publish the latest profile (or clear typing) to the channel.
  const track = useCallback((profile: PresenceProfile | null) => {
    const channel = channelRef.current;
    if (!channel || !profile) return;
    profileRef.current = profile;
    try {
      void channel.track(profile);
    } catch (err) {
      if (isDebugMode) console.warn('[Presence] track failed', err);
    }
  }, []);

  // Public setter invoked by the InputArea. Flips `isTyping` on input and
  // schedules an auto-clear timeout. A second "hard" timeout guards against
  // a missed clear event.
  const setTyping = useCallback((isTyping: boolean) => {
    if (!isMultiplayer || !isSyncableCampaign(campaignId)) return;
    const base = profileRef.current ?? buildProfile(false);
    if (!base) return;
    const next: PresenceProfile = { ...base, isTyping, lastActive: Date.now() };
    track(next);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
    if (isTyping) {
      clearTimerRef.current = setTimeout(() => {
        // Auto-clear after idle.
        const cur = profileRef.current;
        if (cur) track({ ...cur, isTyping: false, lastActive: Date.now() });
      }, TYPING_TIMEOUT_MS);
      hardTimerRef.current = setTimeout(() => {
        const cur = profileRef.current;
        if (cur) track({ ...cur, isTyping: false, lastActive: Date.now() });
      }, TYPING_TIMEOUT_MS * 2);
    }
  }, [isMultiplayer, campaignId, buildProfile, track]);

  useEffect(() => {
    if (!isMultiplayer || !isSyncableCampaign(campaignId) || !userId || !myCharacter) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase.channel(`presence-${campaignId}-${PRESENCE_KEY}`);
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceProfile>();
        const now = Date.now();
        const next: TypingUser[] = [];
        for (const [presenceKey, entries] of Object.entries(state)) {
          // Each presence key maps to an array of profiles (usually one per client).
          for (const entry of entries) {
            // Exclude stale entries defensively (>2× timeout since lastActive).
            if (now - (entry.lastActive ?? 0) > TYPING_TIMEOUT_MS * 2) continue;
            // Exclude the local user — you never see your own indicator.
            if (entry.userId === userId) continue;
            if (!entry.isTyping) continue;
            // Use presenceKey as a tiebreaker id for dedup across multi-client users.
            next.push({
              userId: entry.userId,
              characterId: entry.characterId,
              name: entry.name,
              portraitUrl: entry.portraitUrl,
            });
            void presenceKey;
          }
        }
        // Dedup by userId (a player with multiple tabs open counts once).
        const seen = new Set<string>();
        const deduped = next.filter(u => {
          if (seen.has(u.userId)) return false;
          seen.add(u.userId);
          return true;
        });
        setTypingUsers(deduped);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const initial = buildProfile(false);
          if (initial) {
            profileRef.current = initial;
            try { await channel.track(initial); } catch { /* ignore */ }
          }
        }
      });

    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
      try { void channel.untrack(); } catch { /* ignore */ }
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channelRef.current = null;
      profileRef.current = null;
      setTypingUsers([]);
    };
  }, [isMultiplayer, campaignId, userId, myCharacter, buildProfile]);

  return { typingUsers, setTyping };
}
