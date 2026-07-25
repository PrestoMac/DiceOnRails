import { describe, it, expect, beforeEach } from 'vitest';

const DEFAULT_SETTINGS = {
  voiceName: 'Google UK English Male',
  rate: 1.3,
  pitch: 0.8,
  volume: 1.0,
  autoSpeak: false,
  enableAtmosphere: true,
  debugMode: false,
  enableSuggestions: true,
};

describe('Phase 1B — settings boot-crash guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bug: JSON.parse on corrupted localStorage throws SyntaxError', () => {
    localStorage.setItem('diceonrails_settings', '{bad json');
    const val = localStorage.getItem('diceonrails_settings') as string;
    expect(() => JSON.parse(val)).toThrow(SyntaxError);
  });

  it('fix: try/catch around JSON.parse returns defaults on corrupted data', () => {
    localStorage.setItem('diceonrails_settings', '{bad json');
    const saved = localStorage.getItem('diceonrails_settings');
    let parsed: Record<string, unknown> = {};
    if (saved) {
      try { parsed = JSON.parse(saved) as Record<string, unknown>; } catch { /* corrupted → defaults */ }
    }
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    expect(merged.voiceName).toBe('Google UK English Male');
    expect(merged.debugMode).toBe(false);
    expect(merged.rate).toBe(1.3);
  });

  it('valid settings still parse correctly with proposed guard', () => {
    const valid = JSON.stringify({ voiceName: 'Custom Voice', rate: 2.0, debugMode: true });
    localStorage.setItem('diceonrails_settings', valid);
    const saved = localStorage.getItem('diceonrails_settings');
    let parsed: Record<string, unknown> = {};
    if (saved) {
      try { parsed = JSON.parse(saved) as Record<string, unknown>; } catch { parsed = {}; }
    }
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    expect(merged.voiceName).toBe('Custom Voice');
    expect(merged.rate).toBe(2.0);
    expect(merged.debugMode).toBe(true);
  });
});
