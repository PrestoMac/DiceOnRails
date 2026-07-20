import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnv } from '../../utils/envHelper';

describe('getEnv', () => {
  const NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV;
  });

  it('returns undefined for unknown keys via process.env', () => {
    expect(getEnv('THIS_KEY_DOES_NOT_EXIST_12345')).toBeUndefined();
  });

  it('reads from process.env when available', () => {
    process.env.TEST_ENV_KEY = 'proc-value';
    expect(getEnv('TEST_ENV_KEY')).toBe('proc-value');
    delete process.env.TEST_ENV_KEY;
  });

  it('returns undefined when key is not in process.env', () => {
    expect(getEnv('__MISSING_TEST_KEY__')).toBeUndefined();
  });

  it('returns existing vite env vars (MODE etc.)', () => {
    const mode = getEnv('MODE');
    expect(mode).toBe('test');
  });
});
