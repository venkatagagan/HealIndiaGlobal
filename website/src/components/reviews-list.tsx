import Link from '@/components/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { fmt, formatNumber } from '@/i18n/format';
import { href, routes } from '@/lib/routes';
import type { ReviewPage } from '@/lib/data/types';
import { PageHero } from './page-hero';
import { ReviewItem } from './cards';

export const REVIEWS_PAGE_SIZE = 10;

/** Page number from `?page=` (1 when missing or invalid). */
export function pageParam(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

/** All published reviews of a hospital or doctor, newest first, with previous / next links. */
export function ReviewsList({
  t,
  name,
  parentPath,
  parentCrumb,
  path,
  page,
}: {
  t: Dictionary;
  name: string;
  /** Detail page of the hospital or doctor (site path). */
  parentPath: string;
  /** Breadcrumb of the list the parent belongs to (hospitals / doctors), site path. */
  parentCrumb: { name: string; path: string };
  /** This page's site path (without ?page). */
  path: string;
  page: ReviewPage;
}) {
  const pages = Math.max(1, page.pages);
  const current = Math.min(page.page, pages);
  const pageHref = (n: number) => (n <= 1 ? href(path) : `${href(path)}?page=${n}`);
  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: parentCrumb.name, path: href(parentCrumb.path) },
          { name, path: href(parentPath) },
          { name: t.nav.sections.reviews, path: href(path) },
        ]}
        title={fmt(t.trust.reviewsTitle, { name })}
        intro={<p>{t.trust.reviewsNote}</p>}
      />
      <div className="container-page space-y-8 py-8 sm:py-10">
        {page.items.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {page.items.map((r) => (
              <li key={r.id}>
                <ReviewItem t={t} review={r} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-700">{t.trust.reviewsEmpty}</p>
        )}
        {pages > 1 ? (
          <nav aria-label={t.trust.pagination} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            {current > 1 ? (
              <Link href={pageHref(current - 1)} rel="prev" className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline">
                <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                {t.trust.previous}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-slate-600">{fmt(t.trust.pageOf, { page: formatNumber(current), pages: formatNumber(pages) })}</span>
            {current < pages ? (
              <Link href={pageHref(current + 1)} rel="next" className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline">
                {t.trust.next}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
        <p>
          <Link href={href(parentPath)} className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline">
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            {fmt(t.trust.backTo, { name })}
          </Link>
        </p>
      </div>
    </>
  );
}
