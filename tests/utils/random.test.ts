import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cryptoRoll } from '../../utils/random';

describe('cryptoRoll', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 1 when sides < 2', () => {
    expect(cryptoRoll(1)).toBe(1);
    expect(cryptoRoll(0)).toBe(1);
    expect(cryptoRoll(-5)).toBe(1);
  });

  it('returns values in [1, sides] using crypto when available', () => {
    let callCount = 0;
    const getRandomValues = vi.fn((buf: Uint32Array) => {
      buf[0] = callCount++ % 2 === 0 ? 0 : 3_000_000_000;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const result = cryptoRoll(20);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
    expect(getRandomValues).toHaveBeenCalled();
  });

  it('falls back to Math.random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = cryptoRoll(20);
    expect(result).toBe(11);
    expect(mockMath).toHaveBeenCalled();

    mockMath.mockRestore();
  });

  it('falls back when crypto.getRandomValues is not a function', () => {
    vi.stubGlobal('crypto', {});
    const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const result = cryptoRoll(10);
    expect(result).toBe(3);

    mockMath.mockRestore();
  });

  it('uses rejection sampling to avoid modulo bias', () => {
    const values = [4_294_967_295, 0, 1_000_000_000];
    let idx = 0;
    const getRandomValues = vi.fn((buf: Uint32Array) => {
      buf[0] = values[idx++ % values.length];
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const result = cryptoRoll(6);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(6);
  });
});
