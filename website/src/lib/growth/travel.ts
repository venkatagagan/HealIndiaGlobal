import 'server-only';

import { cityGuide, type ContentPage } from '@/lib/content';

/**
 * Travel notes for a destination, taken from its content-pack city guide (never written here): the whole "Arriving by air"
 * section, so its "Check before you travel" call-outs stay attached to the facts they qualify.
 */
export function travelNotes(guideSlug: string | null): { page: ContentPage; markdown: string } | null {
  if (!guideSlug) return null;
  const page = cityGuide(guideSlug);
  if (!page) return null;
  const lines = page.body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+arriving\b/i.test(l.trim()));
  if (start < 0) return null;
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    section.push(line);
  }
  const markdown = section.join('\n').trim();
  return markdown ? { page, markdown } : null;
}
