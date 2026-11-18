/**
 * Free intro calls (guests and new patients get one 15-minute video call with a coordinator). Coordinators
 * (support | admin | super_admin) schedule the call - a Jitsi link is created when no link is given -, assign
 * it, keep notes and mark it done or cancelled. Unscheduled requests come first.
 */
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { CalendarClock, CheckCircle2, Copy, ExternalLink, Mail, Phone, UserCheck, Video, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@hig/shared/api';
import { filterParam, useTableState } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  FilterBar,
  PageHeader,
  PersonCell,
  QuickFilters,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Button, Checkbox, ConfirmDialog, Drawer, Field, Input, KeyValue, Select, Textarea } from '../ui';
import { Banner } from '../ui/detail';
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';
import {
  INTRO_STATUSES,
  phase1AdminApi,
  phase1Keys,
  type IntroConsultationAdminOut,
  type IntroConsultationUpdate,
  type IntroStatus,
} from '../lib/phase1Api';

const STATUS_TONES: Record<IntroStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  requested: 'warning',
  scheduled: 'info',
  completed: 'success',
  cancelled: 'neutral',
};
const COORDINATOR_ROLES = new Set(['support', 'admin', 'super_admin']);
const NOTES_MAX = 5000;

const FILTERS = {
  status: filterParam.oneOf(INTRO_STATUSES),
  mine: filterParam.text(),
};

function StatusPill({ status }: { status: IntroStatus }) {
  const { t } = useAppTranslation();
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>
      {t(`intro.status.${status}`)}
    </Badge>
  );
}

function preferredWindow(t: TFunction, r: IntroConsultationAdminOut): string {
  if (!r.preferred_from && !r.preferred_to) return t('intro.anyTime');
  const from = r.preferred_from ? formatDateTime(r.preferred_from) : '…';
  const to = r.preferred_to ? formatDateTime(r.preferred_to) : '…';
  return t('intro.window', { from, to });
}

const columnsFor = (t: TFunction): DataTableColumn<IntroConsultationAdminOut>[] => [
  {
    key: 'name',
    header: t('intro.columns.person'),
    sticky: true,
    mobile: 'primary',
    cell: (r) => (
      <PersonCell
        name={r.full_name}
        secondary={r.is_guest ? t('intro.guest') : t('intro.registered')}
      />
    ),
    exportValue: (r) => r.full_name,
  },
  {
    key: 'contact',
    header: t('intro.columns.contact'),
    hideOnMobile: true,
    cell: (r) => (
      <span className="inline-flex items-center gap-1.5 text-sm" dir="ltr">
        {r.contact_channel === 'email' ? <Mail className="size-3.5 text-muted" aria-hidden /> : <Phone className="size-3.5 text-muted" aria-hidden />}
        {r.contact}
      </span>
    ),
    exportValue: (r) => r.contact,
  },
  {
    key: 'when',
    header: t('intro.columns.when'),
    mobile: 'secondary',
    cell: (r) =>
      r.scheduled_at ? (
        <DateCell value={r.scheduled_at} display="datetime" secondary={<DateCell value={r.scheduled_at} display="relative" />} />
      ) : (
        <span className="text-xs text-muted">{preferredWindow(t, r)}</span>
      ),
    exportValue: (r) => r.scheduled_at ?? '',
  },
  {
    key: 'coordinator',
    header: t('intro.columns.coordinator'),
    hideOnMobile: true,
    cell: (r) => r.coordinator_name ?? <span className="text-muted">{t('intro.unassigned')}</span>,
    exportValue: (r) => r.coordinator_name ?? '',
  },
  {
    key: 'status',
    header: t('intro.columns.status'),
    mobile: 'badge',
    cell: (r) => <StatusPill status={r.status} />,
    exportValue: (r) => r.status,
  },
  {
    key: 'created_at',
    header: t('intro.columns.requested'),
    mobile: 'meta',
    cell: (r) => <DateCell value={r.created_at} display="relative" />,
    exportValue: (r) => r.created_at,
  },
];

