/**
 * Tolerant readers for finance endpoints whose response shape differs between the @hig/shared types and
 * the backend implementation (PLAN 8.12 leaves the list/statement shapes open):
 *  - GET /finance/payout-accounts  -> PayoutAccountOut[]  or  Page<PayoutAccountOut>
 *  - GET /finance/statements       -> StatementRow[]      or  {rows: [...], opening_balance_minor, ...}
 */
import { api, financeApi, type Page, type PayoutAccountOut } from '@hig/shared/api';

function isPage<T>(value: unknown): value is Page<T> {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items);
}

export async function listOwnPayoutAccounts(): Promise<PayoutAccountOut[]> {
  const data = (await financeApi.listPayoutAccounts({ page_size: 100 })) as unknown;
  if (Array.isArray(data)) return data as PayoutAccountOut[];
  if (isPage<PayoutAccountOut>(data)) return data.items;
  return [];
}

export interface StatementLine {
  date: string;
  type: string;
  reference: string | null;
  booking_number: string | null;
  description: string | null;
  status: string | null;
  currency: string;
  gross_minor: number | null;
  /** signed effect on the payee balance */
  amount_minor: number;
  balance_minor: number | null;
}

export interface Statement {
  currency: string;
  opening_balance_minor: number | null;
  total_earned_minor: number | null;
  total_paid_minor: number | null;
  closing_balance_minor: number | null;
  rows: StatementLine[];
}

type RawRow = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function normalizeRow(row: RawRow, fallbackCurrency: string): StatementLine {
  return {
    date: (str(row.date) ?? '').slice(0, 10),
    type: str(row.kind) ?? str(row.type) ?? 'entry',
    reference: str(row.reference),
    booking_number: str(row.booking_number),
    description: str(row.description),
    status: str(row.status),
    currency: str(row.currency) ?? fallbackCurrency,
    gross_minor: num(row.gross_minor),
    amount_minor: num(row.amount_minor) ?? num(row.net_minor) ?? 0,
    balance_minor: num(row.balance_minor),
  };
}

export async function fetchStatement(from?: string, to?: string): Promise<Statement> {
  const data = await api.get<unknown>('/finance/statements', { from, to });
  if (Array.isArray(data)) {
    const rows = (data as RawRow[]).map((r) => normalizeRow(r, 'INR'));
    return {
      currency: rows[0]?.currency ?? 'INR',
      opening_balance_minor: null,
      total_earned_minor: null,
      total_paid_minor: null,
      closing_balance_minor: null,
      rows,
    };
  }
  const obj = (data ?? {}) as RawRow;
  const currency = str(obj.currency) ?? 'INR';
  const rawRows = Array.isArray(obj.rows) ? (obj.rows as RawRow[]) : [];
  return {
    currency,
    opening_balance_minor: num(obj.opening_balance_minor),
    total_earned_minor: num(obj.total_earned_minor),
    total_paid_minor: num(obj.total_paid_minor),
    closing_balance_minor: num(obj.closing_balance_minor),
    rows: rawRows.map((r) => normalizeRow(r, currency)),
  };
}
