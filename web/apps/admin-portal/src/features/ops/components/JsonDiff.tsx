import { useMemo, useState } from 'react';
import { cn } from '../lib/format';
import { Checkbox } from '../ui';

type Change = 'added' | 'removed' | 'changed' | 'same';

interface DiffRow {
  path: string;
  before: unknown;
  after: unknown;
  change: Change;
}

const MISSING = Symbol('missing');

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Flatten nested objects into dotted paths; arrays are compared as whole values. */
function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) out.set(prefix, value);
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.set(prefix || '(value)', value);
}

function diffJson(before: unknown, after: unknown): DiffRow[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  if (before !== null && before !== undefined) flatten(before, '', a);
  if (after !== null && after !== undefined) flatten(after, '', b);
  const keys = Array.from(new Set([...a.keys(), ...b.keys()])).sort();
  return keys.map((path) => {
    const x = a.has(path) ? a.get(path) : MISSING;
    const y = b.has(path) ? b.get(path) : MISSING;
    const change: Change =
      x === MISSING ? 'added' : y === MISSING ? 'removed' : JSON.stringify(x) === JSON.stringify(y) ? 'same' : 'changed';
    return { path, before: x, after: y, change };
  });
}

function show(v: unknown): string {
  if (v === MISSING) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

const ROW_CLASS: Record<Change, string> = {
  added: 'bg-green-50 dark:bg-green-500/10',
  removed: 'bg-red-50 dark:bg-red-500/10',
  changed: 'bg-amber-50 dark:bg-amber-500/10',
  same: '',
};

const CHANGE_LABEL: Record<Change, string> = { added: 'added', removed: 'removed', changed: 'changed', same: '' };

/** Side-by-side field diff of an audit log's before/after JSON, with a raw JSON view. */
export function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const rows = useMemo(() => diffJson(before, after), [before, after]);
  const [showSame, setShowSame] = useState(false);
  const [raw, setRaw] = useState(false);
  const visible = showSame ? rows : rows.filter((r) => r.change !== 'same');
  const changed = rows.filter((r) => r.change !== 'same').length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span>
          {changed} changed field{changed === 1 ? '' : 's'}
        </span>
        <Checkbox label="Show unchanged" checked={showSame} onChange={setShowSame} />
        <Checkbox label="Raw JSON" checked={raw} onChange={setRaw} />
      </div>
      {raw ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ['Before', before],
              ['After', after],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{label}</p>
              <pre className="max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-[#0B0F14]">
                {v === null || v === undefined ? '—' : JSON.stringify(v, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          {rows.length === 0 ? 'No before/after data recorded for this event.' : 'No field changes.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-slate-500 dark:bg-[#0B0F14]">
              <tr>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Before</th>
                <th className="px-3 py-2">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((r) => (
                <tr key={r.path} className={ROW_CLASS[r.change]}>
                  <td className="whitespace-nowrap px-3 py-1.5 align-top font-mono">
                    {r.path}
                    {r.change !== 'same' && <span className="ml-1 text-[10px] uppercase text-slate-500">{CHANGE_LABEL[r.change]}</span>}
                  </td>
                  <td className={cn('break-all px-3 py-1.5 align-top font-mono', r.change !== 'same' && 'text-red-700 line-through decoration-red-300 dark:text-red-300')}>
                    {show(r.before)}
                  </td>
                  <td className={cn('break-all px-3 py-1.5 align-top font-mono', r.change !== 'same' && 'text-green-800 dark:text-green-300')}>
                    {show(r.after)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
