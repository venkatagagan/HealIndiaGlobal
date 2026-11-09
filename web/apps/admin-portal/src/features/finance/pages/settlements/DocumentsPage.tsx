/**
 * Settlement documents (GET /finance/settlements/invoices): commission invoices and credit notes issued to
 * hospitals, commission statements for agents. PDFs via /finance/settlements/invoices/{id}/pdf.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Users } from 'lucide-react';
import {
  financeApi,
  PAYEE_TYPE_LABELS,
  type PayeeType,
  type SettlementDocumentKind,
  type SettlementDocumentListParams,
  type SettlementDocumentLineItem,
  type SettlementDocumentOut,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Badge,
  Button,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  SelectFilter,
  TextCell,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatDateTime } from '../../lib/shared';
import { financeKeys, useSettlementDocument } from '../../api/queries';
import { Mono, Money, notifyError } from '../../components/finance';
import { PayeeFilter, payeeParams, SettlementTabs } from '../../components/settlements';
import { DescriptionList, ErrorState, LoadingState, Modal } from '../../components/ui';
import { listOrUndefined, minorOrUndefined } from '../../lib/tables';
import { financePath } from '../../paths';

const KINDS = ['commission_invoice', 'credit_note', 'agent_statement'] as const satisfies readonly SettlementDocumentKind[];
const KIND_LABELS: Record<SettlementDocumentKind, string> = {
  commission_invoice: 'Commission invoice',
  credit_note: 'Credit note',
  agent_statement: 'Agent commission statement',
};
const KIND_TABS: Record<SettlementDocumentKind, string> = {
  commission_invoice: 'Tax invoices',
  credit_note: 'Credit notes',
  agent_statement: 'Agent statements',
};
const kindTone = (k: string) => (k === 'credit_note' ? 'warning' : k === 'agent_statement' ? 'accent' : 'info');

// ---------------------------------------------------------------------------------------------------------
// URL state (`doc=<id>` opens the detail dialog; it is not a filter)
// ---------------------------------------------------------------------------------------------------------
const PAYEE_TYPES_FILTER = ['hospital', 'agent'] as const satisfies readonly PayeeType[];

const FILTERS = {
  q: filterParam.text(),
  kind: filterParam.list(KINDS),
  payee_type: filterParam.oneOf(PAYEE_TYPES_FILTER),
  payee: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['issued_at', 'invoice_number', 'total_minor'] as const;

type DocFilters = FilterValues<typeof FILTERS>;
type ApiFilters = Omit<SettlementDocumentListParams, 'page' | 'page_size' | 'sort'>;

function toApiFilters(f: DocFilters): ApiFilters {
  return {
    q: f.q.trim() || undefined,
    kind: listOrUndefined(f.kind),
    ...payeeParams(f.payee, f.payee_type),
    issued_from: f.from || undefined,
    issued_to: f.to || undefined,
    min_total: minorOrUndefined(f.min),
    max_total: minorOrUndefined(f.max),
  };
}

function issuedTo(d: SettlementDocumentOut): { name: string; type: string } | null {
  const type = d.hospital_id ? PAYEE_TYPE_LABELS.hospital : d.agent_id ? PAYEE_TYPE_LABELS.agent : null;
  const id = d.hospital_id ?? d.agent_id;
  if (!type || !id) return null;
  return { name: d.payee_name ?? `${id.slice(0, 8)}…`, type };
}

const signedMoney = (minor: number, currency: string, className = '') => (
  <MoneyCell minor={minor} currency={currency} className={`${minor < 0 ? 'text-danger-ink' : ''} ${className}`} />
);

function baseColumns(): DataTableColumn<SettlementDocumentOut>[] {
  return [
    {
      key: 'number',
      header: 'Document',
      sortable: true,
      sortKey: 'invoice_number',
      sticky: true,
      mobile: 'secondary',
      cell: (d) => <IdCell value={d.invoice_number} secondary={KIND_LABELS[d.kind as SettlementDocumentKind] ?? d.kind} />,
      exportValue: (d) => d.invoice_number,
    },
    {
      key: 'kind',
      header: 'Kind',
      mobile: 'badge',
      defaultHidden: true,
      cell: (d) => <Badge tone={kindTone(d.kind)}>{KIND_LABELS[d.kind as SettlementDocumentKind] ?? d.kind}</Badge>,
      exportValue: (d) => KIND_LABELS[d.kind as SettlementDocumentKind] ?? d.kind,
    },
    {
      key: 'payee',
      header: 'Issued to',
      mobile: 'primary',
      className: 'max-w-60',
      cell: (d) => {
        const to = issuedTo(d);
        return to ? <TextCell primary={<span className="font-medium">{to.name}</span>} secondary={to.type} /> : <span className="text-muted">—</span>;
      },
      exportValue: (d) => issuedTo(d)?.name ?? '',
    },
    {
      key: 'gstin',
      header: 'Recipient GSTIN',
      defaultHidden: true,
      cell: (d) => <span className="font-mono text-xs">{d.recipient_gstin ?? '—'}</span>,
      exportValue: (d) => d.recipient_gstin ?? '',
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      align: 'end',
      cell: (d) => signedMoney(d.subtotal_minor, d.currency, 'text-muted [&>span]:font-normal'),
      exportValue: (d) => fromMinor(d.subtotal_minor, d.currency),
    },
    {
      key: 'tax',
      header: 'GST',
      align: 'end',
      cell: (d) => signedMoney(d.tax_minor, d.currency, 'text-muted [&>span]:font-normal'),
      exportValue: (d) => fromMinor(d.tax_minor, d.currency),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'end',
      sortable: true,
      sortKey: 'total_minor',
      sortDescFirst: true,
      cell: (d) => signedMoney(d.total_minor, d.currency, 'font-semibold'),
      exportValue: (d) => fromMinor(d.total_minor, d.currency),
    },
    {
      key: 'batch',
      header: 'Batch',
      cell: (d) =>
        d.settlement_batch_id ? (
          <Link
            to={financePath(`settlements/batches/${d.settlement_batch_id}`)}
            className="text-sm font-medium text-primary-ink hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View batch
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (d) => d.settlement_batch_id ?? '',
    },
    {
      key: 'issued',
      header: 'Issued',
      sortable: true,
      sortKey: 'issued_at',
      sortDescFirst: true,
      cell: (d) => <DateCell value={d.issued_at} display="date" />,
      exportValue: (d) => d.issued_at,
    },
  ];
}

const EXPORT_COLUMNS = baseColumns();

export default function DocumentsPage() {
  useDocumentTitle('Invoices & credit notes');
  const table = useTableState({ filters: FILTERS, defaultSort: '-issued_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const [searchParams, setSearchParams] = useSearchParams();
  const openDoc = searchParams.get('doc') ?? '';
  const setDoc = (id: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('doc', id);
        else next.delete('doc');
        return next;
      },
      { replace: true },
    );

  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: SettlementDocumentListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const { kind: _kind, ...countFilters } = apiFilters;
  const list = useQuery({
    queryKey: financeKeys.documents(listParams),
    queryFn: () => financeApi.listSettlementDocuments(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'settlement-documents', 'kind-counts', countFilters],
    queryFn: () => financeApi.settlementDocumentKindCounts(countFilters),
    placeholderData: keepPreviousData,
  });
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (d: SettlementDocumentOut) => {
    setDownloading(d.id);
    try {
      await financeApi.downloadSettlementDocumentPdf(d);
    } catch (e) {
      notifyError(e, 'Could not download the PDF');
    } finally {
      setDownloading(null);
    }
  };

  const columns: DataTableColumn<SettlementDocumentOut>[] = [
    ...baseColumns(),
    {
      key: 'pdf',
      header: <span className="sr-only">PDF</span>,
      title: 'PDF',
      align: 'end',
      hideable: false,
      exportable: false,
      mobile: 'secondary',
      cell: (d) => (
        <Button
          size="xs"
          variant="outline"
          loading={downloading === d.id}
          onClick={(e) => {
            e.stopPropagation();
            void download(d);
          }}
          leftIcon={<Download className="size-3.5" aria-hidden />}
          aria-label={`Download ${d.invoice_number} PDF`}
        >
          PDF
        </Button>
      ),
    },
  ];

  const c = counts.data;
  const kindOptions: FilterOption<SettlementDocumentKind>[] = KINDS.map((k) => ({
    value: k,
    label: KIND_LABELS[k],
    tone: kindTone(k),
    count: c ? (c.counts[k] ?? 0) : undefined,
  }));
  const quickItems: QuickFilterItem<SettlementDocumentKind>[] = [
    { value: '', label: 'All', count: c?.total },
    ...KINDS.map((k) => ({ value: k, label: KIND_TABS[k], count: c ? (c.counts[k] ?? 0) : undefined })),
  ];
  const quickValue = filters.kind.length === 0 ? '' : filters.kind.length === 1 ? filters.kind[0]! : null;

  return (
    <div>
      <PageHeader
        title="Invoices & credit notes"
        description="Commission tax invoices and credit notes issued to hospitals, and commission statements for agents. Credit notes reverse commission on clawed-back items."
      />
      <SettlementTabs />
      <DataTable
        id="admin.finance.settlement-documents"
        caption="Settlement documents"
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(d) => setDoc(d.id)}
        rowLabel={(d) => `Open ${d.invoice_number}`}
        emptyTitle="No documents yet"
        emptyDescription="Documents are issued when settlement payouts are paid."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Document kind" items={quickItems} value={quickValue} onChange={(k) => setFilter('kind', k ? [k] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Document number, GSTIN or payee…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="settlement-documents"
                columns={EXPORT_COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) =>
                    financeApi.listSettlementDocuments({ ...apiFilters, sort: table.sortParam, page, page_size: size }),
                  )
                }
              />
            }
            more={
              <>
                <SelectFilter
                  label="Payee type"
                  icon={<Users className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.payee_type}
                  onChange={(v) => setFilters({ payee_type: v, payee: '' })}
                  options={PAYEE_TYPES_FILTER.map((t) => ({ value: t, label: PAYEE_TYPE_LABELS[t] }))}
                />
                <AmountRangeFilter
                  label="Total"
                  currency="INR"
                  value={{ min: filters.min, max: filters.max }}
                  onChange={({ min, max }) => setFilters({ min, max })}
                />
              </>
            }
          >
            <MultiSelectFilter label="Kind" value={filters.kind} onChange={(v) => setFilter('kind', v)} options={kindOptions} />
            <PayeeFilter value={filters.payee} onChange={(v) => setFilter('payee', v)} payeeType={filters.payee_type} />
            <DateRangeFilter label="Issued" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <Modal open={Boolean(openDoc)} onClose={() => setDoc('')} title="Settlement document" size="lg">
        {openDoc && <DocumentDetail id={openDoc} downloading={downloading === openDoc} onDownload={(d) => void download(d)} />}
      </Modal>
    </div>
  );
}

/** Loaded through GET /finance/settlements/invoices/{id} so deep links (?doc=) work without the list page. */
function DocumentDetail({ id, downloading, onDownload }: {
  id: string;
  downloading: boolean;
  onDownload: (d: SettlementDocumentOut) => void;
}) {
  const q = useSettlementDocument(id);
  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const to = issuedTo(d);
  return (
    <div className="space-y-4">
      <DescriptionList
        items={[
          { label: 'Number', value: <Mono>{d.invoice_number}</Mono> },
          { label: 'Kind', value: KIND_LABELS[d.kind as SettlementDocumentKind] ?? d.kind },
          { label: 'Issued to', value: to ? `${to.name} (${to.type})` : '—' },
          { label: 'Issued', value: formatDateTime(d.issued_at) },
          { label: 'Supplier GSTIN', value: <Mono>{d.supplier_gstin ?? '—'}</Mono> },
          { label: 'Recipient GSTIN', value: <Mono>{d.recipient_gstin ?? '—'}</Mono> },
          { label: 'Place of supply', value: d.place_of_supply ?? '—' },
          {
            label: 'Batch',
            value: d.settlement_batch_id ? (
              <Link to={financePath(`settlements/batches/${d.settlement_batch_id}`)} className="text-primary-ink hover:underline">
                View batch
              </Link>
            ) : (
              '—'
            ),
          },
        ]}
      />
      <LineItemsTable doc={d} />
      <div className="flex justify-end">
        <Button variant="outline" loading={downloading} onClick={() => onDownload(d)} leftIcon={<Download className="size-4" aria-hidden />}>
          Download PDF
        </Button>
      </div>
    </div>
  );
}

