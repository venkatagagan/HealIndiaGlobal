import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { href } from '@/lib/routes';
import type { GrowthLink } from '@/lib/growth/links';

/** Small "Related" block: a titled list of internal links. Renders nothing without links. */
export function RelatedLinks({ id, title, items }: { id: string; title: string; items: GrowthLink[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-surface p-6">
      <h2 id={id} className="text-lg font-bold text-slate-900">
        {title}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={href(item.href)}
              className="group flex h-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-primary-300"
            >
              <span>
                <span className="block font-semibold text-slate-900 group-hover:text-primary-800">{item.title}</span>
                {item.description ? <span className="mt-0.5 block text-sm text-slate-600">{item.description}</span> : null}
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
