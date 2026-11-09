import { ChevronDown } from 'lucide-react';

export interface TocLink {
  id: string;
  text: string;
}

/**
 * "On this page" table of contents: a sticky card on desktop, a collapsed disclosure on phones/tablets so long
 * articles start with content instead of a list of links.
 */
export function TocNav({ items, title, id = 'toc-title' }: { items: TocLink[]; title: string; id?: string }) {
  if (items.length < 3) return null;
  const list = (
    <ol className="mt-3 space-y-1.5 text-sm">
      {items.map((i) => (
        <li key={i.id}>
          <a href={`#${i.id}`} className="block rounded-md py-0.5 text-slate-700 hover:text-primary-800 hover:underline">
            {i.text}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <nav aria-labelledby={id} className="lg:sticky lg:top-24">
      <details className="group rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-card lg:hidden">
        <summary className="flex items-center justify-between text-sm font-semibold text-slate-900">
          <span id={`${id}-m`}>{title}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        {list}
      </details>
      <div className="hidden max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-card lg:block">
        <h2 id={id} className="text-sm font-semibold text-slate-900">
          {title}
        </h2>
        {list}
      </div>
    </nav>
  );
}
