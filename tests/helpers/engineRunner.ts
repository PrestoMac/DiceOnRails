import { describe, it, expect } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import type { MCPResponse } from '../../types';
import { makeCharacter } from './characters';

export { describe, it, expect };

export interface TestRunner {
  server: MockMCPServer;
  assert: (condition: boolean, message?: string) => void;
  assertToolResult: (result: MCPResponse, expected: { success?: boolean }) => void;
  assertState: (checkFn: (server: MockMCPServer) => boolean, message?: string) => void;
}

export function createTestRunner(suiteName: string): TestRunner {
  const server = new MockMCPServer();

  beforeEach(() => {
    server.reset();
  });

  return {
    server,

    assert(condition: boolean, message?: string) {
      expect(condition).toBe(true);
    },

    assertToolResult(result: MCPResponse, expected: { success?: boolean }) {
      if (expected.success !== undefined) {
        expect(result.success).toBe(expected.success);
      }
    },

    assertState(checkFn: (server: MockMCPServer) => boolean, message?: string) {
      expect(checkFn(server)).toBe(true);
    },
  };
}

export function setupCharacter(server: MockMCPServer, char: ReturnType<typeof makeCharacter>, overrides: Partial<ReturnType<typeof makeCharacter>> = {}): void {
  const finalChar = { ...char, ...overrides };
  server.joinParty(finalChar);
}

export function setupCombat(server: MockMCPServer, enemyName = 'Goblin'): void {
  server.add_enemy(enemyName);
  server.start_combat();
}
