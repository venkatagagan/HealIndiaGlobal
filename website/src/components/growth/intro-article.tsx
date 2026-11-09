import { getDictionary } from '@/i18n';
import { resolveContentHref } from '@/lib/content';
import type { Intro } from '@/lib/growth/collections';
import { InlineNote } from '@/components/data-notice';
import { MarkdownContent } from '@/components/markdown';
import { MedicalReviewByline, SourcesList } from '@/components/medical-review';

/**
 * Hand-written intro for a growth page: draft banner, the shared medical-review byline (real reviewers only), the
 * Markdown body and its sources.
 */
export function IntroArticle({ intro, shiftHeadings = 1 }: { intro: Intro; shiftHeadings?: number }) {
  const t = getDictionary();
  return (
    <div className="space-y-5">
      {intro.isDraft ? (
        <InlineNote
          tone="amber"
          text="Draft - this text is awaiting review. Search engines are asked not to index this page until it is approved."
        />
      ) : null}
      <MedicalReviewByline review={intro.review} t={t} />
      <MarkdownContent resolveHref={(h) => resolveContentHref(intro.path, h)} shiftHeadings={shiftHeadings} className="max-w-3xl">
        {intro.body}
      </MarkdownContent>
      <SourcesList sources={intro.review.sources} t={t} id="intro-sources" level={3} />
      {intro.updated ? <p className="text-sm text-slate-500">Last updated {intro.updated}</p> : null}
    </div>
  );
}
