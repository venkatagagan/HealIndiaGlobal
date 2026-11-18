import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { getHospital, getHospitalReviews } from '@/lib/data/catalog';
import { routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { REVIEWS_PAGE_SIZE, ReviewsList, pageParam } from '@/components/reviews-list';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const t = await getDictionary();
  const h = await getHospital(slug);
  if (!h.data) return {};
  const reviews = await getHospitalReviews(h.data.slug, page, REVIEWS_PAGE_SIZE);
  return pageMetadata({
    path: routes.hospitalReviews(h.data.slug),
    title: fmt(t.trust.reviewsTitle, { name: h.data.name }),
    description: fmt(t.trust.reviewsMetaDescription, { name: h.data.name }),
    // Only the first page with published reviews is indexed; later pages and empty lists are noindex,follow.
    noindex: h.source === 'fallback' || page > 1 || reviews.total === 0,
  });
}

export default async function HospitalReviewsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const t = await getDictionary();
  const h = (await getHospital(slug)).data;
  if (!h) notFound();
  const reviews = await getHospitalReviews(h.slug, page, REVIEWS_PAGE_SIZE);
  if (page > 1 && page > reviews.pages) notFound();
  return (
    <ReviewsList
      t={t}
      name={h.name}
      parentPath={routes.hospital(h.slug)}
      parentCrumb={{ name: t.hospitals.title, path: routes.hospitals }}
      path={routes.hospitalReviews(h.slug)}
      page={reviews}
    />
  );
}
