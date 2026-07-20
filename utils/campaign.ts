/** The sentinel campaign ID marking local-only (anonymous) play with no Supabase sync. */
export const ANONYMOUS_CAMPAIGN_ID = 'anonymous';

/**
 * Returns true when the given campaign ID represents a real (Supabase-syncable) campaign.
 * False for null/undefined and for the local-only 'anonymous' sentinel.
 */
export const isSyncableCampaign = (id?: string | null): id is string =>
  id != null && id !== ANONYMOUS_CAMPAIGN_ID;
