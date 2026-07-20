/**
 * Returns the time-of-day period for a given number of minutes since midnight.
 * @param totalMinutes - The total minutes (mod 1440 determines the period).
 * @returns The period name: "dawn", "morning", "afternoon", "dusk", or "night".
 */
export function getTimePeriod(totalMinutes: number): string {
  const tod = ((totalMinutes % 1440) + 1440) % 1440;
  if (tod < 360) return 'night';
  if (tod < 420) return 'dawn';
  if (tod < 720) return 'morning';
  if (tod < 1080) return 'afternoon';
  if (tod < 1200) return 'dusk';
  return 'night';
}

/**
 * Formats a total minutes value into a human-readable game time (day, time, period).
 * @param totalMinutes - The total elapsed minutes (non-negative).
 * @returns An object with day number, formatted time string, and period name.
 */
export function formatGameTime(totalMinutes: number): { day: number; time: string; period: string } {
  const safeMinutes = (typeof totalMinutes === 'number' && !isNaN(totalMinutes)) ? Math.max(0, totalMinutes) : 0;
  const day = Math.floor(safeMinutes / 1440) + 1;
  const mins = safeMinutes % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return {
    day,
    time: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
    period: getTimePeriod(safeMinutes),
  };
}

/** Ambient narration lines keyed by time period for atmospheric description. */
export const AMBIENT_LINES: Record<string, string> = {
  dawn: '[The first light of dawn crests the horizon, painting the sky amber and rose.]',
  dusk: '[The sun sinks low, casting long shadows as twilight settles in.]',
  night: '[Stars emerge as night claims the sky, the air growing cool and still.]',
};
