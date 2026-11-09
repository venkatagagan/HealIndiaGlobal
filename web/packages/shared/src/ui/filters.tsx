import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Calendar, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatDate } from '../lib/dates';
import { Popover, usePopover } from './Popover';
import { normalizeTone, TONE_SOLID, type Tone } from './tone';

/**
 * Filter toolbar for list pages (see TABLES.md):
 *
 *   <FilterBar search={{ value, onChange }} more={<SelectFilter … />} actions={<ExportButton … />}
 *              resultCount={total} onReset={table.resetFilters}>
 *     <MultiSelectFilter label="Status" … />
 *     <SelectFilter label="Hospital" … />
 *     <DateRangeFilter label="Date" … />
 *   </FilterBar>
 *
 * Every filter control registers an "active filter" chip with the bar automatically.
 */

// -----------------------------------------------------------------------------------------------------------
// Context: chip registration + "inside More filters" flag
// -----------------------------------------------------------------------------------------------------------
interface ActiveChip {
  id: string;
  label: string;
  value: string;
  onClear: () => void;
  inMore: boolean;
}

interface FilterBarContextValue {
  register: (id: string, chip: ActiveChip | null) => void;
  inMore: boolean;
}

const FilterBarContext = createContext<FilterBarContextValue | null>(null);

/** Registers an active-filter chip with the surrounding FilterBar (no-op outside one). */
export function useActiveFilterChip(label: string, display: string | null | undefined, onClear: () => void): void {
  const ctx = useContext(FilterBarContext);
  const register = ctx?.register;
  const inMore = ctx?.inMore ?? false;
  const id = useId();
  const clearRef = useRef(onClear);
  useEffect(() => {
    clearRef.current = onClear;
  });
  useEffect(() => {
    if (!register) return;
    register(id, display ? { id, label, value: display, inMore, onClear: () => clearRef.current() } : null);
  }, [register, id, label, display, inMore]);
  useEffect(() => {
    if (!register) return;
    return () => register(id, null);
  }, [register, id]);
}

// -----------------------------------------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------------------------------------
export interface FilterOption<V extends string = string> {
  value: V;
  label: string;
  /** right-aligned count (e.g. from a facets/counts endpoint) */
  count?: number;
  /** coloured dot before the label */
  tone?: Tone;
  description?: string;
  disabled?: boolean;
}

const PILL =
  'inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg';
const PILL_IDLE = 'border-border bg-surface text-fg/80 shadow-xs hover:border-border-strong hover:bg-surface-2 hover:text-fg';
const PILL_ACTIVE = 'border-primary/40 bg-primary-soft/70 text-primary-ink hover:bg-primary-soft';
const FIELD_BUTTON =
  'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-start text-sm text-fg ' +
  'shadow-xs hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const SMALL_INPUT =
  'block h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-fg shadow-xs placeholder:text-muted ' +
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

interface TriggerProps {
  label: string;
  /** summary of the current value (null = inactive) */
  summary: string | null;
  /** count badge (multi-select) */
  count?: number;
  icon?: ReactNode;
  trigger: ReturnType<typeof usePopover>['triggerProps'];
  inMore: boolean;
  haspopup?: 'dialog' | 'listbox';
}

function FilterTrigger({ label, summary, count, icon, trigger, inMore, haspopup = 'dialog' }: TriggerProps) {
  const active = summary !== null;
  if (inMore) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button type="button" {...trigger} aria-haspopup={haspopup} aria-label={`${label}: ${summary ?? 'Any'}`} className={FIELD_BUTTON}>
          <span className={cn('truncate', !active && 'text-muted')}>{summary ?? 'Any'}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      {...trigger}
      aria-haspopup={haspopup}
      aria-label={active ? `${label}: ${summary}` : label}
      className={cn(PILL, active ? PILL_ACTIVE : PILL_IDLE)}
    >
      {icon}
      <span className={cn(active && 'text-fg/70')}>{label}</span>
      {active && (
        <>
          <span className="h-4 w-px bg-current opacity-25" aria-hidden />
          <span className="max-w-40 truncate font-semibold">{summary}</span>
          {count !== undefined && count > 1 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 font-semibold text-primary-fg tabular-nums">{count}</span>
          )}
        </>
      )}
      <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
    </button>
  );
}

