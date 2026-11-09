import { Info } from 'lucide-react';

/** Honest notice when a page was rendered from the offline fallback catalogue. */
export function DataNotice({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return (
    <div role="note" className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <p className="container-page flex items-start gap-2 py-2 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </p>
    </div>
  );
}

export function InlineNote({ text, tone = 'slate' }: { text: string; tone?: 'slate' | 'amber' }) {
  const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <p role="note" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
