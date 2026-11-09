import { BadgeCheck, ExternalLink } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import type { MedicalReview, Source } from '@/lib/medical-review';

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/**
 * "Medically reviewed by <name>, <credentials> · Last reviewed <date>". Renders nothing without a real reviewer
 * (placeholder entries in content/site/reviewers.json are never shown).
 */
export function MedicalReviewByline({ review, t }: { review: MedicalReview; t: Dictionary }) {
  const r = review.reviewer;
  if (!r || !review.reviewedAt) return null;
  return (
    <div className="flex max-w-3xl items-start gap-3 rounded-xl border border-health-200 bg-health-50 px-4 py-3 text-sm text-health-950">
      {r.photo ? (
        // Small portrait from content/site/reviewers.json; a plain <img> avoids image-optimizer host configuration.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-health-700" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p>
          {t.review.reviewedBy}{' '}
          <span className="font-semibold">
            {r.name}, {r.credentials}
          </span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">. </span>
          <time dateTime={review.reviewedAt}>{fmt(t.review.lastReviewed, { date: longDate(review.reviewedAt) })}</time>
        </p>
        <p className="mt-0.5 text-xs text-health-900/80">
          {fmt(t.review.registration, { number: r.registration.number, council: r.registration.council })}
        </p>
        {r.bio ? <p className="mt-1 text-xs text-health-900/80">{r.bio}</p> : null}
      </div>
    </div>
  );
}

/** Reference list from the page's `sources` front matter (https links only). */
export function SourcesList({
  sources,
  t,
  id = 'sources-title',
  level = 2,
}: {
  sources: Source[];
  t: Dictionary;
  id?: string;
  level?: 2 | 3;
}) {
  if (!sources.length) return null;
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <section aria-labelledby={id} className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5">
      <Heading id={id} className="text-base font-semibold text-slate-900">
        {t.review.sourcesTitle}
      </Heading>
      <p className="mt-1 text-sm text-slate-600">{t.review.sourcesIntro}</p>
      <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm">
        {sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-800 underline underline-offset-4 hover:text-primary-900"
            >
              {s.title}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
