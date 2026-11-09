import { useCallback, useContext, useMemo } from 'react';
import { UNSAFE_DataRouterContext, useSearchParams } from 'react-router';
// type-only: SortState / SortDirection are exported by @hig/shared/ui (Table.tsx)
import type { SortState } from '../ui/Table';

/**
 * List-page state (filters, sort, page, page size) kept in the URL query string so views are shareable,
 * bookmarkable and survive reloads. See packages/shared/src/ui/TABLES.md.
 *
 *   const table = useTableState({
 *     filters: { q: filterParam.text(), status: filterParam.list(CASE_STATUSES) },
 *     defaultSort: '-updated_at',
 *   });
 *   useQuery({ queryKey: ['cases', table.params], queryFn: () => casesApi.list(table.params) });
 */

// -----------------------------------------------------------------------------------------------------------
// Filter definitions
// -----------------------------------------------------------------------------------------------------------
export interface FilterParamDef<V> {
  readonly kind: 'text' | 'list' | 'oneOf' | 'number' | 'boolean' | 'date';
  readonly defaultValue: V;
  /** raw URL value (null = absent) -> typed value */
  parse(raw: string | null): V;
  /** typed value -> URL value ('' = present but empty) */
  serialize(value: V): string;
  /** "no filter" value (removed from the API params) */
  isEmpty(value: V): boolean;
  equals(a: V, b: V): boolean;
}

/** Map of filter name -> definition (values are inferred through `FilterValues`). */
export type FilterDefs = Record<string, FilterParamDef<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type FilterValues<D extends FilterDefs> = { [K in keyof D]: D[K] extends FilterParamDef<infer V> ? V : never };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function same<V>(a: V, b: V): boolean {
  return a === b;
}

/** Builders for typed URL filters. Empty values are removed from the URL; defaults are not written. */
export const filterParam = {
  /** free text (search boxes, ids): '' = no filter */
  text(defaultValue = ''): FilterParamDef<string> {
    return {
      kind: 'text',
      defaultValue,
      parse: (raw) => (raw === null ? defaultValue : raw),
      serialize: (v) => v,
      isEmpty: (v) => v.trim() === '',
      equals: same,
    };
  },
  /** multi-select, comma separated in the URL (`status=quoted,booked`), sent to the API as repeated params */
  list<V extends string = string>(allowed?: readonly V[], defaultValue: readonly V[] = []): FilterParamDef<V[]> {
    const allowedSet = allowed ? new Set<string>(allowed) : null;
    return {
      kind: 'list',
      defaultValue: [...defaultValue],
      parse: (raw) => {
        if (raw === null) return [...defaultValue];
        const items = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return [...new Set(allowedSet ? items.filter((s) => allowedSet.has(s)) : items)] as V[];
      },
      serialize: (v) => v.join(','),
      isEmpty: (v) => v.length === 0,
      equals: (a, b) => a.length === b.length && a.every((x) => b.includes(x)),
    };
  },
  /** single value from a fixed set ('' = no filter) */
  oneOf<V extends string>(values: readonly V[], defaultValue: V | '' = ''): FilterParamDef<V | ''> {
    const set = new Set<string>(values);
    return {
      kind: 'oneOf',
      defaultValue,
      parse: (raw) => (raw === null ? defaultValue : set.has(raw) ? (raw as V) : ''),
      serialize: (v) => v,
      isEmpty: (v) => v === '',
      equals: same,
    };
  },
  number(defaultValue?: number): FilterParamDef<number | undefined> {
    return {
      kind: 'number',
      defaultValue,
      parse: (raw) => {
        if (raw === null) return defaultValue;
        if (raw.trim() === '') return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
      },
      serialize: (v) => (v === undefined ? '' : String(v)),
      isEmpty: (v) => v === undefined,
      equals: same,
    };
  },
  /** tri-state: undefined = no filter, true / false */
  boolean(defaultValue?: boolean): FilterParamDef<boolean | undefined> {
    return {
      kind: 'boolean',
      defaultValue,
      parse: (raw) => (raw === null ? defaultValue : raw === 'true' || raw === '1' ? true : raw === 'false' || raw === '0' ? false : undefined),
      serialize: (v) => (v === undefined ? '' : String(v)),
      isEmpty: (v) => v === undefined,
      equals: same,
    };
  },
  /** calendar date "YYYY-MM-DD" ('' = no filter) */
  date(defaultValue = ''): FilterParamDef<string> {
    return {
      kind: 'date',
      defaultValue,
      parse: (raw) => (raw === null ? defaultValue : ISO_DATE.test(raw) ? raw : ''),
      serialize: (v) => v,
      isEmpty: (v) => v === '',
      equals: same,
    };
  },
};

