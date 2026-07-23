import { vi } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { cryptoRoll } from '../../utils/random';

/** Standard `beforeEach` setup for MCP tool tests: clears all mocks, resets the
 *  `cryptoRoll` sequence, and returns a fresh `MockMCPServer`.
 *
 *  Only use in test files that already declare `vi.mock('../../utils/random', ...)`
 *  (or the path-equivalent) so the imported `cryptoRoll` is the mocked function. */
export function createTestServer(): MockMCPServer {
  vi.clearAllMocks();
  vi.mocked(cryptoRoll).mockReset();
  return new MockMCPServer();
}