const TAX_HEADS = ['CGST', 'SGST', 'IGST'];

function taxSplit(li: SettlementDocumentLineItem): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of li.gst_split ?? []) out[part.tax] = (out[part.tax] ?? 0) + part.amount_minor;
  return out;
}

/**
 * Same columns as the PDF (backend `render_settlement_document_pdf`): tax invoices / credit notes show SAC,
 * taxable value, one column per GST head used (CGST+SGST or IGST) and the line total; agent statements show
 * commission, withholding and net. Footnote lines (`note`) are listed under the table.
 */
function LineItemsTable({ doc: d }: { doc: SettlementDocumentOut }) {
  const statement = d.kind === 'agent_statement';
  const lines = d.line_items.filter((li) => !li.note);
  const notes = d.line_items.filter((li) => li.note);
  const splits = lines.map(taxSplit);
  const used = new Set(splits.flatMap((s) => Object.keys(s)));
  const heads = statement ? [] : [...TAX_HEADS.filter((h) => used.has(h)), ...[...used].filter((h) => !TAX_HEADS.includes(h)).sort()];
  const taxCols = heads.length ? heads : ['GST'];
  const money = (minor: number | null | undefined) => (minor == null ? '—' : <Money minor={minor} currency={d.currency} />);
  const th = 'px-3 py-2 font-medium';
  const num = 'px-3 py-2 text-right tabular-nums';
  const headers = statement ? ['Commission', 'Withholding', 'Net'] : ['Taxable', ...taxCols, 'Total'];
  const cols = (statement ? 1 : 2) + headers.length;
  const totals: [string, number][] = statement
    ? [['Commission', d.subtotal_minor], ['Net paid', d.total_minor]]
    : [
        ['Taxable value', d.subtotal_minor],
        ...(heads.length
          ? heads.map((h): [string, number] => [h, splits.reduce((sum, s) => sum + (s[h] ?? 0), 0)])
          : [['GST', d.tax_minor] as [string, number]]),
        ['Total', d.total_minor],
      ];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Line items</caption>
          <thead className="bg-surface-2/60">
            <tr className="text-left text-xs text-muted">
              <th scope="col" className={th}>Description</th>
              {!statement && <th scope="col" className={th}>SAC</th>}
              {headers.map((h) => (
                <th key={h} scope="col" className={`${th} text-right`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((li, i) => (
              <tr key={li.item_id ?? i}>
                <td className="px-3 py-2">
                  {li.description}
                  {li.original_invoice_number && <span className="block text-xs text-muted">Against {li.original_invoice_number}</span>}
                </td>
                {statement ? (
                  <>
                    <td className={num}>{money(li.commission_minor)}</td>
                    <td className={num}>{money(li.withholding_minor)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2"><Mono>{li.sac ?? '—'}</Mono></td>
                    <td className={num}>{money(li.taxable_minor)}</td>
                    {heads.length ? heads.map((h) => <td key={h} className={num}>{money(splits[i]?.[h] ?? 0)}</td>) : <td className={num}>{money(li.gst_minor ?? 0)}</td>}
                  </>
                )}
                <td className={num}>{money(li.amount_minor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border text-fg">
            {totals.map(([label, minor], i) => {
              const last = i === totals.length - 1;
              return (
                <tr key={label}>
                  <td colSpan={cols - 1} className={`px-3 text-right ${i === 0 ? 'pt-2' : ''} ${last ? 'pb-2 font-semibold' : 'text-muted'}`}>{label}</td>
                  <td className={`px-3 text-right tabular-nums ${i === 0 ? 'pt-2' : ''} ${last ? 'pb-2' : ''}`}>
                    <Money minor={minor} currency={d.currency} className={last ? 'font-semibold' : undefined} />
                  </td>
                </tr>
              );
            })}
          </tfoot>
        </table>
      </div>
      {notes.map((n, i) => (
        <p key={i} className="text-xs text-muted">{n.description}</p>
      ))}
    </div>
  );
}
