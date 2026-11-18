import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import { errorMessage, humanize, notificationsApi, type NotificationOut } from '@hig/shared/api';
import { Badge, DataTable, DateCell, QuickFilters, type DataTableColumn, type QuickFilterItem } from '@hig/shared/ui';
import { Button, PageHeader } from '../../components/ui';
import { qk, useUnreadCount } from '../../lib/queries';
import { cn, filterParam, useDocumentTitle, useTableState } from '../../lib/shared';
import { useAppTranslation, type AppT } from '../../i18n';

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

const CATEGORY_KEYS: Record<string, string> = {
  message: 'notifications.category.messages',
  case: 'notifications.category.cases',
  quote: 'notifications.category.quotes',
  booking: 'notifications.category.bookings',
  payment: 'notifications.category.payments',
  screening: 'notifications.category.screenings',
  payout: 'notifications.category.payouts',
  settlement: 'notifications.category.commission',
  commission: 'notifications.category.commission',
  agent: 'notifications.category.account',
  consent: 'notifications.category.consent',
  document: 'notifications.category.documents',
};
const category = (t: AppT, n: NotificationOut) => {
  const head = n.kind.split('.')[0] ?? n.kind;
  const key = CATEGORY_KEYS[head];
  return key ? t(key) : humanize(head);
};

const VIEWS = ['unread'] as const;
const FILTERS = { view: filterParam.oneOf(VIEWS) };

const columns = (t: AppT): DataTableColumn<NotificationOut>[] => [
  {
    key: 'notification',
    header: t('notifications.columns.notification'),
    mobile: 'primary',
    className: 'max-w-[40rem]',
    cell: (n) => (
      <span className="flex items-start gap-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-hidden />
        <span className="min-w-0">
          <span className={cn('block truncate text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
          {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
          {!n.read_at && <span className="sr-only">{t('notifications.unread')}</span>}
        </span>
      </span>
    ),
    mobileCell: (n) => <span className={cn(!n.read_at && 'font-semibold')}>{n.title}</span>,
    exportValue: (n) => n.title,
  },
  {
    key: 'category',
    header: t('notifications.columns.category'),
    mobile: 'badge',
    cell: (n) => (
      <Badge tone="neutral" className="whitespace-nowrap">
        {category(t, n)}
      </Badge>
    ),
    exportValue: (n) => category(t, n),
  },
  {
    key: 'received',
    header: t('notifications.columns.received'),
    cell: (n) => <DateCell value={n.created_at} display="relative" className="text-muted" />,
    exportValue: (n) => n.created_at,
  },
];

export function NotificationsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('notifications.title'));
  const COLUMNS = useMemo(() => columns(t), [t]);
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
      toast.success(t('notifications.allMarked'));
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
    { value: '', label: t('notifications.quick.all'), count: totalAll.data },
    { value: 'unread', label: t('notifications.quick.unread'), count: unread.data?.count },
  ];

  return (
    <div>
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.description')}
        actions={
          <Button
            variant="outline"
            icon={<CheckCheck className="h-4 w-4" aria-hidden />}
            loading={markAll.isPending}
            disabled={unread.data?.count === 0}
            onClick={() => markAll.mutate()}
          >
            {t('notifications.markAll')}
          </Button>
        }
      />
      <DataTable
        id="agent.notifications"
        caption={t('notifications.title')}
        table={table}
        columns={COLUMNS}
        rows={query.data?.items}
        total={query.data?.total}
        loading={query.isLoading}
        fetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={open}
        rowLabel={(n) => t('notifications.openRow', { title: n.title })}
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
            {t('notifications.markRead')}
          </Button>
        )}
        emptyIcon={<Bell className="size-6" aria-hidden />}
        emptyTitle={unreadOnly ? t('notifications.caughtUp') : t('notifications.emptyTitle')}
        emptyDescription={unreadOnly ? t('notifications.noUnread') : t('notifications.emptyDescription')}
        filtersActive={false}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('notifications.filterLabel')} items={quickItems} value={table.filters.view} onChange={(v) => table.setFilter('view', v)} />
          </div>
        }
      />
    </div>
  );
}
