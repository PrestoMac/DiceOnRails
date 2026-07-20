

export const getEnv = (key: string): string | undefined => {
  try {
    if (import.meta?.env?.[key]) return import.meta.env[key];
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) return process.env[key];
  } catch {}
  return undefined;
};


export function getThinkingDisabledBody(): Record<string, unknown> | undefined {
  if (getEnv('VITE_LLM_DISABLE_THINKING') === 'true') {
    return { thinking: { type: 'disabled' } };
  }
  return undefined;
}
