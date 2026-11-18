import { useMemo } from 'react';
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
import { useAppTranslation } from '../../i18n';
import { countryName, formatRelative, fromMinor } from '../../lib/format';
import { RespondBy, respondByText, sla } from './sla';

type TFn = ReturnType<typeof useAppTranslation>['t'];

export function patientLine(patient: CaseOut['patient'], t: TFn): string {
  const parts = [
    patient.age != null ? t('cases.table.ageShort', { age: patient.age }) : null,
    patient.gender ? GENDER_LABELS[patient.gender] : null,
    patient.nationality ? countryName(patient.nationality) : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

const isUrgent = (c: CaseOut) => c.urgency === 'urgent' || c.urgency === 'emergency';

/** Columns of the enquiries list (also used by the dashboard's recent enquiries). Build with `t` inside a component. */
export function caseColumns(t: TFn): DataTableColumn<CaseOut>[] {
  return [
    {
      key: 'case',
      header: t('cases.table.case'),
      sortable: true,
      sortKey: 'case_number',
      sticky: true,
      mobile: 'secondary',
      cell: (c) => (
        <IdCell
          value={c.case_number}
          secondary={c.agent ? t('cases.table.via', { agency: c.agent.agency_name }) : t('cases.table.directEnquiry')}
        />
      ),
      mobileCell: (c) => (
        <span className="font-mono text-xs">
          {c.case_number}
          {c.agent ? ` · ${t('cases.table.via', { agency: c.agent.agency_name })}` : ''}
        </span>
      ),
      exportValue: (c) => c.case_number,
    },
    {
      key: 'patient',
      header: t('common.patient'),
      mobile: 'primary',
      className: 'max-w-56',
      cell: (c) => <PersonCell name={c.patient.full_name} secondary={patientLine(c.patient, t) || undefined} />,
      exportValue: (c) => c.patient.full_name,
    },
    {
      key: 'treatment',
      header: t('cases.table.treatment'),
      className: 'max-w-56',
      cell: (c) => (
        <TextCell
          primary={c.procedure?.name ?? c.specialty?.name ?? t('cases.generalEnquiry')}
          secondary={c.doctor ? c.doctor.full_name : c.procedure && c.specialty ? c.specialty.name : undefined}
        />
      ),
      exportValue: (c) => c.procedure?.name ?? c.specialty?.name ?? t('cases.generalEnquiry'),
    },
    {
      key: 'status',
      header: t('common.status'),
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
      key: 'respondBy',
      header: t('cases.respondBy.header'),
      sortable: true,
      sortKey: 'quote_due_at',
      mobile: 'badge',
      sortValue: (c) => sla(c).quote_due_at ?? '',
      cell: (c) => <RespondBy value={c} />,
      mobileCell: (c) => (sla(c).quote_overdue || sla(c).hours_left != null ? <RespondBy value={c} compact /> : null),
      exportValue: (c) => respondByText(c, t),
    },
    {
      key: 'urgency',
      header: t('cases.table.urgency'),
      mobile: 'badge',
      defaultHidden: true,
      cell: (c) => (c.urgency ? <StatusBadge status={c.urgency} kind="urgency" /> : <span className="text-muted">—</span>),
      mobileCell: (c) => (isUrgent(c) ? <StatusBadge status={c.urgency!} kind="urgency" /> : null),
      exportValue: (c) => (c.urgency ? URGENCY_LABELS[c.urgency] : ''),
    },
    {
      key: 'quote',
      header: t('cases.table.latestQuote'),
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
      header: t('cases.table.received'),
      sortable: true,
      sortKey: 'created_at',
      sortDescFirst: true,
      cell: (c) => <DateCell value={c.created_at} display="date" secondary={formatRelative(c.created_at)} />,
      exportValue: (c) => c.created_at,
    },
    {
      key: 'updated',
      header: t('cases.table.lastActivity'),
      sortable: true,
      sortKey: 'updated_at',
      sortDescFirst: true,
      defaultHidden: true,
      cell: (c) => <DateCell value={c.updated_at} display="relative" className="text-muted" />,
      exportValue: (c) => c.updated_at,
    },
  ];
}

const RECENT_KEYS = ['case', 'patient', 'treatment', 'status', 'respondBy', 'quote', 'received'];

/** Compact, read-only list (dashboard "recent enquiries"). */
export function RecentCasesTable({ cases }: { cases: CaseOut[] }) {
  const { t } = useAppTranslation();
  const columns = useMemo(
    () => caseColumns(t).filter((c) => RECENT_KEYS.includes(c.key)).map((c) => ({ ...c, sortable: false })),
    [t],
  );
  return (
    <DataTable
      id="hospital.dashboard.cases"
      caption={t('cases.table.recentCaption')}
      columns={columns}
      rows={cases}
      rowHref={(c) => `/cases/${c.id}`}
      rowLabel={(c) => t('cases.table.openCase', { number: c.case_number })}
      showViewOptions={false}
      className="rounded-none border-0 shadow-none"
      emptyTitle={t('cases.list.emptyTitle')}
    />
  );
}

/** Backward-compatible name used by the dashboard (owned by the shell/design work). */
export function CasesTable({ cases }: { cases: CaseOut[]; compact?: boolean }) {
  return <RecentCasesTable cases={cases} />;
}
