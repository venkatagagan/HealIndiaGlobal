import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import { errorMessage, humanize, notificationsApi, type NotificationOut } from '@hig/shared/api';
import { Badge, DataTable, DateCell, QuickFilters, type DataTableColumn, type QuickFilterItem } from '@hig/shared/ui';
import { Button, PageHeader } from '../../components/ui';
import { qk, useUnreadCount } from '../../lib/queries';
import { cn, filterParam, useDocumentTitle, useTableState } from '../../lib/shared';

function str(data: Record<string, unknown> | null, key: string): string | null {
  const v = data?.[key];
  return typeof v === 'string' && v ? v : null;
}

/** Deep link for a notification based on its data payload. */
export function notificationLink(n: NotificationOut): string | null {
  const d = n.data;
  const conversation = str(d, 'conversation_id');
  if (n.kind.startsWith('message') && conversation) return `/messages/${conversation}`;
  const screening = str(d, 'screening_id');
  if (n.kind.startsWith('screening') && screening) return `/screenings/${screening}`;
  const caseId = str(d, 'case_id');
  if (caseId) return `/cases/${caseId}`;
  if (n.kind.startsWith('payout') || n.kind.startsWith('settlement') || n.kind.startsWith('commission')) return '/commissions';
  if (n.kind.startsWith('agent.')) return '/profile';
  return null;
}

const CATEGORY_LABELS: Record<string, string> = {
  message: 'Messages',
  case: 'Cases',
  quote: 'Quotes',
  booking: 'Bookings',
  payment: 'Payments',
  screening: 'Screenings',
  payout: 'Payouts',
  settlement: 'Commission',
  commission: 'Commission',
  agent: 'Account',
  consent: 'Consent',
  document: 'Documents',
};
const category = (n: NotificationOut) => {
  const head = n.kind.split('.')[0] ?? n.kind;
  return CATEGORY_LABELS[head] ?? humanize(head);
};

const VIEWS = ['unread'] as const;
const FILTERS = { view: filterParam.oneOf(VIEWS) };

const COLUMNS: DataTableColumn<NotificationOut>[] = [
  {
    key: 'notification',
    header: 'Notification',
    mobile: 'primary',
    className: 'max-w-[40rem]',
    cell: (n) => (
      <span className="flex items-start gap-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-hidden />
        <span className="min-w-0">
          <span className={cn('block truncate text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
          {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
          {!n.read_at && <span className="sr-only">Unread</span>}
        </span>
      </span>
    ),
    mobileCell: (n) => <span className={cn(!n.read_at && 'font-semibold')}>{n.title}</span>,
    exportValue: (n) => n.title,
  },
  {
    key: 'category',
    header: 'Category',
    mobile: 'badge',
    cell: (n) => (
      <Badge tone="neutral" className="whitespace-nowrap">
        {category(n)}
      </Badge>
    ),
    exportValue: (n) => category(n),
  },
  {
    key: 'received',
    header: 'Received',
    cell: (n) => <DateCell value={n.created_at} display="relative" className="text-muted" />,
    exportValue: (n) => n.created_at,
  },
];

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const unreadOnly = table.filters.view === 'unread';
  const params = { page: table.page, page_size: table.pageSize, ...(unreadOnly ? { unread: true } : {}) };

  const query = useQuery({
    queryKey: qk.notifications(params),
    queryFn: () => notificationsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const totalAll = useQuery({
    queryKey: qk.notifications({ total: true }),
    queryFn: () => notificationsApi.list({ page: 1, page_size: 1 }),
    select: (p) => p.total,
  });
  const unread = useUnreadCount();

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markMany = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await notificationsApi.markRead(id);
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      toast.success('All notifications marked as read');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const open = (n: NotificationOut) => {
    if (!n.read_at) markRead.mutate(n.id);
    const link = notificationLink(n);
    if (link) navigate(link);
  };

  const quickItems: QuickFilterItem<'unread'>[] = [
    { value: '', label: 'All', count: totalAll.data },
    { value: 'unread', label: 'Unread', count: unread.data?.count },
  ];

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Updates on your patients’ cases, quotes, bookings and commission."
        actions={
          <Button
            variant="outline"
            icon={<CheckCheck className="h-4 w-4" aria-hidden />}
            loading={markAll.isPending}
            disabled={unread.data?.count === 0}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        }
      />
      <DataTable
        id="agent.notifications"
        caption="Notifications"
        table={table}
        columns={COLUMNS}
        rows={query.data?.items}
        total={query.data?.total}
        loading={query.isLoading}
        fetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={open}
        rowLabel={(n) => `Open notification: ${n.title}`}
        rowClassName={(n) => (n.read_at ? undefined : 'bg-primary-soft/30')}
        selectable
        bulkActions={(selected, clear) => (
          <Button
            size="sm"
            variant="outline"
            icon={<CheckCheck className="h-4 w-4" aria-hidden />}
            loading={markMany.isPending}
            disabled={!selected.some((n) => !n.read_at)}
            onClick={() => markMany.mutate(selected.filter((n) => !n.read_at).map((n) => n.id), { onSuccess: clear })}
          >
            Mark as read
          </Button>
        )}
        emptyIcon={<Bell className="size-6" aria-hidden />}
        emptyTitle={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}
        emptyDescription={unreadOnly ? 'There are no unread notifications.' : 'Updates about your patients will appear here.'}
        filtersActive={false}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Notification filter" items={quickItems} value={table.filters.view} onChange={(v) => table.setFilter('view', v)} />
          </div>
        }
      />
    </div>
  );
}
