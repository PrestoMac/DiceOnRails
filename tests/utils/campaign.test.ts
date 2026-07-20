import { describe, it, expect } from 'vitest';
import { isSyncableCampaign, ANONYMOUS_CAMPAIGN_ID } from '../../utils/campaign';

describe('utils/campaign', () => {
  describe('ANONYMOUS_CAMPAIGN_ID', () => {
    it('is the literal "anonymous"', () => {
      expect(ANONYMOUS_CAMPAIGN_ID).toBe('anonymous');
    });
  });

  describe('isSyncableCampaign', () => {
    it('returns true for a real campaign ID', () => {
      expect(isSyncableCampaign('camp-123')).toBe(true);
    });

    it('returns false for the "anonymous" sentinel', () => {
      expect(isSyncableCampaign('anonymous')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSyncableCampaign(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isSyncableCampaign(null)).toBe(false);
    });

    it('returns true for empty string (matches original inline behavior — only null/undefined/anonymous are excluded)', () => {
      expect(isSyncableCampaign('')).toBe(true);
    });

    it('narrows the type to string when truthy (compile-time check)', () => {
      const maybe: string | undefined = 'camp-1';
      if (isSyncableCampaign(maybe)) {
        // Inside this branch TypeScript treats `maybe` as `string`
        const _len: number = maybe.length;
        expect(_len).toBeGreaterThan(0);
      }
    });
  });
});
