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

const PRESENCE_KEY = 'typing';
const STALE_THRESHOLD_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Multiplayer typing-indicator hook built on Supabase Presence.
 *
 * Presence is ephemeral and broadcast-only: it does NOT touch the campaigns
 * table, requires no migrations, and survives no restarts — perfect for "is
 * writing…" indicators. Each client tracks a profile `{ userId, characterId,
 * name, portraitUrl, isTyping, lastActive }`. Typing is announced on input
 * and stays active as long as text remains in the input field (no auto-clear
 * timers — the InputArea controls the state directly).
 *
 * Hardened against:
 *  - WebSocket drops → auto-reconnect with exponential backoff (1s→30s cap)
 *  - Network offline → re-subscribe on `navigator.online`
 *  - Tab backgrounding → re-broadcast on visibility change
 *  - Stale entries → periodic heartbeat re-broadcast every 10s (only when typing)
 *  - Track failures → awaited + retried with short delay
 *  - Join/leave events → immediate indicator updates (not just sync cycles)
 *
 * Returns `{ typingUsers, setTyping }` where `typingUsers` excludes the local
 * user (you never see your own indicator) and prunes stale (>30s) entries
 * defensively.
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
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror of myCharacter so the mount-stable channel effect and
  // buildProfile can read the latest character data WITHOUT including the
  // deep-cloned Character object in their dependency arrays. The layouts
  // deep-clone gameState on every sync, so the object identity flips every
  // render — depending on it would tear down + rebuild the entire Presence
  // channel on nearly every game-state update, dropping in-flight
  // track({isTyping:false}) calls and re-broadcasting mid-compose. We depend
  // only on the primitive character id instead.
  const myCharacterRef = useRef<Character | undefined>(myCharacter);
  useEffect(() => { myCharacterRef.current = myCharacter; }, [myCharacter]);

  // Build the local profile we broadcast. Reads the latest character from the
  // ref so the callback identity is stable (depends only on userId).
  const buildProfile = useCallback((isTyping: boolean): PresenceProfile | null => {
    const ch = myCharacterRef.current;
    if (!userId || !ch) return null;
    return {
      userId,
      characterId: ch.id,
      name: ch.name,
      portraitUrl: ch.portraitUrl,
      isTyping,
      lastActive: Date.now(),
    };
  }, [userId]);

  // Convert the channel's presence state into the deduped typing-users list.
  const syncTypingUsers = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const state = channel.presenceState<PresenceProfile>();
    const now = Date.now();
    const next: TypingUser[] = [];
    for (const [presenceKey, entries] of Object.entries(state)) {
      for (const entry of entries) {
        if (now - (entry.lastActive ?? 0) > STALE_THRESHOLD_MS) continue;
        if (entry.userId === userId) continue;
        if (!entry.isTyping) continue;
        next.push({
          userId: entry.userId,
          characterId: entry.characterId,
          name: entry.name,
          portraitUrl: entry.portraitUrl,
        });
        void presenceKey;
      }
    }
    const seen = new Set<string>();
    const deduped = next.filter(u => {
      if (seen.has(u.userId)) return false;
      seen.add(u.userId);
      return true;
    });
    setTypingUsers(deduped);
  }, [userId]);

  // Publish the latest profile (or clear typing) to the channel.
  // Awaits the track call and retries once on failure.
  const track = useCallback(async (profile: PresenceProfile | null) => {
    const channel = channelRef.current;
    if (!channel || !profile) return;
    profileRef.current = profile;
    try {
      await channel.track(profile);
    } catch (err) {
      if (isDebugMode) console.warn('[Presence] track failed, retrying…', err);
      // One retry after a short delay.
      await new Promise(r => setTimeout(r, 200));
      try {
        await channel.track(profile);
      } catch (err2) {
        if (isDebugMode) console.warn('[Presence] track retry failed', err2);
      }
    }
  }, []);

  // Public setter invoked by the InputArea. Directly sets `isTyping` —
  // no auto-clear timers. The InputArea controls the state: it calls
  // setTyping(true) when text is entered and setTyping(false) on send/clear.
  const setTyping = useCallback((isTyping: boolean) => {
    if (!isMultiplayer || !isSyncableCampaign(campaignId)) return;
    const base = profileRef.current ?? buildProfile(false);
    if (!base) return;
    const next: PresenceProfile = { ...base, isTyping, lastActive: Date.now() };
    void track(next);
  }, [isMultiplayer, campaignId, buildProfile, track]);

  // Build a channel, subscribe, and wire up presence event handlers.
  // Returns an unsubscribe function.
  const createChannel = useCallback(() => {
    const channel = supabase.channel(`presence-${campaignId}-${PRESENCE_KEY}`);
    channelRef.current = channel;

    // Listen to all three presence event types for immediate updates.
    channel
      .on('presence', { event: 'sync' }, () => syncTypingUsers())
      .on('presence', { event: 'join' }, () => syncTypingUsers())
      .on('presence', { event: 'leave' }, () => syncTypingUsers())
      .subscribe(async (status) => {
        if (isDebugMode) console.log('[Presence] subscribe status:', status);
        if (status === 'SUBSCRIBED') {
          reconnectAttemptsRef.current = 0;
          const initial = buildProfile(false);
          if (initial) {
            profileRef.current = initial;
            await track(initial);
          }
          // Start heartbeat to keep presence entries fresh (only when typing).
          heartbeatRef.current = setInterval(() => {
            const cur = profileRef.current;
            if (cur && cur.isTyping) {
              void track({ ...cur, lastActive: Date.now() });
            }
          }, HEARTBEAT_INTERVAL_MS);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (isDebugMode) console.warn('[Presence] channel', status, '- scheduling reconnect');
          // Clear any pending reconnect.
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          const delay = Math.min(
            RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current,
            RECONNECT_MAX_MS,
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            if (isDebugMode) console.log('[Presence] reconnecting…');
            const unsub = createChannel();
            void unsub;
          }, delay);
        }
      });

    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [campaignId, buildProfile, track, syncTypingUsers]);

  useEffect(() => {
    const myCharacterId = myCharacter?.id;
    if (!isMultiplayer || !isSyncableCampaign(campaignId) || !userId || !myCharacterId) {
      setTypingUsers([]);
      return;
    }

    let unsub = createChannel();

    // Re-subscribe when network connectivity is restored.
    const handleOnline = () => {
      if (isDebugMode) console.log('[Presence] network online - reconnecting');
      unsub();
      unsub = createChannel();
    };
    window.addEventListener('online', handleOnline);

    // Re-broadcast current typing state when the tab regains focus.
    // Browsers may drop the WebSocket while backgrounded; this ensures
    // other clients see an accurate state when the user returns.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cur = profileRef.current;
        if (cur) void track({ ...cur, lastActive: Date.now() });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      unsub();
      channelRef.current = null;
      profileRef.current = null;
      setTypingUsers([]);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMultiplayer, campaignId, userId, myCharacter?.id, buildProfile, createChannel, track]);

  return { typingUsers, setTyping };
}
