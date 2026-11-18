import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Mail, Phone } from 'lucide-react';
import { adminApi, type AdminEnquiryListParams, type EnquiryOut, type EnquiryStatus } from '@hig/shared/api';
import { filterParam, useTableState } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  PageHeader,
  PersonCell,
  QuickFilters,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Drawer, Field, KeyValue, Select } from '../ui';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const ENQUIRY_STATUSES = ['new', 'in_progress', 'closed'] as const satisfies readonly EnquiryStatus[];
const STATUS_TONES: Record<EnquiryStatus, 'info' | 'warning' | 'neutral'> = {
  new: 'info',
  in_progress: 'warning',
  closed: 'neutral',
};
const TOPICS = ['patient', 'agent', 'hospital', 'media', 'other'] as const;
const statusLabel = (t: TFunction, status: EnquiryStatus) => t(`enquiries.status.${status}`, { defaultValue: status });
const topicLabel = (t: TFunction, topic: string | null) =>
  topic ? ((TOPICS as readonly string[]).includes(topic) ? t(`enquiries.topics.${topic}`) : topic) : '—';

const FILTERS = { status: filterParam.oneOf(ENQUIRY_STATUSES) };

function StatusPill({ status }: { status: EnquiryStatus }) {
  const { t } = useAppTranslation();
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>
      {statusLabel(t, status)}
    </Badge>
  );
}

const columnsFor = (t: TFunction): DataTableColumn<EnquiryOut>[] => [
  {
    key: 'name',
    header: t('enquiries.columns.from'),
    sticky: true,
    mobile: 'primary',
    cell: (e) => <PersonCell name={e.name} secondary={e.email} />,
    exportValue: (e) => `${e.name} <${e.email}>`,
  },
  {
    key: 'topic',
    header: t('enquiries.columns.topic'),
    cell: (e) => topicLabel(t, e.topic),
    exportValue: (e) => e.topic ?? '',
  },
  {
    key: 'message',
    header: t('enquiries.columns.message'),
    className: 'max-w-96',
    cell: (e) => <span className="line-clamp-2 text-sm text-fg">{e.message}</span>,
    exportValue: (e) => e.message,
  },
  {
    key: 'country',
    header: t('enquiries.columns.country'),
    hideOnMobile: true,
    cell: (e) => e.country || '—',
    exportValue: (e) => e.country ?? '',
  },
  {
    key: 'status',
    header: t('enquiries.columns.status'),
    mobile: 'badge',
    cell: (e) => <StatusPill status={e.status} />,
    exportValue: (e) => e.status,
  },
  {
    key: 'created_at',
    header: t('enquiries.columns.received'),
    mobile: 'meta',
    cell: (e) => <DateCell value={e.created_at} display="datetime" secondary={<DateCell value={e.created_at} display="relative" />} />,
    exportValue: (e) => e.created_at,
  },
];

export default function EnquiriesPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('enquiries.title'));
  const perms = useOpsPermissions();
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const listParams: AdminEnquiryListParams = {
    status: filters.status || undefined,
    page: table.page,
    page_size: table.pageSize,
  };
  const [selected, setSelected] = useState<EnquiryOut | null>(null);
  const columns = useMemo(() => columnsFor(t), [t]);

  const list = useQuery({
    queryKey: [...opsKeys.enquiries, 'list', listParams],
    queryFn: () => adminApi.listEnquiries(listParams),
    placeholderData: keepPreviousData,
  });

  const update = useOpsMutation({
    mutationFn: ({ id, status }: { id: string; status: EnquiryStatus }) => adminApi.updateEnquiry(id, { status }),
    success: (e) => t(`enquiries.toast.${e.status}`),
    invalidate: [opsKeys.enquiries],
    onSuccess: (e) => setSelected(e),
  });

  const quickItems: QuickFilterItem<EnquiryStatus>[] = [
    { value: '', label: t('enquiries.all') },
    ...ENQUIRY_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s), tone: STATUS_TONES[s] })),
  ];

  return (
    <div>
      <PageHeader title={t('enquiries.title')} description={t('enquiries.description')} />
      <DataTable
        id="admin.enquiries"
        caption={t('enquiries.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={setSelected}
        rowLabel={(e) => t('enquiries.openRow', { name: e.name })}
        emptyTitle={t('enquiries.empty')}
        emptyDescription={t('enquiries.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('enquiries.statusFilter')} items={quickItems} value={filters.status} onChange={(s) => setFilter('status', s)} />
          </div>
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        width="lg"
        title={selected ? t('enquiries.drawerTitle', { name: selected.name }) : t('enquiries.drawerTitleEmpty')}
        subtitle={selected ? formatDateTime(selected.created_at, 'd MMM yyyy, HH:mm') : undefined}
      >
        {selected && (
          <div className="space-y-5">
            <KeyValue
              items={[
                [
                  t('enquiries.fields.email'),
                  <a key="email" href={`mailto:${selected.email}`} className="inline-flex items-center gap-1 text-green-700 hover:underline dark:text-green-400">
                    <Mail className="size-3.5" aria-hidden /> {selected.email}
                  </a>,
                ],
                [
                  t('enquiries.fields.phone'),
                  selected.phone ? (
                    <a key="phone" href={`tel:${selected.phone}`} dir="ltr" className="inline-flex items-center gap-1 text-green-700 hover:underline dark:text-green-400">
                      <Phone className="size-3.5" aria-hidden /> {selected.phone}
                    </a>
                  ) : (
                    '—'
                  ),
                ],
                [t('enquiries.fields.country'), selected.country || '—'],
                [t('enquiries.fields.topic'), topicLabel(t, selected.topic)],
                [t('enquiries.fields.status'), <StatusPill key="status" status={selected.status} />],
                [
                  t('enquiries.fields.handledBy'),
                  selected.handled_by
                    ? `${selected.handled_by.full_name}${selected.handled_at ? ` · ${formatDateTime(selected.handled_at, 'd MMM yyyy, HH:mm')}` : ''}`
                    : '—',
                ],
              ]}
            />
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted">{t('enquiries.fields.message')}</h3>
              <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words text-fg">{selected.message}</div>
            </section>
            {perms.moderateContent && (
              <Field label={t('enquiries.changeStatus')}>
                {(fieldId) => (
                  <Select
                    id={fieldId}
                    value={selected.status}
                    disabled={update.isPending}
                    options={ENQUIRY_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }))}
                    onChange={(e) => {
                      const status = e.target.value as EnquiryStatus;
                      if (status !== selected.status) update.mutate({ id: selected.id, status });
                    }}
                  />
                )}
              </Field>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
