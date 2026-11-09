import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, Bell, CheckCircle2, EyeOff, Shapes } from 'lucide-react';
import {
  adminApi,
  STAFF_ROLES,
  USER_ROLE_LABELS,
  type AdminReportListParams,
  type AdminReportOut,
  type ReportAction,
  type ReportStatus,
  type ReportTargetType,
} from '@hig/shared/api';
import { filterParam, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  FilterBar,
  PageHeader,
  PersonCell,
  QuickFilters,
  SelectFilter,
  TextCell,
  reportReasonLabel,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { Button, ConfirmDialog, Drawer, ErrorState, Field, KeyValue, LoadingState, Textarea } from '../ui';
import { Banner } from '../ui/detail';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';

const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const satisfies readonly ReportStatus[];
const TARGET_TYPES = ['message', 'screening_result', 'document_analysis', 'review'] as const satisfies readonly ReportTargetType[];

const STATUS_LABELS: Record<ReportStatus, string> = { open: 'Open', actioned: 'Actioned', dismissed: 'Dismissed' };
const STATUS_TONES: Record<ReportStatus, 'warning' | 'success' | 'neutral'> = {
  open: 'warning',
  actioned: 'success',
  dismissed: 'neutral',
};
const TARGET_LABELS: Record<ReportTargetType, string> = {
  message: 'Chat message',
  screening_result: 'AI screening result',
  document_analysis: 'AI document analysis',
  review: 'Review',
};
const ACTION_LABELS: Record<ReportAction, string> = {
  dismiss: 'Dismissed',
  hide_message: 'Message hidden',
  warn: 'Author warned',
  suspend: 'Author suspended',
};
const NOTE_MAX = 1000;

const FILTERS = {
  status: filterParam.oneOf(REPORT_STATUSES, 'open'),
  target_type: filterParam.oneOf(TARGET_TYPES),
};
type ReportFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: ReportFilters): Omit<AdminReportListParams, 'page' | 'page_size'> {
  return {
    status: f.status || undefined,
    target_type: f.target_type || undefined,
  };
}

const isStaff = (role: string | undefined) => !!role && (STAFF_ROLES as readonly string[]).includes(role);

