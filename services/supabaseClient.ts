import { createClient } from '@supabase/supabase-js';
import { isDebugMode } from '../utils/debug';

let supabaseUrl: string | undefined, supabaseKey: string | undefined;
try {
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
} catch (e) {
  supabaseUrl = typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined;
  supabaseKey = typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : undefined;
}

if (!supabaseUrl || !supabaseKey) {
  if (isDebugMode) console.warn('Supabase URL or Key is missing. Using placeholder values to prevent crash.');
}

let _supabaseInstance: ReturnType<typeof createClient> | undefined;
export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!_supabaseInstance) _supabaseInstance = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder'
  );
  return _supabaseInstance;
}
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    if (typeof prop === 'string' && (prop === 'then' || prop === 'catch' || prop === 'finally')) return undefined;
    const instance = getSupabaseClient();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
