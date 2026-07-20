import { isDebugMode } from '../utils/debug';

/** A chunk yielded by the SSE stream, representing content deltas, reasoning, tool calls, usage stats, or stream end/error signals. */
export type StreamChunk =
  | { type: 'content'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_calls'; delta: { index: number; id?: string; name?: string; arguments?: string } }
  | { type: 'usage'; prompt: number; completion: number; cached: number; reasoning?: number }
  | { type: 'done' }
  | { type: 'error'; error: Error };

/** Options for the streaming chat completion request, including an abort signal and an optional per-chunk callback. */
export interface StreamOptions {
  signal?: AbortSignal;
  onChunk?: (chunk: StreamChunk) => void;
}

const STREAM_TIMEOUT_MS = 60_000;

/** Creates an async generator that streams a chat completion response from a server-sent events (SSE) endpoint, yielding typed StreamChunks. */
export async function* streamChatCompletion(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  opts: StreamOptions = {},
): AsyncGenerator<StreamChunk> {
  if (isDebugMode) {
    const maskedHeaders = { ...headers, Authorization: headers.Authorization ? `Bearer ${headers.Authorization.slice(0, 20)}...` : undefined };
    console.log('[SSE streamChatCompletion] Starting stream', { url, body: typeof body === 'object' ? { ...(body as any), model: (body as any)?.model } : body, headers: maskedHeaders });
  }
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const resetTimeout = () => {
    clearTimer(timeoutId);
    timeoutId = setTimeout(() => controller.abort(new Error('SSE stream timeout')), STREAM_TIMEOUT_MS);
  };
  resetTimeout();

  let response: Response;
  const startTime = Date.now();
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
    if (isDebugMode) console.log(`[SSE streamChatCompletion] Fetch completed in ${Date.now() - startTime}ms, status=${response.status}`);
  } catch (e) {
    clearTimer(timeoutId);
    if (isDebugMode) console.error('[SSE streamChatCompletion] Fetch failed', e);
    yield { type: 'error', error: toError(e) };
    return;
  }

  if (!response.ok || !response.body) {
    clearTimer(timeoutId);
    let detail = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      if (txt) detail += ` — ${txt.slice(0, 300)}`;
    } catch { }
    if (isDebugMode) console.error('[SSE streamChatCompletion] Response not OK', { status: response.status, detail });
    yield { type: 'error', error: new Error(detail) };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const emit = (chunk: StreamChunk) => {
    try { opts.onChunk?.(chunk); } catch (e) { console.error('[Stream] onChunk error:', e); }
  };

  let readCount = 0;
  let contentChars = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (isDebugMode) console.log(`[SSE streamChatCompletion] Reader done after ${readCount} reads, ${contentChars} content chars received`);
        break;
      }
      readCount++;
      resetTimeout();
      buffer += decoder.decode(value, { stream: true });
      if (isDebugMode && readCount === 1) console.log(`[SSE streamChatCompletion] First chunk received at ${Date.now() - startTime}ms, buffer size=${buffer.length}`);

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSSEEvent(rawEvent);
        if (!parsed) {
          if (isDebugMode && rawEvent.trim() && !rawEvent.startsWith(':')) console.log('[SSE streamChatCompletion] Skipping non-data event', rawEvent.slice(0, 100));
          continue;
        }
        if (parsed === '[DONE]') {
          if (isDebugMode) console.log(`[SSE streamChatCompletion] [DONE] received at ${Date.now() - startTime}ms`);
          emit({ type: 'done' });
          yield { type: 'done' };
          clearTimer(timeoutId);
          return;
        }
        try {
          const json = JSON.parse(parsed);
          const choice = json.choices?.[0];
          if (!choice) {
            if (json.usage) {
              if (isDebugMode) console.log('[SSE streamChatCompletion] Usage chunk', json.usage);
              yield emitUsage(json.usage, emit, false);
            }
            continue;
          }
          const delta = choice.delta ?? {};
          if (isDebugMode && (isNonEmptyString(delta.content) || isNonEmptyString(delta.reasoning_content)) && !choice.index) {
            const t = isNonEmptyString(delta.content) ? 'content' : 'reasoning';
            contentChars += (delta.content || delta.reasoning_content).length;
            if (contentChars <= 200 || readCount % 50 === 0) console.log(`[SSE streamChatCompletion] Delta ${t} at ${Date.now() - startTime}ms, total=${contentChars}`, { chunk: (delta.content || delta.reasoning_content).slice(0, 80) });
          }
          if (isNonEmptyString(delta.content)) {
            const c = { type: 'content' as const, delta: delta.content };
            emit(c);
            yield c;
          }
          if (isNonEmptyString(delta.reasoning_content)) {
            const c = { type: 'reasoning' as const, delta: delta.reasoning_content };
            emit(c);
            yield c;
          }
          if (Array.isArray(delta.tool_calls)) {
            if (isDebugMode) console.log(`[SSE streamChatCompletion] Tool calls at ${Date.now() - startTime}ms`, delta.tool_calls.map((tc: any) => ({ index: tc.index, name: tc.function?.name })));
            for (const tc of delta.tool_calls) {
              const c = {
                type: 'tool_calls' as const,
                delta: {
                  index: tc.index ?? 0,
                  id: tc.id,
                  name: tc.function?.name,
                  arguments: tc.function?.arguments,
                },
              };
              emit(c);
              yield c;
            }
          }
          if (json.usage) {
            if (isDebugMode) console.log('[SSE streamChatCompletion] Final usage', json.usage);
            yield emitUsage(json.usage, emit, true);
          }
        } catch (e) {
          if (isDebugMode) console.error('[SSE streamChatCompletion] Parse error', e, { raw: rawEvent.slice(0, 200) });
          emit({ type: 'error', error: toError(e) });
        }
      }
    }
  } catch (e) {
    clearTimer(timeoutId);
    if (isDebugMode) console.error('[SSE streamChatCompletion] Read error', e);
    yield { type: 'error', error: toError(e) };
    return;
  } finally {
    clearTimer(timeoutId);
    try { reader.releaseLock(); } catch { }
  }

  if (isDebugMode) console.log(`[SSE streamChatCompletion] Stream ended normally after ${readCount} reads, ${contentChars} chars in ${Date.now() - startTime}ms`);
  emit({ type: 'done' });
  yield { type: 'done' };
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function clearTimer(id: ReturnType<typeof setTimeout> | null): void {
  if (id) clearTimeout(id);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function emitUsage(u: any, emit: (chunk: StreamChunk) => void, includeReasoning: boolean): StreamChunk {
  const c: StreamChunk = {
    type: 'usage',
    prompt: u.prompt_tokens ?? 0,
    completion: u.completion_tokens ?? 0,
    cached: u.prompt_tokens_details?.cached_tokens ?? 0,
    ...(includeReasoning && { reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0 }),
  };
  emit(c);
  return c;
}

function parseSSEEvent(raw: string): string | null {
  const lines = raw.split('\n');
  let data = '';
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      const part = line.slice(5).trimStart();
      data += (data ? '\n' : '') + part;
    }
  }
  return data || null;
}
