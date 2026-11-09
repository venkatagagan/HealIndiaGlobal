import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { inter, manrope } from './fonts';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ContactFab } from '@/components/contact-fab';
import { DataNotice } from '@/components/data-notice';
import { JsonLd } from '@/components/json-ld';
import { getDictionary } from '@/i18n';
import { getSpecialties } from '@/lib/data/catalog';
import { organizationLd } from '@/lib/jsonld';
import { favicon } from '@/lib/brand';
import { SITE_NAME, SITE_NOINDEX, SITE_URL } from '@/config/site';
import { getSiteConfig } from '@/lib/site-config';
import { Ga4WithConsent } from '@/components/analytics';
import { WebVitals } from '@/components/web-vitals';
import { routes } from '@/lib/routes';

export const revalidate = 3600;

/**
 * Search-console ownership tokens: site settings (System -> Website & contact), else GOOGLE_SITE_VERIFICATION /
 * BING_SITE_VERIFICATION from the server env.
 */
async function verification(): Promise<Metadata['verification']> {
  const { google, bing } = (await getSiteConfig()).verification;
  if (!google && !bing) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { 'msvalidate.01': bing } } : {}),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return {
    // Canonical URLs, OpenGraph and Twitter image URLs resolve against NEXT_PUBLIC_SITE_URL.
    metadataBase: new URL(SITE_URL),
    title: { default: `${SITE_NAME} - ${t.common.tagline}`, template: `%s | ${SITE_NAME}` },
    description: t.home.metaDescription,
    applicationName: SITE_NAME,
    formatDetection: { telephone: false, address: false, email: false },
    openGraph: {
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
    },
    twitter: { card: 'summary_large_image' },
    // SVG favicon for modern browsers, PNG fallbacks and the apple-touch-icon (src/app/icons/[name]/route.tsx);
    // manifest.webmanifest comes from src/app/manifest.ts.
    icons: {
      icon: [
        ...(favicon() ? [{ url: favicon()!, type: 'image/svg+xml' }] : []),
        { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    robots: SITE_NOINDEX ? { index: false, follow: false } : undefined,
    verification: await verification(),
  };
}

export const viewport: Viewport = {
  themeColor: '#0B0F14',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const t = getDictionary();
  const [specialties, site] = await Promise.all([getSpecialties(), getSiteConfig()]);
  const analytics = site.analytics;

  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-primary-800 shadow focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {t.common.skipToContent}
        </a>
        <Header t={t} />
        <DataNotice show={specialties.source === 'fallback'} text={t.common.sampleData} />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <Footer t={t} specialties={specialties.data} />
        <ContactFab t={t} />
        <JsonLd data={organizationLd(site)} />
        {analytics.provider === 'plausible' ? (
          // Cookieless; no consent banner needed. Loaded only when the analytics provider is plausible.
          <Script defer data-domain={analytics.domain} src={analytics.scriptUrl} strategy="afterInteractive" />
        ) : null}
        {process.env.NEXT_PUBLIC_WEB_VITALS_URL ? <WebVitals /> : null}
        {analytics.provider === 'ga4' ? (
          <Ga4WithConsent measurementId={analytics.measurementId} labels={t.consent} privacyHref={routes.privacy} />
        ) : null}
      </body>
    </html>
  );
}
