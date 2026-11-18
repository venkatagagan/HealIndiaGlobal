import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlarmClock, Download, KanbanSquare, Table2, Tag, Upload, UserPlus } from 'lucide-react';
import {
  LEAD_FOLLOW_UP_FILTERS,
  LEAD_SORT_FIELDS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  crmApi,
  errorMessage,
  type LeadFilters,
  type LeadListParams,
  type LeadOut,
  type LeadStatus,
} from '@hig/shared/api';
import {
  DataTable,
  DateCell,
  FilterBar,
  MultiSelectFilter,
  PersonCell,
  QuickFilters,
  SelectFilter,
  TextCell,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { Badge, Button, Card, PageHeader, Segmented, Skeleton } from '../../components/ui';
import { countryName } from '../../lib/constants';
import { cn, filterParam, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';
import { useAppTranslation, type AppT } from '../../i18n';
import { ImportLeadsDialog } from './ImportLeadsDialog';
import { LeadFormDialog } from './LeadFormDialog';
import { LEAD_SOURCE_TONES, LEAD_STATUS_BAR, LEAD_STATUS_TONES, isOverdue, leadKeys } from './leadMeta';
import { useLeadMove } from './useLeadMove';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(LEAD_STATUSES),
  source: filterParam.list(LEAD_SOURCES),
  follow_up: filterParam.oneOf(LEAD_FOLLOW_UP_FILTERS),
  tag: filterParam.text(),
};
type View = 'board' | 'table';
const BOARD_PAGE_SIZE = 50;

function toApiFilters(f: FilterValues<typeof FILTERS>): LeadFilters {
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    source: f.source.length ? f.source : undefined,
    follow_up: f.follow_up || undefined,
    tag: f.tag.trim().toLowerCase() || undefined,
  };
}

function FollowUp({ lead }: { lead: LeadOut }) {
  const { t } = useAppTranslation();
  if (!lead.next_follow_up_at) return <span className="text-muted">—</span>;
  const overdue = isOverdue(lead);
  return (
    <span className={cn('inline-flex items-center gap-1', overdue ? 'font-medium text-danger-ink' : lead.follow_up_due ? 'font-medium text-warning-ink' : '')}>
      <AlarmClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {formatDateTime(lead.next_follow_up_at)}
      {overdue ? <span className="sr-only">{t('crm.followUp.overdue')}</span> : null}
    </span>
  );
}

const columns = (t: AppT): DataTableColumn<LeadOut>[] => [
  {
    key: 'full_name',
    header: t('crm.fields.fullName'),
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (l) => <PersonCell name={l.full_name} secondary={l.interest ?? undefined} />,
    exportValue: (l) => l.full_name,
  },
  {
    key: 'status',
    header: t('crm.fields.status'),
    sortable: true,
    mobile: 'badge',
    cell: (l) => <Badge tone={LEAD_STATUS_TONES[l.status]}>{t(`crm.status.${l.status}`)}</Badge>,
    exportValue: (l) => t(`crm.status.${l.status}`),
  },
  {
    key: 'source',
    header: t('crm.fields.source'),
    cell: (l) => <TextCell primary={t(`crm.source.${l.source}`)} secondary={l.source_detail ?? undefined} />,
    exportValue: (l) => t(`crm.source.${l.source}`),
  },
  {
    key: 'contact',
    header: t('crm.fields.contact'),
    className: 'max-w-60',
    cell: (l) => (
      <TextCell
        primary={l.phone ?? l.whatsapp ?? l.email ?? <span className="text-muted">—</span>}
        secondary={l.country ? countryName(l.country) : undefined}
      />
    ),
    exportValue: (l) => [l.phone, l.whatsapp, l.email].filter(Boolean).join(' / '),
  },
  {
    key: 'next_follow_up_at',
    header: t('crm.fields.nextFollowUp'),
    sortable: true,
    cell: (l) => <FollowUp lead={l} />,
    exportValue: (l) => l.next_follow_up_at ?? '',
  },
  {
    key: 'budget',
    header: t('crm.fields.budget'),
    align: 'end',
    defaultHidden: true,
    cell: (l) => (l.budget_minor !== null && l.budget_currency ? formatMoney(l.budget_minor, l.budget_currency) : '—'),
    exportValue: (l) => (l.budget_minor !== null && l.budget_currency ? formatMoney(l.budget_minor, l.budget_currency) : ''),
  },
  {
    key: 'tags',
    header: t('crm.fields.tags'),
    defaultHidden: true,
    cell: (l) => (l.tags.length ? <span className="text-xs text-muted">{l.tags.join(', ')}</span> : '—'),
    exportValue: (l) => l.tags.join('; '),
  },
  {
    key: 'last_activity_at',
    header: t('crm.fields.lastActivity'),
    sortable: true,
    sortDescFirst: true,
    cell: (l) => <DateCell value={l.last_activity_at} display="relative" className="text-muted" />,
    exportValue: (l) => l.last_activity_at ?? '',
  },
  {
    key: 'created_at',
    header: t('crm.fields.created'),
    sortable: true,
    sortDescFirst: true,
    defaultHidden: true,
    cell: (l) => <DateCell value={l.created_at} display="date" />,
    exportValue: (l) => l.created_at,
  },
];

