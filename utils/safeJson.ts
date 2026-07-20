/**
 * Safely parses a Response body as JSON, returning null on failure.
 * @param response - The fetch Response object.
 * @returns The parsed JSON value, or null if parsing failed.
 */
export async function safeParseJson<T>(response: Response): Promise<T | null> {
  try { return await response.json(); } catch { return null; }
}
