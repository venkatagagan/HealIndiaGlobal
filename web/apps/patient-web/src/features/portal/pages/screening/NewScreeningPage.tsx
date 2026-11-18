import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowRight, BadgePercent, Clock, HelpCircle, History, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { BrandMark } from '@hig/shared/layout';
import { errorMessage } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useCreateScreening, useScreenings, useSpecialties } from '../../api/queries';
import { SpecialtyTile, specialtyColors } from '../../components/SpecialtyIcon';
import { paths } from '../../lib/paths';
import { cn, formatNumber, formatRelative, useDocumentTitle } from '../../lib/shared';
import { EmptyState, ErrorState, Skeleton } from '../../ui/primitives';

export function NewScreeningPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('screening.new.documentTitle'));
  const [params] = useSearchParams();
  const preselected = params.get('specialty');
  const navigate = useNavigate();
  const specialties = useSpecialties();
  const drafts = useScreenings({ status: 'draft', page_size: 5 });
  const create = useCreateScreening();
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const list = useMemo(() => {
    const items = [...(specialties.data ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const term = q.trim().toLowerCase();
    return term
      ? items.filter((s) => s.name.toLowerCase().includes(term) || (s.description ?? '').toLowerCase().includes(term))
      : items;
  }, [specialties.data, q]);

  async function start(slug: string | null) {
    setPending(slug ?? 'general');
    try {
      const screening = await create.mutateAsync(slug ? { specialty_slug: slug } : {});
      navigate(paths.screeningStep(screening.id, 1));
    } catch (err) {
      toast.error(errorMessage(err, t('screening.new.startFailed')));
      setPending(null);
    }
  }

  return (
    <div>
      {/* hero: title, promise and search */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-brand-gradient px-5 py-7 text-white shadow-glow sm:px-8 sm:py-9">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgb(255_255_255/0.18),transparent_60%),radial-gradient(40%_60%_at_0%_100%,rgb(255_255_255/0.10),transparent_70%)]"
          aria-hidden
        />
        <BrandMark mono className="pointer-events-none absolute -end-6 -top-6 hidden size-48 text-white/12 sm:block" />
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25 backdrop-blur">
            <Sparkles className="size-3.5" aria-hidden /> {t('screening.new.badge')}
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{t('screening.new.title')}</h1>
          <p className="mt-2 text-sm text-white/90 sm:text-base">{t('screening.new.intro')}</p>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('screening.new.searchPlaceholder')}
              aria-label={t('screening.new.searchLabel')}
              className="h-12 w-full rounded-xl border-0 bg-white ps-11 pe-4 text-sm text-slate-900 shadow-raised placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-white/40"
            />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/90">
            <li className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> {t('screening.new.aboutMinutes')}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4" aria-hidden /> {t('screening.new.accreditedOnly')}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <BadgePercent className="size-4" aria-hidden /> {t('screening.new.freeNoObligation')}
            </li>
          </ul>
        </div>
      </section>

      {drafts.data && drafts.data.items.length > 0 ? (
        <section
          aria-labelledby="continue-heading"
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-3 sm:shrink-0 sm:pe-2">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-ink">
              <History className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="continue-heading" className="text-sm font-semibold text-fg">
                {t('screening.new.continueTitle')}
              </h2>
              <p className="text-xs text-muted">{t('screening.new.answersSaved')}</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2">
            {drafts.data.items.map((d) => (
              <li key={d.id}>
                <Link
                  to={paths.screeningStep(d.id, 1)}
                  className="group inline-flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 py-1.5 ps-1.5 pe-3 text-sm font-medium text-fg transition hover:border-primary/40 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SpecialtyTile slug={d.specialty?.slug ?? null} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate">{d.specialty?.name ?? t('screening.generalScreening')}</span>
                    <span className="block text-xs font-normal text-muted">
                      {t('screening.new.startedAgo', { when: formatRelative(d.created_at) })}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary-ink rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">{t('screening.new.chooseSpecialty')}</h2>
        {specialties.data ? (
          <p className="text-sm text-muted">
            {t('screening.new.countOf', { shown: formatNumber(list.length), total: formatNumber(specialties.data.length) })}
          </p>
        ) : null}
      </div>

      {specialties.isPending ? (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : specialties.isError ? (
        <ErrorState error={specialties.error} onRetry={() => void specialties.refetch()} />
      ) : (
        <>
          {list.length === 0 ? (
            <EmptyState title={t('screening.new.noMatchTitle')} description={t('screening.new.noMatchDescription')} />
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={create.isPending}
                  onClick={() => void start(s.slug)}
                  aria-busy={pending === s.slug}
                  className={cn(
                    'group relative flex flex-col items-start rounded-2xl border bg-surface p-5 text-start shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    specialtyColors(s.slug).border,
                    preselected === s.slug ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                    pending === s.slug && 'animate-pulse',
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <SpecialtyTile slug={s.slug} />
                    {s.savings_min_pct != null && s.savings_max_pct != null ? (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-ink ring-1 ring-inset ring-current/15">
                        {t('screening.new.savePct', { min: formatNumber(s.savings_min_pct), max: formatNumber(s.savings_max_pct) })}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-4 font-semibold leading-snug text-fg">{s.name}</span>
                  {s.description ? <span className="mt-1.5 line-clamp-2 text-sm text-muted">{s.description}</span> : null}
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary-ink">
                    {t('screening.new.startScreening')}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
                      aria-hidden
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void start(null)}
            disabled={create.isPending}
            className="group mt-4 flex w-full items-center gap-4 rounded-2xl border border-accent/25 bg-linear-to-r from-accent-soft via-surface to-primary-soft p-4 text-start shadow-card transition hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:p-5"
          >
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-glow-accent">
              <HelpCircle className="size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">{t('screening.new.notSureTitle')}</span>
              <span className="block text-sm text-muted">{t('screening.new.notSureDescription')}</span>
            </span>
            <ArrowRight
              className="size-5 shrink-0 text-accent-ink transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
              aria-hidden
            />
          </button>
        </>
      )}
    </div>
  );
}
