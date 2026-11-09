import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, UserRound, Zap } from 'lucide-react';
import { adminApi, USER_ROLES, USER_ROLE_LABELS, type AuditLogListParams, type AuditLogOut } from '@hig/shared/api';
import { fetchAllPages, filterParam, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  SelectFilter,
  TextCell,
  useActiveFilterChip,
  type DataTableColumn,
  type FilterOption,
} from '@hig/shared/ui';
import { Drawer, KeyValue } from '../ui';
import { JsonDiff } from '../components/JsonDiff';
import { formatDateTime } from '../lib/format';
import { useAdminFacets } from '../lib/lookups';
import { opsKeys } from '../lib/mutations';

const SYSTEM = 'system';
const FILTERS = {
  q: filterParam.text(),
  action: filterParam.text(),
  entity_type: filterParam.text(),
  entity_id: filterParam.text(),
  actor_user_id: filterParam.text(),
  actor_role: filterParam.list([...USER_ROLES, SYSTEM]),
  from: filterParam.date(),
  to: filterParam.date(),
};
type AuditFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: AuditFilters): Omit<AuditLogListParams, 'page' | 'page_size'> {
  return {
    q: f.q.trim() || undefined,
    action: f.action || undefined,
    entity_type: f.entity_type || undefined,
    entity_id: f.entity_id || undefined,
    actor_user_id: f.actor_user_id || undefined,
    actor_role: f.actor_role.length ? f.actor_role : undefined,
    from: f.from || undefined,
    to: f.to || undefined,
  };
}

function actionTone(action: string): 'danger' | 'success' | 'warning' | 'info' | 'neutral' {
  if (/(reject|suspend|delete|cancel|fail|revok|lock)/.test(action)) return 'danger';
  if (/(approve|verify|create|confirm|complete|activate)/.test(action)) return 'success';
  if (/(update|change|role|setting)/.test(action)) return 'warning';
  if (/(login|logout|mfa)/.test(action)) return 'info';
  return 'neutral';
}

const actorName = (l: AuditLogOut) => l.actor_name ?? (l.actor_user_id ? 'User' : 'System');

const COLUMNS: DataTableColumn<AuditLogOut>[] = [
  {
    key: 'when',
    header: 'When',
    sticky: true,
    mobile: 'secondary',
    cell: (l) => <DateCell value={l.created_at} display="datetime" secondary={<DateCell value={l.created_at} display="relative" />} />,
    mobileCell: (l) => formatDateTime(l.created_at, 'd MMM yyyy, HH:mm'),
    exportValue: (l) => l.created_at,
  },
  {
    key: 'action',
    header: 'Action',
    mobile: 'primary',
    cell: (l) => (
      <Badge tone={actionTone(l.action)} className="font-mono">
        {l.action}
      </Badge>
    ),
    mobileCell: (l) => <span className="font-mono text-sm">{l.action}</span>,
    exportValue: (l) => l.action,
  },
  {
    key: 'entity',
    header: 'Entity',
    className: 'max-w-64',
    cell: (l) => <TextCell primary={<span className="capitalize">{l.entity_type.replace(/_/g, ' ')}</span>} secondary={<span className="font-mono">{l.entity_id ?? '—'}</span>} />,
    exportValue: (l) => `${l.entity_type}${l.entity_id ? `:${l.entity_id}` : ''}`,
  },
  {
    key: 'actor',
    header: 'Actor',
    className: 'max-w-56',
    cell: (l) => (
      <PersonCell
        name={actorName(l)}
        avatar={!!l.actor_user_id}
        secondary={l.actor_role ? (USER_ROLE_LABELS[l.actor_role as keyof typeof USER_ROLE_LABELS] ?? l.actor_role) : l.actor_user_id ? undefined : 'Automated'}
      />
    ),
    exportValue: (l) => actorName(l),
  },
  {
    key: 'ip',
    header: 'IP address',
    cell: (l) => <span className="font-mono text-xs">{l.ip ?? '—'}</span>,
    exportValue: (l) => l.ip ?? '',
  },
];

/** Chip for a URL filter that has no control of its own (set from the event drawer). */
function UrlChip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  useActiveFilterChip(label, value || null, onClear);
  return null;
}

