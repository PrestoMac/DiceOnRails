
import { AppSettings } from "../types";
import { isDebugMode } from '../utils/debug';

export const getVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    let v = window.speechSynthesis.getVoices();
    if (v.length !== 0) {
      resolve(v);
    } else {
      const handler = () => {
        v = window.speechSynthesis.getVoices();
        if (v.length > 0) {
          window.speechSynthesis.removeEventListener('voiceschanged', handler);
          resolve(v);
        }
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
      setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
    }
  });
};

const chunkText = (text: string): string[] => {
  if (!text.trim()) return [];
  const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
  return chunks.map(c => c.trim()).filter(c => c.length > 0);
};

export async function speakText(text: string, settings: AppSettings): Promise<boolean> {
  if (!text.trim()) return true;

  window.speechSynthesis.cancel();
  await new Promise(r => setTimeout(r, 100));

  const availableVoices = await getVoices();
  const chunks = chunkText(text);

  if (chunks.length === 0) return true;

  return new Promise((resolve) => {
    let currentIdx = 0;

    const speakNextChunk = () => {
      if (currentIdx >= chunks.length) {
        resolve(true);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[currentIdx]);

      const preferredVoice = availableVoices.find(v => v.name === settings.voiceName) ||
        availableVoices.find(v =>
          v.name.includes('Google UK English Male') ||
          v.name.includes('Microsoft David') ||
          v.name.includes('Daniel')
        ) || availableVoices[0];

      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.pitch = settings.pitch;
      utterance.rate = settings.rate;
      utterance.volume = settings.volume;

      utterance.onend = () => {
        setLastUtterance(null);
        currentIdx++;
        speakNextChunk();
      };

      utterance.onerror = (event: any) => {
        setLastUtterance(null);
        const errorType = event.error || 'unknown';

        if (errorType === 'interrupted' || errorType === 'canceled') {
          resolve(false);
          return;
        }

        if (isDebugMode) console.warn(`TTS Engine status: ${errorType}`);
        currentIdx++;
        if (currentIdx < chunks.length) {
          speakNextChunk();
        } else {
          resolve(false);
        }
      };

      setLastUtterance(utterance);
      window.speechSynthesis.speak(utterance);

      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    };

    speakNextChunk();
  });
}

export function stopSpeaking() {
  window.speechSynthesis.cancel();
}

export function initAudio() {
  getVoices();
}

const setLastUtterance = (utterance: SpeechSynthesisUtterance | null) => {
  (window as any)._lastUtterance = utterance;
};
