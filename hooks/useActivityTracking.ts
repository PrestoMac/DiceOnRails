import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Message } from '../types';

/** Tracks recent activity for display (processing user, new messages) and returns the activity log. */
export function useActivityTracking(gameState: GameState, messages: Message[], userId?: string) {
  const [recentActivity, setRecentActivity] = useState<string[]>([]);
  const prevProcessingUserRef = useRef<string | undefined>(undefined);
  const prevMessageCountRef = useRef(0);
  void userId; // reserved for future per-user activity filtering

  const addActivity = useCallback((msg: string) => {
    setRecentActivity(prev => [msg, ...prev].slice(0, 5));
    setTimeout(() => setRecentActivity(prev => prev.slice(0, -1)), 8000);
  }, []);

  useEffect(() => {
    const cur = gameState.processingUser;
    if (cur && cur !== prevProcessingUserRef.current) addActivity(`${cur} is taking their turn`);
    prevProcessingUserRef.current = cur;
  }, [gameState.processingUser, addActivity]);

  useEffect(() => {
    const count = messages.length;
    if (prevMessageCountRef.current > 0 && count > prevMessageCountRef.current) {
      const other = messages.slice(prevMessageCountRef.current).find(m => m.senderName && m.senderName !== 'You' && m.senderName !== 'GameMaster');
      if (other) addActivity(`${other.senderName} sent a message`);
    }
    prevMessageCountRef.current = count;
  }, [messages, addActivity]);

  return { recentActivity, addActivity };
}
