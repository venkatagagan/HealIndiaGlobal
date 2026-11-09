import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BriefcaseMedical, CalendarCheck, CheckCheck, CreditCard, FileText, MessageSquare, Plane, Stethoscope } from 'lucide-react';
import { errorMessage, notificationsApi, type NotificationOut } from '@hig/shared/api';
import { filterParam, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { DataTable, DateCell, type DataTableColumn } from '@hig/shared/ui';
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

/** "booking.confirmed" -> Bookings (icon + label) */
const CATEGORIES: Record<string, { label: string; icon: typeof Bell; tone: string }> = {
  booking: { label: 'Booking', icon: CalendarCheck, tone: 'bg-success-soft text-success-ink' },
  case: { label: 'Case', icon: BriefcaseMedical, tone: 'bg-primary-soft text-primary-ink' },
  quote: { label: 'Quote', icon: BriefcaseMedical, tone: 'bg-primary-soft text-primary-ink' },
  payment: { label: 'Payment', icon: CreditCard, tone: 'bg-warning-soft text-warning-ink' },
  refund: { label: 'Payment', icon: CreditCard, tone: 'bg-warning-soft text-warning-ink' },
  message: { label: 'Message', icon: MessageSquare, tone: 'bg-info-soft text-info-ink' },
  screening: { label: 'Screening', icon: Stethoscope, tone: 'bg-accent-soft text-accent-ink' },
  travel: { label: 'Trip', icon: Plane, tone: 'bg-info-soft text-info-ink' },
  visa: { label: 'Trip', icon: Plane, tone: 'bg-info-soft text-info-ink' },
  document: { label: 'Document', icon: FileText, tone: 'bg-neutral-soft text-neutral-ink' },
};
const categoryOf = (n: NotificationOut) => CATEGORIES[n.kind.split('.')[0] ?? ''] ?? { label: 'Update', icon: Bell, tone: 'bg-neutral-soft text-neutral-ink' };

const COLUMNS: DataTableColumn<NotificationOut>[] = [
  {
    key: 'title',
    header: 'Notification',
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
              {!n.read_at ? <span className="sr-only"> (unread)</span> : null}
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
    header: 'About',
    mobile: 'badge',
    cell: (n) => <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-fg/80">{categoryOf(n).label}</span>,
  },
  {
    key: 'created_at',
    header: 'Received',
    align: 'end',
    mobile: 'hidden',
    cell: (n) => <DateCell value={n.created_at} display="relative" className="text-muted" />,
  },
];

const FILTERS = { show: filterParam.oneOf(['unread'] as const) };

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const navigate = useNavigate();
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
      { value: '' as const, label: 'All', count: totalAll.data },
      { value: 'unread' as const, label: 'Unread', count: unread.data?.count },
    ],
    [totalAll.data, unread.data],
  );

  function open(n: NotificationOut) {
    if (!n.read_at) mark.mutate(n.id);
    const target = notificationTarget(n);
    if (target) navigate(target);
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Updates about your cases, bookings, payments and messages."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck className="h-4 w-4" aria-hidden />}
            disabled={unreadCount === 0}
            loading={mark.isPending && mark.variables === 'all'}
            onClick={() =>
              mark.mutate('all', {
                onSuccess: () => toast.success('All notifications marked as read'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Mark all as read
          </Button>
        }
      />
      <DataTable
        id="patient.notifications"
        caption="Notifications"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={open}
        rowLabel={(n) => `Open notification: ${n.title}`}
        rowClassName={(n) => (n.read_at ? undefined : 'bg-primary-soft/25')}
        showViewOptions={false}
        emptyIcon={<Bell className="size-8" aria-hidden />}
        emptyTitle="No notifications yet"
        emptyDescription="We will let you know here when a hospital sends a quote, a payment is received or your trip is updated."
        filtersActive={unreadOnly}
        onResetFilters={table.resetFilters}
        empty={
          unreadOnly && list.data?.total === 0 ? (
            <div className="px-4 py-14 text-center">
              <CheckCheck className="mx-auto size-8 text-success" aria-hidden />
              <p className="mt-3 font-semibold">You are all caught up</p>
              <p className="mt-1 text-sm text-muted">There are no unread notifications.</p>
            </div>
          ) : undefined
        }
        header={<TableTabs label="Show" items={tabs} value={table.filters.show} onChange={(v) => table.setFilter('show', v)} />}
      />
    </div>
  );
}
