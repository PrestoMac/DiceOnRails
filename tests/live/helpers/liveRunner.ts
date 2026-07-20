import { MockMCPServer } from '../../../services/mcpService';
import { TuningReporter } from '../../helpers/tuningOutput';

export interface LiveTestContext {
  server: MockMCPServer;
  reporter: TuningReporter;
}

export function createLiveContext(testName: string): LiveTestContext {
  const server = new MockMCPServer();
  const reporter = new TuningReporter(testName);
  return { server, reporter };
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

export async function runLiveTest(
  name: string,
  fn: (ctx: LiveTestContext) => Promise<void>
): Promise<void> {
  const ctx = createLiveContext(name);
  ctx.server.reset();
  process.stdout.write(`  ${name}... `);
  try {
    await fn(ctx);
    ctx.reporter.markSuccess(true);
    await ctx.reporter.flush();
    console.log('PASS');
  } catch (e: unknown) {
    ctx.reporter.markSuccess(false);
    await ctx.reporter.flush();
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAIL\n    ${msg}`);
    process.exitCode = 1;
  }
}
