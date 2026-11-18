import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BriefcaseMedical, CalendarCheck, CheckCheck, CreditCard, FileText, MessageSquare, Plane, Stethoscope } from 'lucide-react';
import type { TFunction } from 'i18next';
import { errorMessage, notificationsApi, type NotificationOut } from '@hig/shared/api';
import { filterParam, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { DataTable, DateCell, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { qk, useMarkNotificationRead, useUnreadCount } from '../api/queries';
import { TableTabs } from '../components/listing';
import { paths } from '../lib/paths';
import { cn, formatRelative } from '../lib/shared';
import { Button, PageHeader } from '../ui/primitives';

function str(data: Record<string, unknown> | null, key: string): string | null {
  const v = data?.[key];
  return typeof v === 'string' && v ? v : null;
}

/** Where a notification should take the patient, based on its payload. */
export function notificationTarget(n: NotificationOut): string | null {
  const d = n.data;
  // insurance / pay-later request updates link to "/insurance" (relative to the portal)
  const link = str(d, 'link');
  if (link && /^\/(insurance|financing)(?:[/?#]|$)/.test(link)) {
    return paths.insurance({ section: 'my-requests' });
  }
  const discharge = str(d, 'discharge_summary_id');
  if (discharge) return paths.dischargeSummary(discharge);
  const conversation = str(d, 'conversation_id');
  if (conversation) return paths.conversation(conversation);
  const screening = str(d, 'screening_id');
  if (screening) return paths.screeningResults(screening);
  const booking = str(d, 'booking_id');
  if (booking) return paths.booking(booking);
  const caseId = str(d, 'case_id');
  if (caseId) return paths.case(caseId);
  return null;
}

/** "booking.confirmed" -> Bookings (icon + label; `label` is the key under `notifications.category`) */
const CATEGORIES: Record<string, { label: string; icon: typeof Bell; tone: string }> = {
  booking: { label: 'booking', icon: CalendarCheck, tone: 'bg-success-soft text-success-ink' },
  case: { label: 'case', icon: BriefcaseMedical, tone: 'bg-primary-soft text-primary-ink' },
  quote: { label: 'quote', icon: BriefcaseMedical, tone: 'bg-primary-soft text-primary-ink' },
  payment: { label: 'payment', icon: CreditCard, tone: 'bg-warning-soft text-warning-ink' },
  refund: { label: 'payment', icon: CreditCard, tone: 'bg-warning-soft text-warning-ink' },
  message: { label: 'message', icon: MessageSquare, tone: 'bg-info-soft text-info-ink' },
  screening: { label: 'screening', icon: Stethoscope, tone: 'bg-accent-soft text-accent-ink' },
  travel: { label: 'trip', icon: Plane, tone: 'bg-info-soft text-info-ink' },
  visa: { label: 'trip', icon: Plane, tone: 'bg-info-soft text-info-ink' },
  document: { label: 'document', icon: FileText, tone: 'bg-neutral-soft text-neutral-ink' },
  discharge_summary: { label: 'document', icon: FileText, tone: 'bg-neutral-soft text-neutral-ink' },
};
const categoryOf = (n: NotificationOut) => CATEGORIES[n.kind.split('.')[0] ?? ''] ?? { label: 'update', icon: Bell, tone: 'bg-neutral-soft text-neutral-ink' };

const columns = (t: TFunction): DataTableColumn<NotificationOut>[] => [
  {
    key: 'title',
    header: t('notifications.columns.notification'),
    mobile: 'primary',
    cell: (n) => {
      const cat = categoryOf(n);
      const Icon = cat.icon;
      return (
        <span className="flex min-w-0 items-start gap-3 py-0.5">
          <span className={cn('relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', cat.tone)} aria-hidden>
            <Icon className="size-4" />
            {!n.read_at ? <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-primary" /> : null}
          </span>
          <span className="min-w-0">
            <span className={cn('block text-fg', !n.read_at ? 'font-semibold' : 'font-medium')}>
              {n.title}
              {!n.read_at ? <span className="sr-only"> {t('notifications.unreadSr')}</span> : null}
            </span>
            {n.body ? <span className="line-clamp-2 block max-w-3xl text-sm whitespace-normal text-muted">{n.body}</span> : null}
          </span>
        </span>
      );
    },
    mobileCell: (n) => (
      <span className="block">
        <span className={cn('flex items-center gap-1.5', !n.read_at ? 'font-semibold' : 'font-medium')}>
          {!n.read_at ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
          {n.title}
        </span>
        {n.body ? <span className="mt-0.5 line-clamp-3 block text-sm font-normal text-muted">{n.body}</span> : null}
        <span className="mt-1 block text-xs font-normal text-muted">{formatRelative(n.created_at)}</span>
      </span>
    ),
  },
  {
    key: 'category',
    header: t('notifications.columns.about'),
    mobile: 'badge',
    cell: (n) => (
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-fg/80">
        {t(`notifications.category.${categoryOf(n).label}`)}
      </span>
    ),
  },
  {
    key: 'created_at',
    header: t('notifications.columns.received'),
    align: 'end',
    mobile: 'hidden',
    cell: (n) => <DateCell value={n.created_at} display="relative" className="text-muted" />,
  },
];

const FILTERS = { show: filterParam.oneOf(['unread'] as const) };

export function NotificationsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('notifications.title'));
  const navigate = useNavigate();
  const cols = useMemo(() => columns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const unreadOnly = table.filters.show === 'unread';
  const params = { page: table.page, page_size: table.pageSize, ...(unreadOnly ? { unread: true } : {}) };
  const list = useQuery({ queryKey: qk.notifications(params), queryFn: () => notificationsApi.list(params), placeholderData: keepPreviousData });
  const totalAll = useQuery({
    queryKey: qk.notifications({ page: 1, page_size: 1 }),
    queryFn: () => notificationsApi.list({ page: 1, page_size: 1 }),
    select: (p) => p.total,
  });
  const unread = useUnreadCount();
  const mark = useMarkNotificationRead();
  const unreadCount = unread.data?.count ?? 0;

  const tabs = useMemo(
    () => [
      { value: '' as const, label: t('notifications.tabs.all'), count: totalAll.data },
      { value: 'unread' as const, label: t('notifications.tabs.unread'), count: unread.data?.count },
    ],
    [totalAll.data, unread.data, t],
  );

  function open(n: NotificationOut) {
    if (!n.read_at) mark.mutate(n.id);
    const target = notificationTarget(n);
    if (target) navigate(target);
  }

  return (
    <div>
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck className="h-4 w-4" aria-hidden />}
            disabled={unreadCount === 0}
            loading={mark.isPending && mark.variables === 'all'}
            onClick={() =>
              mark.mutate('all', {
                onSuccess: () => toast.success(t('notifications.markedAll')),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {t('notifications.markAll')}
          </Button>
        }
      />
      <DataTable
        id="patient.notifications"
        caption={t('notifications.title')}
        table={table}
        columns={cols}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={open}
        rowLabel={(n) => t('notifications.openRow', { title: n.title })}
        rowClassName={(n) => (n.read_at ? undefined : 'bg-primary-soft/25')}
        showViewOptions={false}
        emptyIcon={<Bell className="size-8" aria-hidden />}
        emptyTitle={t('notifications.empty.title')}
        emptyDescription={t('notifications.empty.description')}
        filtersActive={unreadOnly}
        onResetFilters={table.resetFilters}
        empty={
          unreadOnly && list.data?.total === 0 ? (
            <div className="px-4 py-14 text-center">
              <CheckCheck className="mx-auto size-8 text-success" aria-hidden />
              <p className="mt-3 font-semibold">{t('notifications.caughtUp.title')}</p>
              <p className="mt-1 text-sm text-muted">{t('notifications.caughtUp.description')}</p>
            </div>
          ) : undefined
        }
        header={<TableTabs label={t('notifications.tabs.label')} items={tabs} value={table.filters.show} onChange={(v) => table.setFilter('show', v)} />}
      />
    </div>
  );
}
