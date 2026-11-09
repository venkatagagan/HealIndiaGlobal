import { useState, type ReactNode } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { cn } from '../lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { Popover, usePopover } from './Popover';

// -----------------------------------------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------------------------------------
type CsvPrimitive = string | number | boolean | Date | null | undefined;

/** Column shape used by exportCsv; every DataTableColumn<T> already satisfies it. */
export interface CsvColumn<T> {
  key: string;
  header?: ReactNode;
  /** plain-text header (used when `header` is not a string) */
  title?: string;
  /** value written to the CSV (default: accessor(row) / row[key] when primitive) */
  exportValue?: (row: T) => CsvPrimitive;
  accessor?: (row: T) => unknown;
  /** false: leave the column out of exports */
  exportable?: boolean;
}

function csvHeader<T>(column: CsvColumn<T>): string {
  return column.title ?? (typeof column.header === 'string' ? column.header : column.key);
}

function csvValue<T>(column: CsvColumn<T>, row: T): CsvPrimitive {
  if (column.exportValue) return column.exportValue(row);
  const raw = column.accessor ? column.accessor(row) : row && typeof row === 'object' ? (row as Record<string, unknown>)[column.key] : undefined;
  if (raw === null || raw === undefined) return raw;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' || raw instanceof Date) return raw;
  return undefined;
}

function csvCell(value: CsvPrimitive): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // spreadsheet formula injection guard
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build CSV text (RFC 4180, CRLF line endings). Columns with `exportable: false` are skipped. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const cols = columns.filter((c) => c.exportable !== false);
  const lines = [cols.map((c) => csvCell(csvHeader(c))).join(',')];
  for (const row of rows) lines.push(cols.map((c) => csvCell(csvValue(c, row))).join(','));
  return lines.join('\r\n');
}

/** Download rows as a CSV file (UTF-8 with BOM so Excel opens it correctly). */
export function exportCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[], filename: string): void {
  const name = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  const blob = new Blob(['﻿', toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// -----------------------------------------------------------------------------------------------------------
// ExportButton
// -----------------------------------------------------------------------------------------------------------
export interface ExportButtonProps<T> {
  columns: readonly CsvColumn<T>[];
  /** file name without extension; a date stamp is appended */
  filename: string;
  /** rows on screen (current page) */
  rows?: readonly T[] | null;
  /** fetch every matching row (all pages) - e.g. () => fetchAllPages((page, size) => api.list({...params, page, page_size: size})) */
  fetchAll?: () => Promise<readonly T[]>;
  /** total matching rows (label of the "all" option) */
  total?: number;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function ExportButton<T>({
  columns,
  filename,
  rows,
  fetchAll,
  total,
  label = 'Export',
  variant = 'outline',
  size = 'sm',
  className,
}: ExportButtonProps<T>) {
  const popover = usePopover();
  const [busy, setBusy] = useState(false);
  const stamped = `${filename}-${new Date().toISOString().slice(0, 10)}`;
  const pageCount = rows?.length ?? 0;

  const exportPage = () => {
    popover.setOpen(false);
    if (!rows || rows.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    exportCsv(rows, columns, stamped);
  };
  const exportAll = async () => {
    if (!fetchAll) return;
    popover.setOpen(false);
    setBusy(true);
    try {
      const all = await fetchAll();
      if (all.length === 0) toast.info('Nothing to export');
      else {
        exportCsv(all, columns, stamped);
        toast.success(`Exported ${all.length.toLocaleString()} rows`);
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Export failed'));
    } finally {
      setBusy(false);
    }
  };

  const classes = cn('h-9 rounded-full', className);
  const text = <span className="hidden sm:inline">{label}</span>;
  if (!fetchAll) {
    return (
      <Button
        variant={variant}
        size={size}
        className={classes}
        aria-label={label}
        leftIcon={<Download className="size-4" aria-hidden />}
        onClick={exportPage}
        disabled={!pageCount}
      >
        {text}
      </Button>
    );
  }

  const item =
    'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50';
  return (
    <>
      <Button
        ref={popover.anchorRef}
        variant={variant}
        size={size}
        className={classes}
        aria-label={label}
        loading={busy}
        leftIcon={<Download className="size-4" aria-hidden />}
        rightIcon={<ChevronDown className="size-3.5 opacity-60" aria-hidden />}
        aria-expanded={popover.open}
        aria-controls={popover.popoverProps.id}
        aria-haspopup="menu"
        onClick={() => popover.setOpen(!popover.open)}
      >
        {text}
      </Button>
      <Popover {...popover.popoverProps} align="end" role="menu" label="Export" className={cn('w-64 p-1.5')}>
        <button type="button" role="menuitem" className={item} onClick={exportPage} disabled={!pageCount}>
          <span>Current page</span>
          <span className="text-xs text-muted tabular-nums">{pageCount.toLocaleString()} rows</span>
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => void exportAll()}>
          <span>All matching results</span>
          {total !== undefined && <span className="text-xs text-muted tabular-nums">{total.toLocaleString()} rows</span>}
        </button>
        <p className="px-2.5 pt-1 pb-1.5 text-xs text-muted">CSV · current filters and sort</p>
      </Popover>
    </>
  );
}
