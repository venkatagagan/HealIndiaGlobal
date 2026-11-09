import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TAGLINE } from '@/config/site';
import { favicon } from '@/lib/brand';

/** /manifest.webmanifest (install metadata, theme colour, icons). Icons: src/app/icons/[name]/route.tsx. */
export default function manifest(): MetadataRoute.Manifest {
  const svg = favicon();
  return {
    name: SITE_NAME,
    short_name: 'Heal India',
    description: `${SITE_TAGLINE}: compare partner hospitals, treatments and prices for medical travel to India.`,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'browser',
    lang: 'en',
    dir: 'ltr',
    background_color: '#ffffff',
    theme_color: '#0B0F14',
    categories: ['medical', 'health', 'travel'],
    icons: [
      ...(svg ? [{ src: svg, sizes: 'any', type: 'image/svg+xml', purpose: 'any' as const }] : []),
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
