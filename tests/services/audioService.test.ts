import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVoices, speakText, stopSpeaking, initAudio } from '../../services/audioService';

interface UtteranceRecord {
  text: string;
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
  volume: number;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

declare global {
  interface Window {
    _lastUtterance: UtteranceRecord | null;
  }
}

function makeVoice(name: string): SpeechSynthesisVoice {
  return { name, lang: 'en-US', voiceURI: name, default: false, localService: true };
}

function mockSpeechSynthesis(voices: SpeechSynthesisVoice[] = []) {
  const listeners = new Map<string, (args: unknown) => void>();
  return {
    cancel: vi.fn(),
    speak: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    paused: false,
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn((event: string, handler: (args: unknown) => void) => listeners.set(event, handler)),
    removeEventListener: vi.fn((event: string, _handler: (args: unknown) => void) => listeners.delete(event)),
    _listeners: listeners,
  };
}

function fireEnd(): void {
  const u = window._lastUtterance;
  if (u && u.onend) {
    u.onend();
  }
}

function fireError(error: string): void {
  const u = window._lastUtterance;
  if (u && u.onerror) {
    u.onerror({ error });
  }
}

async function flush(): Promise<void> {
  vi.advanceTimersByTime(100);
  await Promise.resolve();
  await Promise.resolve();
}

const baseSettings = {
  voiceName: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  autoSpeak: false,
  enableAtmosphere: false,
  debugMode: false,
};

describe('getVoices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns voices immediately when available', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const voices = await getVoices();

    expect(voices).toHaveLength(1);
    expect(voices[0].name).toBe('Voice1');
  });

  it('returns voices after voiceschanged event', async () => {
    const mock = mockSpeechSynthesis([]);
    window.speechSynthesis = mock;

    const promise = getVoices();

    mock.getVoices.mockReturnValue([makeVoice('Voice1')]);
    const handler = mock._listeners.get('voiceschanged');
    expect(handler).toBeDefined();
    if (handler) {
      handler();
    }

    const voices = await promise;
    expect(voices).toHaveLength(1);
    expect(voices[0].name).toBe('Voice1');
  });

  it('falls back after 1s timeout when no voices appear', async () => {
    const mock = mockSpeechSynthesis([]);
    window.speechSynthesis = mock;

    const promise = getVoices();

    vi.advanceTimersByTime(500);
    mock.getVoices.mockReturnValue([makeVoice('Voice1')]);
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    const voices = await promise;
    expect(voices).toHaveLength(1);
    expect(voices[0].name).toBe('Voice1');
  });

  it('returns empty array when no voices exist', async () => {
    const mock = mockSpeechSynthesis([]);
    window.speechSynthesis = mock;

    const promise = getVoices();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    const voices = await promise;
    expect(voices).toEqual([]);
  });
});

describe('speakText — Basic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window._lastUtterance = null;
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (text: string) {
      return {
        text,
        voice: null,
        pitch: 1,
        rate: 1,
        volume: 1,
        onend: null,
        onerror: null,
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('speaks single-chunk string once and returns true', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('Hello world.', baseSettings);
    await flush();

    expect(mock.speak).toHaveBeenCalledTimes(1);

    fireEnd();
    const result = await promise;
    expect(result).toBe(true);
  });

  it('speaks multiple chunks sequentially and returns true', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('Hello. How are you? I am fine.', baseSettings);
    await flush();

    expect(mock.speak).toHaveBeenCalledTimes(1);
    fireEnd();

    expect(mock.speak).toHaveBeenCalledTimes(2);
    fireEnd();

    expect(mock.speak).toHaveBeenCalledTimes(3);
    fireEnd();

    const result = await promise;
    expect(result).toBe(true);
  });

  it('returns true immediately for empty or whitespace text', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const result = await speakText('   ', baseSettings);

    expect(result).toBe(true);
    expect(mock.speak).not.toHaveBeenCalled();
    expect(mock.cancel).not.toHaveBeenCalled();
  });

  it('handles punctuation-only text as a single chunk', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('?!', baseSettings);
    await flush();

    expect(mock.speak).toHaveBeenCalledTimes(1);

    fireEnd();
    const result = await promise;
    expect(result).toBe(true);
  });
});

