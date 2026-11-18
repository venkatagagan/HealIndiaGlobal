/**
 * System -> WhatsApp (staff): provider configuration (never the secrets), message templates, opt-in counts,
 * last-24h delivery and the recent message log (template + delivery status only; message text is never stored).
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, Send, TriangleAlert, UserCheck, UserMinus, UserRound } from 'lucide-react';
import type { TFunction } from 'i18next';
import {
  WHATSAPP_MESSAGE_STATUSES,
  adminWhatsappApi,
  type WhatsAppMessageOut,
  type WhatsAppMessageStatus,
  type WhatsAppTemplateInfo,
} from '@hig/shared/api';
import { filterParam, formatNumber, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { DataTable, DateCell, FilterBar, SelectFilter, TextCell, type DataTableColumn, type FilterOption } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Badge, Card, ErrorState, KeyValue, LoadingState, PageHeader, StatCard, type Tone } from '../ui';

const STATUS_TONES: Record<WhatsAppMessageStatus, Tone> = {
  queued: 'neutral',
  sent: 'blue',
  delivered: 'green',
  read: 'green',
  failed: 'red',
  skipped: 'amber',
};

const FILTERS = {
  status: filterParam.oneOf(WHATSAPP_MESSAGE_STATUSES),
  template: filterParam.text(),
};

const keys = {
  status: ['admin', 'whatsapp', 'status'] as const,
  messages: (params: object) => ['admin', 'whatsapp', 'messages', params] as const,
};

function StatusPill({ status, t }: { status: WhatsAppMessageStatus; t: TFunction }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{t(`whatsapp.status.${status}`, { defaultValue: status })}</Badge>;
}

function SetBadge({ value, t }: { value: boolean; t: TFunction }) {
  return value ? (
    <Badge tone="green">
      <CheckCircle2 className="size-3.5" aria-hidden />
      {t('whatsapp.provider.set')}
    </Badge>
  ) : (
    <Badge tone="amber">{t('whatsapp.provider.notSet')}</Badge>
  );
}

const templateColumns = (t: TFunction): DataTableColumn<WhatsAppTemplateInfo>[] => [
  {
    key: 'name',
    header: t('whatsapp.templates.columns.name'),
    mobile: 'primary',
    cell: (r) => <span className="font-mono text-xs">{r.name}</span>,
  },
  {
    key: 'category',
    header: t('whatsapp.templates.columns.category'),
    mobile: 'badge',
    cell: (r) => <Badge>{r.category}</Badge>,
  },
  {
    key: 'kinds',
    header: t('whatsapp.templates.columns.kinds'),
    className: 'max-w-96',
    cell: (r) => <span className="font-mono text-xs whitespace-normal text-muted">{r.kinds.join(', ')}</span>,
  },
  {
    key: 'languages',
    header: t('whatsapp.templates.columns.languages'),
    cell: (r) => <span className="font-mono text-xs uppercase">{r.languages.join(' · ')}</span>,
  },
];

const messageColumns = (t: TFunction): DataTableColumn<WhatsAppMessageOut>[] => [
  {
    key: 'created_at',
    header: t('whatsapp.log.columns.created'),
    sticky: true,
    mobile: 'secondary',
    cell: (m) => <DateCell value={m.created_at} display="datetime" secondary={<DateCell value={m.created_at} display="relative" />} />,
  },
  {
    key: 'template',
    header: t('whatsapp.log.columns.template'),
    mobile: 'primary',
    cell: (m) => (
      <TextCell
        primary={<span className="font-mono text-xs">{m.template_name}</span>}
        secondary={<span className="font-mono text-xs">{m.kind}</span>}
      />
    ),
  },
  {
    key: 'language',
    header: t('whatsapp.log.columns.language'),
    cell: (m) => <span className="font-mono text-xs">{m.language_code}</span>,
  },
  {
    key: 'phone',
    header: t('whatsapp.log.columns.phone'),
    cell: (m) => (
      <span className="font-mono text-xs" dir="ltr">
        {m.phone_masked ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: t('whatsapp.log.columns.status'),
    mobile: 'badge',
    cell: (m) => <StatusPill status={m.status} t={t} />,
  },
  {
    key: 'delivery',
    header: t('whatsapp.log.columns.delivery'),
    hideOnMobile: true,
    cell: (m) => {
      const at = m.failed_at ?? m.read_at ?? m.delivered_at ?? m.sent_at;
      return at ? <DateCell value={at} display="relative" className="text-muted" /> : <span className="text-muted">—</span>;
    },
  },
  {
    key: 'error',
    header: t('whatsapp.log.columns.error'),
    className: 'max-w-72',
    cell: (m) =>
      m.error_code || m.error_title ? (
        <TextCell primary={<span className="text-danger">{m.error_title ?? m.error_code}</span>} secondary={m.error_title ? m.error_code : undefined} />
      ) : (
        <span className="text-muted">—</span>
      ),
  },
];

export default function WhatsAppSettingsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('whatsapp.title'));
  const status = useQuery({ queryKey: keys.status, queryFn: adminWhatsappApi.status, staleTime: 60_000 });
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25, prefix: 'wa_' });
  const { filters, setFilter } = table;
  const params = {
    status: filters.status || undefined,
    template: filters.template || undefined,
    page: table.page,
    page_size: table.pageSize,
  };
  const messages = useQuery({
    queryKey: keys.messages(params),
    queryFn: () => adminWhatsappApi.messages(params),
    placeholderData: keepPreviousData,
  });
  const tplColumns = useMemo(() => templateColumns(t), [t]);
  const msgColumns = useMemo(() => messageColumns(t), [t]);

  const statusOptions: FilterOption<WhatsAppMessageStatus>[] = WHATSAPP_MESSAGE_STATUSES.map((s) => ({
    value: s,
    label: t(`whatsapp.status.${s}`),
    tone: STATUS_TONES[s] === 'neutral' ? undefined : STATUS_TONES[s],
  }));
  const templateOptions: FilterOption[] = (status.data?.templates ?? []).map((tpl) => ({ value: tpl.name, label: tpl.name }));
  const s = status.data;

  return (
    <div className="space-y-6">
      <PageHeader title={t('whatsapp.title')} description={t('whatsapp.description')} />

      {status.isLoading ? (
        <LoadingState />
      ) : status.error ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : s ? (
        <>
          {!s.configured && (
            <div role="status" className="flex gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning-ink">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p>{t('whatsapp.notConfigured')}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={t('whatsapp.stats.optedIn')} value={formatNumber(s.opted_in_users)} icon={<UserCheck className="size-4" />} tone="green" />
            <StatCard label={t('whatsapp.stats.pending')} value={formatNumber(s.pending_users)} icon={<UserRound className="size-4" />} tone="amber" />
            <StatCard label={t('whatsapp.stats.optedOut')} value={formatNumber(s.opted_out_users)} icon={<UserMinus className="size-4" />} />
            <StatCard label={t('whatsapp.stats.sent24h')} value={formatNumber(s.sent_last_24h)} icon={<Send className="size-4" />} tone="violet" />
            <StatCard
              label={t('whatsapp.stats.failed24h')}
              value={formatNumber(s.failed_last_24h)}
              icon={<TriangleAlert className="size-4" />}
              tone={s.failed_last_24h > 0 ? 'red' : 'neutral'}
              onClick={s.failed_last_24h > 0 ? () => setFilter('status', 'failed') : undefined}
            />
          </div>

          <Card
            title={
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <MessageCircle className="size-4 text-success-ink" aria-hidden />
                {t('whatsapp.provider.title')}
              </h2>
            }
          >
            <KeyValue
              columns={3}
              items={[
                [t('whatsapp.provider.provider'), <span className="font-mono text-xs">{s.provider}</span>],
                [t('whatsapp.provider.configured'), <SetBadge value={s.configured} t={t} />],
                [t('whatsapp.provider.webhook'), <SetBadge value={s.webhook_configured} t={t} />],
                [t('whatsapp.provider.verifyToken'), <SetBadge value={s.verify_token_set} t={t} />],
                [t('whatsapp.provider.phoneNumberId'), <SetBadge value={s.phone_number_id_set} t={t} />],
                [t('whatsapp.provider.apiVersion'), <span className="font-mono text-xs">{s.graph_api_version}</span>],
                [t('whatsapp.provider.dailyLimit'), formatNumber(s.daily_limit_per_user)],
              ]}
            />
            <p className="mt-4 text-xs text-muted">{t('whatsapp.provider.secretsNote')}</p>
          </Card>

          <section className="space-y-2">
            <div>
              <h2 className="text-sm font-semibold text-fg">{t('whatsapp.templates.title')}</h2>
              <p className="text-xs text-muted">{t('whatsapp.templates.description')}</p>
            </div>
            <DataTable
              id="admin.whatsapp.templates"
              caption={t('whatsapp.templates.title')}
              columns={tplColumns}
              rows={s.templates}
              rowKey={(r) => r.name}
              mode="client"
              density="compact"
              showViewOptions={false}
              emptyTitle={t('whatsapp.templates.empty')}
            />
          </section>
        </>
      ) : null}

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">{t('whatsapp.log.title')}</h2>
          <p className="text-xs text-muted">{t('whatsapp.log.description')}</p>
        </div>
        <DataTable
          id="admin.whatsapp.messages"
          caption={t('whatsapp.log.title')}
          table={table}
          columns={msgColumns}
          rows={messages.data?.items}
          total={messages.data?.total}
          loading={messages.isLoading}
          fetching={messages.isFetching && !messages.isLoading}
          error={messages.error}
          onRetry={() => void messages.refetch()}
          density="compact"
          emptyIcon={<MessageCircle className="size-6" />}
          emptyTitle={t('whatsapp.log.empty')}
          toolbar={
            <FilterBar onReset={table.resetFilters}>
              <SelectFilter
                label={t('whatsapp.log.filters.status')}
                value={filters.status}
                onChange={(v) => setFilter('status', v)}
                options={statusOptions}
              />
              <SelectFilter
                label={t('whatsapp.log.filters.template')}
                value={filters.template}
                onChange={(v) => setFilter('template', v)}
                options={templateOptions}
                loading={status.isLoading}
              />
            </FilterBar>
          }
        />
      </section>
    </div>
  );
}
