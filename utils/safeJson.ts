export async function safeParseJson<T>(response: Response): Promise<T | null> {
  try { return await response.json(); } catch { return null; }
}
