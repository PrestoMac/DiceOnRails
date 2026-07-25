/**
 * Runner for JSON hardening live-LLM tests (Phase 2).
 *
 * Usage:
 *   npx tsx tests/live/run_json_hardening.ts
 *
 * Each test makes real API calls using the environment's VITE_LLM_API_KEY.
 * Tests auto-skip when no API key is configured.
 *
 * Prerequisites:
 *   - .env file with VITE_LLM_API_KEY at project root (loaded via dotenv).
 *   - dotenv installed (listed in devDependencies).
 */
import 'dotenv/config';

async function main() {
  console.log('='.repeat(60));
  console.log('JSON Hardening Live LLM Tests');
  console.log('='.repeat(60));
  console.log();

  await import('./07_malformed_response_live.test');

  console.log();
  console.log('='.repeat(60));
  if (typeof process !== 'undefined' && process.exitCode) {
    console.log('Some tests FAILED.');
  } else {
    console.log('All tests PASSED.');
  }
  console.log('='.repeat(60));
}

main().catch((e) => {
  console.error('Runner error:', e);
  process.exitCode = 1;
});
