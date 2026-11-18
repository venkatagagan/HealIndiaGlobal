import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { getDoctor, getDoctorReviews } from '@/lib/data/catalog';
import { routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { REVIEWS_PAGE_SIZE, ReviewsList, pageParam } from '@/components/reviews-list';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const t = await getDictionary();
  const d = await getDoctor(slug);
  if (!d.data) return {};
  const reviews = await getDoctorReviews(d.data.id, d.data.slug, page, REVIEWS_PAGE_SIZE);
  return pageMetadata({
    path: routes.doctorReviews(d.data.slug),
    title: fmt(t.trust.reviewsTitle, { name: d.data.full_name }),
    description: fmt(t.trust.reviewsMetaDescription, { name: d.data.full_name }),
    noindex: d.source === 'fallback' || page > 1 || reviews.total === 0,
  });
}

export default async function DoctorReviewsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageParam((await searchParams).page);
  const t = await getDictionary();
  const d = (await getDoctor(slug)).data;
  if (!d) notFound();
  const reviews = await getDoctorReviews(d.id, d.slug, page, REVIEWS_PAGE_SIZE);
  if (page > 1 && page > reviews.pages) notFound();
  return (
    <ReviewsList
      t={t}
      name={d.full_name}
      parentPath={routes.doctor(d.slug)}
      parentCrumb={{ name: t.doctors.title, path: routes.doctors }}
      path={routes.doctorReviews(d.slug)}
      page={reviews}
    />
  );
}
