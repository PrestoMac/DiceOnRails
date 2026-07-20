

/**
 * Reads an environment variable, checking import.meta.env first, then process.env.
 * Never throws; returns undefined for missing or empty values.
 * @param key - The environment variable name.
 * @returns The variable value, or undefined if not set.
 */
export const getEnv = (key: string): string | undefined => {
  try {
    if (import.meta?.env?.[key]) return import.meta.env[key];
  } catch { /* import.meta.env may not exist in all environments */ }
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) return process.env[key];
  } catch { /* process.env may not exist in all environments */ }
  return undefined;
};


/**
 * Returns the request body fragment to disable LLM thinking traces,
 * or undefined if thinking is enabled.
 * @returns An object to merge into the request body, or undefined.
 */
export function getThinkingDisabledBody(): Record<string, unknown> | undefined {
  if (getEnv('VITE_LLM_DISABLE_THINKING') === 'true') {
    return { thinking: { type: 'disabled' } };
  }
  return undefined;
}
