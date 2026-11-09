# List pages: FilterBar + useTableState + DataTable

The reference implementation is `apps/admin-portal/src/features/ops/pages/CasesPage.tsx`. Copy its structure.

## The look (do not deviate)

```
PageHeader (title, one-line description, ONE primary action on the right)
└─ DataTable card (rounded-xl, soft border)
   ├─ header   = <QuickFilters> status tabs with counts      (optional; only when a status/count endpoint exists)
   ├─ toolbar  = <FilterBar>: search · filter pills · More filters · actions (Export)      + ⚙ view menu (auto)
   │            active-filter chips + "Reset all" appear on a second line only when filters are active
   ├─ table (md+) / cards (<md)
   └─ footer: "1–25 of 43" · Rows per page · pages
```

Rules:
- **Never** put native `<Select>` / `<Input>` filters above a table. Use the pill filters below.
- 1–4 pills in the row (most used first); everything else goes in `more`. Desktop must stay one row with no filters active.
- Search is always the first thing in the bar (`search` prop) and is debounced (300 ms) and URL-synced.
- Use the cell helpers so all tables look the same: `IdCell`, `PersonCell`, `TextCell`, `StatusBadgeCell`,
  `MoneyCell` (+ `align: 'end'`), `DateCell` (`display="relative"` for activity columns, `"date"` for dates).
- Give every DataTable an `id` (`"<app>.<page>"`, e.g. `"hospital.quotes"`) - it persists column visibility/density
  and switches small screens to the card layout.
- Strings are English and hard-coded (the product is English only).

## API

### `useTableState` (`@hig/shared/lib`)

```ts
const FILTERS = {                         // module-level constant (stable)
  q: filterParam.text(),                  // string ('' = none)
  status: filterParam.list(CASE_STATUSES),// V[]     URL: status=quoted,booked   API: repeated status=
  hospital_id: filterParam.text(),
  urgent: filterParam.boolean(),          // boolean | undefined
  min_total: filterParam.number(),        // number | undefined
  date_field: filterParam.oneOf(['created', 'updated'] as const, 'created'),
  from: filterParam.date(), to: filterParam.date(),   // 'YYYY-MM-DD' | ''
};
const table = useTableState({ filters: FILTERS, defaultSort: '-updated_at', sortKeys: [...], defaultPageSize: 25 });

table.filters            // typed values (defaults applied)
table.setFilter(k, v)    // URL replace (no history spam); resets page to 1
table.setFilters({...})  // several at once
table.resetFilters()     // filters only;  table.reset() also clears sort
table.isFiltered / table.activeFilterCount
table.sort / table.sortParam ('-updated_at') / table.setSort
table.page / pageSize / setPage / setPageSize
table.filterParams       // non-empty filters only
table.params             // filterParams + sort + page + page_size  -> pass straight to most list endpoints
```

`prefix: 'bk_'` namespaces the URL keys when a page has two tables. `useUrlFilters(defs)` is the filters-only variant.
When URL names differ from API names (e.g. `coordinator=unassigned` -> `unassigned=true`), write a small
`toApiFilters(filters)` mapper like CasesPage does and build the params from it.

### Filters (`@hig/shared/ui`)

| Component | Value | Notes |
|---|---|---|
| `FilterBar` | - | `search`, children (pills), `more`, `actions`, `onReset`, `resultCount` (omit when QuickFilters already shows the total) |
| `SelectFilter` | `string` (`''` = any) | `options: {value,label,count?,tone?,description?}[]`, `searchable`, `loading` |
| `MultiSelectFilter` | `string[]` | same options; checkboxes, select all, count badge |
| `DateRangeFilter` | `{from,to}` | presets (today, 7/30/90 days, this/last month); optional `fieldOptions` + `field` switch |
| `AmountRangeFilter` | `{min?,max?}` major units | convert with `toMinor()` for the API |
| `ToggleFilter` | `boolean` | single on/off pill |
| `QuickFilters` | `string` | segmented tabs with counts; `value=null` when no tab matches |

Filters register their active chip automatically - you don't build chips yourself.

### `DataTable`

```tsx
<DataTable
  id="admin.cases" caption="Cases"
  table={table}                 // wires sort, page, page size, filtered-empty state
  total={data?.total}           // server mode. Omit total => client mode (sort + paginate the given rows locally)
  columns={COLUMNS} rows={data?.items}
  loading={q.isLoading} fetching={q.isFetching && !q.isLoading} error={q.error} onRetry={() => void q.refetch()}
  rowHref={(r) => paths.case(r.id)} rowLabel={(r) => `Open case ${r.case_number}`}   // or onRowClick
  emptyTitle="No cases yet" emptyDescription="…" emptyAction={<Button>…</Button>}  // "no data yet"
  // filtered-empty ("No matching results" + Reset filters) is automatic when table.isFiltered
  selectable bulkActions={(rows, clear) => <Button …>Export selected</Button>}       // optional
  header={<QuickFilters …/>} toolbar={<FilterBar …/>}
/>
```

