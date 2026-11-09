import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { resolveContentHref, tableOfContents, type ContentPage } from '@/lib/content';
import { TocNav } from './toc-nav';
import { getReviewers, medicalReview, medicalWebPageLd } from '@/lib/medical-review';
import { InlineNote } from './data-notice';
import { JsonLd } from './json-ld';
import { MarkdownContent } from './markdown';
import { MedicalReviewByline, SourcesList } from './medical-review';

/** Draft notice for a content-pack page. */
export function ContentNotices({ page, t }: { page: ContentPage; t: Dictionary }) {
  return (
    <div className="space-y-3">
      {page.isDraft ? <InlineNote tone="amber" text={t.common.contentDraft} /> : null}
    </div>
  );
}

/**
 * A long-form content page (guide, city guide, procedure guide): notices, medical-review byline, optional table of
 * contents, the safely rendered Markdown body and its sources. With `path` (the page's site path), health pages
 * (`review_required` contains `medical`) also emit MedicalWebPage JSON-LD (reviewedBy/lastReviewed when reviewed).
 */
export async function ContentArticle({
  page,
  t,
  toc = true,
  shiftHeadings = 0,
  aside,
  path,
  title,
}: {
  page: ContentPage;
  t: Dictionary;
  toc?: boolean;
  shiftHeadings?: number;
  aside?: ReactNode;
  /** Site path of the page that shows this content (enables MedicalWebPage JSON-LD for health pages). */
  path?: string;
  /** Page title for JSON-LD when it differs from the content title. */
  title?: string;
}) {
  const items = toc ? tableOfContents(page.body) : [];
  const reviewers = await getReviewers();
  const review = medicalReview(page, reviewers);
  return (
    <div className={items.length > 2 || aside ? 'grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]' : ''}>
      <div className="min-w-0 space-y-6">
        {path && review.isHealthPage ? <JsonLd data={medicalWebPageLd(page, path, title, reviewers)} /> : null}
        <ContentNotices page={page} t={t} />
        <MedicalReviewByline review={review} t={t} />
        <MarkdownContent
          resolveHref={(h) => resolveContentHref(page.path, h)}
          shiftHeadings={shiftHeadings}
          className="max-w-3xl"
        >
          {page.body}
        </MarkdownContent>
        <SourcesList sources={review.sources} t={t} level={shiftHeadings > 0 ? 3 : 2} id={`sources-${page.meta.slug}`} />
        {page.meta.updated ? (
          <p className="text-sm text-slate-500">{fmt(t.guides.lastUpdated, { date: page.meta.updated })}</p>
        ) : null}
      </div>
      {items.length > 2 || aside ? (
        <aside className="order-first space-y-6 lg:order-none lg:sticky lg:top-24 lg:self-start">
          <TocNav items={items.filter((i) => i.depth === 2)} title={t.guides.onThisPage} />
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

/** Shown when a route exists but its long-form content is hidden (not yet approved) or missing. */
export function ContentPending({ t }: { t: Dictionary }) {
  return <InlineNote text={t.common.contentPending} />;
}
