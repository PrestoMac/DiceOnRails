import '@testing-library/jest-dom';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    cancel: () => {},
    speak: () => {},
    getVoices: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    paused: false,
    resume: () => {},
  },
});

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: class {
    createOscillator() {
      return {
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        frequency: { setValueAtTime: () => {} },
        type: '',
      };
    }
    createGain() {
      return {
        connect: () => {},
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      };
    }
    get destination(): AudioDestinationNode { return { maxChannelCount: 0 } as AudioDestinationNode; }
    currentTime: 0;
  },
});

Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
  },
});
