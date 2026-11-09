import { ArrowRight, ShieldCheck } from 'lucide-react';
import { assessmentUrl } from '@/config/site';
import { illustration } from '@/lib/brand';
import { ButtonLink } from './ui';

/** Gradient call-to-action for the free AI assessment (patient portal, PLAN §10). */
export function AssessmentCta({
  title,
  body,
  button,
  specialty,
  note,
  secondary,
}: {
  title: string;
  body: string;
  button: string;
  specialty?: string | null;
  note?: string;
  secondary?: { href: string; label: string };
}) {
  const art = illustration('ai-processing');
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-9 shadow-card sm:px-10 sm:py-10" aria-label={title}>
      <span aria-hidden="true" className="absolute inset-y-8 start-0 w-0.5 rounded-full bg-champagne" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-base text-slate-700 sm:text-lg">{body}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={assessmentUrl(specialty)} variant="primary" size="lg">
              {button}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </ButtonLink>
            {secondary ? (
              <ButtonLink href={secondary.href} variant="outline" size="lg">
                {secondary.label}
              </ButtonLink>
            ) : null}
          </div>
          {note ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {note}
            </p>
          ) : null}
        </div>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" width={320} height={240} loading="lazy" className="mx-auto hidden h-40 w-auto lg:block" />
        ) : null}
      </div>
    </section>
  );
}
