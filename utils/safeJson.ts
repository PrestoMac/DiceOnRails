/**
 * Safely parses a Response body as JSON, returning null on failure.
 * @param response - The fetch Response object.
 * @returns The parsed JSON value, or null if parsing failed.
 */
export async function safeParseJson<T>(response: Response): Promise<T | null> {
  try { return await response.json(); } catch { return null; }
}

/** Typed view of a validated LLM response choice message. */
export interface LlmChoiceMessage {
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> | null;
  reasoning_content?: string | null;
}

/** Typed view of a validated LLM response body. */
export interface ParsedLlmData {
  choices: Array<{ message: LlmChoiceMessage; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

/**
 * Validates a parsed LLM response body has the expected structure.
 * Throws descriptive errors for malformed bodies (empty object, missing choices, etc).
 * Use this immediately after `response.json()` to catch upstream/proxy failures
 * that return `200 OK` with `{}` or `"<html>..."` bodies.
 */
export function parseLlmResponse(data: unknown): ParsedLlmData {
  if (data === null || data === undefined) {
    throw new Error('LLM response body is null/undefined');
  }
  if (typeof data !== 'object') {
    throw new Error(`LLM response body is not an object: ${typeof data}`);
  }
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.choices) || d.choices.length === 0) {
    throw new Error('LLM response missing valid choices array');
  }
  const choice = d.choices[0];
  if (!choice || typeof choice !== 'object') {
    throw new Error('LLM response first choice is not an object');
  }
  const msg = (choice as Record<string, unknown>).message;
  if (!msg || typeof msg !== 'object') {
    throw new Error('LLM response choices[0] missing message object');
  }
  return data as ParsedLlmData;
}
