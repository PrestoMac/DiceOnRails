/** Tiny classnames joiner used across the Emberlight V2 UI. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
