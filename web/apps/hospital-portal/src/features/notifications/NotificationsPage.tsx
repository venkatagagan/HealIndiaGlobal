import { useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import { errorMessage, notificationsApi, type NotificationListParams, type NotificationOut } from '@hig/shared/api';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs } from '../../components/ui';
import { cn, formatDateTime, formatRelative } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

/** Deep link for a notification based on ids in its data payload. */
function linkFor(n: NotificationOut): string | null {
  const data = n.data ?? {};
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : null);
  if (str('conversation_id')) return `/messages?c=${encodeURIComponent(str('conversation_id')!)}`;
  if (str('booking_id')) return `/bookings/${str('booking_id')}`;
  if (str('case_id')) return `/cases/${str('case_id')}`;
  if (n.kind.startsWith('payout') || n.kind.startsWith('settlement')) return '/finance';
  if (n.kind.startsWith('hospital.')) return '/profile';
  return null;
}

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const params: NotificationListParams = { page, page_size: 20, ...(unreadOnly ? { unread: true } : {}) };
  const list = useQuery({
    queryKey: qk.notifications(params),
    queryFn: () => notificationsApi.list(params),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), onSuccess: invalidate });
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
    const to = linkFor(n);
    if (to) navigate(to);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <Button variant="outline" icon={<CheckCheck className="h-4 w-4" aria-hidden />} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        }
      />
      <Card>
        <Tabs
          className="px-3"
          tabs={[
            { value: 'all' as const, label: 'All' },
            { value: 'unread' as const, label: 'Unread' },
          ]}
          value={unreadOnly ? 'unread' : 'all'}
          onChange={(v) => {
            setUnreadOnly(v === 'unread');
            setPage(1);
          }}
        />
        {list.isPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Bell className="h-6 w-6" aria-hidden />} title={unreadOnly ? 'You are all caught up' : 'No notifications yet'} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-raised-dark/40',
                      !n.read_at && 'bg-brand-50/40 dark:bg-brand-500/5',
                    )}
                  >
                    <span
                      className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand-500')}
                      aria-label={n.read_at ? undefined : 'Unread'}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">{n.body}</span>}
                      <span className="mt-1 block text-xs text-slate-500" title={formatDateTime(n.created_at)}>
                        {formatRelative(n.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
