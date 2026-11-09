import { SITEMAP_SECTIONS, sitemapSection } from '@/lib/sitemap';

export const revalidate = 3600;
export const dynamicParams = false;

/**
 * Sitemaps split by page type: /sitemap/pages.xml, /sitemap/treatments.xml, /sitemap/hospitals.xml, ...
 * The index at /sitemap.xml (../../sitemap.xml/route.ts) lists them; entries and indexing rules: src/lib/sitemap.ts.
 * (Route handlers rather than app/sitemap.ts + generateSitemaps, which cannot coexist with a /sitemap.xml index.)
 */
export function generateStaticParams() {
  return SITEMAP_SECTIONS.map((s) => ({ file: `${s}.xml` }));
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const section = file.replace(/\.xml$/, '');
  if (!file.endsWith('.xml') || !(SITEMAP_SECTIONS as readonly string[]).includes(section)) {
    return new Response('Not found', { status: 404 });
  }
  const entries = await sitemapSection(section);
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map((e) => {
      const lastmod = e.lastModified ? `<lastmod>${xmlEscape(String(e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified))}</lastmod>` : '';
      const priority = e.priority !== undefined ? `<priority>${e.priority}</priority>` : '';
      // Every language version of the page, including itself (hreflang annotations).
      const alternates = Object.entries(e.alternates?.languages ?? {})
        .map(([lang, url]) => `<xhtml:link rel="alternate" hreflang="${xmlEscape(lang)}" href="${xmlEscape(String(url))}"/>`)
        .join('');
      return `  <url><loc>${xmlEscape(e.url)}</loc>${lastmod}${priority}${alternates}</url>`;
    }),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
