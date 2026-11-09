'use client';

import { useEffect, useState } from 'react';

export interface SectionNavItem {
  /** id of the section heading (or section) to jump to. */
  id: string;
  label: string;
}

/**
 * Sticky in-page navigation for long detail pages: a horizontal row of anchor pills under the site header that
 * highlights the section currently in view. Items whose target is missing from the page are dropped after load.
 */
export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const [present, setPresent] = useState<SectionNavItem[]>(items);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const found = items.filter((i) => document.getElementById(i.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the server-rendered page once
    setPresent(found);
    const targets = found
      .map((i) => document.getElementById(i.id))
      .map((el) => (el?.closest('section') as HTMLElement | null) ?? el)
      .filter((el): el is HTMLElement => !!el);
    const idOf = new Map(targets.map((el, n) => [el, found[n]!.id]));
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = idOf.get(e.target as HTMLElement);
          if (!id) continue;
          if (e.isIntersecting) visible.set(id, e.boundingClientRect.top);
          else visible.delete(id);
        }
        const first = found.find((i) => visible.has(i.id));
        setActive(first?.id ?? null);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  if (present.length < 2) return null;
  return (
    <nav aria-label={label} className="sticky top-16 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md print:hidden">
      <ul className="container-page flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        {present.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? 'location' : undefined}
              className={`inline-block rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active === i.id ? 'bg-primary-100 text-primary-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
