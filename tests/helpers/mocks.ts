import { vi } from 'vitest';

export function mockRandom() {
  vi.mock('../../utils/random', () => ({ cryptoRoll: vi.fn() }));
}

export function mockDebug() {
  vi.mock('../../utils/debug', () => ({ isDebugMode: false }));
}
