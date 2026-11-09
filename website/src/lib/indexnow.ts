import 'server-only';

/**
 * IndexNow (https://www.indexnow.org): tells Bing, Yandex, Seznam, Naver and other participating search engines
 * that URLs changed, so they recrawl quickly. Google does not use IndexNow (it reads the sitemap lastmod).
 *
 * OFF unless a key is configured (8-128 characters: a-z, A-Z, 0-9, "-"): the site setting "IndexNow key" (System ->
 * Website & contact -> Search engines; read server-side from GET /site-config/server with REVALIDATE_SECRET), else
 * the INDEXNOW_KEY environment variable. The key is public by design: it is served at
 * /indexnow-key.txt so the engines can verify the host. Pings are also skipped when SITE_NOINDEX=true or when
 * NEXT_PUBLIC_SITE_URL is not a public https origin (development, staging on localhost).
 */
import { SITE_NOINDEX, SITE_URL } from '@/config/site';
import { absoluteUrl } from './seo';
import { getServerSiteConfig } from './site-config';

const ENDPOINT = (process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow').trim();
export const INDEXNOW_KEY_PATH = '/indexnow-key.txt';
const MAX_URLS = 10_000;

const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

export async function indexNowKey(): Promise<string | null> {
  const fromSettings = (await getServerSiteConfig())?.indexnowKey ?? '';
  if (KEY_RE.test(fromSettings)) return fromSettings;
  const key = process.env.INDEXNOW_KEY?.trim() ?? '';
  return KEY_RE.test(key) ? key : null;
}

function publicHost(): string | null {
  try {
    const u = new URL(SITE_URL);
    if (u.protocol !== 'https:' || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname) || u.hostname.endsWith('.local')) return null;
    return u.host;
  } catch {
    return null;
  }
}

/**
 * Submit changed site paths (e.g. ["/hospitals/apollo-chennai"]). Never throws; resolves to a short status for logs.
 * Callers should not await it on a request's critical path.
 */
export async function submitIndexNow(paths: string[]): Promise<string> {
  const key = await indexNowKey();
  if (!key) return 'indexnow: not configured';
  if (SITE_NOINDEX) return 'indexnow: skipped (SITE_NOINDEX)';
  const host = publicHost();
  if (!host) return 'indexnow: skipped (site URL is not a public https origin)';
  const urlList = [...new Set(paths.filter((p) => p.startsWith('/')).map((p) => absoluteUrl(p)))].slice(0, MAX_URLS);
  if (!urlList.length) return 'indexnow: nothing to submit';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: absoluteUrl(INDEXNOW_KEY_PATH), urlList }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    // 200 = accepted, 202 = accepted (key validation pending); 4xx = key/host problem.
    return `indexnow: ${res.status} for ${urlList.length} URL(s)`;
  } catch (e) {
    return `indexnow: failed (${e instanceof Error ? e.name : 'error'})`;
  }
}
