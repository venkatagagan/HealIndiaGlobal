'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

export interface FooterColumn {
  title: string;
  links: { href: string; label: string }[];
}

/** Footer link columns: evenly spread on desktop, an accordion (one group open at a time) on mobile. */
export function FooterColumns({ columns }: { columns: FooterColumn[] }) {
  const id = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="grid divide-y divide-night-line border-y border-night-line sm:grid-cols-4 sm:divide-y-0 sm:border-0 lg:grid-cols-[1.35fr_1fr_1fr_1fr] sm:gap-6">
      {columns.map((col, i) => {
        const panel = `${id}-${i}`;
        const isOpen = open === i;
        return (
          <div key={col.title} className="min-w-0">
            <h3 className="text-sm font-semibold text-white">
              <span className="hidden sm:block">{col.title}</span>
              <button
                type="button"
                className="flex w-full items-center justify-between py-3 text-start sm:hidden"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                {col.title}
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </h3>
            <ul id={panel} className={`${isOpen ? 'grid' : 'hidden'} grid-cols-2 gap-x-4 gap-y-2 pb-4 text-sm sm:mt-3 sm:block sm:space-y-1.5 sm:pb-0`}>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-slate-400 transition-colors hover:text-white xl:whitespace-nowrap">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
