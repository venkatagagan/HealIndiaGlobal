import localFont from 'next/font/local';

/**
 * Self-hosted variable fonts (no request to Google at build or run time).
 * Inter (body) and Manrope (headings), Latin subsets only; the site is English only.
 */
export const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: true,
});

/** Manrope (Latin, variable) for headings - self-hosted like Inter; `display: swap` keeps text visible (no CLS). */
export const manrope = localFont({
  src: '../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
});