describe('speakText — Voice selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window._lastUtterance = null;
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (text: string) {
      return {
        text,
        voice: null,
        pitch: 1,
        rate: 1,
        volume: 1,
        onend: null,
        onerror: null,
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('selects voice by exact name match', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Alex'), makeVoice('Samantha')]);
    window.speechSynthesis = mock;

    const settings = { ...baseSettings, voiceName: 'Samantha' };
    const promise = speakText('Hello', settings);
    await flush();

    const u = window._lastUtterance;
    expect(u).toBeTruthy();
    if (u) {
      expect(u.voice?.name).toBe('Samantha');
    }

    fireEnd();
    await promise;
  });

  it('falls back to Google UK English Male, Microsoft David, or Daniel', async () => {
    const mock = mockSpeechSynthesis([
      makeVoice('Some Voice'),
      makeVoice('Microsoft David'),
    ]);
    window.speechSynthesis = mock;

    const promise = speakText('Hello', baseSettings);
    await flush();

    const u = window._lastUtterance;
    expect(u).toBeTruthy();
    if (u) {
      expect(u.voice?.name).toBe('Microsoft David');
    }

    fireEnd();
    await promise;
  });

  it('uses first available voice when no fallbacks match', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Alex'), makeVoice('Samantha')]);
    window.speechSynthesis = mock;

    const promise = speakText('Hello', baseSettings);
    await flush();

    const u = window._lastUtterance;
    expect(u).toBeTruthy();
    if (u) {
      expect(u.voice?.name).toBe('Alex');
    }

    fireEnd();
    await promise;
  });

  it('leaves utterance voice null when no voices available', async () => {
    const mock = mockSpeechSynthesis([]);
    window.speechSynthesis = mock;

    const promise = speakText('Hello', baseSettings);
    await flush();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    const u = window._lastUtterance;
    expect(u).toBeTruthy();
    if (u) {
      expect(u.voice).toBeNull();
    }

    fireEnd();
    await promise;
  });
});

describe('speakText — Settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window._lastUtterance = null;
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (text: string) {
      return {
        text,
        voice: null,
        pitch: 1,
        rate: 1,
        volume: 1,
        onend: null,
        onerror: null,
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('applies pitch, rate, and volume to each utterance', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const settings = { ...baseSettings, pitch: 0.5, rate: 1.5, volume: 0.8 };
    const promise = speakText('Hello world.', settings);
    await flush();

    const u = window._lastUtterance;
    expect(u).toBeTruthy();
    if (u) {
      expect(u.pitch).toBe(0.5);
      expect(u.rate).toBe(1.5);
      expect(u.volume).toBe(0.8);
    }

    fireEnd();
    await promise;
  });
});

