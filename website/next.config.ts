import type { NextConfig } from 'next';

/**
 * Heal India Global public website.
 *
 * Everything that depends on deployment (API origin, portal URLs, allowed image hosts, Google sign-in) is read
 * from environment variables here at build/start time. See README.md and .env.example.
 */

const isProd = process.env.NODE_ENV === 'production';

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** API base used by server-side data fetching and by the same-origin `/api/*` rewrite (PLAN §3.1). */
const apiBase = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1').trim();
const apiOrigin = originOf(apiBase) ?? 'http://127.0.0.1:8000';

const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim());

/** Extra hosts allowed for remote images (hospital logos, doctor photos), e.g. "https://cdn.example.com". */
const remoteImageOrigins = (process.env.IMAGE_REMOTE_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => originOf(s))
  .filter((s): s is string => Boolean(s));

/**
 * The Content-Security-Policy is NOT set here: src/proxy.ts builds it per request (src/lib/csp.ts) because the
 * analytics provider is a site setting a super admin can change at runtime (System -> Website & contact).
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: googleEnabled ? 'same-origin-allow-popups' : 'same-origin' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/** Public-door pages live at the domain root (PLAN §3.1): /login, /register, /forgot-password, ... */
const doorPaths = ['login', 'register', 'forgot-password', 'reset-password', 'verify-email', 'accept-invite'];
/**
 * Pages that receive one-time tokens from emails (INTEGRATION_BACKLOG #22). Links carry the token in the fragment, but
 * old `?token=` links still work, so these pages never send a Referer (overrides the site-wide policy above).
 */
const tokenPaths = ['reset-password', 'verify-email', 'accept-invite'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a production build/start (e.g. `npm run audit:seo`, which uses .next-audit) run next to a
  // running `next dev` without sharing its output folder. Unset = the default `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  // One URL per page: /hospitals/ redirects (308) to /hospitals, so canonical URLs never have a trailing slash.
  trailingSlash: false,
  // Docker image uses the standalone server (see Dockerfile); `next start` works without it.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    '/*': ['./content-snapshot/**/*', './src/data/*.json'],
  },
  turbopack: { root: process.cwd() },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: remoteImageOrigins.map((origin) => {
      const u = new URL(origin);
      return {
        protocol: u.protocol.replace(':', '') as 'http' | 'https',
        hostname: u.hostname,
        port: u.port,
        pathname: '/**',
      };
    }),
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Auth door pages are noindex (also set via <meta name="robots">).
      ...doorPaths.map((p) => ({ source: `/${p}`, headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] })),
      ...tokenPaths.map((p) => ({ source: `/${p}`, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] })),
      // Operational endpoints are never indexed.
      { source: '/api/health/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/api/revalidate', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // Machine-readable files: never shown as search results themselves.
      { source: '/:file(sitemap.xml|llms.txt|manifest.webmanifest)', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/sitemap/:file*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/guides/feed.xml', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      // Long-lived caching for the build-time PNG icons.
      { source: '/icons/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
    ];
  },
  async redirects() {
    return [
      // The site is English only and served without a locale prefix. Old /en, /ar and /fr URLs (and anything
      // below them) redirect permanently to the same path at the root; query strings are kept.
      { source: '/:locale(en|ar|fr)', destination: '/', permanent: true },
      { source: '/:locale(en|ar|fr)/:path*', destination: '/:path*', permanent: true },
      // Friendly aliases.
      { source: '/procedures', destination: '/treatments', permanent: true },
      { source: '/specialties', destination: '/treatments', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Same-origin API for the auth door (httpOnly refresh cookie). nginx routes /api/ itself in production.
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    ];
  },
};

export default nextConfig;
