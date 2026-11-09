import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { breadcrumbLd, type Crumb } from '@/lib/jsonld';
import { JsonLd } from './json-ld';

/** Visible breadcrumb trail + BreadcrumbList JSON-LD. The last item is the current page. */
export function Breadcrumbs({
  items,
  label = 'Breadcrumb',
  dark = false,
  pill = false,
}: {
  items: Crumb[];
  label?: string;
  dark?: boolean;
  /** Compact frosted pill (page heroes). */
  pill?: boolean;
}) {
  return (
    <>
      <nav aria-label={label} className={pill ? '' : 'mb-4'}>
        <ol
          className={`flex flex-wrap items-center gap-1 ${dark ? 'text-slate-300' : 'text-slate-600'} ${
            pill
              ? 'w-fit rounded-[1rem] bg-white/75 px-3 py-1.5 text-[0.8rem] shadow-sm ring-1 ring-slate-900/5 backdrop-blur'
              : 'text-sm'
          }`}
        >
          {items.map((item, i) => {
            const last = i === items.length - 1;
            return (
              // Pill (page hero) on phones: only the parent link, as a "back" crumb.
              <li
                key={item.path}
                className={`flex items-center gap-1 ${pill && i !== items.length - 2 ? 'max-sm:hidden' : ''}`}
              >
                {pill && i === items.length - 2 ? <ChevronLeft className="h-3.5 w-3.5 opacity-60 sm:hidden" aria-hidden="true" /> : null}
                {i > 0 ? (
                  <ChevronRight className={`${pill ? 'h-3.5 w-3.5 max-sm:hidden' : 'h-4 w-4'} opacity-60`} aria-hidden="true" />
                ) : null}
                {last ? (
                  <span aria-current="page" className={`font-medium ${dark ? 'text-white' : 'text-slate-900'}`}>
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path} className={`underline-offset-4 hover:underline ${dark ? 'hover:text-white' : 'hover:text-slate-900'}`}>
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbLd(items)} />
    </>
  );
}
