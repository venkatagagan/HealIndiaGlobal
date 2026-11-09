import { Input, Select } from '../ui';
import { SUPPORTED_CURRENCIES, fromMinor, toMinor } from '../lib/format';

export interface MoneyValue {
  /** user-entered major amount text, e.g. "1250.50" */
  amount: string;
  currency: string;
}

export function moneyValueFrom(minor: number | null | undefined, currency: string | null | undefined, fallbackCcy = 'INR'): MoneyValue {
  const ccy = currency || fallbackCcy;
  return { amount: minor == null ? '' : String(fromMinor(minor, ccy)), currency: ccy };
}

/** MoneyValue -> integer minor units; '' -> null; invalid -> undefined */
export function moneyValueToMinor(v: MoneyValue): number | null | undefined {
  if (v.amount.trim() === '') return null;
  const minor = toMinor(v.amount, v.currency);
  return minor === null || minor < 0 ? undefined : minor;
}

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }));

/** Amount (major units) + currency selector. */
export function MoneyInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  lockCurrency,
}: {
  id?: string;
  value: MoneyValue;
  onChange: (v: MoneyValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  lockCurrency?: boolean;
}) {
  const options = CURRENCY_OPTIONS.some((o) => o.value === value.currency)
    ? CURRENCY_OPTIONS
    : [{ value: value.currency, label: value.currency }, ...CURRENCY_OPTIONS];
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        inputMode="decimal"
        value={value.amount}
        disabled={disabled}
        invalid={invalid}
        placeholder="0.00"
        onChange={(e) => onChange({ ...value, amount: e.target.value })}
      />
      <Select
        aria-label="Currency"
        className="w-24 shrink-0"
        value={value.currency}
        disabled={disabled || lockCurrency}
        onChange={(e) => onChange({ ...value, currency: e.target.value })}
        options={options}
      />
    </div>
  );
}
