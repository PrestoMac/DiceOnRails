import 'dotenv/config';
import { runLiveTest, assert } from './helpers/liveRunner';
import { mcpServer } from '../../services/mcpService';
import { resolveLLMConfig } from '../../services/llm/llmApiClient';
import { runAgentLoop } from '../../services/llm/agentLoop';
import { makeWizard } from '../helpers/characters';
import { Message, MessageRole, LLMProvider } from '../../types';

/**
 * Sets up the singleton mcpServer with a level-5 wizard named Merlin.
 * Must be called before importing runAgentLoop or the tests using it.
 */
function setupSingletonServer() {
  mcpServer.reset();
  const wizard = makeWizard({ id: 'wiz-1', name: 'Merlin' });
  mcpServer.joinParty(wizard);
}

/**
 * Inline copy of the proposed parseLlmResponse helper (Phase 2).
 * This is NOT a source change — it lives only in the test to validate the fix shape.
 */
interface LlmChoice {
  message?: { content?: string; tool_calls?: unknown[]; reasoning_content?: string };
}
interface LlmResponse {
  choices?: LlmChoice[];
  usage?: Record<string, unknown>;
  model?: string;
}
async function parseLlmResponse(response: Response): Promise<LlmResponse> {
  const data = await response.json().catch(() => null);
  if (!data || !Array.isArray(data.choices) || data.choices.length === 0 || !data.choices[0]?.message) {
    throw new Error('Malformed LLM response: missing choices[0].message');
  }
  return data as LlmResponse;
}

runLiveTest('Phase 2 — Step 1: happy-path baseline (real LLM, real engine)', async (ctx) => {
  const cfg = resolveLLMConfig();
  if (!cfg.apiKey) { console.log('  SKIP: no VITE_LLM_API_KEY'); return; }
  setupSingletonServer();

  const history: Message[] = [{
    id: 'msg-1', role: MessageRole.USER, text: 'Cast fire bolt at the training dummy using a 4th-level slot.',
    senderId: 'wiz-1', senderName: 'Merlin', timestamp: Date.now(),
  }];
  const context = 'You are in a training yard with a straw dummy.';

  const result = await runAgentLoop(history, context, undefined, undefined, {
    provider: 'openai' as LLMProvider,
    apiKey: cfg.apiKey,
    apiBase: cfg.apiUrl.replace('/chat/completions', ''),
  }, { maxIters: 3, requestEndNarration: false });
  ctx.reporter.capturePrompt(`Happy path: ${result.iterationCount} iters`);
  ctx.reporter.markSuccess(true);

  console.log(`\n    iterations: ${result.iterationCount}`);
  console.log(`    toolMessages: ${result.toolMessages?.length ?? 0}`);
  console.log(`    promptTokens: ${result.promptTokens}`);
  console.log(`    completionTokens: ${result.completionTokens}`);
});

runLiveTest('Phase 2 — Step 2: crash reproduction (malformed response body)', async (ctx) => {
  const cfg = resolveLLMConfig();
  if (!cfg.apiKey) { console.log('  SKIP: no VITE_LLM_API_KEY'); return; }
  setupSingletonServer();

  // Intercept ALL fetch calls to return a body missing `choices[]`.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (..._args) => {
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  let thrown: Error | null = null;
  try {
    const history: Message[] = [{
      id: 'msg-1', role: MessageRole.USER, text: 'Cast fire bolt at the training dummy.',
      senderId: 'wiz-1', senderName: 'Merlin', timestamp: Date.now(),
    }];
    const context = 'You are in a training yard with a straw dummy.';

    try {
      await runAgentLoop(history, context, undefined, undefined, {
        provider: 'openai' as LLMProvider,
        apiKey: cfg.apiKey,
        apiBase: cfg.apiUrl.replace('/chat/completions', ''),
      }, { maxIters: 5, requestEndNarration: false });
    } catch (e) {
      thrown = e instanceof Error ? e : new Error(String(e));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  // The agent loop MUST crash because data.choices[0].message is impossible
  // on a `{}` body (agentLoop.ts:264-276 has no try/catch).
  assert(thrown !== null, 'Expected runAgentLoop to throw TypeError on malformed body, but it did not');
  const msg = thrown.message;
  console.log(`\n    Caught error: ${thrown.constructor.name}: ${msg.substring(0, 120)}`);
  assert(
    msg.includes('choices') || msg.includes('message') || (msg.includes('Cannot') && msg.includes('undefined')),
    `Unexpected error — expected a crash from missing choices[], got: ${msg.substring(0, 120)}`,
  );
  ctx.reporter.capturePrompt(`Crash repro — ${thrown.constructor.name}: ${msg.substring(0, 80)}`);
  ctx.reporter.markSuccess(true);
});

runLiveTest('Phase 2 — Step 3: parseLlmResponse helper catches the error', async (ctx) => {
  // This test validates the proposed helper without changing source.
  // It simulates what happens at agentLoop.ts:264-276 with the guard applied.
  const badResponse = new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const htmlResponse = new Response('<html>Internal Server Error</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
  const emptyResponse = new Response('', {
    status: 200,
  });
  const validResponse = new Response(JSON.stringify({
    choices: [{ message: { content: 'Hello' } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const errors: string[] = [];

  // Test 1: empty object body → helper throws typed error
  try {
    await parseLlmResponse(badResponse);
    errors.push('Expected parseLlmResponse to throw on {} body');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes('Malformed LLM response'), `Expected "Malformed LLM response" but got: ${msg}`);
    console.log(`    ✓ {} body → throws "${msg.substring(0, 60)}..."`);
  }

  // Test 2: HTML body → helper throws typed error (response.json() fails)
  try {
    await parseLlmResponse(htmlResponse);
    errors.push('Expected parseLlmResponse to throw on HTML body');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes('Malformed LLM response'), `Expected "Malformed LLM response" but got: ${msg}`);
    console.log(`    ✓ HTML body → throws "${msg.substring(0, 60)}..."`);
  }

  // Test 3: empty body → helper throws
  try {
    await parseLlmResponse(emptyResponse);
    errors.push('Expected parseLlmResponse to throw on empty body');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes('Malformed LLM response'), `Expected "Malformed LLM response" but got: ${msg}`);
    console.log(`    ✓ Empty body → throws "${msg.substring(0, 60)}..."`);
  }

  // Test 4: valid response → helper returns data
  const result = await parseLlmResponse(validResponse);
  assert(result.choices?.[0]?.message?.content === 'Hello', 'Expected content to be "Hello"');
  console.log('    ✓ Valid response → returns data correctly');

  assert(errors.length === 0, errors.join('; '));
  ctx.reporter.capturePrompt('parseLlmResponse: all 4 cases passed');
  ctx.reporter.markSuccess(true);
});