export default function AuditLogsPage() {
  useDocumentTitle('Audit log');
  const table = useTableState({ filters: FILTERS, defaultPageSize: 50 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: AuditLogListParams = { ...apiFilters, page: table.page, page_size: table.pageSize };
  const [selected, setSelected] = useState<AuditLogOut | null>(null);

  const list = useQuery({
    queryKey: [...opsKeys.audit, listParams],
    queryFn: () => adminApi.auditLogs(listParams),
    placeholderData: keepPreviousData,
  });
  const facets = useAdminFacets();
  const staff = useQuery({ queryKey: [...opsKeys.staff, 'all'], queryFn: () => adminApi.listStaff(), staleTime: 5 * 60_000 });

  const actionOptions = useMemo<FilterOption[]>(() => {
    const actions = facets.data?.audit_actions ?? [];
    const groups = [...new Set(actions.map((a) => a.split('.')[0]!).filter(Boolean))].sort();
    return [
      ...groups.map((g) => ({ value: `${g}.*`, label: `${g}.*`, description: `Every ${g} action` })),
      ...actions.map((a) => ({ value: a, label: a })),
    ];
  }, [facets.data]);
  const actorOptions = useMemo<FilterOption[]>(() => {
    const opts = (staff.data ?? []).map((s) => ({ value: s.id, label: s.full_name, description: USER_ROLE_LABELS[s.role] }));
    if (filters.actor_user_id && !opts.some((o) => o.value === filters.actor_user_id)) {
      const known = list.data?.items.find((l) => l.actor_user_id === filters.actor_user_id);
      opts.unshift({ value: filters.actor_user_id, label: known?.actor_name ?? `User ${filters.actor_user_id.slice(0, 8)}`, description: 'Selected user' });
    }
    return opts;
  }, [staff.data, filters.actor_user_id, list.data]);

  return (
    <div>
      <PageHeader title="Audit log" description="Append-only record of security-relevant and state-changing actions." />
      <DataTable
        id="admin.audit"
        caption="Audit log"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={setSelected}
        rowLabel={(l) => `Open audit event ${l.action}`}
        density="compact"
        emptyTitle="No audit events yet"
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Action, entity id or actor…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="audit-log"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => adminApi.auditLogs({ ...apiFilters, page, page_size: size }))}
              />
            }
            more={
              <MultiSelectFilter
                label="Actor role"
                value={filters.actor_role}
                onChange={(v) => setFilter('actor_role', v)}
                options={[{ value: SYSTEM, label: 'System (automated)' }, ...USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))]}
              />
            }
          >
            <SelectFilter
              label="Action"
              icon={<Zap className="size-3.5 opacity-70" aria-hidden />}
              value={filters.action}
              onChange={(v) => setFilter('action', v)}
              options={actionOptions}
              loading={facets.isLoading}
              searchable
            />
            <SelectFilter
              label="Entity"
              icon={<Boxes className="size-3.5 opacity-70" aria-hidden />}
              value={filters.entity_type}
              onChange={(v) => setFilters({ entity_type: v, entity_id: '' })}
              options={(facets.data?.audit_entity_types ?? []).map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
              loading={facets.isLoading}
              searchable
            />
            <SelectFilter
              label="Actor"
              icon={<UserRound className="size-3.5 opacity-70" aria-hidden />}
              value={filters.actor_user_id}
              onChange={(v) => setFilter('actor_user_id', v)}
              options={actorOptions}
              loading={staff.isLoading}
              searchable
            />
            <DateRangeFilter label="Date" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
            <UrlChip label="Entity id" value={filters.entity_id} onClear={() => setFilter('entity_id', '')} />
          </FilterBar>
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        width="xl"
        title={selected?.action ?? 'Audit event'}
        subtitle={selected ? formatDateTime(selected.created_at, 'd MMM yyyy, HH:mm:ss') : undefined}
      >
        {selected && (
          <div className="space-y-5">
            <KeyValue
              items={[
                ['Entity', `${selected.entity_type} · ${selected.entity_id ?? '—'}`],
                [
                  'Actor',
                  `${actorName(selected)}${selected.actor_role ? ` (${USER_ROLE_LABELS[selected.actor_role as keyof typeof USER_ROLE_LABELS] ?? selected.actor_role})` : ''}`,
                ],
                [
                  'Actor id',
                  selected.actor_user_id ? (
                    <button
                      type="button"
                      className="font-mono text-xs text-green-700 hover:underline dark:text-green-400"
                      onClick={() => {
                        setFilter('actor_user_id', selected.actor_user_id ?? '');
                        setSelected(null);
                      }}
                    >
                      {selected.actor_user_id}
                    </button>
                  ) : (
                    '—'
                  ),
                ],
                ['IP address', selected.ip ?? '—'],
                ['User agent', <span key="ua" className="text-xs">{selected.user_agent ?? '—'}</span>],
                [
                  'Same entity',
                  selected.entity_id ? (
                    <button
                      type="button"
                      className="text-xs text-green-700 hover:underline dark:text-green-400"
                      onClick={() => {
                        setFilters({ entity_type: selected.entity_type, entity_id: selected.entity_id ?? '' });
                        setSelected(null);
                      }}
                    >
                      Show all events for this entity
                    </button>
                  ) : (
                    '—'
                  ),
                ],
              ]}
            />
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Changes</h3>
              <JsonDiff before={selected.before} after={selected.after} />
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
