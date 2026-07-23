import { describe, it, expect } from 'vitest';
import { getTimePeriod, formatGameTime, AMBIENT_LINES } from '../../utils/timeUtils';

describe('timeUtils', () => {
  describe('getTimePeriod', () => {
    it('returns night for minutes 0-359', () => {
      expect(getTimePeriod(0)).toBe('night');
      expect(getTimePeriod(180)).toBe('night');
      expect(getTimePeriod(359)).toBe('night');
    });

    it('returns dawn for minutes 360-419', () => {
      expect(getTimePeriod(360)).toBe('dawn');
      expect(getTimePeriod(390)).toBe('dawn');
      expect(getTimePeriod(419)).toBe('dawn');
    });

    it('returns morning for minutes 420-719', () => {
      expect(getTimePeriod(420)).toBe('morning');
      expect(getTimePeriod(600)).toBe('morning');
      expect(getTimePeriod(719)).toBe('morning');
    });

    it('returns afternoon for minutes 720-1079', () => {
      expect(getTimePeriod(720)).toBe('afternoon');
      expect(getTimePeriod(900)).toBe('afternoon');
      expect(getTimePeriod(1079)).toBe('afternoon');
    });

    it('returns dusk for minutes 1080-1199', () => {
      expect(getTimePeriod(1080)).toBe('dusk');
      expect(getTimePeriod(1140)).toBe('dusk');
      expect(getTimePeriod(1199)).toBe('dusk');
    });

    it('returns night for minutes 1200-1439', () => {
      expect(getTimePeriod(1200)).toBe('night');
      expect(getTimePeriod(1439)).toBe('night');
    });

    it('wraps correctly at 1440 (next day midnight)', () => {
      expect(getTimePeriod(1440)).toBe('night');
      expect(getTimePeriod(1441)).toBe('night');
    });

    it('handles multi-day values via modulo', () => {
      expect(getTimePeriod(1440 * 2 + 360)).toBe('dawn');
      expect(getTimePeriod(1440 * 5 + 720)).toBe('afternoon');
    });

    it('handles negative values correctly', () => {
      expect(getTimePeriod(-1)).toBe('night');

      expect(getTimePeriod(-360)).toBe('dusk');
    });
  });

  describe('formatGameTime', () => {
    it('returns day 1 at midnight for gameTime 0', () => {
      const result = formatGameTime(0);
      expect(result.day).toBe(1);
      expect(result.time).toBe('12:00 AM');
      expect(result.period).toBe('night');
    });

    it('formats morning time correctly', () => {
      const result = formatGameTime(480);
      expect(result.day).toBe(1);
      expect(result.time).toBe('8:00 AM');
      expect(result.period).toBe('morning');
    });

    it('formats afternoon time correctly', () => {
      const result = formatGameTime(810);
      expect(result.day).toBe(1);
      expect(result.time).toBe('1:30 PM');
      expect(result.period).toBe('afternoon');
    });

    it('formats evening time correctly', () => {
      const result = formatGameTime(1140);
      expect(result.day).toBe(1);
      expect(result.time).toBe('7:00 PM');
      expect(result.period).toBe('dusk');
    });

    it('advances to day 2 after 1440 minutes', () => {
      const result = formatGameTime(1440);
      expect(result.day).toBe(2);
      expect(result.time).toBe('12:00 AM');
      expect(result.period).toBe('night');
    });

    it('handles large gameTime values', () => {
      const result = formatGameTime(1440 * 10 + 600);
      expect(result.day).toBe(11);
      expect(result.time).toBe('10:00 AM');
      expect(result.period).toBe('morning');
    });

    it('handles NaN input gracefully', () => {
      const result = formatGameTime(NaN);
      expect(result.day).toBe(1);
      expect(result.time).toBe('12:00 AM');
      expect(result.period).toBe('night');
    });

    it('handles negative input gracefully', () => {
      const result = formatGameTime(-100);
      expect(result.day).toBe(1);
      expect(result.time).toBe('12:00 AM');
      expect(result.period).toBe('night');
    });

    it('pads single-digit minutes', () => {
      const result = formatGameTime(61);
      expect(result.time).toBe('1:01 AM');
    });

    it('converts hour 0 to 12 AM', () => {
      const result = formatGameTime(0);
      expect(result.time).toBe('12:00 AM');
    });

    it('converts hour 12 to 12 PM', () => {
      const result = formatGameTime(720);
      expect(result.time).toBe('12:00 PM');
    });
  });

  describe('AMBIENT_LINES', () => {
    it('has entries for dawn, dusk, and night', () => {
      expect(AMBIENT_LINES.dawn).toBeDefined();
      expect(AMBIENT_LINES.dusk).toBeDefined();
      expect(AMBIENT_LINES.night).toBeDefined();
    });

    it('does not have entries for morning or afternoon', () => {
      expect(AMBIENT_LINES.morning).toBeUndefined();
      expect(AMBIENT_LINES.afternoon).toBeUndefined();
    });
  });
});