function PanelHeader({ title, onClear, canClear }: { title: string; onClear: () => void; canClear: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <button
        type="button"
        onClick={onClear}
        disabled={!canClear}
        className="rounded px-1 text-xs font-medium text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:invisible"
      >
        Clear
      </button>
    </div>
  );
}

/** Arrow-key navigation between [role=option] elements of a listbox. */
function listboxKeyDown(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const root = event.currentTarget.closest('[data-filter-panel]') ?? event.currentTarget;
  const options = Array.from(root.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
  if (options.length === 0) return;
  event.preventDefault();
  const index = options.indexOf(document.activeElement as HTMLElement);
  let next = 0;
  if (event.key === 'ArrowDown') next = index < 0 ? 0 : Math.min(options.length - 1, index + 1);
  else if (event.key === 'ArrowUp') next = index <= 0 ? 0 : index - 1;
  else if (event.key === 'End') next = options.length - 1;
  options[next]?.focus();
}

function OptionSearch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative border-b border-border p-2">
      <Search className="pointer-events-none absolute start-4.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="text"
        data-autofocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={listboxKeyDown}
        placeholder={`Filter ${label.toLowerCase()}…`}
        aria-label={`Filter ${label} options`}
        className={cn(SMALL_INPUT, 'ps-8')}
      />
    </div>
  );
}

function useOptionSearch<V extends string>(options: readonly FilterOption<V>[], searchable: boolean | undefined) {
  const [query, setQuery] = useState('');
  const enabled = searchable ?? options.length > 8;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  return { enabled, query, setQuery, visible };
}

