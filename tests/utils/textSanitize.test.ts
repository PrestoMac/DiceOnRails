import { describe, it, expect } from 'vitest';
import { sanitizeNarration } from '../../utils/textSanitize';

describe('sanitizeNarration', () => {
  it('returns empty string for undefined/null/empty input', () => {
    expect(sanitizeNarration(undefined)).toBe('');
    expect(sanitizeNarration(null)).toBe('');
    expect(sanitizeNarration('')).toBe('');
  });

  it('passes through clean narration unchanged', () => {
    const text = 'The guard lowers his halberd and waves you through the gate.';
    expect(sanitizeNarration(text)).toBe(text);
  });

  it('strips <tool_call> blocks entirely', () => {
    const input = '<tool_call>\n{"name": "move_to", "arguments": {}}\n</tool_call>';
    expect(sanitizeNarration(input)).toBe('');
  });

  it('strips <function=...>...</function> blocks', () => {
    const input = '<tool_call> <function=move_to> </function> </tool_call><tool_call> <function=award_experience> </function> </tool_call>';
    expect(sanitizeNarration(input)).toBe('');
  });

  it('preserves surrounding prose when stripping embedded markup', () => {
    const input = 'You enter the tavern. <tool_call> <function=move_to> </function> </tool_call> The fire crackles.';
    expect(sanitizeNarration(input)).toBe('You enter the tavern. The fire crackles.');
  });

  it('strips ChatML special tokens (ascii and fullwidth unicode variants)', () => {
    const input = '<|im_start|>system<|im_end|> Hello <｜tool▁calls｜> world';
    expect(sanitizeNarration(input)).toBe('system Hello world');
  });

  it('strips residual [System:identifier] prefixes', () => {
    expect(sanitizeNarration('[System:narrate_turn] The door creaks open.')).toBe('The door creaks open.');
    expect(sanitizeNarration('[System:check_skill] success')).toBe('success');
  });

  it('collapses whitespace left by removed blocks', () => {
    const input = 'Line one.\n\n\n\n<tool_call>x</tool_call>\n\n\n\nLine two.';
    expect(sanitizeNarration(input)).toBe('Line one.\n\nLine two.');
  });

  it('returns empty string when only artifacts are present (enables fallback)', () => {
    expect(sanitizeNarration('<tool_call><function=x></function></tool_call>')).toBe('');
    expect(sanitizeNarration('<|im_end|>')).toBe('');
  });

  it('handles stray unclosed tags (removes just the tag, keeps surrounding text)', () => {
    // No closing tag → only the stray tag is stripped, prose is preserved.
    expect(sanitizeNarration('Hello <tool_call> world')).toBe('Hello world');
    expect(sanitizeNarration('Text <function=foo> tail')).toBe('Text tail');
  });

  it('removes complete blocks including their interior (malformed call content)', () => {
    // A closed block's interior is part of the malformed tool call, not narration.
    expect(sanitizeNarration('Hello <tool_call> world </tool_call> end')).toBe('Hello end');
  });
});