describe('speakText — Events', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window._lastUtterance = null;
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (text: string) {
      return {
        text,
        voice: null,
        pitch: 1,
        rate: 1,
        volume: 1,
        onend: null,
        onerror: null,
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('onend triggers next chunk and final chunk resolves true', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('First. Second.', baseSettings);
    await flush();

    expect(mock.speak).toHaveBeenCalledTimes(1);
    fireEnd();

    expect(mock.speak).toHaveBeenCalledTimes(2);
    fireEnd();

    const result = await promise;
    expect(result).toBe(true);
  });

  it('onerror with interrupted resolves false immediately', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('First. Second.', baseSettings);
    await flush();

    fireError('interrupted');

    const result = await promise;
    expect(result).toBe(false);
    expect(mock.speak).toHaveBeenCalledTimes(1);
  });

  it('onerror with canceled resolves false', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('First. Second.', baseSettings);
    await flush();

    fireError('canceled');

    const result = await promise;
    expect(result).toBe(false);
    expect(mock.speak).toHaveBeenCalledTimes(1);
  });

  it('onerror with unknown error skips chunk and resolves false on last', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('First. Second. Third.', baseSettings);
    await flush();

    fireError('synthesis-failed');
    expect(mock.speak).toHaveBeenCalledTimes(2);

    fireEnd();
    expect(mock.speak).toHaveBeenCalledTimes(3);

    fireError('audio-busy');

    const result = await promise;
    expect(result).toBe(false);
  });

  it('continues past error on first chunk and resolves true when remaining chunks succeed', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('First. Second. Third.', baseSettings);
    await flush();

    fireError('synthesis-failed');
    expect(mock.speak).toHaveBeenCalledTimes(2);

    fireEnd();
    expect(mock.speak).toHaveBeenCalledTimes(3);

    fireEnd();

    const result = await promise;
    expect(result).toBe(true);
  });
});

describe('speakText — Resume', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window._lastUtterance = null;
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (text: string) {
      return {
        text,
        voice: null,
        pitch: 1,
        rate: 1,
        volume: 1,
        onend: null,
        onerror: null,
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resumes speech when speechSynthesis is paused', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    mock.paused = true;
    window.speechSynthesis = mock;

    const promise = speakText('Hello world.', baseSettings);
    await flush();

    expect(mock.resume).toHaveBeenCalledTimes(1);

    fireEnd();
    await promise;
  });

  it('does not resume when speechSynthesis is not paused', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const promise = speakText('Hello world.', baseSettings);
    await flush();

    expect(mock.resume).not.toHaveBeenCalled();

    fireEnd();
    await promise;
  });
});

describe('stopSpeaking', () => {
  it('calls speechSynthesis.cancel', () => {
    const mock = mockSpeechSynthesis();
    window.speechSynthesis = mock;

    stopSpeaking();

    expect(mock.cancel).toHaveBeenCalledTimes(1);
  });

  it('handles multiple calls without error', () => {
    const mock = mockSpeechSynthesis();
    window.speechSynthesis = mock;

    stopSpeaking();
    stopSpeaking();
    stopSpeaking();

    expect(mock.cancel).toHaveBeenCalledTimes(3);
  });
});

describe('initAudio', () => {
  it('calls getVoices', () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    initAudio();

    expect(mock.getVoices).toHaveBeenCalledTimes(1);
  });
});

describe('Edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window._lastUtterance = null;
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function (text: string) {
      return {
        text,
        voice: null,
        pitch: 1,
        rate: 1,
        volume: 1,
        onend: null,
        onerror: null,
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('handles very long text without sentence punctuation as single chunk', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const longText = 'Lorem ipsum dolor sit amet '.repeat(50);
    const promise = speakText(longText, baseSettings);
    await flush();

    expect(mock.speak).toHaveBeenCalledTimes(1);

    fireEnd();
    const result = await promise;
    expect(result).toBe(true);
  });

  it('handles special characters like emoji, quotes, and accented text', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    const text = 'Hello "world" — café ñoño 😊. How are you?';
    const promise = speakText(text, baseSettings);
    await flush();

    expect(mock.speak).toHaveBeenCalledTimes(1);

    fireEnd();
    expect(mock.speak).toHaveBeenCalledTimes(2);
    fireEnd();

    const result = await promise;
    expect(result).toBe(true);
  });

  it('handles rapid speak, stop, speak sequence', async () => {
    const mock = mockSpeechSynthesis([makeVoice('Voice1')]);
    window.speechSynthesis = mock;

    speakText('First call.', baseSettings);
    stopSpeaking();
    const promise = speakText('Second call.', baseSettings);

    await flush();

    fireEnd();

    const result = await promise;
    expect(result).toBe(true);
  });
});