const COLUMNS: DataTableColumn<AdminReportOut>[] = [
  {
    key: 'reason',
    header: 'Reason',
    sticky: true,
    mobile: 'primary',
    cell: (r) => (
      <TextCell
        primary={reportReasonLabel(r.reason)}
        secondary={TARGET_LABELS[r.target_type] ?? r.target_type}
      />
    ),
    exportValue: (r) => r.reason,
  },
  {
    key: 'excerpt',
    header: 'Content',
    className: 'max-w-80',
    cell: (r) => (
      <span className="line-clamp-2 text-sm text-fg">
        {r.excerpt ?? <span className="text-muted">No preview</span>}
      </span>
    ),
    exportValue: (r) => r.excerpt ?? '',
  },
  {
    key: 'reporter',
    header: 'Reporter',
    hideOnMobile: true,
    cell: (r) =>
      r.reporter ? (
        <PersonCell name={r.reporter.full_name} secondary={USER_ROLE_LABELS[r.reporter.role] ?? r.reporter.role} />
      ) : (
        <span className="text-muted">Deleted user</span>
      ),
    exportValue: (r) => r.reporter?.full_name ?? '',
  },
  {
    key: 'target_user',
    header: 'Author',
    cell: (r) =>
      r.target_user ? (
        <PersonCell name={r.target_user.full_name} secondary={USER_ROLE_LABELS[r.target_user.role] ?? r.target_user.role} />
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (r) => r.target_user?.full_name ?? '',
  },
  {
    key: 'report_count',
    header: 'Reports',
    align: 'end',
    mobile: 'badge',
    cell: (r) => <Badge tone={r.report_count > 1 ? 'danger' : 'neutral'}>{r.report_count}</Badge>,
    exportValue: (r) => r.report_count,
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'badge',
    cell: (r) => (
      <Badge tone={STATUS_TONES[r.status]} dot>
        {STATUS_LABELS[r.status] ?? r.status}
      </Badge>
    ),
    exportValue: (r) => r.status,
  },
  {
    key: 'created_at',
    header: 'Reported',
    mobile: 'meta',
    cell: (r) => <DateCell value={r.created_at} display="datetime" secondary={<DateCell value={r.created_at} display="relative" />} />,
    exportValue: (r) => r.created_at,
  },
];

export default function ModerationPage() {
  useDocumentTitle('Reports');
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const listParams: AdminReportListParams = { ...toApiFilters(filters), page: table.page, page_size: table.pageSize };
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...opsKeys.contentReports, 'list', listParams],
    queryFn: () => adminApi.listContentReports(listParams),
    placeholderData: keepPreviousData,
  });

  const quickItems: QuickFilterItem<ReportStatus>[] = [
    ...REPORT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], tone: STATUS_TONES[s] })),
    { value: '', label: 'All' },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Content people reported: chat messages, AI screening results, AI document analyses and reviews."
      />
      <DataTable
        id="admin.content-reports"
        caption="Content reports"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setSelectedId(r.id)}
        rowLabel={(r) => `Open report: ${reportReasonLabel(r.reason)}`}
        emptyTitle={filters.status === 'open' ? 'No open reports' : 'No reports'}
        emptyDescription="Reports appear here when someone flags content in the apps."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Report status" items={quickItems} value={filters.status} onChange={(s) => setFilter('status', s)} />
          </div>
        }
        toolbar={
          <FilterBar onReset={table.resetFilters}>
            <SelectFilter
              label="Content type"
              icon={<Shapes className="size-3.5 opacity-70" aria-hidden />}
              value={filters.target_type}
              onChange={(v) => setFilter('target_type', v as ReportTargetType | '')}
              options={TARGET_TYPES.map((t) => ({ value: t, label: TARGET_LABELS[t] }))}
            />
          </FilterBar>
        }
      />
      <ReportDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function ReportDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const perms = useOpsPermissions();
  const [note, setNote] = useState('');
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const detail = useQuery({
    queryKey: [...opsKeys.contentReports, 'detail', id],
    queryFn: () => adminApi.getContentReport(id!),
    enabled: !!id,
  });

  const resolve = useOpsMutation({
    mutationFn: (action: ReportAction) => {
      const trimmed = note.trim();
      return adminApi.resolveContentReport(id!, { action, ...(trimmed ? { note: trimmed.slice(0, NOTE_MAX) } : {}) });
    },
    success: (r) => `Report resolved: ${r.action ? ACTION_LABELS[r.action] : 'done'}.`,
    invalidate: [opsKeys.contentReports],
    onSuccess: () => {
      setNote('');
      setConfirmSuspend(false);
      onClose();
    },
  });

  const close = () => {
    if (resolve.isPending) return;
    setNote('');
    setConfirmSuspend(false);
    onClose();
  };

  const r = detail.data;
  const canAct = perms.moderateContent && r?.status === 'open';
  const author = r?.target_user ?? null;
  const authorActionable = !!author && !isStaff(author.role);
  const pendingAction = resolve.isPending ? resolve.variables : undefined;

  return (
    <>
      <Drawer
        open={!!id}
        onClose={close}
        width="lg"
        title={r ? `Report: ${reportReasonLabel(r.reason)}` : 'Report'}
        subtitle={r ? `${TARGET_LABELS[r.target_type] ?? r.target_type} · ${formatDateTime(r.created_at, 'd MMM yyyy, HH:mm')}` : undefined}
        footer={
          canAct ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                loading={pendingAction === 'dismiss'}
                disabled={resolve.isPending}
                onClick={() => resolve.mutate('dismiss')}
              >
                Dismiss
              </Button>
              {r?.target_type === 'message' && (
                <Button
                  variant="outline"
                  icon={<EyeOff className="size-4" aria-hidden />}
                  loading={pendingAction === 'hide_message'}
                  disabled={resolve.isPending || r.message_hidden}
                  onClick={() => resolve.mutate('hide_message')}
                >
                  Hide message
                </Button>
              )}
              <Button
                variant="outline"
                icon={<Bell className="size-4" aria-hidden />}
                loading={pendingAction === 'warn'}
                disabled={resolve.isPending || !authorActionable}
                onClick={() => resolve.mutate('warn')}
              >
                Warn author
              </Button>
              <Button
                variant="danger"
                icon={<Ban className="size-4" aria-hidden />}
                disabled={resolve.isPending || !authorActionable || author?.status === 'suspended'}
                onClick={() => setConfirmSuspend(true)}
              >
                Suspend author
              </Button>
            </div>
          ) : undefined
        }
      >
        {detail.isLoading ? (
          <LoadingState />
        ) : detail.isError ? (
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        ) : r ? (
          <div className="space-y-5">
            {r.report_count > 1 && r.status === 'open' && (
              <Banner tone="warning" title={`${r.report_count} open reports on this content`}>
                Resolving this report also closes the other open reports on the same content.
              </Banner>
            )}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted">Reported content</h3>
              <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words text-fg">
                {r.excerpt ?? <span className="text-muted">No preview available.</span>}
              </div>
              {r.target_type === 'message' && r.message_hidden && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
                  <EyeOff className="size-3.5" aria-hidden /> Hidden by moderators
                </p>
              )}
              {r.conversation_id && (
                <Link
                  to={`${opsPaths.messages}?c=${encodeURIComponent(r.conversation_id)}`}
                  className="mt-1.5 inline-block text-xs text-green-700 hover:underline dark:text-green-400"
                >
                  Open conversation
                </Link>
              )}
            </section>
            <KeyValue
              items={[
                ['Status', <Badge key="s" tone={STATUS_TONES[r.status]} dot>{STATUS_LABELS[r.status] ?? r.status}</Badge>],
                ['Open reports on this content', String(r.report_count)],
                ['Reporter', r.reporter ? `${r.reporter.full_name} (${USER_ROLE_LABELS[r.reporter.role] ?? r.reporter.role})` : 'Deleted user'],
                [
                  'Author',
                  author
                    ? `${author.full_name} (${USER_ROLE_LABELS[author.role] ?? author.role}) · ${author.status}`
                    : 'No author (for example an AI result)',
                ],
                ['Reporter note', r.note || '—'],
                ['Target id', <span key="t" className="font-mono text-xs">{r.target_id}</span>],
              ]}
            />
            {r.status !== 'open' ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted">Resolution</h3>
                <KeyValue
                  items={[
                    ['Action', r.action ? ACTION_LABELS[r.action] : '—'],
                    ['Resolved', r.resolved_at ? formatDateTime(r.resolved_at, 'd MMM yyyy, HH:mm') : '—'],
                    ['Resolved by', r.resolved_by?.full_name ?? '—'],
                    ['Note', r.resolution_note || '—'],
                  ]}
                />
              </section>
            ) : canAct ? (
              <Field label="Moderator note" hint={`Optional, kept with the report (up to ${NOTE_MAX} characters).`}>
                {(fieldId) => (
                  <Textarea id={fieldId} rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
                )}
              </Field>
            ) : null}
            {canAct && !authorActionable && (
              <p className="text-xs text-muted">
                {author ? 'The author is a staff member, so warn and suspend are not available.' : 'There is no author to warn or suspend.'}
              </p>
            )}
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirmSuspend}
        title="Suspend this account?"
        tone="danger"
        confirmLabel="Suspend author"
        loading={resolve.isPending}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => resolve.mutate('suspend')}
        message={
          <>
            <strong>{author?.full_name}</strong> will be signed out and cannot sign in until an admin activates the
            account again. The report is closed as actioned.
          </>
        }
      />
    </>
  );
}
