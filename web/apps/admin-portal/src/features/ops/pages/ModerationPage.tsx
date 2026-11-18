import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
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
import { useAppTranslation } from '../../../i18n';
import { Button, ConfirmDialog, Drawer, ErrorState, Field, KeyValue, LoadingState, Textarea } from '../ui';
import { Banner } from '../ui/detail';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';

const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const satisfies readonly ReportStatus[];
const TARGET_TYPES = ['message', 'screening_result', 'document_analysis', 'review'] as const satisfies readonly ReportTargetType[];

const STATUS_TONES: Record<ReportStatus, 'warning' | 'success' | 'neutral'> = {
  open: 'warning',
  actioned: 'success',
  dismissed: 'neutral',
};
const statusLabel = (t: TFunction, status: ReportStatus) => t(`moderation.status.${status}`, { defaultValue: status });
const targetLabel = (t: TFunction, target: ReportTargetType) => t(`moderation.targets.${target}`, { defaultValue: target });
const actionLabel = (t: TFunction, action: ReportAction) => t(`moderation.actions.${action}`, { defaultValue: action });
const roleLabel = (role: string) => USER_ROLE_LABELS[role as keyof typeof USER_ROLE_LABELS] ?? role;
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

const columnsFor = (t: TFunction): DataTableColumn<AdminReportOut>[] => [
  {
    key: 'reason',
    header: t('moderation.columns.reason'),
    sticky: true,
    mobile: 'primary',
    cell: (r) => <TextCell primary={reportReasonLabel(r.reason)} secondary={targetLabel(t, r.target_type)} />,
    exportValue: (r) => r.reason,
  },
  {
    key: 'excerpt',
    header: t('moderation.columns.content'),
    className: 'max-w-80',
    cell: (r) => (
      <span className="line-clamp-2 text-sm text-fg">{r.excerpt ?? <span className="text-muted">{t('moderation.noPreview')}</span>}</span>
    ),
    exportValue: (r) => r.excerpt ?? '',
  },
  {
    key: 'reporter',
    header: t('moderation.columns.reporter'),
    hideOnMobile: true,
    cell: (r) =>
      r.reporter ? (
        <PersonCell name={r.reporter.full_name} secondary={roleLabel(r.reporter.role)} />
      ) : (
        <span className="text-muted">{t('moderation.deletedUser')}</span>
      ),
    exportValue: (r) => r.reporter?.full_name ?? '',
  },
  {
    key: 'target_user',
    header: t('moderation.columns.author'),
    cell: (r) =>
      r.target_user ? (
        <PersonCell name={r.target_user.full_name} secondary={roleLabel(r.target_user.role)} />
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (r) => r.target_user?.full_name ?? '',
  },
  {
    key: 'report_count',
    header: t('moderation.columns.reports'),
    align: 'end',
    mobile: 'badge',
    cell: (r) => <Badge tone={r.report_count > 1 ? 'danger' : 'neutral'}>{r.report_count}</Badge>,
    exportValue: (r) => r.report_count,
  },
  {
    key: 'status',
    header: t('moderation.columns.status'),
    mobile: 'badge',
    cell: (r) => (
      <Badge tone={STATUS_TONES[r.status]} dot>
        {statusLabel(t, r.status)}
      </Badge>
    ),
    exportValue: (r) => r.status,
  },
  {
    key: 'created_at',
    header: t('moderation.columns.reported'),
    mobile: 'meta',
    cell: (r) => <DateCell value={r.created_at} display="datetime" secondary={<DateCell value={r.created_at} display="relative" />} />,
    exportValue: (r) => r.created_at,
  },
];

export default function ModerationPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('moderation.title'));
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const listParams: AdminReportListParams = { ...toApiFilters(filters), page: table.page, page_size: table.pageSize };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const columns = useMemo(() => columnsFor(t), [t]);

  const list = useQuery({
    queryKey: [...opsKeys.contentReports, 'list', listParams],
    queryFn: () => adminApi.listContentReports(listParams),
    placeholderData: keepPreviousData,
  });

  const quickItems: QuickFilterItem<ReportStatus>[] = [
    ...REPORT_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s), tone: STATUS_TONES[s] })),
    { value: '', label: t('moderation.all') },
  ];

  return (
    <div>
      <PageHeader title={t('moderation.title')} description={t('moderation.description')} />
      <DataTable
        id="admin.content-reports"
        caption={t('moderation.caption')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setSelectedId(r.id)}
        rowLabel={(r) => t('moderation.openRow', { reason: reportReasonLabel(r.reason) })}
        emptyTitle={filters.status === 'open' ? t('moderation.emptyOpen') : t('moderation.empty')}
        emptyDescription={t('moderation.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('moderation.statusFilter')} items={quickItems} value={filters.status} onChange={(s) => setFilter('status', s)} />
          </div>
        }
        toolbar={
          <FilterBar onReset={table.resetFilters}>
            <SelectFilter
              label={t('moderation.contentType')}
              icon={<Shapes className="size-3.5 opacity-70" aria-hidden />}
              value={filters.target_type}
              onChange={(v) => setFilter('target_type', v as ReportTargetType | '')}
              options={TARGET_TYPES.map((type) => ({ value: type, label: targetLabel(t, type) }))}
            />
          </FilterBar>
        }
      />
      <ReportDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function ReportDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useAppTranslation();
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
    success: (r) => t('moderation.toast.resolved', { action: r.action ? actionLabel(t, r.action) : t('moderation.toast.done') }),
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
        title={r ? t('moderation.drawerTitle', { reason: reportReasonLabel(r.reason) }) : t('moderation.drawerTitleEmpty')}
        subtitle={r ? `${targetLabel(t, r.target_type)} · ${formatDateTime(r.created_at, 'd MMM yyyy, HH:mm')}` : undefined}
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
                {t('moderation.buttons.dismiss')}
              </Button>
              {r?.target_type === 'message' && (
                <Button
                  variant="outline"
                  icon={<EyeOff className="size-4" aria-hidden />}
                  loading={pendingAction === 'hide_message'}
                  disabled={resolve.isPending || r.message_hidden}
                  onClick={() => resolve.mutate('hide_message')}
                >
                  {t('moderation.buttons.hideMessage')}
                </Button>
              )}
              <Button
                variant="outline"
                icon={<Bell className="size-4" aria-hidden />}
                loading={pendingAction === 'warn'}
                disabled={resolve.isPending || !authorActionable}
                onClick={() => resolve.mutate('warn')}
              >
                {t('moderation.buttons.warn')}
              </Button>
              <Button
                variant="danger"
                icon={<Ban className="size-4" aria-hidden />}
                disabled={resolve.isPending || !authorActionable || author?.status === 'suspended'}
                onClick={() => setConfirmSuspend(true)}
              >
                {t('moderation.buttons.suspend')}
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
              <Banner tone="warning" title={t('moderation.multipleTitle', { count: r.report_count })}>
                {t('moderation.multipleBody')}
              </Banner>
            )}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted">{t('moderation.reportedContent')}</h3>
              <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words text-fg">
                {r.excerpt ?? <span className="text-muted">{t('moderation.noPreviewAvailable')}</span>}
              </div>
              {r.target_type === 'message' && r.message_hidden && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
                  <EyeOff className="size-3.5" aria-hidden /> {t('moderation.hiddenByModerators')}
                </p>
              )}
              {r.conversation_id && (
                <Link
                  to={`${opsPaths.messages}?c=${encodeURIComponent(r.conversation_id)}`}
                  className="mt-1.5 inline-block text-xs text-green-700 hover:underline dark:text-green-400"
                >
                  {t('moderation.openConversation')}
                </Link>
              )}
            </section>
            <KeyValue
              items={[
                [
                  t('moderation.fields.status'),
                  <Badge key="s" tone={STATUS_TONES[r.status]} dot>
                    {statusLabel(t, r.status)}
                  </Badge>,
                ],
                [t('moderation.fields.openReports'), String(r.report_count)],
                [
                  t('moderation.fields.reporter'),
                  r.reporter ? `${r.reporter.full_name} (${roleLabel(r.reporter.role)})` : t('moderation.deletedUser'),
                ],
                [
                  t('moderation.fields.author'),
                  author ? `${author.full_name} (${roleLabel(author.role)}) · ${author.status}` : t('moderation.noAuthor'),
                ],
                [t('moderation.fields.reporterNote'), r.note || '—'],
                [t('moderation.fields.targetId'), <span key="t" className="font-mono text-xs">{r.target_id}</span>],
              ]}
            />
            {r.status !== 'open' ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted">{t('moderation.resolution')}</h3>
                <KeyValue
                  items={[
                    [t('moderation.fields.action'), r.action ? actionLabel(t, r.action) : '—'],
                    [t('moderation.fields.resolved'), r.resolved_at ? formatDateTime(r.resolved_at, 'd MMM yyyy, HH:mm') : '—'],
                    [t('moderation.fields.resolvedBy'), r.resolved_by?.full_name ?? '—'],
                    [t('moderation.fields.note'), r.resolution_note || '—'],
                  ]}
                />
              </section>
            ) : canAct ? (
              <Field label={t('moderation.moderatorNote')} hint={t('moderation.moderatorNoteHint', { max: NOTE_MAX })}>
                {(fieldId) => (
                  <Textarea id={fieldId} rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
                )}
              </Field>
            ) : null}
            {canAct && !authorActionable && (
              <p className="text-xs text-muted">{author ? t('moderation.authorIsStaff') : t('moderation.noAuthorToAct')}</p>
            )}
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirmSuspend}
        title={t('moderation.suspendTitle')}
        tone="danger"
        confirmLabel={t('moderation.buttons.suspend')}
        loading={resolve.isPending}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => resolve.mutate('suspend')}
        message={
          <Trans t={t} i18nKey="moderation.suspendMessage" values={{ name: author?.full_name ?? '' }} components={{ 0: <strong /> }} />
        }
      />
    </>
  );
}
