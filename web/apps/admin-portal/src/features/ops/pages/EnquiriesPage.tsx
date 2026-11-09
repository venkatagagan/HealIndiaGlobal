import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { Drawer, Field, KeyValue, Select } from '../ui';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const ENQUIRY_STATUSES = ['new', 'in_progress', 'closed'] as const satisfies readonly EnquiryStatus[];
const STATUS_LABELS: Record<EnquiryStatus, string> = { new: 'New', in_progress: 'In progress', closed: 'Closed' };
const STATUS_TONES: Record<EnquiryStatus, 'info' | 'warning' | 'neutral'> = {
  new: 'info',
  in_progress: 'warning',
  closed: 'neutral',
};
const TOPIC_LABELS: Record<string, string> = {
  patient: 'Patient',
  agent: 'Agent',
  hospital: 'Hospital',
  media: 'Media',
  other: 'Other',
};
const topicLabel = (topic: string | null) => (topic ? (TOPIC_LABELS[topic] ?? topic) : '—');

const FILTERS = { status: filterParam.oneOf(ENQUIRY_STATUSES) };

function StatusPill({ status }: { status: EnquiryStatus }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const COLUMNS: DataTableColumn<EnquiryOut>[] = [
  {
    key: 'name',
    header: 'From',
    sticky: true,
    mobile: 'primary',
    cell: (e) => <PersonCell name={e.name} secondary={e.email} />,
    exportValue: (e) => `${e.name} <${e.email}>`,
  },
  {
    key: 'topic',
    header: 'Topic',
    cell: (e) => topicLabel(e.topic),
    exportValue: (e) => e.topic ?? '',
  },
  {
    key: 'message',
    header: 'Message',
    className: 'max-w-96',
    cell: (e) => <span className="line-clamp-2 text-sm text-fg">{e.message}</span>,
    exportValue: (e) => e.message,
  },
  {
    key: 'country',
    header: 'Country',
    hideOnMobile: true,
    cell: (e) => e.country || '—',
    exportValue: (e) => e.country ?? '',
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'badge',
    cell: (e) => <StatusPill status={e.status} />,
    exportValue: (e) => e.status,
  },
  {
    key: 'created_at',
    header: 'Received',
    mobile: 'meta',
    cell: (e) => <DateCell value={e.created_at} display="datetime" secondary={<DateCell value={e.created_at} display="relative" />} />,
    exportValue: (e) => e.created_at,
  },
];

export default function EnquiriesPage() {
  useDocumentTitle('Website enquiries');
  const perms = useOpsPermissions();
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const listParams: AdminEnquiryListParams = {
    status: filters.status || undefined,
    page: table.page,
    page_size: table.pageSize,
  };
  const [selected, setSelected] = useState<EnquiryOut | null>(null);

  const list = useQuery({
    queryKey: [...opsKeys.enquiries, 'list', listParams],
    queryFn: () => adminApi.listEnquiries(listParams),
    placeholderData: keepPreviousData,
  });

  const update = useOpsMutation({
    mutationFn: ({ id, status }: { id: string; status: EnquiryStatus }) => adminApi.updateEnquiry(id, { status }),
    success: (e) => `Marked as ${STATUS_LABELS[e.status].toLowerCase()}.`,
    invalidate: [opsKeys.enquiries],
    onSuccess: (e) => setSelected(e),
  });

  const quickItems: QuickFilterItem<EnquiryStatus>[] = [
    { value: '', label: 'All' },
    ...ENQUIRY_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], tone: STATUS_TONES[s] })),
  ];

  return (
    <div>
      <PageHeader title="Website enquiries" description="Messages sent through the contact form on the public website." />
      <DataTable
        id="admin.enquiries"
        caption="Website enquiries"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={setSelected}
        rowLabel={(e) => `Open enquiry from ${e.name}`}
        emptyTitle="No enquiries"
        emptyDescription="Messages from the website contact form appear here."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Enquiry status" items={quickItems} value={filters.status} onChange={(s) => setFilter('status', s)} />
          </div>
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        width="lg"
        title={selected ? `Enquiry from ${selected.name}` : 'Enquiry'}
        subtitle={selected ? formatDateTime(selected.created_at, 'd MMM yyyy, HH:mm') : undefined}
      >
        {selected && (
          <div className="space-y-5">
            <KeyValue
              items={[
                [
                  'Email',
                  <a key="email" href={`mailto:${selected.email}`} className="inline-flex items-center gap-1 text-green-700 hover:underline dark:text-green-400">
                    <Mail className="size-3.5" aria-hidden /> {selected.email}
                  </a>,
                ],
                [
                  'Phone',
                  selected.phone ? (
                    <a key="phone" href={`tel:${selected.phone}`} className="inline-flex items-center gap-1 text-green-700 hover:underline dark:text-green-400">
                      <Phone className="size-3.5" aria-hidden /> {selected.phone}
                    </a>
                  ) : (
                    '—'
                  ),
                ],
                ['Country', selected.country || '—'],
                ['Topic', topicLabel(selected.topic)],
                ['Status', <StatusPill key="status" status={selected.status} />],
                [
                  'Handled by',
                  selected.handled_by
                    ? `${selected.handled_by.full_name}${selected.handled_at ? ` · ${formatDateTime(selected.handled_at, 'd MMM yyyy, HH:mm')}` : ''}`
                    : '—',
                ],
              ]}
            />
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted">Message</h3>
              <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words text-fg">{selected.message}</div>
            </section>
            {perms.moderateContent && (
              <Field label="Change status">
                {(fieldId) => (
                  <Select
                    id={fieldId}
                    value={selected.status}
                    disabled={update.isPending}
                    options={ENQUIRY_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
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
