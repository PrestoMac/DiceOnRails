/**
 * Strips model-format artifacts that leak into narration/content when a model suffers
 * a tool-calling format failure (e.g. DeepSeek emitting raw `<tool_call>` text instead
 * of using the structured `tool_calls` field). Prevents markup from reaching the
 * narration bubble or being persisted as prose.
 *
 * Removes:
 *  - `<tool_call>…</tool_call>` blocks and stray `<tool_call>` tags
 *  - `<function=…>…</function>` and stray `<function>` / `</function>` tags
 *  - ChatML special tokens: `<|im_start|>`, `<|im_end|>` (and fullwidth unicode variants)
 *  - Residual `[System:identifier]` prefixes
 *
 * Collapses leftover blank lines and trims. Returns '' when only artifacts were present,
 * so callers can fall back to a narration-generation path.
 */
const NARRATION_ARTIFACT_PATTERNS: ReadonlyArray<RegExp> = [
  /<tool_call>[\s\S]*?<\/tool_call>/gi,
  /<\/?tool_call>/gi,
  /<function\b[\s\S]*?<\/function>/gi,
  /<\/?function[^>]*>/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<[｜|][^>]*>/gi,
  /\[System:[a-zA-Z0-9_-]+\]\s*/gi,
];

export function sanitizeNarration(text: string | undefined | null): string {
  if (!text) return '';
  let out = text;
  for (const pattern of NARRATION_ARTIFACT_PATTERNS) {
    out = out.replace(pattern, '');
  }
  // Collapse runs of whitespace/newlines left behind by removed blocks.
  out = out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}
