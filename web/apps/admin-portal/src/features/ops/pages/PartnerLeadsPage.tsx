/**
 * Insurance requests (/insurance/requests) and pay-later requests (/financing/requests): patients who asked a
 * partner to contact them, with their consent to share their contact details. Staff move a request through
 * new -> in progress -> shared with partner -> closed and keep a note; "cancelled" is the patient's own withdrawal
 * (read-only). Deep link: ?request=<id> opens the drawer (staff notification links).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { ExternalLink, Mail, MessageCircle, Phone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { filterParam, useTableState } from '@hig/shared/lib';
import { Badge, DataTable, DateCell, PageHeader, QuickFilters, type DataTableColumn, type QuickFilterItem } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Button, Drawer, Field, KeyValue, Select, Textarea } from '../ui';
import { Banner } from '../ui/detail';
import { PartnerDisclaimer } from './PartnerCatalogPage';
import { countryName } from '../lib/lookups';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import {
  LEAD_STATUSES,
  partnerKeys,
  partnersApi,
  STAFF_LEAD_STATUSES,
  type AdminLeadOut,
  type LeadStatus,
  type LeadUpdate,
  type PartnerKind,
} from '../lib/partnersApi';

const STATUS_TONES: Record<LeadStatus, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  new: 'info',
  in_progress: 'warning',
  shared_with_partner: 'success',
  closed: 'neutral',
  cancelled: 'danger',
};
const NOTE_MAX = 4000;
const FILTERS = { status: filterParam.oneOf(LEAD_STATUSES) };

const statusLabel = (t: TFunction, s: LeadStatus) => t(`insurance.common.leadStatus.${s}`, { defaultValue: s });

function StatusPill({ status }: { status: LeadStatus }) {
  const { t } = useAppTranslation();
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>
      {statusLabel(t, status)}
    </Badge>
  );
}

const columnsFor = (t: TFunction): DataTableColumn<AdminLeadOut>[] => [
  {
    key: 'created_at',
    header: t('insurance.common.requests.columns.created'),
    mobile: 'meta',
    cell: (r) => <DateCell value={r.created_at} display="datetime" secondary={<DateCell value={r.created_at} display="relative" />} />,
    exportValue: (r) => r.created_at,
  },
  {
    key: 'product',
    header: t('insurance.common.requests.columns.product'),
    mobile: 'secondary',
    className: 'max-w-72',
    cell: (r) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{r.product_name}</span>
        <span className="block truncate text-xs text-muted">{r.provider_name}</span>
      </span>
    ),
    exportValue: (r) => `${r.provider_name} - ${r.product_name}`,
  },
  {
    key: 'contact',
    header: t('insurance.common.requests.columns.contact'),
    sticky: true,
    mobile: 'primary',
    cell: (r) => <span className="font-medium">{r.contact_name}</span>,
    exportValue: (r) => r.contact_name,
  },
  {
    key: 'country',
    header: t('insurance.common.requests.columns.country'),
    hideOnMobile: true,
    cell: (r) => (r.country ? countryName(r.country) : <span className="text-muted">—</span>),
    exportValue: (r) => r.country ?? '',
  },
  {
    key: 'case',
    header: t('insurance.common.requests.columns.case'),
    hideOnMobile: true,
    cell: (r) =>
      r.case_id && r.case_number ? (
        <Link to={opsPaths.case(r.case_id)} className="font-mono text-xs text-primary-ink hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.case_number}
        </Link>
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (r) => r.case_number ?? '',
  },
  {
    key: 'status',
    header: t('insurance.common.requests.columns.status'),
    mobile: 'badge',
    cell: (r) => <StatusPill status={r.status} />,
    exportValue: (r) => r.status,
  },
];

function PartnerLeads({ kind }: { kind: PartnerKind }) {
  const { t } = useAppTranslation();
  const ns = kind === 'insurance' ? 'insurance.requests' : 'financing.requests';
  useDocumentTitle(t(`${ns}.title`));
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('request');
  const columns = useMemo(() => columnsFor(t), [t]);
  const listParams = { status: filters.status || undefined, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...partnerKeys.leads(kind), 'list', listParams],
    queryFn: () => partnersApi.listLeads(kind, listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...partnerKeys.leads(kind), 'status-counts'],
    queryFn: () => partnersApi.leadStatusCounts(kind),
  });
  const inPage = selectedId ? (list.data?.items.find((r) => r.id === selectedId) ?? null) : null;
  // deep link to a request outside the current page / filter: look through the latest 100
  const lookup = useQuery({
    queryKey: [...partnerKeys.leads(kind), 'lookup'],
    queryFn: () => partnersApi.listLeads(kind, { page: 1, page_size: 100 }),
    enabled: !!selectedId && !!list.data && !inPage,
  });
  const selected = inPage ?? (selectedId ? (lookup.data?.items.find((r) => r.id === selectedId) ?? null) : null);
  const notFound = !!selectedId && !selected && !!lookup.data;

  const setSelected = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('request', id);
        else next.delete('request');
        return next;
      },
      { replace: !id },
    );

  const quickItems: QuickFilterItem<LeadStatus>[] = [
    { value: '', label: t('insurance.common.requests.all'), count: counts.data?.total ?? null },
    ...LEAD_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s), tone: STATUS_TONES[s], count: counts.data ? (counts.data.counts[s] ?? 0) : null })),
  ];

  return (
    <div>
      <PageHeader title={t(`${ns}.title`)} description={t(`${ns}.description`)} />
      <PartnerDisclaimer />
      <DataTable
        id={kind === 'insurance' ? 'admin.insurance.requests' : 'admin.financing.requests'}
        caption={t(`${ns}.title`)}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setSelected(r.id)}
        rowLabel={(r) => t('insurance.common.requests.openRow', { name: r.contact_name })}
        emptyTitle={t(`${ns}.empty`)}
        emptyDescription={t(`${ns}.emptyDescription`)}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('insurance.common.requests.statusFilter')}
              items={quickItems}
              value={filters.status}
              onChange={(s) => setFilter('status', s)}
            />
          </div>
        }
      />
      <LeadDrawer
        kind={kind}
        open={!!selectedId}
        lead={selected}
        loading={!!selectedId && !selected && !notFound}
        notFound={notFound}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function LeadDrawer({
  kind,
  open,
  lead,
  loading,
  notFound,
  onClose,
}: {
  kind: PartnerKind;
  open: boolean;
  lead: AdminLeadOut | null;
  loading: boolean;
  notFound: boolean;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const canManage = perms.isStaff;
  const [note, setNote] = useState('');
  useEffect(() => {
    setNote(lead?.staff_note ?? '');
  }, [lead?.id, lead?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useOpsMutation({
    mutationFn: (body: LeadUpdate) => partnersApi.updateLead(kind, lead!.id, body),
    success: () => t('insurance.common.requests.saved'),
    invalidate: [partnerKeys.leads(kind)],
  });

  const cancelled = lead?.status === 'cancelled';
  const preferred = lead?.preferred_contact;
  const preferredLabel = preferred
    ? (['email', 'phone', 'whatsapp'] as const).some((p) => p === preferred)
      ? t(`insurance.common.requests.preferredContact.${preferred}`)
      : preferred
    : '—';
  const noteChanged = (note.trim() || null) !== (lead?.staff_note ?? null);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={lead ? t('insurance.common.requests.drawerTitle', { name: lead.contact_name }) : t('insurance.common.requests.drawerTitleEmpty')}
      subtitle={lead ? `${lead.provider_name} · ${lead.product_name} · ${formatDateTime(lead.created_at)}` : undefined}
    >
      {notFound ? (
        <p className="text-sm text-muted">{t('insurance.common.requests.notFound')}</p>
      ) : loading || !lead ? (
        <p className="text-sm text-muted">{t('insurance.common.requests.loading')}</p>
      ) : (
        <div className="space-y-5">
          {cancelled && (
            <Banner tone="warning" icon={<ShieldAlert className="size-4" aria-hidden />} title={t('insurance.common.requests.cancelledTitle')}>
              {t('insurance.common.requests.cancelledNote')}
            </Banner>
          )}
          <KeyValue
            items={[
              [
                t('insurance.common.requests.fields.email'),
                lead.contact_email ? (
                  <a key="email" href={`mailto:${lead.contact_email}`} className="inline-flex items-center gap-1 text-primary-ink hover:underline" dir="ltr">
                    <Mail className="size-3.5" aria-hidden /> {lead.contact_email}
                  </a>
                ) : (
                  '—'
                ),
              ],
              [
                t('insurance.common.requests.fields.phone'),
                lead.contact_phone ? (
                  <a key="phone" href={`tel:${lead.contact_phone}`} className="inline-flex items-center gap-1 text-primary-ink hover:underline" dir="ltr">
                    <Phone className="size-3.5" aria-hidden /> {lead.contact_phone}
                  </a>
                ) : (
                  '—'
                ),
              ],
              [
                t('insurance.common.requests.fields.preferred'),
                <span key="pref" className="inline-flex items-center gap-1">
                  {preferred === 'whatsapp' && <MessageCircle className="size-3.5 text-muted" aria-hidden />}
                  {preferredLabel}
                </span>,
              ],
              [t('insurance.common.requests.fields.country'), lead.country ? `${countryName(lead.country)} (${lead.country})` : '—'],
              [
                t('insurance.common.requests.fields.case'),
                lead.case_id && lead.case_number ? (
                  <Link key="case" to={opsPaths.case(lead.case_id)} className="font-mono text-primary-ink hover:underline">
                    {lead.case_number}
                  </Link>
                ) : (
                  '—'
                ),
              ],
              [t('insurance.common.requests.fields.status'), <StatusPill key="status" status={lead.status} />],
              [
                t('insurance.common.requests.fields.handledBy'),
                lead.handled_by
                  ? `${lead.handled_by.full_name}${lead.handled_at ? ` · ${formatDateTime(lead.handled_at)}` : ''}`
                  : '—',
              ],
              [t('insurance.common.requests.fields.sharedAt'), lead.shared_at ? formatDateTime(lead.shared_at) : '—'],
            ]}
          />

          <section className="rounded-lg border border-border p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg">
              <ShieldCheck className="size-4 text-success-ink" aria-hidden />
              {t('insurance.common.requests.consentTitle')}
            </h3>
            <p className="text-sm text-muted">
              {lead.consent_granted_at
                ? t('insurance.common.requests.consentGiven', { date: formatDateTime(lead.consent_granted_at), provider: lead.provider_name })
                : t('insurance.common.requests.consentMissing')}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted">{t('insurance.common.requests.fields.message')}</h3>
            {lead.message ? (
              <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words text-fg">{lead.message}</div>
            ) : (
              <p className="text-sm text-muted">{t('insurance.common.requests.noMessage')}</p>
            )}
          </section>

          {lead.partner_website_url && (
            <a
              href={lead.partner_website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline"
            >
              {t('insurance.common.requests.partnerSite')} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}

          {canManage && (
            <div className="space-y-4 border-t border-border pt-4">
              <Field label={t('insurance.common.requests.changeStatus')} hint={cancelled ? undefined : t('insurance.common.requests.statusHint')}>
                {(fieldId) => (
                  <Select
                    id={fieldId}
                    value={lead.status}
                    disabled={cancelled || update.isPending}
                    options={(cancelled ? LEAD_STATUSES : STAFF_LEAD_STATUSES).map((s) => ({ value: s, label: statusLabel(t, s) }))}
                    onChange={(e) => {
                      const status = e.target.value as LeadStatus;
                      if (status !== lead.status) update.mutate({ status });
                    }}
                  />
                )}
              </Field>
              <Field label={t('insurance.common.requests.staffNote')} hint={t('insurance.common.requests.staffNoteHint')}>
                {(fieldId) => (
                  <Textarea id={fieldId} value={note} maxLength={NOTE_MAX} rows={4} onChange={(e) => setNote(e.target.value)} />
                )}
              </Field>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!noteChanged}
                  loading={update.isPending}
                  onClick={() => update.mutate({ staff_note: note.trim() || null })}
                >
                  {t('insurance.common.requests.saveNote')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function InsuranceRequestsPage() {
  return <PartnerLeads kind="insurance" />;
}

export function FinancingRequestsPage() {
  return <PartnerLeads kind="pay_later" />;
}
