import { SITE_NAME, SITE_NOINDEX, SITE_URL } from '@/config/site';
import { getDictionary } from '@/i18n';
import { guideContent } from '@/lib/content';
import { stories } from '@/lib/growth/collections';
import { GUIDE_SLUGS } from '@/lib/guides';
import { routes } from '@/lib/routes';
import { absoluteUrl } from '@/lib/seo';

export const revalidate = 3600;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DATE = /^\d{4}-\d{2}-\d{2}/;
const STARTED = new Date().toISOString();

function isoDate(value: string | null | undefined): string {
  return value && DATE.test(value) ? new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString() : STARTED;
}

/**
 * Atom feed of the patient guides and published patient stories (/guides/feed.xml), linked from every page with
 * <link rel="alternate" type="application/atom+xml">. Lists only pages that are published (same rule as the pages).
 */
export function GET() {
  const t = getDictionary();
  const entries: { title: string; path: string; summary: string; updated: string }[] = [];
  if (!SITE_NOINDEX) {
    for (const slug of GUIDE_SLUGS) {
      const page = guideContent(slug);
      if (!page) continue;
      entries.push({
        title: t.guides.items[slug].title,
        path: routes.guide(slug),
        summary: page.meta.summary || t.guides.items[slug].description,
        updated: isoDate(page.meta.updated),
      });
    }
    for (const s of stories().filter((x) => !x.isDraft)) {
      entries.push({ title: s.title, path: routes.story(s.slug), summary: s.summary ?? '', updated: isoDate(s.updated) });
    }
  }
  entries.sort((a, b) => b.updated.localeCompare(a.updated));
  const feedUrl = absoluteUrl('/guides/feed.xml');
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">',
    `  <title>${esc(`${SITE_NAME} - ${t.guides.metaTitle}`)}</title>`,
    `  <subtitle>${esc(t.guides.metaDescription)}</subtitle>`,
    `  <id>${esc(feedUrl)}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${esc(feedUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${esc(absoluteUrl(routes.guides))}"/>`,
    `  <updated>${entries[0]?.updated ?? STARTED}</updated>`,
    `  <author><name>${esc(SITE_NAME)}</name><uri>${esc(SITE_URL)}</uri></author>`,
    `  <icon>${esc(absoluteUrl('/icons/icon-192.png'))}</icon>`,
    ...entries.map((e) =>
      [
        '  <entry>',
        `    <title>${esc(e.title)}</title>`,
        `    <id>${esc(absoluteUrl(e.path))}</id>`,
        `    <link rel="alternate" type="text/html" href="${esc(absoluteUrl(e.path))}"/>`,
        `    <updated>${e.updated}</updated>`,
        e.summary ? `    <summary>${esc(e.summary)}</summary>` : '',
        '  </entry>',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    '</feed>',
    '',
  ].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
}