export default function IntroConsultationsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('intro.title'));
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const columns = useMemo(() => columnsFor(t), [t]);
  const params = {
    status: (filters.status || undefined) as IntroStatus | undefined,
    mine: filters.mine === '1' ? true : undefined,
    page: table.page,
    page_size: table.pageSize,
  };
  const list = useQuery({
    queryKey: [...phase1Keys.intro, 'list', params],
    queryFn: () => phase1AdminApi.listIntroConsultations(params),
    placeholderData: keepPreviousData,
  });
  const selected = list.data?.items.find((r) => r.id === selectedId) ?? null;

  const quickItems: QuickFilterItem<IntroStatus>[] = [
    { value: '', label: t('intro.all') },
    ...INTRO_STATUSES.map((s) => ({ value: s, label: t(`intro.status.${s}`), tone: STATUS_TONES[s] })),
  ];

  return (
    <div>
      <PageHeader title={t('intro.title')} description={t('intro.description')} />
      <DataTable
        id="admin.intro-consultations"
        caption={t('intro.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setSelectedId(r.id)}
        rowLabel={(r) => t('intro.openRow', { name: r.full_name })}
        emptyTitle={t('intro.empty')}
        emptyDescription={t('intro.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('intro.statusFilter')} items={quickItems} value={filters.status} onChange={(s) => setFilter('status', s)} />
          </div>
        }
        toolbar={
          <FilterBar onReset={table.resetFilters}>
            <Checkbox label={t('intro.mineOnly')} checked={filters.mine === '1'} onChange={(v) => setFilter('mine', v ? '1' : '')} />
          </FilterBar>
        }
      />
      <IntroDrawer intro={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function IntroDrawer({ intro, onClose }: { intro: IntroConsultationAdminOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const canManage = perms.moderateContent; // support | admin | super_admin
  const staff = useQuery({ queryKey: [...opsKeys.staff, 'all'], queryFn: () => adminApi.listStaff(), staleTime: 5 * 60_000 });
  const coordinatorOptions = useMemo(
    () => (staff.data ?? []).filter((s) => COORDINATOR_ROLES.has(s.role)).map((s) => ({ value: s.id, label: s.full_name })),
    [staff.data],
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [coordinator, setCoordinator] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'completed' | 'cancelled' | null>(null);

  useEffect(() => {
    setScheduledAt(toDateTimeLocal(intro?.scheduled_at));
    setMeetingUrl(intro?.meeting_url ?? '');
    setCoordinator(intro?.coordinator_user_id ?? '');
    setNotes(intro?.coordinator_notes ?? '');
    setError(null);
  }, [intro?.id, intro?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useOpsMutation({
    mutationFn: (body: IntroConsultationUpdate) => phase1AdminApi.updateIntroConsultation(intro!.id, body),
    success: (r) =>
      r.status === 'completed'
        ? t('intro.toast.completed')
        : r.status === 'cancelled'
          ? t('intro.toast.cancelled')
          : r.status === 'scheduled'
            ? t('intro.toast.scheduled', { when: r.scheduled_at ? formatDateTime(r.scheduled_at) : '' })
            : t('intro.toast.saved'),
    invalidate: [phase1Keys.intro],
    onSuccess: () => setConfirm(null),
  });

  const open = intro?.status === 'requested' || intro?.status === 'scheduled';
  const save = () => {
    if (!intro) return;
    const body: IntroConsultationUpdate = {};
    const iso = fromDateTimeLocal(scheduledAt);
    if (scheduledAt && !iso) return setError(t('intro.form.invalidDate'));
    if (iso && new Date(iso).getTime() <= Date.now()) return setError(t('intro.form.pastDate'));
    const url = meetingUrl.trim();
    if (url && !/^https:\/\/\S+$/i.test(url)) return setError(t('intro.form.httpsOnly'));
    setError(null);
    if (iso && iso !== (intro.scheduled_at ? new Date(intro.scheduled_at).toISOString() : null)) body.scheduled_at = iso;
    if (url && url !== (intro.meeting_url ?? '')) body.meeting_url = url;
    if (coordinator && coordinator !== (intro.coordinator_user_id ?? '')) body.coordinator_user_id = coordinator;
    if (notes.trim() !== (intro.coordinator_notes ?? '')) body.coordinator_notes = notes.trim() || null;
    if (Object.keys(body).length === 0) {
      toast.info(t('intro.toast.noChanges'));
      return;
    }
    update.mutate(body);
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('intro.toast.linkCopied'));
    } catch {
      toast.error(t('intro.toast.copyFailed'));
    }
  };

  const r = intro;
  return (
    <>
      <Drawer
        open={!!r}
        onClose={() => !update.isPending && onClose()}
        width="lg"
        title={r ? r.full_name : t('intro.title')}
        subtitle={r ? t('intro.drawerSubtitle', { minutes: r.duration_min, date: formatDateTime(r.created_at) }) : undefined}
        footer={
          r && canManage && open ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" icon={<XCircle className="size-4" aria-hidden />} disabled={update.isPending} onClick={() => setConfirm('cancelled')}>
                {t('intro.actions.cancel')}
              </Button>
              {r.status === 'scheduled' && (
                <Button variant="outline" icon={<CheckCircle2 className="size-4" aria-hidden />} disabled={update.isPending} onClick={() => setConfirm('completed')}>
                  {t('intro.actions.complete')}
                </Button>
              )}
              <Button icon={<CalendarClock className="size-4" aria-hidden />} loading={update.isPending && !confirm} onClick={save}>
                {r.status === 'requested' && scheduledAt ? t('intro.actions.schedule') : t('intro.actions.save')}
              </Button>
            </div>
          ) : undefined
        }
      >
        {r && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={r.status} />
              <Badge tone="neutral">{r.is_guest ? t('intro.guest') : t('intro.registered')}</Badge>
            </div>
            {r.meeting_url && (
              <Banner
                tone="info"
                icon={<Video className="size-5" aria-hidden />}
                title={r.scheduled_at ? t('intro.callAt', { when: formatDateTime(r.scheduled_at) }) : t('intro.meetingLink')}
                action={
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" icon={<Copy className="size-3.5" aria-hidden />} onClick={() => void copyLink(r.meeting_url!)}>
                      {t('intro.copyLink')}
                    </Button>
                    <a
                      href={r.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-fg"
                    >
                      <ExternalLink className="size-3.5" aria-hidden /> {t('intro.join')}
                    </a>
                  </div>
                }
              >
                <span className="break-all" dir="ltr">
                  {r.meeting_url}
                </span>
              </Banner>
            )}
            <KeyValue
              items={[
                [t('intro.fields.contact'), <span key="c" dir="ltr">{r.contact}</span>],
                [t('intro.fields.channel'), t(`intro.channels.${r.contact_channel}`)],
                [t('intro.fields.preferred'), preferredWindow(t, r)],
                [t('intro.fields.timezone'), r.timezone ?? '—'],
                [t('intro.fields.coordinator'), r.coordinator_name ?? t('intro.unassigned')],
                [t('intro.fields.attachments'), t('intro.attachments', { count: r.document_ids.length + (r.screening_id ? 1 : 0) })],
              ]}
            />
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{t('intro.fields.question')}</h3>
              <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg">
                {r.question || <span className="text-muted">{t('intro.noQuestion')}</span>}
              </p>
            </section>
            {canManage && open ? (
              <section className="grid gap-3 sm:grid-cols-2">
                <Field label={t('intro.form.when')} hint={t('intro.form.whenHint')}>
                  {(id) => <Input id={id} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}
                </Field>
                <Field label={t('intro.form.coordinator')}>
                  {(id) => (
                    <Select
                      id={id}
                      value={coordinator}
                      onChange={(e) => setCoordinator(e.target.value)}
                      options={coordinatorOptions}
                      placeholder={t('intro.form.coordinatorPlaceholder')}
                    />
                  )}
                </Field>
                <Field label={t('intro.form.meetingUrl')} hint={t('intro.form.meetingUrlHint')} className="sm:col-span-2">
                  {(id) => (
                    <Input id={id} type="url" dir="ltr" placeholder="https://" value={meetingUrl} maxLength={500} onChange={(e) => setMeetingUrl(e.target.value)} />
                  )}
                </Field>
                <Field label={t('intro.form.notes')} hint={t('intro.form.notesHint')} className="sm:col-span-2">
                  {(id) => <Textarea id={id} rows={4} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />}
                </Field>
                {error && (
                  <p role="alert" className="text-xs text-danger-ink sm:col-span-2">
                    {error}
                  </p>
                )}
                {!coordinator && (
                  <p className="flex items-center gap-1 text-xs text-muted sm:col-span-2">
                    <UserCheck className="size-3.5" aria-hidden /> {t('intro.form.selfAssign')}
                  </p>
                )}
              </section>
            ) : (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{t('intro.form.notes')}</h3>
                <p className="whitespace-pre-wrap break-words text-sm text-fg">{r.coordinator_notes || '—'}</p>
              </section>
            )}
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm !== null}
        tone={confirm === 'cancelled' ? 'danger' : 'primary'}
        title={confirm === 'cancelled' ? t('intro.confirm.cancelTitle') : t('intro.confirm.completeTitle')}
        message={confirm === 'cancelled' ? t('intro.confirm.cancelMessage') : t('intro.confirm.completeMessage')}
        confirmLabel={confirm === 'cancelled' ? t('intro.actions.cancel') : t('intro.actions.complete')}
        loading={update.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          confirm && update.mutate({ status: confirm, ...(notes.trim() !== (r?.coordinator_notes ?? '') ? { coordinator_notes: notes.trim() || null } : {}) })
        }
      />
    </>
  );
}
