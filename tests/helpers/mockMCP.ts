import { vi } from 'vitest';

export function createMockMCPServer() {
  return {
    getFullState: vi.fn(),
    getTarget: vi.fn(),
    getCharacterProgression: vi.fn(),
    getResource: vi.fn(),
    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
    saveRewindPoint: vi.fn(),
    loadRewindPoint: vi.fn(),
    clearRewindPoint: vi.fn(),
    saveEmergencySnapshot: vi.fn(),
    loadEmergencySnapshot: vi.fn(),
    clearEmergencySnapshot: vi.fn(),
    restoreSnapshot: vi.fn(),
    joinParty: vi.fn(),
    roll_dice: vi.fn(),
    loadState: vi.fn(),
    reset: vi.fn(),
    updateInventoryDirectly: vi.fn(),
    updateCurrencyDirectly: vi.fn(),
    setAtmosphere: vi.fn(),
    getCachedLocationImage: vi.fn(),
    cacheLocationImage: vi.fn(),
  };
}
