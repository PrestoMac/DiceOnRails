let _rewindGeneration = 0;

export function getRewindGeneration(): number {
  return _rewindGeneration;
}

export function bumpRewindGeneration(): number {
  _rewindGeneration += 1;
  return _rewindGeneration;
}

export function resetRewindGeneration(): void {
  _rewindGeneration = 0;
}