// -----------------------------------------------------------------------------------------------------------
// Sort
// -----------------------------------------------------------------------------------------------------------
/** "-updated_at" -> {key: 'updated_at', direction: 'desc'} */
export function parseSort(value: string | null | undefined): SortState | null {
  if (!value) return null;
  const desc = value.startsWith('-');
  const key = desc ? value.slice(1) : value;
  return key ? { key, direction: desc ? 'desc' : 'asc' } : null;
}

/** {key: 'updated_at', direction: 'desc'} -> "-updated_at" */
export function serializeSort(sort: SortState | null | undefined): string | undefined {
  if (!sort) return undefined;
  return sort.direction === 'desc' ? `-${sort.key}` : sort.key;
}

// -----------------------------------------------------------------------------------------------------------
// useUrlFilters
// -----------------------------------------------------------------------------------------------------------
export interface UrlFiltersOptions {
  /** namespace for the URL keys when a page has several tables (e.g. "bk_" -> bk_status, bk_page) */
  prefix?: string;
}

export interface UrlFilters<D extends FilterDefs> {
  /** typed current values (defaults applied) */
  filters: FilterValues<D>;
  setFilter<K extends keyof D & string>(key: K, value: FilterValues<D>[K]): void;
  /** set several at once (one history entry); page resets to 1 */
  setFilters(patch: Partial<FilterValues<D>>): void;
  /** clear every filter back to its default (sort and page size are kept) */
  resetFilters(): void;
  /** true when any filter differs from its default */
  isFiltered: boolean;
  /** number of filters that differ from their default */
  activeFilterCount: number;
  /** non-empty filter values, ready to spread into API params (lists stay arrays -> repeated params) */
  filterParams: Partial<FilterValues<D>>;
  /** the raw search params (for anything custom) */
  searchParams: URLSearchParams;
}

/** Typed URL-synced filters only (no sort / pagination). Writes use `replace` so typing doesn't spam history. */
export function useUrlFilters<D extends FilterDefs>(defs: D, options: UrlFiltersOptions = {}): UrlFilters<D> {
  return useTableState({ filters: defs, prefix: options.prefix, paginate: false });
}

// -----------------------------------------------------------------------------------------------------------
// useTableState
// -----------------------------------------------------------------------------------------------------------
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface TableStateOptions<D extends FilterDefs> {
  filters?: D;
  /** e.g. "-updated_at" (null = unsorted / server default) */
  defaultSort?: string | null;
  /** accepted sort keys (others in the URL are ignored); omit to accept any */
  sortKeys?: readonly string[];
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
  prefix?: string;
  /** false: no page / page_size handling (useUrlFilters) */
  paginate?: boolean;
}

/** What DataTable needs from a table state (`<DataTable table={table} />`). */
export interface TableStateLike {
  sort: SortState | null;
  setSort(sort: SortState | null): void;
  page: number;
  pageSize: number;
  setPage(page: number): void;
  setPageSize(size: number): void;
  pageSizeOptions: readonly number[];
  isFiltered: boolean;
  resetFilters(): void;
}

export interface TableState<D extends FilterDefs> extends UrlFilters<D>, TableStateLike {
  /** "-updated_at" style value of `sort` (undefined when unsorted) */
  sortParam: string | undefined;
  /** API params: non-empty filters + sort + page + page_size */
  params: Partial<FilterValues<D>> & { sort?: string; page: number; page_size: number };
  /** reset filters, sort and page (keeps page size) */
  reset(): void;
}

type Patch = Record<string, string | null>;

