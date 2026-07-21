import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboarding, TOUR_SEEN_KEY, WELCOME_SEEN_KEY } from '../../hooks/useOnboarding';

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with tour unseen and welcome unseen on first run', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.tourSeen).toBe(false);
    expect(result.current.welcomeSeen).toBe(false);
    expect(result.current.shouldAutoLaunchTour).toBe(true);
    expect(result.current.shouldShowWelcomeChips).toBe(true);
    expect(result.current.tourActive).toBe(false);
  });

  it('dismissTour marks tour as seen and persists to localStorage', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      result.current.launchTour();
    });
    expect(result.current.tourActive).toBe(true);
    act(() => {
      result.current.dismissTour();
    });
    expect(result.current.tourActive).toBe(false);
    expect(result.current.tourSeen).toBe(true);
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('true');
  });

  it('markWelcomeSeen persists welcome flag', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.markWelcomeSeen());
    expect(result.current.welcomeSeen).toBe(true);
    expect(result.current.shouldShowWelcomeChips).toBe(false);
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe('true');
  });

  it('resetOnboarding wipes both flags and relaunches the tour', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      result.current.dismissTour();
      result.current.markWelcomeSeen();
    });
    expect(result.current.tourSeen).toBe(true);
    expect(result.current.welcomeSeen).toBe(true);

    act(() => {
      result.current.resetOnboarding();
    });

    expect(result.current.tourSeen).toBe(false);
    expect(result.current.welcomeSeen).toBe(false);
    expect(result.current.tourActive).toBe(true);
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBeNull();
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBeNull();
  });

  it('reads existing flags from localStorage on mount', () => {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.tourSeen).toBe(true);
    expect(result.current.welcomeSeen).toBe(true);
    expect(result.current.shouldAutoLaunchTour).toBe(false);
  });

  it('is resilient to localStorage being unavailable', () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('denied'); },
        setItem: () => { throw new Error('denied'); },
        removeItem: () => { throw new Error('denied'); },
      },
    });
    try {
      const { result } = renderHook(() => useOnboarding());
      expect(result.current.tourSeen).toBe(false);
      act(() => result.current.dismissTour());
      expect(result.current.tourSeen).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
