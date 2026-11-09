import { CASE_STATUS_LABELS, GENDER_LABELS, URGENCY_LABELS, type CaseOut } from '@hig/shared/api';
import {
  DataTable,
  DateCell,
  IdCell,
  MoneyCell,
  PersonCell,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { countryName, formatRelative, fromMinor } from '../../lib/format';

export function patientLine(patient: CaseOut['patient']): string {
  const parts = [
    patient.age != null ? `${patient.age} y` : null,
    patient.gender ? GENDER_LABELS[patient.gender] : null,
    patient.nationality ? countryName(patient.nationality) : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

const isUrgent = (c: CaseOut) => c.urgency === 'urgent' || c.urgency === 'emergency';

/** Columns of the enquiries list (also used by the dashboard's recent enquiries). */
export const CASE_COLUMNS: DataTableColumn<CaseOut>[] = [
  {
    key: 'case',
    header: 'Case',
    sortable: true,
    sortKey: 'case_number',
    sticky: true,
    mobile: 'secondary',
    cell: (c) => <IdCell value={c.case_number} secondary={c.agent ? `via ${c.agent.agency_name}` : 'Direct enquiry'} />,
    mobileCell: (c) => (
      <span className="font-mono text-xs">
        {c.case_number}
        {c.agent ? ` · via ${c.agent.agency_name}` : ''}
      </span>
    ),
    exportValue: (c) => c.case_number,
  },
  {
    key: 'patient',
    header: 'Patient',
    mobile: 'primary',
    className: 'max-w-56',
    cell: (c) => <PersonCell name={c.patient.full_name} secondary={patientLine(c.patient) || undefined} />,
    exportValue: (c) => c.patient.full_name,
  },
  {
    key: 'treatment',
    header: 'Treatment',
    className: 'max-w-56',
    cell: (c) => (
      <TextCell
        primary={c.procedure?.name ?? c.specialty?.name ?? 'General enquiry'}
        secondary={c.doctor ? c.doctor.full_name : c.procedure && c.specialty ? c.specialty.name : undefined}
      />
    ),
    exportValue: (c) => c.procedure?.name ?? c.specialty?.name ?? 'General enquiry',
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (c) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={c.status} kind="case" />
        {isUrgent(c) && <StatusBadge status={c.urgency!} kind="urgency" dot={false} />}
      </span>
    ),
    mobileCell: (c) => <StatusBadgeCell status={c.status} kind="case" />,
    exportValue: (c) => CASE_STATUS_LABELS[c.status],
  },
  {
    key: 'urgency',
    header: 'Urgency',
    mobile: 'badge',
    defaultHidden: true,
    cell: (c) => (c.urgency ? <StatusBadge status={c.urgency} kind="urgency" /> : <span className="text-muted">—</span>),
    mobileCell: (c) => (isUrgent(c) ? <StatusBadge status={c.urgency!} kind="urgency" /> : null),
    exportValue: (c) => (c.urgency ? URGENCY_LABELS[c.urgency] : ''),
  },
  {
    key: 'quote',
    header: 'Latest quote',
    align: 'end',
    cell: (c) => (
      <MoneyCell
        minor={c.latest_quote?.total_minor}
        currency={c.latest_quote?.currency}
        secondary={c.latest_quote ? <StatusBadge status={c.latest_quote.status} kind="quote" dot={false} className="bg-transparent px-0" /> : undefined}
      />
    ),
    exportValue: (c) => (c.latest_quote ? `${c.latest_quote.currency} ${fromMinor(c.latest_quote.total_minor, c.latest_quote.currency)}` : ''),
  },
  {
    key: 'received',
    header: 'Received',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (c) => <DateCell value={c.created_at} display="date" secondary={formatRelative(c.created_at)} />,
    exportValue: (c) => c.created_at,
  },
  {
    key: 'updated',
    header: 'Last activity',
    sortable: true,
    sortKey: 'updated_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (c) => <DateCell value={c.updated_at} display="relative" className="text-muted" />,
    exportValue: (c) => c.updated_at,
  },
];

const RECENT_COLUMNS = CASE_COLUMNS.filter((c) => ['case', 'patient', 'treatment', 'status', 'quote', 'received'].includes(c.key)).map(
  (c) => ({ ...c, sortable: false }),
);

/** Compact, read-only list (dashboard "recent enquiries"). */
export function RecentCasesTable({ cases }: { cases: CaseOut[] }) {
  return (
    <DataTable
      id="hospital.dashboard.cases"
      caption="Recent enquiries"
      columns={RECENT_COLUMNS}
      rows={cases}
      rowHref={(c) => `/cases/${c.id}`}
      rowLabel={(c) => `Open case ${c.case_number}`}
      showViewOptions={false}
      className="rounded-none border-0 shadow-none"
      emptyTitle="No enquiries yet"
    />
  );
}

/** Backward-compatible name used by the dashboard (owned by the shell/design work). */
export function CasesTable({ cases }: { cases: CaseOut[]; compact?: boolean }) {
  return <RecentCasesTable cases={cases} />;
}
