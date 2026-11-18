/**
 * Reviews moderation queue (trust module): patient reviews wait as `pending` until staff publish them; staff can
 * hide a published review with a reason (shown to its author). Publishing / hiding recomputes the hospital and
 * doctor ratings. List: any staff; decisions: admin | super_admin.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { BadgeCheck, Building2, CheckCircle2, EyeOff, Star } from 'lucide-react';
import { filterParam, useTableState } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  FilterBar,
  PageHeader,
  QuickFilters,
  SelectFilter,
  TextCell,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Button, Drawer, KeyValue, LoadingState, ReasonDialog } from '../ui';
import { Banner } from '../ui/detail';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { useHospitalOptions } from '../lib/lookups';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { phase1AdminApi, phase1Keys, REVIEW_STATUSES, type AdminReviewOut, type ReviewStatus } from '../lib/phase1Api';

const STATUS_TONES: Record<ReviewStatus, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  published: 'success',
  hidden: 'neutral',
};

const FILTERS = {
  status: filterParam.oneOf(REVIEW_STATUSES, 'pending'),
  hospital_id: filterParam.text(),
};

function Stars({ rating }: { rating: number }) {
  const { t } = useAppTranslation();
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={t('reviews.stars', { count: rating })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= rating ? 'size-3.5 fill-amber-400 text-amber-400' : 'size-3.5 text-border-strong'} aria-hidden />
      ))}
    </span>
  );
}

function statusLabel(t: TFunction, status: ReviewStatus): string {
  return t(`reviews.status.${status}`);
}

const columnsFor = (t: TFunction): DataTableColumn<AdminReviewOut>[] => [
  {
    key: 'review',
    header: t('reviews.columns.review'),
    sticky: true,
    mobile: 'primary',
    className: 'max-w-96',
    cell: (r) => (
      <span className="block min-w-0">
        <span className="flex items-center gap-2">
          <Stars rating={r.rating} />
          {r.title && <span className="truncate font-medium text-fg">{r.title}</span>}
        </span>
        <span className="line-clamp-2 text-xs text-muted">{r.body ?? t('reviews.noText')}</span>
      </span>
    ),
    mobileCell: (r) => r.title ?? t('reviews.stars', { count: r.rating }),
    exportValue: (r) => `${r.rating} ${r.title ?? ''} ${r.body ?? ''}`.trim(),
  },
  {
    key: 'hospital',
    header: t('reviews.columns.hospital'),
    mobile: 'secondary',
    cell: (r) => <TextCell primary={r.hospital_name ?? '—'} secondary={[r.doctor_name, r.treatment_name].filter(Boolean).join(' · ') || undefined} />,
    exportValue: (r) => r.hospital_name ?? '',
  },
  {
    key: 'patient',
    header: t('reviews.columns.patient'),
    hideOnMobile: true,
    cell: (r) => (
      <span className="inline-flex flex-col gap-0.5">
        <span className="text-sm text-fg">{r.patient_name ?? t('reviews.anonymous')}</span>
        {r.verified_patient ? (
          <Badge tone="success">
            <BadgeCheck className="size-3" aria-hidden /> {t('reviews.verifiedPatient')}
          </Badge>
        ) : (
          <span className="text-xs text-muted">{t('reviews.notVerified')}</span>
        )}
      </span>
    ),
    exportValue: (r) => r.patient_name ?? '',
  },
  {
    key: 'status',
    header: t('reviews.columns.status'),
    mobile: 'badge',
    cell: (r) => (
      <Badge tone={STATUS_TONES[r.status] ?? 'neutral'} dot>
        {statusLabel(t, r.status)}
      </Badge>
    ),
    exportValue: (r) => r.status,
  },
  {
    key: 'created_at',
    header: t('reviews.columns.submitted'),
    mobile: 'meta',
    cell: (r) => <DateCell value={r.created_at} display="datetime" secondary={<DateCell value={r.created_at} display="relative" />} />,
    exportValue: (r) => r.created_at,
  },
];

export default function ReviewsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('reviews.title'));
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const hospitals = useHospitalOptions();
  const [selected, setSelected] = useState<AdminReviewOut | null>(null);
  const columns = useMemo(() => columnsFor(t), [t]);

  const params = {
    status: (filters.status || undefined) as ReviewStatus | undefined,
    hospital_id: filters.hospital_id || undefined,
    page: table.page,
    page_size: table.pageSize,
  };
  const list = useQuery({
    queryKey: [...phase1Keys.reviews, 'list', params],
    queryFn: () => phase1AdminApi.listReviews(params),
    placeholderData: keepPreviousData,
  });

  const quickItems: QuickFilterItem<ReviewStatus>[] = [
    ...REVIEW_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s), tone: STATUS_TONES[s] })),
    { value: '', label: t('reviews.all') },
  ];

  return (
    <div>
      <PageHeader title={t('reviews.title')} description={t('reviews.description')} />
      <DataTable
        id="admin.reviews"
        caption={t('reviews.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setSelected(r)}
        rowLabel={(r) => t('reviews.openRow', { hospital: r.hospital_name ?? '—' })}
        emptyTitle={filters.status === 'pending' ? t('reviews.emptyPending') : t('reviews.empty')}
        emptyDescription={t('reviews.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('reviews.statusFilter')} items={quickItems} value={filters.status} onChange={(s) => setFilter('status', s)} />
          </div>
        }
        toolbar={
          <FilterBar onReset={table.resetFilters}>
            <SelectFilter
              label={t('reviews.hospitalFilter')}
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital_id}
              onChange={(v) => setFilter('hospital_id', v)}
              options={hospitals.data ?? []}
              loading={hospitals.isLoading}
              searchable
            />
          </FilterBar>
        }
      />
      <ReviewDrawer review={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ReviewDrawer({ review, onClose }: { review: AdminReviewOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const [hiding, setHiding] = useState(false);
  const canModerate = perms.approvePartners; // admin | super_admin (PATCH /admin/reviews)
  const moderate = useOpsMutation({
    mutationFn: (body: { status: 'published' | 'hidden'; reason?: string }) => phase1AdminApi.moderateReview(review!.id, body),
    success: (r) => (r.status === 'published' ? t('reviews.toast.published') : t('reviews.toast.hidden')),
    invalidate: [phase1Keys.reviews, opsKeys.hospitals],
    onSuccess: () => {
      setHiding(false);
      onClose();
    },
  });
  const r = review;
  return (
    <>
      <Drawer
        open={!!r}
        onClose={() => !moderate.isPending && onClose()}
        width="lg"
        title={r ? t('reviews.drawerTitle', { hospital: r.hospital_name ?? '—' }) : t('reviews.title')}
        subtitle={r ? formatDateTime(r.created_at) : undefined}
        footer={
          r && canModerate ? (
            <div className="flex flex-wrap justify-end gap-2">
              {r.status !== 'hidden' && (
                <Button variant="outline" icon={<EyeOff className="size-4" aria-hidden />} disabled={moderate.isPending} onClick={() => setHiding(true)}>
                  {t('reviews.hide')}
                </Button>
              )}
              {r.status !== 'published' && (
                <Button
                  icon={<CheckCircle2 className="size-4" aria-hidden />}
                  loading={moderate.isPending && moderate.variables?.status === 'published'}
                  onClick={() => moderate.mutate({ status: 'published' })}
                >
                  {r.status === 'hidden' ? t('reviews.republish') : t('reviews.publish')}
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {!r ? (
          <LoadingState />
        ) : (
          <div className="space-y-5">
            {r.status === 'hidden' && r.moderation_reason && (
              <Banner tone="warning" icon={<EyeOff className="size-5" aria-hidden />} title={t('reviews.hiddenReason')}>
                {r.moderation_reason}
              </Banner>
            )}
            {!r.verified_patient && (
              <Banner tone="info" title={t('reviews.unverifiedTitle')}>
                {t('reviews.unverifiedBody')}
              </Banner>
            )}
            <section>
              <div className="flex items-center gap-2">
                <Stars rating={r.rating} />
                <Badge tone={STATUS_TONES[r.status] ?? 'neutral'} dot>
                  {t(`reviews.status.${r.status}`)}
                </Badge>
              </div>
              {r.title && <h3 className="mt-2 text-base font-semibold text-fg">{r.title}</h3>}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">{r.body ?? <span className="text-muted">{t('reviews.noText')}</span>}</p>
            </section>
            <KeyValue
              items={[
                [
                  t('reviews.fields.hospital'),
                  <Link key="h" to={opsPaths.hospital(r.hospital_id)} className="text-primary-ink hover:underline">
                    {r.hospital_name ?? '—'}
                  </Link>,
                ],
                [t('reviews.fields.doctor'), r.doctor_name ?? '—'],
                [t('reviews.fields.treatment'), r.treatment_name ?? '—'],
                [
                  t('reviews.fields.patient'),
                  <span key="p" className="inline-flex flex-wrap items-center gap-2">
                    {r.patient_name ?? t('reviews.anonymous')}
                    {r.verified_patient && (
                      <Badge tone="success">
                        <BadgeCheck className="size-3" aria-hidden /> {t('reviews.verifiedPatient')}
                      </Badge>
                    )}
                  </span>,
                ],
                [t('reviews.fields.booking'), r.booking_number ?? '—'],
                [t('reviews.fields.submitted'), formatDateTime(r.created_at)],
                [t('reviews.fields.published'), r.published_at ? formatDateTime(r.published_at) : '—'],
                [t('reviews.fields.moderated'), r.moderated_at ? formatDateTime(r.moderated_at) : '—'],
              ]}
            />
            {!canModerate && <p className="text-xs text-muted">{t('reviews.adminOnly')}</p>}
          </div>
        )}
      </Drawer>
      <ReasonDialog
        open={hiding}
        title={t('reviews.hideTitle')}
        description={t('reviews.hideDescription')}
        confirmLabel={t('reviews.hide')}
        loading={moderate.isPending}
        onClose={() => setHiding(false)}
        onConfirm={(reason) => moderate.mutate({ status: 'hidden', reason })}
      />
    </>
  );
}
