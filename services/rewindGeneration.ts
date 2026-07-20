let _rewindGeneration = 0;

/** Returns the current rewind generation counter, used to discard stale sync updates after rewinds. */
export function getRewindGeneration(): number {
  return _rewindGeneration;
}

/** Increments the rewind generation counter and returns the new value. */
export function bumpRewindGeneration(): number {
  _rewindGeneration += 1;
  return _rewindGeneration;
}

/** Resets the rewind generation counter back to zero. */
export function resetRewindGeneration(): void {
  _rewindGeneration = 0;
}
