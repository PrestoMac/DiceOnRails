import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChatCompletion, type StreamChunk } from '../../services/streamingClient';

let debugMode = false;
vi.mock('../../utils/debug', () => ({
  get isDebugMode() { return debugMode; },
}));

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}`;
}

const DONE = 'data: [DONE]';

function contentDelta(text: string) {
  return sse({ choices: [{ index: 0, delta: { content: text } }] });
}

function reasoningDelta(text: string) {
  return sse({ choices: [{ index: 0, delta: { reasoning_content: text } }] });
}

function toolCallDelta(index: number, id: string | undefined, name: string | undefined, args: string | undefined) {
  return sse({
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index,
          ...(id !== undefined ? { id } : {}),
          ...(name !== undefined || args !== undefined ? {
            function: {
              ...(name !== undefined ? { name } : {}),
              ...(args !== undefined ? { arguments: args } : {}),
            },
          } : {}),
        }],
      },
    }],
  });
}

function usageOnlyEvent(prompt: number, completion: number, cached: number) {
  return sse({
    usage: {
      prompt_tokens: prompt,
      completion_tokens: completion,
      prompt_tokens_details: { cached_tokens: cached },
    },
  });
}

function finalUsageEvent(prompt: number, completion: number, cached: number, reasoning?: number) {
  return sse({
    choices: [{ index: 0, delta: {} }],
    usage: {
      prompt_tokens: prompt,
      completion_tokens: completion,
      prompt_tokens_details: { cached_tokens: cached },
      ...(reasoning !== undefined ? { completion_tokens_details: { reasoning_tokens: reasoning } } : {}),
    },
  });
}

function makeMockBody(bytes: Uint8Array) {
  let called = false;
  return {
    getReader: () => ({
      read: () => {
        if (called) return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true });
        called = true;
        return Promise.resolve({ value: bytes, done: false });
      },
      releaseLock: () => {},
      cancel: () => {},
      closed: Promise.resolve(undefined),
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

function makeMockResponse(events: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const text = events.join('\n\n') + '\n\n';
  return {
    ok: status >= 200 && status < 300,
    status,
    body: makeMockBody(encoder.encode(text)),
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function makeMockResponseFromReader(
  reader: { read: () => Promise<{ value: Uint8Array; done: boolean }> },
  status = 200,
  bodyText = '',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        ...reader,
        releaseLock: () => {},
        cancel: () => {},
        closed: Promise.resolve(undefined),
      }),
    } as unknown as ReadableStream<Uint8Array>,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    text: () => Promise.resolve(bodyText),
  } as unknown as Response;
}

function makeResponseWithoutBody(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    headers: new Headers(),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

async function collectChunks(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

describe('streamChatCompletion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    debugMode = false;
  });

  describe('content streaming', () => {
    it('yields a content chunk for a single delta', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('Hello')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'Hello' },
        { type: 'done' },
      ]);
    });

    it('concatenates multiple content deltas in order', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('Hello'), contentDelta(' World')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'Hello' },
        { type: 'content', delta: ' World' },
        { type: 'done' },
      ]);
    });

    it('skips empty delta content', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([sse({ choices: [{ index: 0, delta: { content: '' } }] })]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([{ type: 'done' }]);
    });

    it('passes through special characters including newlines and tabs', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('Hello\nWorld\t!')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'Hello\nWorld\t!' },
        { type: 'done' },
      ]);
    });
  });

  describe('tool calls', () => {
    it('yields a tool_calls chunk with correct structure', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([toolCallDelta(0, 'call_1', 'get_weather', '{"city":"London"}')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('tool_calls');
      if (chunks[0].type === 'tool_calls') {
        expect(chunks[0].delta).toEqual({
          index: 0,
          id: 'call_1',
          name: 'get_weather',
          arguments: '{"city":"London"}',
        });
      }
      expect(chunks[1]).toEqual({ type: 'done' });
    });

    it('handles multiple tool calls in a single delta', async () => {
      const event = sse({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'fn1', arguments: '{}' } },
              { index: 1, id: 'call_2', function: { name: 'fn2', arguments: '{"x":1}' } },
            ],
          },
        }],
      });
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([event]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'tool_calls', delta: { index: 0, id: 'call_1', name: 'fn1', arguments: '{}' } });
      expect(chunks[1]).toEqual({ type: 'tool_calls', delta: { index: 1, id: 'call_2', name: 'fn2', arguments: '{"x":1}' } });
      expect(chunks[2]).toEqual({ type: 'done' });
    });

    it('handles missing optional fields in tool calls', async () => {
      const event = sse({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{ index: 1, function: {} }],
          },
        }],
      });
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([event]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('tool_calls');
      if (chunks[0].type === 'tool_calls') {
        expect(chunks[0].delta.index).toBe(1);
        expect(chunks[0].delta.id).toBeUndefined();
        expect(chunks[0].delta.name).toBeUndefined();
        expect(chunks[0].delta.arguments).toBeUndefined();
      }
    });

    it('interleaves content and tool calls in the same delta', async () => {
      const event = sse({
        choices: [{
          index: 0,
          delta: {
            content: 'Let me check',
            tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search', arguments: '{"q":"test"}' } }],
          },
        }],
      });
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([event]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'content', delta: 'Let me check' });
      expect(chunks[1]).toEqual({ type: 'tool_calls', delta: { index: 0, id: 'call_1', name: 'search', arguments: '{"q":"test"}' } });
      expect(chunks[2]).toEqual({ type: 'done' });
    });
  });

  describe('reasoning', () => {
    it('yields reasoning chunk from reasoning_content', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([reasoningDelta('thinking step by step')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'reasoning', delta: 'thinking step by step' },
        { type: 'done' },
      ]);
    });

    it('yields both reasoning and content from the same delta', async () => {
      const event = sse({
        choices: [{
          index: 0,
          delta: {
            reasoning_content: 'thinking',
            content: 'answer',
          },
        }],
      });
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([event]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'answer' },
        { type: 'reasoning', delta: 'thinking' },
        { type: 'done' },
      ]);
    });

    it('skips empty reasoning_content', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([sse({ choices: [{ index: 0, delta: { reasoning_content: '' } }] })]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([{ type: 'done' }]);
    });
  });

  describe('usage', () => {
    it('yields intermediate usage when no choices present', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([usageOnlyEvent(10, 5, 2)]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'usage', prompt: 10, completion: 5, cached: 2 });
      expect(chunks[1]).toEqual({ type: 'done' });
    });

    it('yields final usage with reasoning when choices are present', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([finalUsageEvent(20, 15, 3, 7)]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'usage', prompt: 20, completion: 15, cached: 3, reasoning: 7 });
      expect(chunks[1]).toEqual({ type: 'done' });
    });

    it('defaults missing usage fields to 0', async () => {
      const event = sse({ usage: {} });
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([event]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks[0]).toEqual({ type: 'usage', prompt: 0, completion: 0, cached: 0 });
    });
  });

  describe('[DONE] signal', () => {
    it('stops the stream on bare [DONE]', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([DONE]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([{ type: 'done' }]);
    });

    it('yields content before [DONE] then stops', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('Hello'), DONE]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'Hello' },
        { type: 'done' },
      ]);
    });

    it('yields usage before [DONE]', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([usageOnlyEvent(5, 3, 1), DONE]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'usage', prompt: 5, completion: 3, cached: 1 });
      expect(chunks[1]).toEqual({ type: 'done' });
    });
  });

  describe('error paths', () => {
    it('yields error on HTTP 401 with status detail', async () => {
      const resp = makeMockResponse([], 401);
      vi.mocked(fetch).mockResolvedValue(resp);

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      if (chunks[0].type === 'error') {
        expect(chunks[0].error.message).toContain('HTTP 401');
      }
    });

    it('includes response body text in the error detail', async () => {
      const bodyText = '{"error":"unauthorized"}';
      const encoder = new TextEncoder();
      const resp = {
        ok: false,
        status: 401,
        body: makeMockBody(encoder.encode(bodyText)),
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        text: () => Promise.resolve(bodyText),
      } as unknown as Response;
      vi.mocked(fetch).mockResolvedValue(resp);

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      if (chunks[0].type === 'error') {
        expect(chunks[0].error.message).toContain('{"error":"unauthorized"}');
      }
    });

    it('yields error when response has no body', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponseWithoutBody(200));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });

    it('yields error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      if (chunks[0].type === 'error') {
        expect(chunks[0].error).toBeInstanceOf(TypeError);
        expect(chunks[0].error.message).toBe('Failed to fetch');
      }
    });

    it('yields error on fetch throwing a non-Error value', async () => {
      vi.mocked(fetch).mockRejectedValue('string error');

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      if (chunks[0].type === 'error') {
        expect(chunks[0].error).toBeInstanceOf(Error);
        expect(chunks[0].error.message).toBe('string error');
      }
    });

    it('does not crash on JSON parse error, continues stream', async () => {
      const onChunk = vi.fn();
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        'data: {invalid json',
        contentDelta('Hello'),
      ]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}, { onChunk }));

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'content', delta: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'done' });
      expect(onChunk).toHaveBeenCalledWith({ type: 'error', error: expect.any(Error) });
    });

    it('handles empty body with 0 status', async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponseWithoutBody(0));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });
  });

  describe('timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('yields error when STREAM_TIMEOUT_MS elapses without data', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockImplementation((_url, opts) => {
        return new Promise<never>((_resolve, reject) => {
          (opts as RequestInit).signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const gen = streamChatCompletion('url', {}, {});
      const promise = collectChunks(gen);

      await vi.advanceTimersByTimeAsync(60001);

      const chunks = await promise;
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });

    it('completes stream when data arrives within the timeout window', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('A'), contentDelta('B')]));

      const promise = collectChunks(streamChatCompletion('url', {}, {}));

      await vi.advanceTimersByTimeAsync(120000);

      const chunks = await promise;
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'content', delta: 'A' });
      expect(chunks[1]).toEqual({ type: 'content', delta: 'B' });
      expect(chunks[2]).toEqual({ type: 'done' });
    });

    it('aborts on external signal via opts.signal', async () => {
      const ac = new AbortController();
      vi.mocked(fetch).mockImplementation((_url, opts) => {
        return new Promise<never>((_resolve, reject) => {
          (opts as RequestInit).signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const gen = streamChatCompletion('url', {}, {}, { signal: ac.signal });
      const promise = collectChunks(gen);

      ac.abort();

      const chunks = await promise;
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });
  });

  describe('debug logging', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.mocked(console.log).mockRestore();
      vi.mocked(console.error).mockRestore();
    });

    it('logs when isDebugMode is true', async () => {
      debugMode = true;
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('test')]));

      await collectChunks(streamChatCompletion('url', { model: 'gpt-4' }, {}));

      expect(console.log).toHaveBeenCalled();
    });

    it('does not log when isDebugMode is false', async () => {
      debugMode = false;
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('test')]));

      await collectChunks(streamChatCompletion('url', {}, {}));

      expect(console.log).not.toHaveBeenCalled();
    });

    it('tracks content characters across deltas in debug mode', async () => {
      debugMode = true;
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        contentDelta('Hello'),
        contentDelta(' World'),
      ]));

      await collectChunks(streamChatCompletion('url', {}, {}));

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles a full multi-type stream', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        contentDelta('Hello'),
        reasoningDelta('thinking'),
        toolCallDelta(0, 'call_1', 'fn', '{}'),
        finalUsageEvent(10, 5, 2, 1),
        DONE,
      ]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(5);
      expect(chunks[0]).toEqual({ type: 'content', delta: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'reasoning', delta: 'thinking' });
      expect(chunks[2]).toEqual({ type: 'tool_calls', delta: { index: 0, id: 'call_1', name: 'fn', arguments: '{}' } });
      expect(chunks[3]).toEqual({ type: 'usage', prompt: 10, completion: 5, cached: 2, reasoning: 1 });
      expect(chunks[4]).toEqual({ type: 'done' });
    });

    it('handles empty stream where reader returns done immediately', async () => {
      const emptyReader = {
        read: () => Promise.resolve({ value: undefined as unknown as Uint8Array, done: true }),
      };
      vi.mocked(fetch).mockResolvedValue(makeMockResponseFromReader(emptyReader));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([{ type: 'done' }]);
    });

    it('processes multiple events in a single buffer read', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('A'), contentDelta('B'), contentDelta('C')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'A' },
        { type: 'content', delta: 'B' },
        { type: 'content', delta: 'C' },
        { type: 'done' },
      ]);
    });

    it('accumulates buffer across reads when events are split', async () => {
      const encoder = new TextEncoder();
      let readIndex = 0;
      const chunks = [
        encoder.encode('data: {"choices":[{"delta":{"content":"Hel'),
        encoder.encode('lo"}}]}\n\ndata: [DONE]'),
      ];
      const splitReader = {
        read: () => {
          if (readIndex >= chunks.length) {
            return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true });
          }
          const value = chunks[readIndex];
          readIndex++;
          return Promise.resolve({ value, done: false });
        },
      };
      vi.mocked(fetch).mockResolvedValue(makeMockResponseFromReader(splitReader));

      const result = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(result).toEqual([
        { type: 'content', delta: 'Hello' },
        { type: 'done' },
      ]);
    });

    it('invokes onChunk callback for each chunk', async () => {
      const onChunk = vi.fn();
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('Hi'), DONE]));

      await collectChunks(streamChatCompletion('url', {}, {}, { onChunk }));

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, { type: 'content', delta: 'Hi' });
      expect(onChunk).toHaveBeenNthCalledWith(2, { type: 'done' });
    });

    it('continues stream when onChunk throws an exception', async () => {
      const onChunk = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('Hi'), DONE]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}, { onChunk }));

      expect(chunks).toEqual([
        { type: 'content', delta: 'Hi' },
        { type: 'done' },
      ]);
    });

    it('works when opts is omitted (undefined)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('ok')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([
        { type: 'content', delta: 'ok' },
        { type: 'done' },
      ]);
    });

    it('handles multiple usage events (intermediate then final)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        usageOnlyEvent(5, 2, 0),
        contentDelta('answer'),
        finalUsageEvent(10, 8, 1, 3),
      ]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({ type: 'usage', prompt: 5, completion: 2, cached: 0 });
      expect(chunks[1]).toEqual({ type: 'content', delta: 'answer' });
      expect(chunks[2]).toEqual({ type: 'usage', prompt: 10, completion: 8, cached: 1, reasoning: 3 });
      expect(chunks[3]).toEqual({ type: 'done' });
    });

    it('skips events with no choices and no usage', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        sse({ choices: [{ index: 0, delta: {} }] }),
        contentDelta('Hello'),
      ]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'content', delta: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'done' });
    });
  });

  describe('SSE event parsing', () => {
    it('parses a single data line', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([contentDelta('parsed')]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks[0]).toEqual({ type: 'content', delta: 'parsed' });
    });

    it('parses multiple data lines into a single JSON payload', async () => {
      const multiLine = 'data: {"choices":[{"index":0,\ndata: "delta":{"content":"multi"}}]}';
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([multiLine]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks[0]).toEqual({ type: 'content', delta: 'multi' });
    });

    it('ignores comment lines starting with colon', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        ': comment line',
        contentDelta('after comment'),
      ]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks[0]).toEqual({ type: 'content', delta: 'after comment' });
    });

    it('returns empty array for empty input', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks).toEqual([{ type: 'done' }]);
    });

    it('skips data without data: prefix', async () => {
      vi.mocked(fetch).mockResolvedValue(makeMockResponse([
        'not a data line',
        contentDelta('real data'),
      ]));

      const chunks = await collectChunks(streamChatCompletion('url', {}, {}));

      expect(chunks[0]).toEqual({ type: 'content', delta: 'real data' });
    });
  });
});
