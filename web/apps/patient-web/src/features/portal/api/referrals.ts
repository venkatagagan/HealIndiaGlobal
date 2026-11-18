import { websiteUrl } from '@hig/shared/auth';

/** react-query keys of the referral programme / platform credit data */
export const referralKeys = {
  all: ['referrals'] as const,
  overview: ['referrals', 'overview'] as const,
  credits: ['referrals', 'credits'] as const,
  preview: (bookingId: string, purpose: string) => ['referrals', 'preview', bookingId, purpose] as const,
};

/** Terms of Service, section "Referral programme" (website). */
export function referralTermsUrl(): string {
  try {
    return new URL('terms#referral-programme', websiteUrl()).toString();
  } catch {
    return '/terms#referral-programme';
  }
}
