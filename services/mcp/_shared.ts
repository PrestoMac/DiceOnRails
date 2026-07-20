import { MCPResponse } from '../../types';

export const fail = (message: string): MCPResponse => ({ success: false, data: {}, message });
export const ok = (data: any, message: string): MCPResponse => ({ success: true, data, message });

export function generateId(length = 9): string {
  return Math.random().toString(36).substr(2, length);
}

export function fuzzyMatchEntity(entity: { id: string; name: string }, query: string): boolean {
  const clean = (query || '').toLowerCase().trim();
  const cleanName = entity.name.toLowerCase();
  return entity.id === query || cleanName === clean || clean.includes(cleanName) || cleanName.includes(clean);
}
