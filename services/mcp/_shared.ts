import { MCPResponse } from '../../types';

/** Returns a failure response. */
export const fail = (message: string): MCPResponse => ({ success: false, data: {}, message });
/** Returns a success response. */
export const ok = (data: unknown, message: string): MCPResponse => ({ success: true, data, message });

/** Generates a random alphanumeric ID of the specified length. */
export function generateId(length = 9): string {
  return Math.random().toString(36).substr(2, length);
}

/** Checks if a query string loosely matches an entity by ID or name. */
export function fuzzyMatchEntity(entity: { id: string; name: string }, query: string): boolean {
  const clean = (query || '').toLowerCase().trim();
  if (!clean) return false;
  const cleanName = entity.name.toLowerCase();
  return entity.id.toLowerCase() === clean || cleanName === clean || clean.includes(cleanName) || cleanName.includes(clean);
}
