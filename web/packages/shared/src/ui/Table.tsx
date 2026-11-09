import {
  useMemo,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Minus, Rows3, Rows4, Settings2, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { prefs } from '../lib/storage';
import type { TableStateLike } from '../lib/tableState';
import { Button } from './Button';
import { EmptyState, ErrorState, Skeleton } from './feedback';
import { Popover, usePopover } from './Popover';

// -----------------------------------------------------------------------------------------------------------
// Table primitives
// -----------------------------------------------------------------------------------------------------------
export interface TableProps extends ComponentProps<'table'> {
  /** class of the scroll container */
  containerClassName?: string;
  /** style of the scroll container (e.g. a maxHeight for a sticky header) */
  containerStyle?: CSSProperties;
  /** visually hidden caption (accessible name of the table) */
  caption?: ReactNode;
}

export function Table({ className, containerClassName, containerStyle, caption, children, ...rest }: TableProps) {
  return (
    <div className={cn('w-full overflow-x-auto', containerClassName)} style={containerStyle}>
      <table className={cn('w-full border-collapse text-sm', className)} {...rest}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...rest }: ComponentProps<'thead'>) {
  return <thead className={cn('border-b border-border bg-surface-2/60', className)} {...rest} />;
}

export function TBody({ className, ...rest }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...rest} />;
}

export function TFoot({ className, ...rest }: ComponentProps<'tfoot'>) {
  return <tfoot className={cn('border-t border-border bg-surface-2/40 font-medium', className)} {...rest} />;
}

export function Tr({ className, ...rest }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors', className)} {...rest} />;
}