Column options (all optional except `key`/`header`): `cell`, `accessor`, `sortable`, `sortKey` (server field name,
e.g. `'updated_at'`), `sortDescFirst`, `align: 'end'` (amounts), `width`/`minWidth`/`className` (`'max-w-52'` truncates),
`hideable` (default true; first column never), `defaultHidden`, `sticky` (first column),
`mobile: 'primary' | 'secondary' | 'badge' | 'meta' | 'hidden'` (card layout; default first = primary, rest = meta),
`mobileCell`, `title` (plain label when `header` is a node), `exportValue` / `exportable` (CSV).

Server sort: the column's `sortKey ?? key` becomes `sort=field` / `sort=-field`. Only mark a column `sortable`
if the endpoint supports that field (check the backend router) - otherwise leave it unsortable.

Legacy props (`pagination`, `pageSize`, `sort`/`onSortChange`/`manualSort`, `dense`, `hideOnMobile`) still work.

### Export

`<ExportButton filename columns rows total fetchAll />` - "Current page" or "All matching results"
(`fetchAll={() => fetchAllPages((page, size) => api.list({ ...apiFilters, sort, page, page_size: size }))}`).
`exportCsv(rows, columns, filename)` for custom buttons (BOM + formula-injection guard included).

## Complete example (server-side list)

```tsx
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { bookingsApi, BOOKING_STATUSES, BOOKING_STATUS_LABELS, type BookingOut } from '@hig/shared/api';
import { fetchAllPages, filterParam, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  DataTable, DateCell, DateRangeFilter, ExportButton, FilterBar, IdCell, MoneyCell, MultiSelectFilter,
  PageHeader, PersonCell, StatusBadgeCell, statusTone, type DataTableColumn,
} from '@hig/shared/ui';

const FILTERS = { q: filterParam.text(), status: filterParam.list(BOOKING_STATUSES), from: filterParam.date(), to: filterParam.date() };

const COLUMNS: DataTableColumn<BookingOut>[] = [
  { key: 'ref', header: 'Booking', sticky: true, mobile: 'secondary', cell: (b) => <IdCell value={b.reference} />, exportValue: (b) => b.reference },
  { key: 'patient', header: 'Patient', mobile: 'primary', className: 'max-w-56', cell: (b) => <PersonCell name={b.patient_name} /> },
  { key: 'status', header: 'Status', sortable: true, mobile: 'badge', cell: (b) => <StatusBadgeCell status={b.status} kind="booking" /> },
  { key: 'total', header: 'Total', align: 'end', cell: (b) => <MoneyCell minor={b.total_minor} currency={b.currency} /> },
  { key: 'admission', header: 'Admission', sortable: true, sortKey: 'admission_date', sortDescFirst: true, cell: (b) => <DateCell value={b.admission_date} /> },
];

export default function BookingsPage() {
  useDocumentTitle('Bookings');
  const table = useTableState({ filters: FILTERS, defaultSort: '-admission_date' });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = { q: filters.q || undefined, status: filters.status, admission_from: filters.from || undefined, admission_to: filters.to || undefined };
  const params = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const q = useQuery({ queryKey: ['bookings', 'list', params], queryFn: () => bookingsApi.list(params), placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="Bookings" description="Confirmed treatments and admissions." />
      <DataTable
        id="admin.bookings" caption="Bookings" table={table} total={q.data?.total}
        columns={COLUMNS} rows={q.data?.items}
        loading={q.isLoading} fetching={q.isFetching && !q.isLoading} error={q.error} onRetry={() => void q.refetch()}
        rowHref={(b) => `/bookings/${b.id}`}
        emptyTitle="No bookings yet"
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (v) => setFilter('q', v), placeholder: 'Reference or patient…' }}
            onReset={table.resetFilters}
            resultCount={q.data?.total}
            actions={
              <ExportButton filename="bookings" columns={COLUMNS} rows={q.data?.items} total={q.data?.total}
                fetchAll={() => fetchAllPages((page, size) => bookingsApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))} />
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)}
              options={BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s], tone: statusTone(s, 'booking') }))} />
            <DateRangeFilter label="Admission" value={{ from: filters.from, to: filters.to }} onChange={(r) => setFilters(r)} />
          </FilterBar>
        }
      />
    </div>
  );
}
```

(The endpoint/param names in this example are illustrative - check the real list endpoint's params in
`@hig/shared/api` and the backend router; send only params the backend accepts.)

## Client-side lists (one request, no server paging)

Same code, but omit `total`: DataTable sorts and paginates the rows locally with the URL state. Filter first:

```ts
const rows = (q.data ?? []).filter(matchesSearch(filters.q, (r) => [r.name, r.email])).filter((r) => !filters.status.length || filters.status.includes(r.status));
<DataTable id="hospital.doctors" table={table} rows={rows} columns={COLUMNS} … />
```

## Backend notes

`GET /cases` accepts repeated `status` / `urgency`, `coordinator_id`, `unassigned`, `created_from/to`,
`updated_from/to` (inclusive IST dates) and `sort` (`created_at|updated_at|case_number|status`, `-` = desc);
`GET /cases/status-counts` returns `{counts, total}` for the same filters (powers QuickFilters). If another list
endpoint lacks a filter/sort you need, add it additively in that module (router + service + test) rather than
filtering a single page client-side.
