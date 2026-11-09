import { CircleCheck } from 'lucide-react';
import { Suspense, type ReactNode } from 'react';
import { illustration } from '@/lib/brand';

/** Two-column layout for the public login door; the form column is a client island. */
export function AuthShell({
  title,
  subtitle,
  tagline,
  points,
  children,
}: {
  title: string;
  subtitle?: string;
  tagline: string;
  points: string[];
  children: ReactNode;
}) {
  const art = illustration('onboarding-security');
  return (
    <div className="bg-surface">
      <div className="container-page grid gap-8 py-10 sm:py-14 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-12">
        <aside className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white p-10 text-slate-900 shadow-card lg:block" aria-hidden="true">
          <p className="flex items-center gap-3 text-sm font-semibold tracking-[0.08em] text-slate-600 uppercase"><span className="h-px w-8 bg-champagne" />Heal India Global</p>
          <p className="font-display mt-3 text-3xl leading-tight font-bold text-slate-900">{tagline}</p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-slate-700">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" strokeWidth={1.75} />
                {p}
              </li>
            ))}
          </ul>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt="" width={320} height={240} className="mx-auto mt-10 h-56 w-auto" />
          ) : null}
        </aside>
        <section className="mx-auto w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8" aria-labelledby="auth-title">
          <h1 id="auth-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-slate-600">{subtitle}</p> : null}
          <div className="mt-6">
            <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-slate-100" />}>{children}</Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
