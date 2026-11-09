import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareQuote } from 'lucide-react';
import { hospitalPortalApi, type ReviewOut } from '@hig/shared/api';
import { Card, CardBody, EmptyState, ErrorState, PageHeader, Skeleton, Stars, StatusBadge, Tabs } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { qk, useHospitalDoctors } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

type Filter = 'all' | '5' | '4' | 'low';

function matches(r: ReviewOut, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'low') return r.rating <= 3;
  return r.rating === Number(f);
}

export function ReviewsPage() {
  useDocumentTitle('Reviews');
  const reviews = useQuery({ queryKey: qk.reviews, queryFn: hospitalPortalApi.listReviews });
  const doctors = useHospitalDoctors();
  const doctorName = useMemo(() => new Map((doctors.data ?? []).map((d) => [d.id, d.full_name])), [doctors.data]);
  const [filter, setFilter] = useState<Filter>('all');

  const list = reviews.data ?? [];
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: list.filter((r) => r.rating === star).length }));
  const shown = [...list].filter((r) => matches(r, filter)).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <PageHeader title="Reviews" description="What patients say after their treatment. Published reviews appear on your public profile." />
      {reviews.isPending ? (
        <Skeleton className="h-64" />
      ) : reviews.isError ? (
        <Card>
          <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquareQuote className="h-6 w-6" aria-hidden />}
            title="No reviews yet"
            description="Patients are invited to review after their treatment is completed."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card className="self-start">
            <CardBody>
              <p className="text-4xl font-bold text-slate-900 dark:text-white">{avg.toFixed(1)}</p>
              <Stars value={avg} size="md" />
              <p className="mt-1 text-sm text-slate-500">{list.length} reviews</p>
              <ul className="mt-4 space-y-1.5">
                {dist.map((d) => (
                  <li key={d.star} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-slate-600 dark:text-slate-300">{d.star}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-raised-dark">
                      <span
                        className="block h-full rounded-full bg-amber-400"
                        style={{ width: `${list.length ? (d.count / list.length) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-slate-500">{d.count}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <Tabs
              className="px-3"
              tabs={[
                { value: 'all' as const, label: 'All', count: list.length },
                { value: '5' as const, label: '5 stars', count: dist[0]?.count },
                { value: '4' as const, label: '4 stars', count: dist[1]?.count },
                { value: 'low' as const, label: '3 or less', count: list.filter((r) => r.rating <= 3).length },
              ]}
              value={filter}
              onChange={setFilter}
            />
            {shown.length === 0 ? (
              <EmptyState title="No reviews in this filter" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Stars value={r.rating} />
                        {r.title && <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>}
                      </div>
                      {r.status && r.status !== 'published' && <StatusBadge status={r.status} />}
                    </div>
                    {r.body && <p className="mt-2 text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{r.body}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      {r.patient_name ?? 'Patient'} · {formatDate(r.created_at)}
                      {r.doctor_id && doctorName.get(r.doctor_id) ? ` · ${doctorName.get(r.doctor_id)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
