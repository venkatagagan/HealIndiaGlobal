import { localizePath } from '@/i18n/config';
import { requestLocale } from '@/i18n/request';

/** Site paths ('' = home, always without a language prefix). Use `href()` to turn a path into a link target. */
export const routes = {
  home: '',
  treatments: '/treatments',
  specialty: (specialty: string) => `/treatments/${encodeURIComponent(specialty)}`,
  procedure: (specialty: string, procedure: string) =>
    `/treatments/${encodeURIComponent(specialty)}/${encodeURIComponent(procedure)}`,
  hospitals: '/hospitals',
  hospital: (slug: string) => `/hospitals/${encodeURIComponent(slug)}`,
  doctors: '/doctors',
  doctor: (slug: string) => `/doctors/${encodeURIComponent(slug)}`,
  destinations: '/destinations',
  city: (slug: string) => `/destinations/${encodeURIComponent(slug)}`,
  guides: '/guides',
  guide: (slug: string) => `/guides/${encodeURIComponent(slug)}`,
  faq: '/faq',
  // Content growth (procedure x city, cost guides by home country, patient stories).
  procedureCity: (specialty: string, procedure: string, city: string) =>
    `/treatments/${encodeURIComponent(specialty)}/${encodeURIComponent(procedure)}/${encodeURIComponent(city)}`,
  costs: '/costs',
  costGuide: (procedure: string, country: string) => `/costs/${encodeURIComponent(procedure)}/${encodeURIComponent(country)}`,
  stories: '/stories',
  story: (slug: string) => `/stories/${encodeURIComponent(slug)}`,
  forHospitals: '/for-hospitals',
  forAgents: '/for-agents',
  about: '/about',
  contact: '/contact',
  terms: '/terms',
  privacy: '/privacy',
  refunds: '/refund-policy',
  deleteAccount: '/account/delete',
  search: '/search',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  acceptInvite: '/accept-invite',
} as const;

/**
 * Link target for a site path in the language of the page being rendered: the home path '' becomes '/', and on a
 * translated page the language prefix is added ('/hospitals' -> '/ar/hospitals'). English has no prefix. In client
 * components (no server render) paths stay unprefixed; the Link component (components/link.tsx) adds the prefix.
 */
export function href(path: string): string {
  return localizePath(path || '/', requestLocale());
}
