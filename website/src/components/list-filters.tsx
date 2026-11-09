'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface FilterDef {
  /** Matches `data-f-<key>` on each item (values separated by "|"). */
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Render as a checkbox ("only items whose attribute is 'true'"). */
  checkbox?: boolean;
}

export interface SortDef {
  label: string;
  /** Sort keys read from `data-s-<key>` (numbers sort ascending unless `desc`). */
  options: { value: string; label: string; desc?: boolean; numeric?: boolean }[];
}

/**
 * Progressive-enhancement filters for server-rendered directory lists. Without JavaScript every item is visible;
 * with JavaScript the controls show/hide `[data-filter-item]` children and reorder them - no extra requests and
 * no client-side copy of the catalogue.
 */
export function ListFilters({
  title,
  filters,
  sort,
  anyLabel,
  resetLabel,
  resultTemplates,
  emptyText,
  pluralRulesLocale,
  children,
}: {
  title: string;
  filters: FilterDef[];
  sort?: SortDef;
  anyLabel: string;
  resetLabel: string;
  /** Plural templates with {count}. */
  resultTemplates: { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
  emptyText: string;
  pluralRulesLocale: string;
  children: ReactNode;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState(sort?.options[0]?.value ?? '');
  const [count, setCount] = useState<number | null>(null);

  // Deep links from the mega menu (/hospitals?city=Chennai, /doctors?specialty=cardiology) preselect a filter.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial: Record<string, string> = {};
    for (const f of filters) {
      const v = params.get(f.key);
      if (v && (f.checkbox ? v === 'true' : f.options.some((o) => o.value === v))) initial[f.key] = v;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL after hydration
    if (Object.keys(initial).length) setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-filter-item]'));
    let visible = 0;
    for (const el of items) {
      const ok = filters.every((f) => {
        const want = values[f.key];
        if (!want) return true;
        const have = (el.dataset[`f${f.key[0]!.toUpperCase()}${f.key.slice(1)}`] ?? '').split('|');
        return have.includes(want);
      });
      el.hidden = !ok;
      if (ok) visible += 1;
    }
    const opt = sort?.options.find((o) => o.value === order);
    if (opt && items.length) {
      const prop = `s${opt.value[0]!.toUpperCase()}${opt.value.slice(1)}`;
      const parent = items[0]!.parentElement;
      const sorted = [...items].sort((a, b) => {
        const av = a.dataset[prop] ?? '';
        const bv = b.dataset[prop] ?? '';
        let r: number;
        if (opt.numeric) {
          // Items without a value always go last.
          const an = av === '' ? null : Number(av);
          const bn = bv === '' ? null : Number(bv);
          if (an === null && bn === null) r = 0;
          else if (an === null) r = 1;
          else if (bn === null) r = -1;
          else r = opt.desc ? bn - an : an - bn;
        } else {
          r = av.localeCompare(bv);
          if (opt.desc) r = -r;
        }
        return r;
      });
      if (parent) for (const el of sorted) parent.appendChild(el);
    }
    setCount(visible);
  }, [values, order, filters, sort]);

  const rules = new Intl.PluralRules(pluralRulesLocale);
  const resultText = (n: number) => {
    const cat = n === 0 && resultTemplates.zero ? 'zero' : rules.select(n);
    const tpl = resultTemplates[cat as keyof typeof resultTemplates] ?? resultTemplates.other;
    return tpl.replace('{count}', new Intl.NumberFormat(pluralRulesLocale).format(n));
  };
  const active = Object.values(values).some(Boolean);
  // One compact row: each control carries its own label ("City: Any"), so no label rows above the selects.
  const control = (on: boolean) =>
    `h-10 rounded-full border bg-white pl-4 pr-9 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
      on ? 'border-primary-500 text-primary-800 ring-1 ring-primary-500/30' : 'border-slate-300 text-slate-800 hover:border-slate-400'
    }`;

  return (
    <div>
      <form
        aria-labelledby={`${id}-title`}
        className="mb-6 rounded-2xl border border-slate-200 bg-surface px-3 py-3 shadow-sm sm:px-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <h2 id={`${id}-title`} className="sr-only">
          {title}
        </h2>
        {/* Phones: a two-column grid; tablets: wrapping row; desktop: one row (controls shrink, capped at 15rem). */}
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap lg:flex-nowrap">
          {filters.map((f) =>
            f.checkbox ? (
              <label
                key={f.key}
                className={`${control(values[f.key] === 'true')} col-span-2 inline-flex shrink-0 cursor-pointer items-center gap-2 pr-4 whitespace-nowrap sm:col-span-1`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-400 accent-primary-700"
                  checked={values[f.key] === 'true'}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked ? 'true' : '' }))}
                />
                {f.label}
              </label>
            ) : (
              <div key={f.key} className="min-w-0 sm:min-w-[8.5rem] sm:shrink">
                <label htmlFor={`${id}-${f.key}`} className="sr-only">
                  {f.label}
                </label>
                <select
                  id={`${id}-${f.key}`}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className={`${control(Boolean(values[f.key]))} w-full max-w-[15rem] min-w-0 truncate`}
                >
                  {/* the placeholder names the filter ("Any city"); the choices stay plain ("Chennai") */}
                  <option value="">{`${anyLabel} ${f.label.toLowerCase()}`}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ),
          )}
          {active ? (
            <button
              type="button"
              onClick={() => setValues({})}
              className="h-10 px-2 text-sm font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-900"
            >
              {resetLabel}
            </button>
          ) : null}
          <div className="col-span-2 flex min-w-0 items-center justify-between gap-3 sm:ml-auto sm:justify-end">
            <p aria-live="polite" className="text-sm font-medium whitespace-nowrap text-slate-600">
              {count !== null ? resultText(count) : null}
            </p>
            {sort ? (
              <div className="flex min-w-0 items-center gap-2 sm:min-w-[11rem] sm:shrink">
                <label htmlFor={`${id}-sort`} className="text-sm font-medium whitespace-nowrap text-slate-600">
                  {sort.label}
                </label>
                <select id={`${id}-sort`} value={order} onChange={(e) => setOrder(e.target.value)} className={`${control(false)} w-full max-w-[15rem] min-w-0 truncate`}>
                  {sort.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </form>
      <div ref={listRef}>{children}</div>
      {count === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">{emptyText}</p> : null}
    </div>
  );
}
