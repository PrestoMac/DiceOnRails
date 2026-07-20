import { isDebugMode } from './debug';


/**
 * Generates a cryptographically secure random integer in [1, sides].
 * Falls back to Math.random() if crypto is unavailable.
 * @param sides - The number of sides on the die (must be >= 2).
 * @returns A random integer between 1 and sides inclusive.
 */
export function cryptoRoll(sides: number): number {
  if (sides < 2) return 1;

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    try {
      const maxValid = Math.floor(0x1_0000_0000 / sides) * sides;
      const buf = new Uint32Array(1);
      let val = 0;
      let attempts = 0;
      do {
        globalThis.crypto.getRandomValues(buf);
        val = buf[0];
        if (val == null || Number.isNaN(val)) {
          throw new Error('getRandomValues returned non-numeric');
        }
        if (++attempts > 100) {
          throw new Error('getRandomValues rejected too many times');
        }
      } while (val >= maxValid);
      const result = (val % sides) + 1;
      if (Number.isFinite(result) && result >= 1 && result <= sides) {
        if (isDebugMode) {
          console.log(`[DEBUG RANDOM] cryptoRoll d${sides} rolled: ${result}`);
        }
        return result;
      }
    } catch { /* crypto.getRandomValues may throw if unavailable */ }
  }

  const fallback = Math.floor(Math.random() * sides) + 1;
  const finalFallback = Number.isFinite(fallback) ? fallback : 1;
  if (isDebugMode) {
    console.log(`[DEBUG RANDOM] cryptoRoll d${sides} rolled (fallback): ${finalFallback}`);
  }
  return finalFallback;
}
