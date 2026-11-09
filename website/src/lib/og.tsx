import 'server-only';

/**
 * Shared 1200x630 Open Graph card (brand colours + logo) for the `opengraph-image.tsx` routes. Text comes from
 * catalogue/content data only; nothing here invents claims.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/config/site';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const NIGHT = '#070c1a';
const NIGHT_CARD = '#0e1629';
const LINE = '#1f2b47';
const BRAND = '#22c55e';
const GRADIENT = 'linear-gradient(90deg, #22C55E 0%, #10B981 35%, #3B82F6 65%, #7C3AED 100%)';

let markCache: string | null | undefined;

/** The design-system logo mark (public/brand/logo/logo-mark.svg) as a data URI, or null to use the inline mark. */
function logoMark(): string | null {
  if (markCache !== undefined) return markCache;
  try {
    const svg = fs.readFileSync(path.join(process.cwd(), 'public', 'brand', 'logo', 'logo-mark.svg'));
    markCache = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  } catch {
    markCache = null;
  }
  return markCache;
}

function clip(text: string | null | undefined, max: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ') > max * 0.6 ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  return `${atWord.replace(/[\s,;:.-]+$/, '')}…`;
}

function host(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return '';
  }
}

export interface OgCard {
  /** Small label above the title, e.g. "Hospital · Chennai". */
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  /** Up to four short chips (accreditations, specialties, languages). */
  chips?: (string | null | undefined)[];
}

export function ogImage({ eyebrow, title, subtitle, chips = [] }: OgCard): ImageResponse {
  const mark = logoMark();
  const titleText = clip(title, 90);
  const chipList = chips.filter((c): c is string => !!c && !!c.trim()).slice(0, 4).map((c) => clip(c, 28));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: NIGHT,
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', height: 12, width: '100%', backgroundImage: GRADIENT }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '56px 72px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {mark ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={mark} width={64} height={64} />
            ) : (
              <div style={{ display: 'flex', width: 64, height: 64, borderRadius: 18, backgroundImage: GRADIENT }} />
            )}
            <div style={{ display: 'flex', fontSize: 34, letterSpacing: -0.5 }}>
              <span>Heal India&nbsp;</span>
              <span style={{ color: '#4ade80' }}>Global</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            {eyebrow ? (
              <div style={{ display: 'flex', fontSize: 28, color: BRAND, textTransform: 'uppercase', letterSpacing: 2 }}>
                {clip(eyebrow, 60)}
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                marginTop: 16,
                fontSize: titleText.length > 48 ? 58 : 72,
                lineHeight: 1.1,
                letterSpacing: -1.5,
              }}
            >
              {titleText}
            </div>
            {subtitle ? (
              <div style={{ display: 'flex', marginTop: 22, fontSize: 30, lineHeight: 1.35, color: '#cbd5e1' }}>
                {clip(subtitle, 130)}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {chipList.map((c) => (
                <div
                  key={c}
                  style={{
                    display: 'flex',
                    padding: '8px 18px',
                    borderRadius: 999,
                    border: `2px solid ${LINE}`,
                    background: NIGHT_CARD,
                    fontSize: 24,
                    color: '#e2e8f0',
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', fontSize: 24, color: '#94a3b8' }}>{host()}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      // Catalogue names can change; let crawlers/CDNs refresh daily instead of caching for a year (the default).
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
    },
  );
}

/** Default site card (home and every page without its own image). */
export function defaultOgImage(): ImageResponse {
  return ogImage({ title: SITE_TAGLINE, subtitle: `${SITE_NAME} helps international patients plan treatment at partner hospitals in India.` });
}
