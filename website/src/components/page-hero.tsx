import type { ReactNode } from 'react';
import type { Crumb } from '@/lib/jsonld';
import { Breadcrumbs } from './breadcrumbs';

/**
 * Inner-page hero: a compact, luminous brand band (soft mint -> blue tint, faint dot pattern).
 * Title, intro and key-fact chips on the left; the breadcrumb is a small pill at the top-right on desktop
 * (above the title on phones); an optional `aside` card sits under the breadcrumb on the right.
 */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  intro,
  children,
  aside,
  facts,
}: {
  crumbs: Crumb[];
  eyebrow?: ReactNode;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  /** Short key facts shown as chips under the intro, e.g. "16 specialties". */
  facts?: ReactNode[];
}) {
  const layout = aside
    ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-x-10 lg:[grid-template-areas:"main_crumbs""main_aside"]'
    : 'lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-10 lg:[grid-template-areas:"main_crumbs"]';
  const shownFacts = (facts ?? []).filter(Boolean);
  return (
    <section className="bg-hero-light relative isolate overflow-hidden border-b border-champagne/30">
      {/* decorative layer */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-dots absolute inset-y-0 end-0 w-1/2 [mask-image:radial-gradient(60%_70%_at_80%_40%,black,transparent)]" />
        <div className="absolute -top-24 -end-16 h-64 w-64 rounded-full bg-primary-300/30 blur-3xl" />
        <div className="absolute -bottom-28 start-1/4 h-56 w-56 rounded-full bg-champagne/15 blur-3xl" />
        <svg
          viewBox="0 0 200 200"
          className="absolute end-[6%] top-1/2 hidden h-56 w-56 -translate-y-1/2 text-primary-500/10 lg:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <circle cx="100" cy="100" r="96" />
          <circle cx="100" cy="100" r="70" />
          <path d="M100 30c18 22 18 48 0 70-18-22-18-48 0-70Z" />
          <path d="M100 100c-26-6-44-24-48-50 26 4 44 22 48 50Zm0 0c26-6 44-24 48-50-26 4-44 22-48 50Z" />
          <path d="M88 150h24M100 138v24" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div
        className={`container-page grid gap-3 py-6 [grid-template-areas:"crumbs""main""aside"] sm:py-8 ${layout}`}
      >
        <div className="[grid-area:crumbs] lg:flex lg:justify-end lg:self-start">
          <Breadcrumbs items={crumbs} pill />
        </div>
        <div className="[grid-area:main] lg:pt-1">
          {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
          <h1 className="text-[1.7rem] leading-tight font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl">{title}</h1>
          {intro ? <div className="mt-2 max-w-3xl text-base text-slate-700 sm:text-lg">{intro}</div> : null}
          {shownFacts.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {shownFacts.map((f, i) => (
                <li
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/5"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${['bg-primary-600', 'bg-champagne', 'bg-navy', 'bg-primary-600'][i % 4]}`} />
                  {f}
                </li>
              ))}
            </ul>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
        {aside ? <div className="mt-2 [grid-area:aside] lg:mt-1">{aside}</div> : null}
      </div>
    </section>
  );
}