export function useTableState<D extends FilterDefs = Record<string, never>>(
  options: TableStateOptions<D> = {},
): TableState<D> {
  const {
    filters: defsOption,
    defaultSort = null,
    sortKeys,
    defaultPageSize = 25,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    prefix = '',
    paginate = true,
  } = options;
  const defs = (defsOption ?? {}) as D;
  const [searchParams, setSearchParams] = useSearchParams();
  // data router (createBrowserRouter) only; null under a plain <BrowserRouter>/<MemoryRouter>
  const dataRouter = useContext(UNSAFE_DataRouterContext)?.router ?? null;
  const k = useCallback((name: string) => `${prefix}${name}`, [prefix]);
  const pageKey = k('page');
  const sizeKey = k('page_size');
  const sortKey = k('sort');
  const qs = searchParams.toString();

  // definitions are usually object literals: key the memo on their shape, not identity
  const defsKey = Object.entries(defs)
    .map(([name, def]) => `${name}:${def.kind}`)
    .join('|');

  const filters = useMemo(() => {
    const params = new URLSearchParams(qs);
    const out: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(defs)) out[name] = def.parse(params.get(k(name)));
    return out as FilterValues<D>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, defsKey, k]);

  const { activeFilterCount, filterParams } = useMemo(() => {
    let count = 0;
    const params: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(defs)) {
      const value = (filters as Record<string, unknown>)[name] as never;
      if (!def.equals(value, def.defaultValue as never)) count += 1;
      if (!def.isEmpty(value)) params[name] = value;
    }
    return { activeFilterCount: count, filterParams: params as Partial<FilterValues<D>> };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, defsKey]);

  const rawSort = searchParams.get(sortKey);
  const sort = useMemo(() => {
    const parsed = rawSort === '' ? null : parseSort(rawSort ?? defaultSort);
    if (parsed && sortKeys && !sortKeys.includes(parsed.key)) return parseSort(defaultSort);
    return parsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSort, defaultSort, sortKeys?.join('|')]);

  const page = paginate ? Math.max(1, Math.floor(Number(searchParams.get(pageKey))) || 1) : 1;
  const rawSize = Number(searchParams.get(sizeKey));
  const pageSize = paginate && pageSizeOptions.includes(rawSize) ? rawSize : defaultPageSize;

  const write = useCallback(
    (patch: Patch, resetPage: boolean) => {
      // A late write (debounced search, etc.) must not cancel a navigation that is leaving this page: with lazy
      // routes the list stays mounted while the next page loads, and `setSearchParams` would start a new
      // navigation back to the list (e.g. type a search, click a row within the debounce window).
      if (dataRouter && isLeavingPage(dataRouter.state)) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          if (resetPage) next.delete(pageKey);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, pageKey, dataRouter],
  );

  const filterPatch = useCallback(
    (values: Record<string, unknown>): Patch => {
      const patch: Patch = {};
      for (const [name, value] of Object.entries(values)) {
        const def = defs[name];
        if (!def) continue;
        // default -> drop from URL; empty but non-empty default -> keep an explicit empty marker
        if (def.equals(value as never, def.defaultValue as never)) patch[k(name)] = null;
        else patch[k(name)] = def.serialize(value as never);
      }
      return patch;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defsKey, k],
  );

  const setFilters = useCallback(
    (values: Partial<FilterValues<D>>) => write(filterPatch(values as Record<string, unknown>), true),
    [write, filterPatch],
  );
  const setFilter = useCallback(
    <K extends keyof D & string>(key: K, value: FilterValues<D>[K]) => setFilters({ [key]: value } as Partial<FilterValues<D>>),
    [setFilters],
  );
  const resetFilters = useCallback(() => {
    const patch: Patch = {};
    for (const name of Object.keys(defs)) patch[k(name)] = null;
    write(patch, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [write, defsKey, k]);

  const setSort = useCallback(
    (next: SortState | null) => {
      const value = serializeSort(next) ?? '';
      write({ [sortKey]: value === (defaultSort ?? '') ? null : value }, true);
    },
    [write, sortKey, defaultSort],
  );
  const setPage = useCallback((next: number) => write({ [pageKey]: next <= 1 ? null : String(next) }, false), [write, pageKey]);
  const setPageSize = useCallback(
    (size: number) => write({ [sizeKey]: size === defaultPageSize ? null : String(size) }, true),
    [write, sizeKey, defaultPageSize],
  );
  const reset = useCallback(() => {
    const patch: Patch = { [sortKey]: null };
    for (const name of Object.keys(defs)) patch[k(name)] = null;
    write(patch, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [write, sortKey, defsKey, k]);

  const sortParam = serializeSort(sort);
  const params = useMemo(
    () => ({
      ...filterParams,
      ...(sortParam ? { sort: sortParam } : {}),
      page,
      page_size: pageSize,
    }),
    [filterParams, sortParam, page, pageSize],
  );

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    isFiltered: activeFilterCount > 0,
    activeFilterCount,
    filterParams,
    searchParams,
    sort,
    sortParam,
    setSort,
    page,
    pageSize,
    setPage,
    setPageSize,
    pageSizeOptions,
    params,
    reset,
  };
}

/** True while a navigation to another pathname is in flight (loaders / lazy route modules still loading). */
function isLeavingPage(state: {
  location: { pathname: string };
  navigation: { state: string; location?: { pathname: string } | null };
}): boolean {
  const target = state.navigation.location;
  return state.navigation.state !== 'idle' && !!target && target.pathname !== state.location.pathname;
}

// -----------------------------------------------------------------------------------------------------------
// Client-side helpers (small lists loaded in one request)
// -----------------------------------------------------------------------------------------------------------
/** Case-insensitive "contains" search over a few string fields: rows.filter(matchesSearch(q, r => [r.name])) */
export function matchesSearch<T>(query: string, fields: (row: T) => readonly (string | number | null | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return (row: T): boolean =>
    !needle || fields(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(needle));
}

/** Fetch every page of a paginated endpoint (exports). Stops at `maxRows`. */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; pages: number }>,
  { pageSize = 100, maxRows = 10_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page += 1) {
    const res = await fetchPage(page, pageSize);
    out.push(...res.items);
    if (page >= res.pages || res.items.length === 0 || out.length >= maxRows) break;
  }
  return out.slice(0, maxRows);
}
