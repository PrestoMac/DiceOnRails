import { useCallback, useState } from 'react';

/** localStorage flag keys for onboarding. */
export const TOUR_SEEN_KEY = 'diceonrails_seenTour';
export const WELCOME_SEEN_KEY = 'diceonrails_seenWelcome';

/** Reads a boolean-ish flag from localStorage ('true' or absence). */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable; no-op */
  }
}

/**
 * localStorage-backed onboarding state hook.
 * Tracks whether the first-session tour and welcome chips have been seen.
 */
export function useOnboarding() {
  const [tourSeen, setTourSeen] = useState<boolean>(() => readFlag(TOUR_SEEN_KEY));
  const [welcomeSeen, setWelcomeSeen] = useState<boolean>(() => readFlag(WELCOME_SEEN_KEY));
  const [tourActive, setTourActive] = useState<boolean>(false);

  const launchTour = useCallback(() => {
    setTourActive(true);
  }, []);

  const dismissTour = useCallback(() => {
    setTourActive(false);
    setTourSeen(true);
    writeFlag(TOUR_SEEN_KEY, true);
  }, []);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    writeFlag(WELCOME_SEEN_KEY, true);
  }, []);

  /** Wipes both flags so the next mount re-triggers tour and welcome chips. */
  const resetOnboarding = useCallback(() => {
    writeFlag(TOUR_SEEN_KEY, false);
    writeFlag(WELCOME_SEEN_KEY, false);
    setTourSeen(false);
    setWelcomeSeen(false);
    setTourActive(true);
  }, []);

  /** Stops the active tour WITHOUT persisting the seen flag (it may auto-launch again next session). */
  const stopTour = useCallback(() => {
    setTourActive(false);
  }, []);

  return {
    tourSeen,
    welcomeSeen,
    tourActive,
    /** True when the tour should auto-launch on first PLAY entry. */
    shouldAutoLaunchTour: !tourSeen,
    /** True when welcome chips should show (first session, no messages). */
    shouldShowWelcomeChips: !welcomeSeen,
    launchTour,
    dismissTour,
    stopTour,
    markWelcomeSeen,
    resetOnboarding,
  };
}