export function Th({ className, scope = 'col', ...rest }: ComponentProps<'th'>) {
  return (
    <th
      scope={scope}
      className={cn('whitespace-nowrap px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted', className)}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle text-fg', className)} {...rest} />;
}

// -----------------------------------------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------------------------------------
export interface PaginationProps {
  /** 1-based current page */
  page: number;
  /** total pages (else derived from total / pageSize) */
  pages?: number;
  pageSize?: number;
  total?: number;
  /** called with the new page (`onChange` / `onPage` are aliases) */
  onPageChange?: (page: number) => void;
  onChange?: (page: number) => void;
  onPage?: (page: number) => void;
  /** page buttons on each side of the current page (default 1) */
  siblingCount?: number;
  /** "21–40 of 135" text (default true) */
  showSummary?: boolean;
  /** shows a "Rows per page" select */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
}

type PageToken = number | 'gap-start' | 'gap-end';

function pageTokens(page: number, pages: number, siblings: number): PageToken[] {
  const tokens: PageToken[] = [];
  const start = Math.max(2, page - siblings);
  const end = Math.min(pages - 1, page + siblings);
  tokens.push(1);
  if (start > 2) tokens.push('gap-start');
  for (let p = start; p <= end; p += 1) tokens.push(p);
  if (end < pages - 1) tokens.push('gap-end');
  if (pages > 1) tokens.push(pages);
  return tokens;
}

export function Pagination({
  page,
  pages,
  pageSize,
  total,
  onPageChange,
  onChange,
  onPage,
  siblingCount = 1,
  showSummary = true,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const { t } = useCommonTranslation();
  const pageCount = Math.max(1, pages ?? (total !== undefined && pageSize ? Math.ceil(total / pageSize) : 1));
  if (total === 0 || (pageCount <= 1 && total === undefined)) return null;
  const go = (next: number) => {
    const target = Math.min(Math.max(next, 1), pageCount);
    if (target === page) return;
    onPageChange?.(target);
    onChange?.(target);
    onPage?.(target);
  };
  const summary =
    total !== undefined && pageSize
      ? t('pagination.summary', {
          from: Math.min((page - 1) * pageSize + 1, total).toLocaleString(),
          to: Math.min(page * pageSize, total).toLocaleString(),
          total: total.toLocaleString(),
        })
      : t('pagination.page', { page, pages: pageCount });
  const navButton =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-surface px-2 text-sm text-fg ' +
    'transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'disabled:pointer-events-none disabled:opacity-40';
  const sizeSelect = onPageSizeChange && pageSize && (
    <label className="hidden items-center gap-2 text-sm text-muted sm:flex">
      Rows per page
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="h-8 cursor-pointer rounded-lg border border-border bg-surface px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {pageSizeOptions.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <nav aria-label={t('pagination.label')} className={cn('flex flex-wrap items-center justify-between gap-3 py-3', className)}>
      {showSummary ? <p className="text-sm text-muted tabular-nums">{summary}</p> : <span />}
      <div className="flex items-center gap-4">
        {sizeSelect}
        {pageCount > 1 && (
          <ul className="flex items-center gap-1">
            <li>
              <button type="button" className={navButton} onClick={() => go(page - 1)} disabled={page <= 1} aria-label={t('pagination.previous')}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
            </li>
            {pageTokens(page, pageCount, siblingCount).map((token) =>
              typeof token === 'number' ? (
                <li key={token} className="hidden sm:block">
                  <button
                    type="button"
                    className={cn(navButton, token === page && 'border-primary bg-primary-soft font-semibold text-primary-ink hover:bg-primary-soft')}
                    onClick={() => go(token)}
                    aria-current={token === page ? 'page' : undefined}
                    aria-label={t('pagination.goTo', { page: token })}
                  >
                    {token}
                  </button>
                </li>
              ) : (
                <li key={token} className="hidden px-1 text-muted sm:block" aria-hidden>
                  …
                </li>
              ),
            )}
            <li className="px-2 text-sm text-muted tabular-nums sm:hidden">
              {page} / {pageCount}
            </li>
            <li>
              <button type="button" className={navButton} onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label={t('pagination.next')}>
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </li>
          </ul>
        )}
      </div>
    </nav>
  );
}

// -----------------------------------------------------------------------------------------------------------
// DataTable
// -----------------------------------------------------------------------------------------------------------
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export type SortValue = string | number | boolean | Date | null | undefined;

/** Where a column goes in the mobile card layout (below `md`, when `responsive="cards"`). */
export type MobileRole = 'primary' | 'secondary' | 'badge' | 'meta' | 'hidden';

export type TableDensity = 'comfortable' | 'compact';

export interface DataTableColumn<T> {
  /** unique column id; also the default property read from the row */
  key: string;
  header: ReactNode;
  /** custom cell renderer (default: `accessor(row)` or `row[key]`) */
  cell?: (row: T, index: number) => ReactNode;
  /** raw value for the default renderer, sorting and CSV export */
  accessor?: (row: T) => unknown;
  sortable?: boolean;
  /** value used for client-side sorting (default: accessor / row[key]) */
  sortValue?: (row: T) => SortValue;
  /** sort field name sent to the server / kept in the URL (default: `key`), e.g. "updated_at" */
  sortKey?: string;
  /** first click sorts descending (dates, amounts) */
  sortDescFirst?: boolean;
  align?: 'start' | 'center' | 'end' | 'left' | 'right';
  className?: string;
  headerClassName?: string;
  /** CSS width, e.g. "8rem" or "20%" */
  width?: string;
  minWidth?: string;
  /** hide below the md breakpoint (scroll layout) / leave out of mobile cards */
  hideOnMobile?: boolean;
  /** plain-text name used for labels (sort button, column menu, mobile cards, CSV) when `header` is not a string */
  title?: string;
  /** may be hidden from the column menu (default true; the first column is never hideable) */
  hideable?: boolean;
  /** hidden until the user turns it on in the column menu */
  defaultHidden?: boolean;
  /** stick to the start edge while scrolling horizontally */
  sticky?: boolean;
  /** role in the mobile card (default: first column "primary", the rest "meta") */
  mobile?: MobileRole;
  /** renderer for the mobile card (default: `cell`) */
  mobileCell?: (row: T, index: number) => ReactNode;
  /** CSV value (default: accessor / row[key] when primitive) */
  exportValue?: (row: T) => SortValue;
  /** false: leave out of CSV exports */
  exportable?: boolean;
}

/** Alias for apps that call it Column<T>. */
export type Column<T> = DataTableColumn<T>;

export interface DataTablePagination {
  page: number;
  pages?: number;
  pageSize?: number;
  total?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

type RowKey = string | number;

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  /** rows (`data` is an alias) */
  rows?: readonly T[] | null;
  data?: readonly T[] | null;
  /** default: row.id, else the index */
  rowKey?: (row: T, index: number) => RowKey;
  /** first load: shows skeleton rows */
  loading?: boolean;
  /** background refetch: dims the rows */
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  // ---- state wiring ----------------------------------------------------------------------------------
  /** URL table state from `useTableState()`: wires sort, pagination, page size and the filtered-empty state */
  table?: TableStateLike;
  /** total rows on the server (server mode). With `table` and no `total` the table sorts/paginates client-side */
  total?: number;
  /** override the mode inferred from `table` + `total` */
  mode?: 'server' | 'client';
  /** persistence key for column visibility + density (localStorage), e.g. "admin.cases" */
  id?: string;

  // ---- empty states ----------------------------------------------------------------------------------
  /** custom empty state (replaces everything below) */
  empty?: ReactNode;
  /** "no data yet" title / description / call to action */
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  /** filters are active: shows "No matching results" + "Reset filters" (default: table.isFiltered) */
  filtersActive?: boolean;
  onResetFilters?: () => void;

  // ---- rows ------------------------------------------------------------------------------------------
  onRowClick?: (row: T) => void;
  /** row navigates to this URL (router link; Ctrl/Cmd-click opens a new tab) */
  rowHref?: (row: T) => string | null | undefined;
  /** accessible name of the row link (default "Open") */
  rowLabel?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** checkbox column + bulk-actions bar */
  selectable?: boolean;
  /** bar shown while rows are selected: (selectedRows, clearSelection) => actions */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
  onSelectionChange?: (rows: T[]) => void;

  // ---- legacy / uncontrolled sort + pagination (when `table` is not given) ----------------------------
  /** controlled sort; with `manualSort` the rows are expected to be sorted by the server */
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  manualSort?: boolean;
  /** server-side pagination (from a `Page<T>` response) */
  pagination?: DataTablePagination;
  /** client-side pagination page size (when `pagination` is not given) */
  pageSize?: number;

  // ---- presentation ----------------------------------------------------------------------------------
  caption?: ReactNode;
  className?: string;
  /** initial density compact (legacy) */
  dense?: boolean;
  /** initial density (the user's choice is persisted with `id`) */
  density?: TableDensity;
  skeletonRows?: number;
  /** full-width content at the top of the card (e.g. QuickFilters tabs) */
  header?: ReactNode;
  /** toolbar row (e.g. a FilterBar); the view-options menu sits at its end */
  toolbar?: ReactNode;
  /** columns + density menu (default: true when `id` is set) */
  showViewOptions?: boolean;
  /** below md: "cards" (default with `id` or `table`) or "scroll" (horizontal scroll, legacy default) */
  responsive?: 'cards' | 'scroll';
  /** scroll the body inside the card with a sticky header, e.g. "70vh" */
  maxHeight?: string;
}

const ALIGN: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  start: 'text-start',
  left: 'text-start',
  center: 'text-center',
  end: 'text-end',
  right: 'text-end',
};

function readValue<T>(column: DataTableColumn<T>, row: T): unknown {
  if (column.accessor) return column.accessor(row);
  if (row && typeof row === 'object') return (row as Record<string, unknown>)[column.key];
  return undefined;
}

function renderDefault(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function compareValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function defaultRowKey(row: unknown, index: number): RowKey {
  if (row && typeof row === 'object' && 'id' in row) {
    const id = (row as { id: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return index;
}

const sortKeyOf = <T,>(column: DataTableColumn<T>) => column.sortKey ?? column.key;
const columnName = <T,>(column: DataTableColumn<T>) => column.title ?? (typeof column.header === 'string' ? column.header : column.key);

/** Sort rows client-side the way DataTable does (exported for custom layouts). */
export function sortRows<T>(rows: readonly T[], sort: SortState | null | undefined, columns: readonly DataTableColumn<T>[]): T[] {
  if (!sort) return [...rows];
  const column = columns.find((c) => sortKeyOf(c) === sort.key || c.key === sort.key);
  if (!column) return [...rows];
  const valueOf = (row: T): SortValue => {
    if (column.sortValue) return column.sortValue(row);
    const v = readValue(column, row);
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date ? v : v == null ? null : String(v);
  };
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => factor * compareValues(valueOf(a), valueOf(b)));
}

// ---- persisted view (column visibility + density) -------------------------------------------------------
interface ViewPrefs {
  hidden: string[];
  density: TableDensity;
}

function readViewPrefs(id: string | undefined): Partial<ViewPrefs> | null {
  if (!id) return null;
  try {
    const raw = prefs.get(`table:${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((k): k is string => typeof k === 'string') : undefined,
      density: parsed.density === 'compact' || parsed.density === 'comfortable' ? parsed.density : undefined,
    };
  } catch {
    return null;
  }
}

function writeViewPrefs(id: string | undefined, value: ViewPrefs): void {
  if (!id) return;
  try {
    prefs.set(`table:${id}`, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [role="menuitem"], [role="option"]';

function SelectBox({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        'flex size-4 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        checked || indeterminate ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface hover:border-primary',
      )}
    >
      {indeterminate ? <Minus className="size-3" strokeWidth={3} aria-hidden /> : checked ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

function ViewOptionsMenu<T>({
  columns,
  hidden,
  onToggle,
  density,
  onDensity,
  onReset,
}: {
  columns: readonly DataTableColumn<T>[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  density: TableDensity;
  onDensity: (d: TableDensity) => void;
  onReset: () => void;
}) {
  const popover = usePopover();
  const hideable = columns.filter((c, i) => i > 0 && c.hideable !== false);
  return (
    <>
      <Button
        ref={popover.anchorRef}
        variant="outline"
        size="icon-sm"
        className="size-9 rounded-full"
        title="Table view options"
        aria-label="Table view options"
        aria-expanded={popover.open}
        aria-controls={popover.popoverProps.id}
        aria-haspopup="dialog"
        onClick={() => popover.setOpen(!popover.open)}
      >
        <Settings2 className="size-4" aria-hidden />
      </Button>
      <Popover {...popover.popoverProps} align="end" label="Table view options" className="w-64">
        <div className="border-b border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Density</p>
          <div role="radiogroup" aria-label="Density" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {(
              [
                ['comfortable', 'Comfortable', Rows3],
                ['compact', 'Compact', Rows4],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={density === value}
                onClick={() => onDensity(value)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  density === value ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
        {hideable.length > 0 && (
          <div className="flex min-h-0 flex-col">
            <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Columns</p>
            <div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
              {hideable.map((c) => {
                const visible = !hidden.has(c.key);
                return (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={visible} onChange={() => onToggle(c.key)} className="size-4 accent-primary" />
                    {columnName(c)}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded text-xs font-medium text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reset view
          </button>
        </div>
      </Popover>
    </>
  );
}

/**
 * Accessible data table: server- or client-side sort and pagination, URL state (`table`), column visibility
 * and density (persisted per `id`), row links, selection with bulk actions, loading / empty / filtered-empty /
 * error states and a card layout on small screens. See TABLES.md.
 */
export function DataTable<T>({
  columns,
  rows,
  data,
  rowKey = defaultRowKey,
  loading = false,
  fetching = false,
  error,
  onRetry,
  table,
  total,
  mode,
  id,
  empty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyIcon,
  filtersActive,
  onResetFilters,
  onRowClick,
  rowHref,
  rowLabel,
  rowClassName,
  selectable = false,
  bulkActions,
  onSelectionChange,
  sort,
  defaultSort = null,
  onSortChange,
  manualSort = false,
  pagination,
  pageSize,
  caption,
  className,
  dense = false,
  density: densityProp,
  skeletonRows,
  header,
  toolbar,
  showViewOptions,
  responsive,
  maxHeight,
}: DataTableProps<T>) {
  const { t } = useCommonTranslation();
  const source = rows ?? data ?? null;
  const effectiveMode: 'server' | 'client' | 'legacy' = mode ?? (table ? (total !== undefined ? 'server' : 'client') : 'legacy');
  const layout = responsive ?? (id || table ? 'cards' : 'scroll');

  // ---- view prefs ------------------------------------------------------------------------------------
  const [view, setView] = useState<ViewPrefs>(() => {
    const stored = readViewPrefs(id);
    return {
      hidden: stored?.hidden ?? columns.filter((c) => c.defaultHidden).map((c) => c.key),
      density: stored?.density ?? densityProp ?? (dense ? 'compact' : 'comfortable'),
    };
  });
  const updateView = (next: ViewPrefs) => {
    setView(next);
    writeViewPrefs(id, next);
  };
  const hiddenSet = useMemo(() => new Set(view.hidden), [view.hidden]);
  const visibleColumns = useMemo(
    () => columns.filter((c, i) => i === 0 || c.hideable === false || !hiddenSet.has(c.key)),
    [columns, hiddenSet],
  );
  const compact = view.density === 'compact';

  // ---- sort ------------------------------------------------------------------------------------------
  const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort);
  const [clientPage, setClientPage] = useState(1);
  const activeSort = table ? table.sort : sort !== undefined ? sort : innerSort;
  const sortLocally = effectiveMode === 'client' || (effectiveMode === 'legacy' && !manualSort);

  const sorted = useMemo(() => {
    if (!source) return [];
    return sortLocally ? sortRows(source, activeSort, columns) : [...source];
  }, [source, activeSort, sortLocally, columns]);

  const toggleSort = (column: DataTableColumn<T>) => {
    const key = sortKeyOf(column);
    const first: SortDirection = column.sortDescFirst ? 'desc' : 'asc';
    let next: SortState | null;
    if (!activeSort || activeSort.key !== key) next = { key, direction: first };
    else if (activeSort.direction === first) next = { key, direction: first === 'asc' ? 'desc' : 'asc' };
    else next = null;
    if (table) table.setSort(next);
    else if (sort === undefined) setInnerSort(next);
    onSortChange?.(next);
    setClientPage(1);
  };

  // ---- pagination ------------------------------------------------------------------------------------
  let visible: T[] = sorted;
  let footer: DataTablePagination | null = null;
  if (effectiveMode === 'server' && table) {
    footer = {
      page: table.page,
      pageSize: table.pageSize,
      total,
      onPageChange: table.setPage,
      onPageSizeChange: table.setPageSize,
      pageSizeOptions: table.pageSizeOptions,
    };
  } else if (effectiveMode === 'client' && table) {
    const pages = Math.max(1, Math.ceil(sorted.length / table.pageSize));
    const current = Math.min(table.page, pages);
    visible = sorted.slice((current - 1) * table.pageSize, current * table.pageSize);
    footer = {
      page: current,
      pageSize: table.pageSize,
      total: sorted.length,
      onPageChange: table.setPage,
      onPageSizeChange: table.setPageSize,
      pageSizeOptions: table.pageSizeOptions,
    };
  } else if (pagination) {
    footer = pagination;
  } else if (pageSize) {
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const current = Math.min(clientPage, pages);
    visible = sorted.slice((current - 1) * pageSize, current * pageSize);
    footer = sorted.length > pageSize ? { page: current, pageSize, total: sorted.length, onPageChange: setClientPage } : null;
  }

  // ---- selection -------------------------------------------------------------------------------------
  const [selection, setSelection] = useState<Map<RowKey, T>>(() => new Map());
  const changeSelection = (next: Map<RowKey, T>) => {
    setSelection(next);
    onSelectionChange?.([...next.values()]);
  };
  const clearSelection = () => changeSelection(new Map());
  const visibleKeys = visible.map((row, i) => rowKey(row, i));
  const selectedOnPage = visibleKeys.filter((k) => selection.has(k)).length;
  const allOnPage = visible.length > 0 && selectedOnPage === visible.length;
  const togglePage = () => {
    const next = new Map(selection);
    if (allOnPage) visibleKeys.forEach((k) => next.delete(k));
    else visible.forEach((row, i) => next.set(visibleKeys[i]!, row));
    changeSelection(next);
  };
  const toggleRow = (row: T, key: RowKey) => {
    const next = new Map(selection);
    if (next.has(key)) next.delete(key);
    else next.set(key, row);
    changeSelection(next);
  };

  // ---- row activation --------------------------------------------------------------------------------
  const clickable = Boolean(onRowClick || rowHref);
  const activate = (row: T, event: MouseEvent<HTMLElement>) => {
    const target = event.target as Element;
    const interactive = target.closest(INTERACTIVE);
    if (interactive && interactive !== event.currentTarget && !interactive.hasAttribute('data-row-link')) return;
    if (window.getSelection?.()?.toString()) return; // user is selecting text
    if (rowHref) {
      const link = event.currentTarget.querySelector<HTMLAnchorElement>('a[data-row-link]');
      if (link && !interactive) {
        if (event.metaKey || event.ctrlKey) window.open(link.href, '_blank', 'noopener');
        else link.click();
        return;
      }
      if (link) return; // the link itself handles the click
    }
    onRowClick?.(row);
  };
  const onRowKeyDown = (row: T) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };
  const rowLink = (row: T) => {
    const href = rowHref?.(row);
    if (!href) return null;
    return (
      <Link to={href} data-row-link="" className="sr-only" onClick={(e) => e.stopPropagation()}>
        {rowLabel?.(row) ?? 'Open'}
      </Link>
    );
  };

  // ---- states ----------------------------------------------------------------------------------------
  const showSkeleton = loading && !source;
  const isEmpty = !showSkeleton && !error && visible.length === 0;
  const isFiltered = filtersActive ?? table?.isFiltered ?? false;
  const resetFilters = onResetFilters ?? table?.resetFilters;
  const skeletonCount = skeletonRows ?? Math.min(table?.pageSize ?? 6, 8);
  const viewOptions = (showViewOptions ?? Boolean(id)) && (
    <ViewOptionsMenu
      columns={columns}
      hidden={hiddenSet}
      onToggle={(key) =>
        updateView({ ...view, hidden: hiddenSet.has(key) ? view.hidden.filter((k) => k !== key) : [...view.hidden, key] })
      }
      density={view.density}
      onDensity={(density) => updateView({ ...view, density })}
      onReset={() =>
        updateView({ hidden: columns.filter((c) => c.defaultHidden).map((c) => c.key), density: densityProp ?? (dense ? 'compact' : 'comfortable') })
      }
    />
  );

  const emptyNode =
    empty ??
    (isFiltered ? (
      <EmptyState
        title="No matching results"
        description="Try a different search or remove some filters."
        action={
          resetFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters} leftIcon={<X className="size-4" aria-hidden />}>
              Reset filters
            </Button>
          )
        }
        compact
      />
    ) : (
      <EmptyState icon={emptyIcon} title={emptyTitle ?? t('states.noResults')} description={emptyDescription} action={emptyAction} compact />
    ));

  const footerVisible =
    footer !== null && footer.total !== 0 && !(footer.total === undefined && (footer.pages ?? 1) <= 1) && !showSkeleton;

  // classes
  const cellPad = cn(compact ? 'px-2.5 py-2' : 'px-3 py-3.5', 'first:ps-4 last:pe-4');
  const headPad = cn(compact ? 'px-2.5 py-2' : 'px-3 py-3', 'first:ps-4 last:pe-4');
  const stickyCell = 'sticky start-0 z-[1] bg-surface';
  const stickyHover = 'group-hover/row:bg-[color-mix(in_oklab,var(--color-surface-2)_60%,var(--color-surface))]';
  const stickySelected = 'bg-[color-mix(in_oklab,var(--color-primary-soft)_45%,var(--color-surface))]';
  const desktopOnly = layout === 'cards' ? 'hidden md:block' : '';
  const colHide = (c: DataTableColumn<T>) => layout === 'scroll' && c.hideOnMobile && 'hidden md:table-cell';
  const colCount = visibleColumns.length + (selectable ? 1 : 0);

  // mobile card roles
  const roles = visibleColumns.map((c, i): MobileRole => c.mobile ?? (c.hideOnMobile ? 'hidden' : i === 0 ? 'primary' : 'meta'));
  const renderCell = (c: DataTableColumn<T>, row: T, index: number, mobile = false) =>
    mobile && c.mobileCell ? c.mobileCell(row, index) : c.cell ? c.cell(row, index) : renderDefault(readValue(c, row));

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-surface shadow-card', className)}>
      {header}
      {toolbar && (
        <div className="flex items-start gap-2 border-b border-border px-3 py-3 sm:px-4">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {viewOptions && <div className="shrink-0">{viewOptions}</div>}
        </div>
      )}
      {selectable && selection.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary-soft/50 px-4 py-2 text-sm animate-fade-in" role="region" aria-label="Bulk actions">
          <span className="font-semibold text-fg tabular-nums">{selection.size.toLocaleString()} selected</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions?.([...selection.values()], clearSelection)}</div>
          <button
            type="button"
            onClick={clearSelection}
            className="ms-auto rounded text-sm font-medium text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear selection
          </button>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : (
        <>
          {/* ---------- table (md+, or always in scroll layout) ---------- */}
          <div className={desktopOnly}>
            <Table caption={caption} aria-busy={loading || fetching || undefined} containerStyle={maxHeight ? { maxHeight } : undefined}>
              <thead className="border-b border-border">
                <tr>
                  {selectable && (
                    <th scope="col" className="sticky start-0 top-0 z-[3] w-11 bg-surface-2 py-3 ps-4 pe-1">
                      <SelectBox
                        checked={allOnPage}
                        indeterminate={!allOnPage && selectedOnPage > 0}
                        onChange={togglePage}
                        label={allOnPage ? 'Deselect all rows on this page' : 'Select all rows on this page'}
                      />
                    </th>
                  )}
                  {visibleColumns.map((column) => {
                    const sk = sortKeyOf(column);
                    const sortedHere = activeSort?.key === sk ? activeSort.direction : null;
                    const name = columnName(column);
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        style={{ width: column.width, minWidth: column.minWidth }}
                        aria-sort={sortedHere ? (sortedHere === 'asc' ? 'ascending' : 'descending') : column.sortable ? 'none' : undefined}
                        className={cn(
                          'sticky top-0 z-[2] bg-surface-2 text-start text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase',
                          headPad,
                          column.align && ALIGN[column.align],
                          column.sticky && (selectable ? 'start-11 z-[3]' : 'start-0 z-[3]'),
                          colHide(column),
                          column.headerClassName,
                        )}
                      >
                        {column.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column)}
                            className={cn(
                              'group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 uppercase tracking-wide hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              sortedHere && 'text-fg',
                              column.align && (column.align === 'end' || column.align === 'right') && 'flex-row-reverse',
                            )}
                            aria-label={t('table.sortBy', { column: name })}
                          >
                            {column.header}
                            {sortedHere === 'asc' ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : sortedHere === 'desc' ? (
                              <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ChevronsUpDown className="size-3.5 opacity-40 group-hover/sort:opacity-80" aria-hidden />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-border', fetching && !showSkeleton && 'opacity-60 transition-opacity')}>
                {showSkeleton &&
                  Array.from({ length: skeletonCount }, (_, i) => (
                    <tr key={`skeleton-${i}`}>
                      {selectable && <td className="w-11 ps-4 pe-1" />}
                      {visibleColumns.map((column, ci) => (
                        <td key={column.key} className={cn(cellPad, colHide(column))}>
                          <Skeleton className={cn('h-4', ci === 0 ? 'w-36' : 'w-full max-w-28')} />
                          {ci === 0 && !compact && <Skeleton className="mt-1.5 h-3 w-20" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                {isEmpty && (
                  <tr>
                    <td colSpan={colCount}>{emptyNode}</td>
                  </tr>
                )}
                {!showSkeleton &&
                  visible.map((row, index) => {
                    const key = visibleKeys[index]!;
                    const isSelected = selection.has(key);
                    return (
                      <tr
                        key={key}
                        onClick={clickable ? (e) => activate(row, e) : undefined}
                        onKeyDown={onRowClick && !rowHref ? onRowKeyDown(row) : undefined}
                        tabIndex={onRowClick && !rowHref ? 0 : undefined}
                        aria-selected={selectable ? isSelected : undefined}
                        className={cn(
                          'group/row transition-colors',
                          clickable && 'cursor-pointer',
                          'hover:bg-surface-2/60',
                          'focus-visible:bg-surface-2 focus-visible:outline-none has-[a[data-row-link]:focus-visible]:bg-surface-2 has-[a[data-row-link]:focus-visible]:outline-2 has-[a[data-row-link]:focus-visible]:-outline-offset-2 has-[a[data-row-link]:focus-visible]:outline-ring',
                          isSelected && 'bg-primary-soft/40 hover:bg-primary-soft/50',
                          rowClassName?.(row),
                        )}
                      >
                        {selectable && (
                          <td className={cn(compact ? 'py-2' : 'py-3.5', 'w-11 ps-4 pe-1', stickyCell, isSelected ? stickySelected : stickyHover)}>
                            <SelectBox checked={isSelected} onChange={() => toggleRow(row, key)} label={isSelected ? 'Deselect row' : 'Select row'} />
                          </td>
                        )}
                        {visibleColumns.map((column, ci) => (
                          <td
                            key={column.key}
                            className={cn(
                              'align-middle text-fg',
                              cellPad,
                              column.align && ALIGN[column.align],
                              column.sticky && cn(stickyCell, selectable && 'start-11', isSelected ? stickySelected : stickyHover),
                              colHide(column),
                              column.className,
                            )}
                          >
                            {ci === 0 && rowLink(row)}
                            {renderCell(column, row, index)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          </div>

          {/* ---------- cards (below md) ---------- */}
          {layout === 'cards' && (
            <div className="md:hidden">
              {selectable && visible.length > 0 && (
                <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted">
                  <SelectBox checked={allOnPage} indeterminate={!allOnPage && selectedOnPage > 0} onChange={togglePage} label="Select all rows on this page" />
                  Select page
                </div>
              )}
              {showSkeleton && (
                <ul className="divide-y divide-border" aria-hidden>
                  {Array.from({ length: Math.min(skeletonCount, 5) }, (_, i) => (
                    <li key={i} className="space-y-2 px-4 py-4">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-5/6" />
                    </li>
                  ))}
                </ul>
              )}
              {isEmpty && emptyNode}
              {!showSkeleton && visible.length > 0 && (
                <ul className={cn('divide-y divide-border', fetching && 'opacity-60 transition-opacity')} aria-label={typeof caption === 'string' ? caption : undefined}>
                  {visible.map((row, index) => {
                    const key = visibleKeys[index]!;
                    const isSelected = selection.has(key);
                    const pick = (role: MobileRole) => visibleColumns.filter((_, i) => roles[i] === role);
                    const primary = pick('primary');
                    const secondary = pick('secondary');
                    const badges = pick('badge');
                    const meta = pick('meta');
                    return (
                      <li
                        key={key}
                        onClick={clickable ? (e) => activate(row, e) : undefined}
                        onKeyDown={onRowClick && !rowHref ? onRowKeyDown(row) : undefined}
                        tabIndex={onRowClick && !rowHref ? 0 : undefined}
                        className={cn(
                          'flex gap-3 px-4 py-3.5 transition-colors',
                          clickable && 'cursor-pointer active:bg-surface-2',
                          'focus-visible:bg-surface-2 focus-visible:outline-none has-[a[data-row-link]:focus-visible]:bg-surface-2',
                          isSelected && 'bg-primary-soft/40',
                          rowClassName?.(row),
                        )}
                      >
                        {selectable && (
                          <div className="pt-0.5">
                            <SelectBox checked={isSelected} onChange={() => toggleRow(row, key)} label={isSelected ? 'Deselect row' : 'Select row'} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {rowLink(row)}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              {primary.map((c) => (
                                <div key={c.key} className="min-w-0 font-medium">
                                  {renderCell(c, row, index, true)}
                                </div>
                              ))}
                            </div>
                            {badges.length > 0 && (
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                {badges.map((c) => (
                                  <div key={c.key}>{renderCell(c, row, index, true)}</div>
                                ))}
                              </div>
                            )}
                            {clickable && badges.length === 0 && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
                          </div>
                          {secondary.map((c) => (
                            <div key={c.key} className="mt-1 min-w-0 text-sm text-muted">
                              {renderCell(c, row, index, true)}
                            </div>
                          ))}
                          {meta.length > 0 && (
                            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              {meta.map((c) => (
                                <div key={c.key} className={cn('min-w-0', c.align && (c.align === 'end' || c.align === 'right') && 'text-start')}>
                                  <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{columnName(c)}</dt>
                                  <dd className="mt-0.5 min-w-0 text-fg [&_.text-end]:text-start">{renderCell(c, row, index, true)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {!error && (footerVisible || (viewOptions && !toolbar)) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 sm:px-4">
          {!toolbar && viewOptions && <div className="py-2">{viewOptions}</div>}
          {footer && footerVisible && (
            <Pagination
              className="min-w-0 flex-1"
              page={footer.page}
              pages={footer.pages}
              pageSize={footer.pageSize}
              total={footer.total}
              onPageChange={footer.onPageChange}
              onPageSizeChange={footer.onPageSizeChange}
              pageSizeOptions={footer.pageSizeOptions}
            />
          )}
        </div>
      )}
    </div>
  );
}
