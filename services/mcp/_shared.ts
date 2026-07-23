import { MCPResponse } from '../../types';

/** Canonical machine-readable failure codes that may appear on `MCPResponse.errorCode`. */
export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  INVALID_STATE: 'INVALID_STATE',
  INSUFFICIENT_RESOURCES: 'INSUFFICIENT_RESOURCES',
  CONFLICT: 'CONFLICT',
} as const;

/** Returns a failure response, optionally tagged with a stable error code. */
export const fail = (message: string, errorCode?: string): MCPResponse => ({ success: false, data: {}, message, errorCode });
/** Returns a success response. */
export const ok = (data: unknown, message: string): MCPResponse => ({ success: true, data, message });

/** Generates a random alphanumeric ID of the specified length. */
export function generateId(length = 9): string {
  return Math.random().toString(36).substr(2, length);
}

/** Checks if a query string loosely matches an entity by ID or name.
 *  Matches on exact id, exact name, or a whole-word partial name match
 *  (so "goblin" matches "Goblin Shaman" but "orc" does not match "orchard"). */
export function fuzzyMatchEntity(entity: { id: string; name: string }, query: string): boolean {
  const clean = (query || '').toLowerCase().trim();
  if (!clean) return false;
  const cleanName = entity.name.toLowerCase();
  if (entity.id.toLowerCase() === clean || cleanName === clean) return true;
  try {
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(cleanName);
  } catch {
    return false;
  }
}