export function LeadsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('crm.title'));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'table' ? 'table' : 'board';
  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    if (next === 'board') p.delete('view');
    else p.set('view', next);
    setParams(p, { replace: true });
  };
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: LEAD_SORT_FIELDS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const boardFilters = useMemo(() => ({ ...apiFilters, status: undefined }), [apiFilters]);
  const cols = useMemo(() => columns(t), [t]);

  const pipeline = useQuery({
    queryKey: leadKeys.pipeline(boardFilters),
    queryFn: () => crmApi.pipeline(boardFilters),
    placeholderData: keepPreviousData,
  });
  const stageCount = (s: LeadStatus) => pipeline.data?.stages.find((x) => x.status === s)?.count;

  async function exportCsv() {
    setExporting(true);
    try {
      await crmApi.exportCsv(view === 'board' ? boardFilters : apiFilters);
    } catch (error) {
      toast.error(errorMessage(error, t('crm.export.failed')));
    } finally {
      setExporting(false);
    }
  }

  const statusOptions: FilterOption<LeadStatus>[] = LEAD_STATUSES.map((s) => ({
    value: s,
    label: t(`crm.status.${s}`),
    tone: LEAD_STATUS_TONES[s],
    count: stageCount(s),
  }));
  const sourceOptions: FilterOption<(typeof LEAD_SOURCES)[number]>[] = LEAD_SOURCES.map((s) => ({
    value: s,
    label: t(`crm.source.${s}`),
    count: pipeline.data?.sources.find((x) => x.source === s)?.total,
  }));
  const followOptions: FilterOption<(typeof LEAD_FOLLOW_UP_FILTERS)[number]>[] = [
    { value: 'due', label: t('crm.followUp.due'), tone: 'warning', count: pipeline.data?.follow_ups_due_today },
    { value: 'overdue', label: t('crm.followUp.overdue'), tone: 'danger', count: pipeline.data?.follow_ups_overdue },
    { value: 'none', label: t('crm.followUp.none') },
  ];

  const toolbar = (
    <FilterBar
      search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('crm.filters.search'), label: t('crm.filters.searchLabel') }}
      onReset={table.resetFilters}
    >
      {view === 'table' ? (
        <MultiSelectFilter label={t('crm.fields.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
      ) : null}
      <MultiSelectFilter label={t('crm.fields.source')} value={filters.source} onChange={(v) => setFilter('source', v)} options={sourceOptions} />
      <SelectFilter
        label={t('crm.filters.followUp')}
        icon={<AlarmClock className="size-3.5 opacity-70" aria-hidden />}
        value={filters.follow_up}
        onChange={(v) => setFilter('follow_up', v)}
        options={followOptions}
      />
      <TagFilter value={filters.tag} onChange={(v) => setFilter('tag', v)} />
    </FilterBar>
  );

  const p = pipeline.data;
  return (
    <div>
      <PageHeader
        title={t('crm.title')}
        description={t('crm.description')}
        actions={
          <>
            <Button variant="outline" icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => setImporting(true)}>
              {t('crm.import.open')}
            </Button>
            <Button variant="outline" icon={<Download className="h-4 w-4" aria-hidden />} loading={exporting} onClick={() => void exportCsv()}>
              {t('crm.export.button')}
            </Button>
            <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>
              {t('crm.add')}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label={t('crm.summary.open')} value={p ? formatNumber(p.open) : null} />
        <SummaryTile
          label={t('crm.summary.conversion')}
          value={p ? (p.conversion_rate === null ? '—' : formatPercent(p.conversion_rate)) : null}
          hint={p ? t('crm.summary.wonLost', { won: formatNumber(p.won), lost: formatNumber(p.lost) }) : undefined}
        />
        <SummaryTile
          label={t('crm.summary.dueToday')}
          value={p ? formatNumber(p.follow_ups_due_today) : null}
          hint={p && p.follow_ups_overdue > 0 ? t('crm.summary.overdue', { count: p.follow_ups_overdue }) : undefined}
          to="/leads?follow_up=due"
          warn={Boolean(p && p.follow_ups_overdue > 0)}
        />
        <SummaryTile label={t('crm.summary.newThisMonth')} value={p ? formatNumber(p.new_this_month) : null} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          ariaLabel={t('crm.view.label')}
          value={view}
          onChange={setView}
          size="sm"
          options={[
            {
              value: 'board',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <KanbanSquare className="h-3.5 w-3.5" aria-hidden />
                  {t('crm.view.board')}
                </span>
              ),
            },
            {
              value: 'table',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Table2 className="h-3.5 w-3.5" aria-hidden />
                  {t('crm.view.table')}
                </span>
              ),
            },
          ]}
        />
      </div>

      {view === 'table' ? (
        <LeadsTable table={table} columns={cols} filters={apiFilters} toolbar={toolbar} onAdd={() => setAdding(true)} />
      ) : (
        <>
          <Card className="mb-3 p-3">{toolbar}</Card>
          <Board filters={boardFilters} counts={stageCount} />
        </>
      )}

      <LeadFormDialog open={adding} onClose={() => setAdding(false)} onSaved={(lead) => navigate(`/leads/${lead.id}`)} />
      <ImportLeadsDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

