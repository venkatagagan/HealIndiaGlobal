import { sectionUrl, sitemapIndex } from '@/lib/sitemap';

export const revalidate = 3600;

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sitemap index (robots.txt points here). Lists the per-type sitemaps that currently have at least one URL. */
export async function GET() {
  const sections = await sitemapIndex();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sections.map(
      (s) => `  <sitemap><loc>${xmlEscape(sectionUrl(s.section))}</loc>${s.lastModified ? `<lastmod>${xmlEscape(s.lastModified)}</lastmod>` : ''}</sitemap>`,
    ),
    '</sitemapindex>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
