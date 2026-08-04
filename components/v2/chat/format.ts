import { MessageRole } from '../../../types';

/** Strips the `[System:identifier]` prefix used by engine log messages. */
export function formatMessageText(text: string, role: MessageRole): string {
  if (role === MessageRole.SYSTEM || role === MessageRole.TOOL) {
    return text.replace(/^\[System:[a-zA-Z0-9_-]+\]\s*/i, '');
  }
  return text;
}