type LeadsTableState = ReturnType<typeof useTableState<typeof FILTERS>>;

function LeadsTable({
  table,
  columns: cols,
  filters,
  toolbar,
  onAdd,
}: {
  table: LeadsTableState;
  columns: DataTableColumn<LeadOut>[];
  filters: LeadFilters;
  toolbar: ReactNode;
  onAdd: () => void;
}) {
  const { t } = useAppTranslation();
  const params: LeadListParams = { ...filters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const list = useQuery({ queryKey: leadKeys.list(params), queryFn: () => crmApi.list(params), placeholderData: keepPreviousData });
  const quickItems: QuickFilterItem<LeadStatus>[] = [
    { value: '', label: t('crm.filters.all') },
    ...LEAD_STATUSES.map((s) => ({ value: s, label: t(`crm.status.${s}`) })),
  ];
  const status = table.filters.status;
  const quickValue = status.length === 0 ? '' : status.length === 1 ? status[0]! : null;
  return (
    <DataTable
      id="agent.leads"
      caption={t('crm.title')}
      table={table}
      columns={cols}
      rows={list.data?.items}
      total={list.data?.total}
      loading={list.isLoading}
      fetching={list.isFetching && !list.isLoading}
      error={list.error}
      onRetry={() => void list.refetch()}
      rowHref={(l) => `/leads/${l.id}`}
      rowLabel={(l) => t('crm.openLead', { name: l.full_name })}
      emptyTitle={t('crm.emptyTitle')}
      emptyDescription={t('crm.emptyDescription')}
      emptyAction={
        <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={onAdd}>
          {t('crm.add')}
        </Button>
      }
      header={
        <div className="border-b border-border px-2 sm:px-3">
          <QuickFilters label={t('crm.fields.status')} items={quickItems} value={quickValue} onChange={(v) => table.setFilter('status', v ? [v] : [])} />
        </div>
      }
      toolbar={toolbar}
    />
  );
}

function SummaryTile({ label, value, hint, to, warn }: { label: string; value: string | null; hint?: string; to?: string; warn?: boolean }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      {value === null ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="mt-0.5 text-2xl font-bold tabular-nums text-fg">{value}</p>}
      {hint ? <p className={cn('mt-0.5 text-xs', warn ? 'font-medium text-danger-ink' : 'text-muted')}>{hint}</p> : null}
    </>
  );
  const cls = 'block rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4';
  return to ? (
    <Link to={to} className={cn(cls, 'transition hover:border-border-strong hover:shadow-raised')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function TagFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  return (
    <form
      className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface ps-3 pe-1 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(text.trim());
      }}
    >
      <Tag className="h-3.5 w-3.5 opacity-70" aria-hidden />
      <input
        aria-label={t('crm.filters.tag')}
        placeholder={t('crm.filters.tag')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== value && onChange(text.trim())}
        className="w-28 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------------------------------------
function Board({ filters, counts }: { filters: LeadFilters; counts: (s: LeadStatus) => number | undefined }) {
  const { t } = useAppTranslation();
  const { move, dialog } = useLeadMove();
  const [dragging, setDragging] = useState<LeadOut | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);
  const columnsData = useQueries({
    queries: LEAD_STATUSES.map((status) => {
      const params: LeadListParams = {
        ...filters,
        status: [status],
        page_size: BOARD_PAGE_SIZE,
        // open stages: next follow-up first; closed stages: most recently changed first
        sort: status === 'won' || status === 'lost' ? '-updated_at' : 'next_follow_up_at',
      };
      return {
        queryKey: leadKeys.column(status, params),
        queryFn: () => crmApi.list(params),
        placeholderData: keepPreviousData,
      };
    }),
  });

  function onDrop(event: DragEvent<HTMLElement>, status: LeadStatus) {
    event.preventDefault();
    setOver(null);
    const lead = dragging;
    setDragging(null);
    if (lead) move(lead, status);
  }

  return (
    <>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3" role="list" aria-label={t('crm.view.boardLabel')}>
        {LEAD_STATUSES.map((status, i) => {
          const q = columnsData[i]!;
          const items = q.data?.items ?? [];
          const total = counts(status) ?? q.data?.total;
          const droppable = dragging !== null && dragging.status !== status;
          return (
            <section
              key={status}
              role="listitem"
              aria-label={t(`crm.status.${status}`)}
              onDragOver={(e) => {
                if (!droppable) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (over !== status) setOver(status);
              }}
              onDragLeave={() => over === status && setOver(null)}
              onDrop={(e) => onDrop(e, status)}
              className={cn(
                'flex w-72 shrink-0 snap-start flex-col rounded-2xl border border-t-4 border-border bg-surface-2/60',
                LEAD_STATUS_BAR[status],
                over === status && 'ring-2 ring-primary',
              )}
            >
              <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                <h2 className="text-sm font-semibold text-fg">{t(`crm.status.${status}`)}</h2>
                <Badge tone={LEAD_STATUS_TONES[status]}>{total === undefined ? '…' : formatNumber(total)}</Badge>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {q.isPending ? (
                  <>
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                  </>
                ) : q.isError ? (
                  <p className="p-2 text-xs text-danger-ink">{errorMessage(q.error)}</p>
                ) : items.length === 0 ? (
                  <p className="p-2 text-center text-xs text-muted">{t('crm.board.empty')}</p>
                ) : (
                  items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onMove={(to) => move(lead, to)}
                      onDragStart={() => setDragging(lead)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    />
                  ))
                )}
                {q.data && q.data.total > items.length ? (
                  <Link to={`/leads?view=table&status=${status}`} className="p-1 text-center text-xs font-medium text-primary-ink hover:underline">
                    {t('crm.board.more', { count: q.data.total - items.length })}
                  </Link>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {dialog}
    </>
  );
}

function LeadCard({
  lead,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  lead: LeadOut;
  onMove: (to: LeadStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useAppTranslation();
  const locked = lead.status === 'won' || Boolean(lead.converted_patient_id);
  return (
    <article
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lead.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-xl border border-border bg-surface p-3 text-sm shadow-card',
        !locked && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <Link to={`/leads/${lead.id}`} className="block font-semibold text-fg hover:text-primary-ink hover:underline">
        {lead.full_name}
      </Link>
      {lead.interest ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{lead.interest}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone={LEAD_SOURCE_TONES[lead.source]}>{t(`crm.source.${lead.source}`)}</Badge>
        {lead.country ? <span className="text-muted">{countryName(lead.country)}</span> : null}
      </div>
      {lead.next_follow_up_at && !locked && lead.status !== 'lost' ? (
        <p className="mt-2 text-xs">
          <FollowUp lead={lead} />
        </p>
      ) : null}
      {lead.status === 'lost' && lead.lost_reason ? <p className="mt-2 line-clamp-2 text-xs text-muted">{lead.lost_reason}</p> : null}
      {lead.converted_at ? <p className="mt-2 text-xs text-primary-ink">{t('crm.board.convertedOn', { date: formatDate(lead.converted_at) })}</p> : null}
      {lead.tags.length ? <p className="mt-1 truncate text-xs text-muted">#{lead.tags.join(' #')}</p> : null}
      {!locked ? (
        <label className="mt-2 block">
          <span className="sr-only">{t('crm.board.moveTo', { name: lead.full_name })}</span>
          <select
            value=""
            onChange={(e) => e.target.value && onMove(e.target.value as LeadStatus)}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted"
          >
            <option value="">{t('crm.board.movePlaceholder')}</option>
            {LEAD_STATUSES.filter((s) => s !== lead.status).map((s) => (
              <option key={s} value={s}>
                {s === 'won' ? t('crm.board.convertOption') : t(`crm.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  );
}