function OptionRow<V extends string>({
  option,
  selected,
  multiple,
  onToggle,
}: {
  option: FilterOption<V>;
  selected: boolean;
  multiple: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      onClick={option.disabled ? undefined : onToggle}
      onKeyDown={(e) => {
        if (option.disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm outline-none',
        'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/40',
        option.disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {multiple ? (
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
            selected ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface',
          )}
          aria-hidden
        >
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
      ) : (
        <Check className={cn('size-4 shrink-0 text-primary-ink', !selected && 'invisible')} aria-hidden />
      )}
      {option.tone && <span className={cn('size-2 shrink-0 rounded-full', TONE_SOLID[normalizeTone(option.tone)])} aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.description && <span className="block truncate text-xs text-muted">{option.description}</span>}
      </span>
      {option.count !== undefined && <span className="shrink-0 text-xs text-muted tabular-nums">{option.count.toLocaleString()}</span>}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------------------
// SelectFilter (single)
// -----------------------------------------------------------------------------------------------------------
export interface SelectFilterProps<V extends string = string> {
  label: string;
  /** '' = no filter */
  value: V | '';
  onChange: (value: V | '') => void;
  options: readonly FilterOption<V>[];
  /** text-filter box in the panel (default: when more than 8 options) */
  searchable?: boolean;
  icon?: ReactNode;
  /** options still loading */
  loading?: boolean;
  align?: 'start' | 'end';
}

export function SelectFilter<V extends string = string>({
  label,
  value,
  onChange,
  options,
  searchable,
  icon,
  loading = false,
  align = 'start',
}: SelectFilterProps<V>) {
  const ctx = useContext(FilterBarContext);
  const popover = usePopover();
  const search = useOptionSearch(options, searchable);
  const selected = options.find((o) => o.value === value);
  const summary = value ? (selected?.label ?? (loading ? '…' : String(value))) : null;
  useActiveFilterChip(label, summary, () => onChange(''));
  const pick = (next: V | '') => {
    onChange(next);
    popover.setOpen(false);
    popover.anchorRef.current?.focus();
  };
  return (
    <>
      <FilterTrigger label={label} summary={summary} icon={icon} trigger={popover.triggerProps} inMore={ctx?.inMore ?? false} haspopup="listbox" />
      <Popover {...popover.popoverProps} align={align} label={label} className="w-72">
        <div data-filter-panel className="flex min-h-0 flex-col">
          <PanelHeader title={label} onClear={() => pick('')} canClear={Boolean(value)} />
          {search.enabled && <OptionSearch value={search.query} onChange={search.setQuery} label={label} />}
          <div role="listbox" aria-label={label} onKeyDown={listboxKeyDown} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loading && options.length === 0 && <p className="px-2 py-3 text-sm text-muted">Loading…</p>}
            {!loading && search.visible.length === 0 && <p className="px-2 py-3 text-sm text-muted">No matches</p>}
            {search.visible.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                selected={option.value === value}
                multiple={false}
                onToggle={() => pick(option.value === value ? '' : option.value)}
              />
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

// -----------------------------------------------------------------------------------------------------------
// MultiSelectFilter
// -----------------------------------------------------------------------------------------------------------
export interface MultiSelectFilterProps<V extends string = string> {
  label: string;
  value: readonly V[];
  onChange: (value: V[]) => void;
  options: readonly FilterOption<V>[];
  searchable?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  align?: 'start' | 'end';
}

export function MultiSelectFilter<V extends string = string>({
  label,
  value,
  onChange,
  options,
  searchable,
  icon,
  loading = false,
  align = 'start',
}: MultiSelectFilterProps<V>) {
  const ctx = useContext(FilterBarContext);
  const popover = usePopover();
  const search = useOptionSearch(options, searchable);
  const labels = value.map((v) => options.find((o) => o.value === v)?.label ?? String(v));
  const summary = labels.length === 0 ? null : labels[0]!;
  useActiveFilterChip(label, labels.length ? labels.join(', ') : null, () => onChange([]));
  const toggle = (v: V) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const allVisible = search.visible.filter((o) => !o.disabled).map((o) => o.value);
  return (
    <>
      <FilterTrigger
        label={label}
        summary={summary}
        count={value.length}
        icon={icon}
        trigger={popover.triggerProps}
        inMore={ctx?.inMore ?? false}
        haspopup="listbox"
      />
      <Popover {...popover.popoverProps} align={align} label={label} className="w-72">
        <div data-filter-panel className="flex min-h-0 flex-col">
          <PanelHeader title={label} onClear={() => onChange([])} canClear={value.length > 0} />
          {search.enabled && <OptionSearch value={search.query} onChange={search.setQuery} label={label} />}
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            onKeyDown={listboxKeyDown}
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {loading && options.length === 0 && <p className="px-2 py-3 text-sm text-muted">Loading…</p>}
            {!loading && search.visible.length === 0 && <p className="px-2 py-3 text-sm text-muted">No matches</p>}
            {search.visible.map((option) => (
              <OptionRow key={option.value} option={option} selected={value.includes(option.value)} multiple onToggle={() => toggle(option.value)} />
            ))}
          </div>
          {allVisible.length > 1 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => onChange([...new Set([...value, ...allVisible])])}
                className="rounded font-medium text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Select all
              </button>
              <span className="text-muted tabular-nums">{value.length} selected</span>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}

// -----------------------------------------------------------------------------------------------------------
// DateRangeFilter
// -----------------------------------------------------------------------------------------------------------
export interface DateRange {
  /** "YYYY-MM-DD" or '' */
  from: string;
  to: string;
}

export interface DatePreset {
  id: string;
  label: string;
  range: () => DateRange;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export const DEFAULT_DATE_PRESETS: readonly DatePreset[] = [
  { id: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { id: '7d', label: 'Last 7 days', range: () => ({ from: iso(addDays(new Date(), -6)), to: iso(new Date()) }) },
  { id: '30d', label: 'Last 30 days', range: () => ({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) }) },
  { id: '90d', label: 'Last 90 days', range: () => ({ from: iso(addDays(new Date(), -89)), to: iso(new Date()) }) },
  { id: 'month', label: 'This month', range: () => ({ from: iso(startOfMonth(new Date())), to: iso(new Date()) }) },
  {
    id: 'last-month',
    label: 'Last month',
    range: () => {
      const d = subMonths(new Date(), 1);
      return { from: iso(startOfMonth(d)), to: iso(endOfMonth(d)) };
    },
  },
];

/** "Last 7 days" when the range matches a preset, else "1 Oct – 21 Oct 2026" / "From 1 Oct 2026". */
export function describeDateRange(range: DateRange, presets: readonly DatePreset[] = DEFAULT_DATE_PRESETS): string | null {
  if (!range.from && !range.to) return null;
  const preset = presets.find((p) => {
    const r = p.range();
    return r.from === range.from && r.to === range.to;
  });
  if (preset) return preset.label;
  if (range.from && range.to) {
    const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
    return `${formatDate(range.from, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${formatDate(range.to)}`;
  }
  return range.from ? `From ${formatDate(range.from)}` : `Until ${formatDate(range.to)}`;
}

export interface DateRangeFilterProps<F extends string = string> {
  label: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
  presets?: readonly DatePreset[];
  /** optional "which date" switch, e.g. Created / Updated */
  fieldOptions?: readonly { value: F; label: string }[];
  field?: F;
  onFieldChange?: (field: F) => void;
  align?: 'start' | 'end';
}

export function DateRangeFilter<F extends string = string>({
  label,
  value,
  onChange,
  presets = DEFAULT_DATE_PRESETS,
  fieldOptions,
  field,
  onFieldChange,
  align = 'start',
}: DateRangeFilterProps<F>) {
  const ctx = useContext(FilterBarContext);
  const popover = usePopover();
  const fromId = useId();
  const toId = useId();
  const described = describeDateRange(value, presets);
  const fieldLabel = fieldOptions?.find((o) => o.value === field)?.label;
  const summary = described && fieldLabel ? `${fieldLabel}: ${described}` : described;
  useActiveFilterChip(label, summary, () => onChange({ from: '', to: '' }));
  const activePreset = presets.find((p) => {
    const r = p.range();
    return r.from === value.from && r.to === value.to;
  });
  return (
    <>
      <FilterTrigger
        label={label}
        summary={summary}
        icon={<Calendar className="size-3.5 opacity-70" aria-hidden />}
        trigger={popover.triggerProps}
        inMore={ctx?.inMore ?? false}
      />
      <Popover {...popover.popoverProps} align={align} label={label} className="w-[22rem]">
        <PanelHeader title={label} onClear={() => onChange({ from: '', to: '' })} canClear={Boolean(value.from || value.to)} />
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          {fieldOptions && fieldOptions.length > 1 && (
            <div role="radiogroup" aria-label="Date field" className="grid grid-flow-col gap-1 rounded-lg bg-surface-2 p-1">
              {fieldOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={o.value === field}
                  onClick={() => onFieldChange?.(o.value)}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    o.value === field ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Presets">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={activePreset?.id === preset.id}
                onClick={() => onChange(preset.range())}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-start text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activePreset?.id === preset.id
                    ? 'border-primary/50 bg-primary-soft text-primary-ink'
                    : 'border-border text-fg hover:bg-surface-2',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={fromId} className="flex flex-col gap-1 text-xs font-medium text-muted">
              From
              <input
                id={fromId}
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className={SMALL_INPUT}
              />
            </label>
            <label htmlFor={toId} className="flex flex-col gap-1 text-xs font-medium text-muted">
              To
              <input
                id={toId}
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className={SMALL_INPUT}
              />
            </label>
          </div>
        </div>
      </Popover>
    </>
  );
}

// -----------------------------------------------------------------------------------------------------------
// AmountRangeFilter (major units; convert with toMinor() for the API)
// -----------------------------------------------------------------------------------------------------------
export interface AmountRange {
  min?: number;
  max?: number;
}

export interface AmountRangeFilterProps {
  label: string;
  value: AmountRange;
  onChange: (value: AmountRange) => void;
  /** shown as a prefix/suffix, e.g. "USD" */
  currency?: string;
  align?: 'start' | 'end';
}

export function AmountRangeFilter({ label, value, onChange, currency, align = 'start' }: AmountRangeFilterProps) {
  const ctx = useContext(FilterBarContext);
  const popover = usePopover();
  const [draft, setDraft] = useState({ min: '', max: '' });
  const minId = useId();
  const maxId = useId();
  const fmt = (n: number) => `${currency ? `${currency} ` : ''}${n.toLocaleString()}`;
  const summary =
    value.min !== undefined && value.max !== undefined
      ? `${fmt(value.min)} – ${fmt(value.max)}`
      : value.min !== undefined
        ? `≥ ${fmt(value.min)}`
        : value.max !== undefined
          ? `≤ ${fmt(value.max)}`
          : null;
  useActiveFilterChip(label, summary, () => onChange({}));
  const open = (next: boolean) => {
    if (next) setDraft({ min: value.min?.toString() ?? '', max: value.max?.toString() ?? '' });
    popover.setOpen(next);
  };
  const apply = () => {
    const parse = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));
    onChange({ min: parse(draft.min), max: parse(draft.max) });
    popover.setOpen(false);
    popover.anchorRef.current?.focus();
  };
  const trigger = { ...popover.triggerProps, onClick: () => open(!popover.open) };
  return (
    <>
      <FilterTrigger label={label} summary={summary} trigger={trigger} inMore={ctx?.inMore ?? false} />
      <Popover {...popover.popoverProps} onOpenChange={open} align={align} label={label} className="w-72">
        <PanelHeader title={label} onClear={() => onChange({})} canClear={summary !== null} />
        <form
          className="flex flex-col gap-3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(['min', 'max'] as const).map((k) => (
              <label key={k} htmlFor={k === 'min' ? minId : maxId} className="flex flex-col gap-1 text-xs font-medium text-muted">
                {k === 'min' ? 'Minimum' : 'Maximum'}
                <input
                  id={k === 'min' ? minId : maxId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={draft[k]}
                  placeholder={currency ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className={cn(SMALL_INPUT, 'tabular-nums')}
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="h-8 rounded-lg bg-primary text-sm font-medium text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Apply
          </button>
        </form>
      </Popover>
    </>
  );
}

// -----------------------------------------------------------------------------------------------------------
// ToggleFilter (boolean pill, e.g. "Emergency only")
// -----------------------------------------------------------------------------------------------------------
export interface ToggleFilterProps {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  icon?: ReactNode;
}

export function ToggleFilter({ label, pressed, onChange, icon }: ToggleFilterProps) {
  const ctx = useContext(FilterBarContext);
  useActiveFilterChip(label, pressed ? 'Yes' : null, () => onChange(false));
  if (ctx?.inMore) {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
        <span className="font-medium">{label}</span>
        <input type="checkbox" checked={pressed} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
      </label>
    );
  }
  return (
    <button type="button" aria-pressed={pressed} onClick={() => onChange(!pressed)} className={cn(PILL, pressed ? PILL_ACTIVE : PILL_IDLE)}>
      {icon}
      {label}
      {pressed && <Check className="size-3.5" aria-hidden />}
    </button>
  );
}

// -----------------------------------------------------------------------------------------------------------
// Search (debounced, URL friendly)
// -----------------------------------------------------------------------------------------------------------
export interface FilterSearchProps {
  value: string;
  /** called debounced (and immediately on Enter / clear) */
  onChange: (value: string) => void;
  placeholder?: string;
  /** accessible label (default "Search") */
  label?: string;
  debounceMs?: number;
  className?: string;
}

export function FilterSearch({ value, onChange, placeholder = 'Search…', label = 'Search', debounceMs = 300, className }: FilterSearchProps) {
  const [text, setText] = useState(value);
  const [emitted, setEmitted] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  // external change (reset, chip removed, back/forward): adopt it
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== emitted) {
      setText(value);
      setEmitted(value);
    }
  }
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const emit = useCallback((next: string) => {
    setEmitted(next);
    onChangeRef.current(next);
  }, []);
  useEffect(() => {
    if (text === emitted) return;
    const handle = setTimeout(() => emit(text), debounceMs);
    return () => clearTimeout(handle);
  }, [text, emitted, debounceMs, emit]);
  useActiveFilterChip('Search', value ? `“${value}”` : null, () => {
    setText('');
    emit('');
  });
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        role="searchbox"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (text !== emitted) emit(text);
          } else if (e.key === 'Escape' && text) {
            e.preventDefault();
            setText('');
            emit('');
          }
        }}
        className={cn(
          'block h-9 w-full rounded-full border border-border bg-surface ps-9 pe-9 text-sm text-fg shadow-xs transition-colors placeholder:text-muted',
          'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('');
            emit('');
          }}
          className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------------------
// FilterBar
// -----------------------------------------------------------------------------------------------------------
export interface FilterBarProps {
  /** debounced search box at the start of the row */
  search?: FilterSearchProps;
  /** the primary filter controls (pills) */
  children?: ReactNode;
  /** overflow filters shown in a "More filters" popover (still produce chips) */
  more?: ReactNode;
  moreLabel?: string;
  /** right-aligned actions: export, column picker, primary button … */
  actions?: ReactNode;
  /** "1,234 results" next to the actions (undefined = hidden) */
  resultCount?: number | null;
  /** noun for the count, e.g. (n) => `${n} cases` */
  resultLabel?: (count: number) => string;
  /** "Reset all" in the chip row */
  onReset?: () => void;
  /** show active-filter chips (default true) */
  showChips?: boolean;
  className?: string;
}

export function FilterBar({
  search,
  children,
  more,
  moreLabel = 'More filters',
  actions,
  resultCount,
  resultLabel = (n) => `${n.toLocaleString()} ${n === 1 ? 'result' : 'results'}`,
  onReset,
  showChips = true,
  className,
}: FilterBarProps) {
  const [chips, setChips] = useState<ActiveChip[]>([]);
  const register = useCallback((id: string, chip: ActiveChip | null) => {
    setChips((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      if (!chip) return index < 0 ? prev : prev.filter((c) => c.id !== id);
      if (index < 0) return [...prev, chip];
      const old = prev[index]!;
      if (old.value === chip.value && old.label === chip.label && old.inMore === chip.inMore) return prev;
      const next = [...prev];
      next[index] = chip;
      return next;
    });
  }, []);
  const rootCtx = useMemo(() => ({ register, inMore: false }), [register]);
  const moreCtx = useMemo(() => ({ register, inMore: true }), [register]);
  const morePopover = usePopover();
  const moreCount = chips.filter((c) => c.inMore).length;

  return (
    <FilterBarContext.Provider value={rootCtx}>
      <div className={cn('flex flex-col gap-2.5', className)}>
        <div className="flex flex-wrap items-center gap-2">
          {search && <FilterSearch {...search} className={cn('w-full sm:w-64 2xl:w-80', search.className)} />}
          {/* pills: one horizontally scrolling row on phones, wrapping on larger screens */}
          <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-0.5 [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none] sm:contents">
          {children}
          {more && (
            <>
              <button
                type="button"
                {...morePopover.triggerProps}
                className={cn(PILL, moreCount ? PILL_ACTIVE : PILL_IDLE)}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                {moreLabel}
                {moreCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 font-semibold text-primary-fg tabular-nums">{moreCount}</span>
                )}
              </button>
              <Popover {...morePopover.popoverProps} keepMounted label={moreLabel} className="w-80">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{moreLabel}</p>
                </div>
                <FilterBarContext.Provider value={moreCtx}>
                  <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">{more}</div>
                </FilterBarContext.Provider>
                <div className="flex justify-end border-t border-border px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      morePopover.setOpen(false);
                      morePopover.anchorRef.current?.focus();
                    }}
                    className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Done
                  </button>
                </div>
              </Popover>
            </>
          )}
          </div>
          {(actions || (resultCount !== undefined && resultCount !== null)) && (
            <div className="ms-auto flex shrink-0 items-center gap-2">
              {resultCount !== undefined && resultCount !== null && (
                <p className="hidden text-sm whitespace-nowrap text-muted tabular-nums sm:block" aria-live="polite">
                  {resultLabel(resultCount)}
                </p>
              )}
              {actions}
            </div>
          )}
        </div>
        {showChips && chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters" role="group">
            {chips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border bg-surface-2/70 ps-2.5 pe-1 text-xs"
              >
                <span className="text-muted">{chip.label}:</span>
                <span className="max-w-64 truncate font-medium text-fg">{chip.value}</span>
                <button
                  type="button"
                  onClick={chip.onClear}
                  aria-label={`Remove filter ${chip.label}`}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:bg-border hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
            {onReset && chips.length > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="ms-1 rounded px-1 text-xs font-medium text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Reset all
              </button>
            )}
          </div>
        )}
      </div>
    </FilterBarContext.Provider>
  );
}

// -----------------------------------------------------------------------------------------------------------
// QuickFilters: segmented "views" with counts (All · Enquiry · Quoted …)
// -----------------------------------------------------------------------------------------------------------
export interface QuickFilterItem<V extends string = string> {
  /** '' = "All" */
  value: V | '';
  label: string;
  count?: number | null;
  tone?: Tone;
}

export interface QuickFiltersProps<V extends string = string> {
  items: readonly QuickFilterItem<V>[];
  /** current value; null = none of the items matches (e.g. a custom multi-select) */
  value: V | '' | null;
  onChange: (value: V | '') => void;
  /** accessible name */
  label?: string;
  className?: string;
}

export function QuickFilters<V extends string = string>({ items, value, onChange, label = 'Quick filters', className }: QuickFiltersProps<V>) {
  return (
    <div role="group" aria-label={label} className={cn('-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value || '__all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'group relative inline-flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {item.tone && <span className={cn('size-2 rounded-full', TONE_SOLID[normalizeTone(item.tone)])} aria-hidden />}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'min-w-6 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums',
                  active ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-muted group-hover:text-fg',
                )}
              >
                {item.count === null ? '–' : item.count.toLocaleString()}
              </span>
            )}
            <span
              className={cn('absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors', active ? 'bg-primary' : 'bg-transparent')}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
