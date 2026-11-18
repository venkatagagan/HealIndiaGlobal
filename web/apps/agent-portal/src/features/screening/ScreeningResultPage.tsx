import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  AlertOctagon,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Circle,
  GitCompare,
  Languages,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  LIKELIHOOD_LABELS,
  agentPortalApi,
  errorMessage,
  screeningsApi,
  type MatchOut,
  type ScreeningOut,
} from '@hig/shared/api';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  Money,
  PageHeader,
  StatusBadge,
} from '../../components/ui';
import { MAX_COMPARE } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { qk } from '../../lib/queries';
import { cn, formatDateTime, formatMoneyRange, formatNumber, useDocumentTitle } from '../../lib/shared';
import { languageLabel } from '../../lib/constants';
import { Trans } from 'react-i18next';
import { useAppTranslation, type AppT } from '../../i18n';

/** 45 -> "45%" in the UI language */
const pctText = (value: number) => formatNumber(value / 100, { style: 'percent', maximumFractionDigits: 0 });
import { EnquiryDialog, type EnquiryTarget } from '../cases/EnquiryDialog';

export function ScreeningResultPage() {
  const { t } = useAppTranslation();
  const { screeningId = '' } = useParams();
  const queryClient = useQueryClient();
  useDocumentTitle(t('screeningResult.documentTitle'));

  const screening = useQuery({
    queryKey: qk.screening(screeningId),
    queryFn: () => screeningsApi.get(screeningId),
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 2500 : false),
  });
  const s = screening.data;
  const patient = useQuery({
    queryKey: qk.patient(s?.patient_id ?? ''),
    queryFn: () => agentPortalApi.getPatient(s?.patient_id ?? ''),
    enabled: Boolean(s?.patient_id),
  });
  const matches = useQuery({
    queryKey: qk.matches(screeningId),
    queryFn: () => screeningsApi.matches(screeningId),
    enabled: s?.status === 'completed',
  });

  const rerun = useMutation({
    mutationFn: () => screeningsApi.rerun(screeningId),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.screening(screeningId), data);
      void queryClient.invalidateQueries({ queryKey: qk.matches(screeningId) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (screening.isPending) return <LoadingBlock />;
  if (screening.isError) return <ErrorState error={screening.error} onRetry={() => void screening.refetch()} />;
  if (!s) return null;

  const pName = patient.data ? patientName(patient.data) : t('screeningResult.fallbackPatient');
  const back = (
    <Link to={`/patients/${s.patient_id}?tab=screenings`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {pName}
    </Link>
  );

  if (s.status === 'draft') {
    return (
      <div>
        <PageHeader back={back} title={t('screeningResult.draftTitle')} />
        <Card>
          <EmptyState
            title={t('screeningResult.notSubmitted')}
            action={<ButtonLink to={`/screenings/${s.id}/edit`}>{t('screeningResult.continue')}</ButtonLink>}
          />
        </Card>
      </div>
    );
  }

  if (s.status === 'processing') return <Processing back={back} />;

  if (s.status === 'failed') {
    return (
      <div>
        <PageHeader back={back} title={t('screeningResult.failedTitle')} />
        <Card>
          <ErrorState
            title={t('screeningResult.analysisFailed')}
            error={new Error(s.error ?? t('screeningResult.analysisFailedHint'))}
            onRetry={() => rerun.mutate()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={back}
        title={t('screeningResult.title', { name: pName })}
        description={`${t('screeningResult.completed', { date: formatDateTime(s.completed_at) })}${s.ai_result ? ` · ${s.ai_result.engine === 'claude' ? t('screeningResult.aiAnalysis') : t('screeningResult.rulesAnalysis')}` : ''}`}
        actions={
          <Button variant="outline" icon={<RefreshCw className="h-4 w-4" aria-hidden />} loading={rerun.isPending} onClick={() => rerun.mutate()}>
            {t('screeningResult.rerun')}
          </Button>
        }
      />
      <TriageSummary screening={s} />
      <MatchesSection
        screening={s}
        patientId={s.patient_id}
        patientLabel={pName}
        matches={matches.data}
        loading={matches.isPending}
        error={matches.isError ? matches.error : null}
        onRetry={() => void matches.refetch()}
      />
    </div>
  );
}

const STEP_KEYS = ['screeningResult.steps.analyzing', 'screeningResult.steps.matching', 'screeningResult.steps.savings'] as const;

function Processing({ back }: { back: ReactNode }) {
  const { t } = useAppTranslation();
  const STEPS = STEP_KEYS.map((key) => t(key));
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1)), 4000);
    return () => clearInterval(id);
  }, []);
  return (
    <div>
      <PageHeader back={back} title={t('screeningResult.findingTitle')} />
      <Card className="hero-gradient overflow-hidden border-0 text-white">
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="relative mb-8 flex h-20 w-20 items-center justify-center">
            <span className="pulse-ring absolute inset-0 rounded-full bg-white/30" />
            <Stethoscope className="relative h-10 w-10" aria-hidden />
          </div>
          <h2 className="text-2xl font-bold">{t('screeningResult.findingHeading')}</h2>
          <ul className="mt-6 space-y-3 text-start" aria-live="polite">
            {STEPS.map((label, i) => (
              <li key={label} className={cn('flex items-center gap-3', i > step && 'opacity-60')}>
                {i < step ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                ) : i === step ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5" aria-hidden />
                )}
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-white/80">{t('screeningResult.findingHint')}</p>
        </div>
      </Card>
    </div>
  );
}

function TriageSummary({ screening }: { screening: ScreeningOut }) {
  const { t } = useAppTranslation();
  const ai = screening.ai_result;
  const urgency = screening.urgency ?? ai?.urgency ?? null;
  return (
    <div className="mb-6 space-y-4">
      {urgency === 'emergency' && (
        <div role="alert" className="flex gap-3 rounded-xl border border-danger/40 bg-danger-soft p-4 text-red-800 dark:text-red-200">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">{t('screeningResult.emergencyTitle')}</p>
            <p>{t('screeningResult.emergencyBody')}</p>
          </div>
        </div>
      )}
      {ai ? (
        <Card>
          <CardHeader
            title={t('screeningResult.triageSummary')}
            actions={urgency && <StatusBadge kind="urgency" status={urgency} />}
          />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm leading-relaxed">{ai.summary}</p>
              {ai.suggested_specialties.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted uppercase">{t('screeningResult.suggestedSpecialties')}</p>
                  <div className="flex flex-wrap gap-2">
                    {ai.suggested_specialties.map((sp) => (
                      <Badge key={sp.slug} tone="accent">
                        {sp.name} · {pctText(sp.confidence * 100)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {ai.possible_conditions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted uppercase">{t('screeningResult.possibleConditions')}</p>
                  <ul className="space-y-1.5 text-sm">
                    {ai.possible_conditions.map((c) => (
                      <li key={c.name}>
                        <span className="font-medium">{c.name}</span>{' '}
                        <span className="text-muted">({t('screeningResult.likelihood', { level: LIKELIHOOD_LABELS[c.likelihood] })})</span>
                        {c.notes && <span className="block text-muted">{c.notes}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(screening.red_flags.length > 0 || ai.red_flags.length > 0) && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-danger uppercase">{t('screeningResult.redFlags')}</p>
                  <ul className="list-disc space-y-1 ps-5 text-sm">
                    {[...new Set([...screening.red_flags, ...ai.red_flags])].map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-4 text-sm">
              {ai.recommended_procedures.length > 0 && (
                <SummaryList title={t('screeningResult.recommendedProcedures')} items={ai.recommended_procedures.map((p) => `${p.name} — ${p.rationale}`)} />
              )}
              {ai.recommended_tests.length > 0 && <SummaryList title={t('screeningResult.recommendedTests')} items={ai.recommended_tests} />}
              {ai.questions_for_doctor.length > 0 && <SummaryList title={t('screeningResult.questionsForDoctor')} items={ai.questions_for_doctor} />}
              {ai.travel_advice && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted uppercase">{t('screeningResult.travelAdvice')}</p>
                  <p>{ai.travel_advice}</p>
                </div>
              )}
            </div>
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            {ai.disclaimer || t('screeningResult.disclaimer')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted uppercase">{title}</p>
      <ul className="list-disc space-y-1 ps-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function matchTarget(m: MatchOut): EnquiryTarget {
  return {
    hospital_id: m.hospital.id,
    hospital_name: m.hospital.name,
    doctor_id: m.doctor?.id ?? null,
    doctor_name: m.doctor?.full_name ?? null,
    procedure_id: m.procedure?.id ?? null,
    procedure_name: m.procedure?.name ?? null,
    specialty_id: m.doctor?.specialty.id ?? null,
  };
}

function MatchesSection({
  screening,
  patientId,
  patientLabel,
  matches,
  loading,
  error,
  onRetry,
}: {
  screening: ScreeningOut;
  patientId: string;
  patientLabel: string;
  matches: MatchOut[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useAppTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  const selectedMatches = (matches ?? []).filter((m) => selected.includes(m.id));
  // one case per hospital: de-duplicate by hospital
  const targets = selectedMatches
    .map(matchTarget)
    .filter((target, i, arr) => arr.findIndex((x) => x.hospital_id === target.hospital_id) === i);

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_COMPARE) {
        toast.info(t('screeningResult.selectMax', { max: MAX_COMPARE }));
        return cur;
      }
      return [...cur, id];
    });
  };

  return (
    <section aria-labelledby="matches-heading" className="pb-24">
      <h2 id="matches-heading" className="mb-1 text-lg font-semibold">
        {t('screeningResult.topMatches')}
      </h2>
      <p className="mb-4 text-sm text-muted">{t('screeningResult.topMatchesHint', { max: MAX_COMPARE })}</p>
      {loading ? (
        <LoadingBlock label={t('screeningResult.loadingMatches')} />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={onRetry} />
        </Card>
      ) : !matches || matches.length === 0 ? (
        <Card>
          <EmptyState
            title={t('screeningResult.noMatches')}
            description={t('screeningResult.noMatchesHint')}
            action={<ButtonLink to="/hospitals">{t('screeningResult.browseHospitals')}</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} selected={selected.includes(m.id)} onToggle={() => toggle(m.id)} />
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur lg:start-64">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <Trans
                t={t}
                i18nKey="screeningResult.selectedFor"
                values={{ count: selected.length, max: MAX_COMPARE, name: patientLabel }}
                components={{ 0: <strong /> }}
              />
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelected([])}>
                {t('screeningResult.clear')}
              </Button>
              <Button
                variant="outline"
                icon={<GitCompare className="h-4 w-4" aria-hidden />}
                disabled={selected.length < 2}
                onClick={() => setCompareOpen(true)}
              >
                {t('screeningResult.compare')}
              </Button>
              <Button icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => setEnquiryOpen(true)}>
                {t('screeningResult.requestQuotes')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title={t('screeningResult.compareMatches')} size="xl" footer={
        <Button icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => { setCompareOpen(false); setEnquiryOpen(true); }}>
          {t('screeningResult.requestFromThese')}
        </Button>
      }>
        <MatchCompareTable matches={selectedMatches} />
      </Modal>
      <EnquiryDialog
        open={enquiryOpen}
        onClose={() => setEnquiryOpen(false)}
        targets={targets}
        patientId={patientId}
        patientLabel={patientLabel}
        screeningId={screening.id}
      />
    </section>
  );
}

function MatchCard({ match, selected, onToggle }: { match: MatchOut; selected: boolean; onToggle: () => void }) {
  const { t } = useAppTranslation();
  const d = match.doctor;
  const h = match.hospital;
  return (
    <Card className={cn('flex flex-col overflow-hidden transition-shadow', selected && 'ring-2 ring-primary')}>
      <div className="flex items-start gap-3 p-5">
        {d?.photo_url ? (
          <img src={d.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <Stethoscope className="h-6 w-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{d ? d.full_name : h.name}</p>
            <Badge tone="success">{t('screeningResult.matchScore', { pct: pctText(match.match_score) })}</Badge>
          </div>
          {d && (
            <p className="text-sm text-muted">
              {d.specialty.name}
              {d.experience_years ? ` · ${t('screeningResult.yearsShort', { count: d.experience_years })}` : ''}
            </p>
          )}
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {d ? `${h.name}, ` : ''}
            {h.city}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-5">
        {h.accreditations.map((a) => (
          <Badge key={a} tone="info">
            <BadgeCheck className="h-3 w-3" aria-hidden /> {a.toUpperCase()}
          </Badge>
        ))}
        {d?.success_rate_pct != null && <Badge tone="success">{t('screeningResult.success', { pct: pctText(Number(d.success_rate_pct)) })}</Badge>}
        {(d?.rating_avg ?? h.rating_avg) != null && (
          <Badge>
            <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden /> {formatNumber(Number(d?.rating_avg ?? h.rating_avg), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </Badge>
        )}
        {d?.qualifications.slice(0, 3).map((q) => <Badge key={q}>{q}</Badge>)}
      </div>
      {match.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 px-5 text-xs text-muted">
          {match.reasons.slice(0, 4).map((r) => (
            <li key={r} className="flex gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> {r}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto space-y-3 p-5">
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted">{t('screeningResult.estimatedTotal')}{match.procedure ? ` · ${match.procedure.name}` : ''}</p>
          <p className="text-xl font-bold text-danger">
            {match.estimated_cost_minor != null ? <Money minor={match.estimated_cost_minor} currency={match.currency} /> : t('screeningResult.onRequest')}
          </p>
          {match.savings && (
            <p className="text-xs text-primary-ink">
              {t('screeningResult.savings', {
                min: formatNumber(match.savings.pct_min),
                max: formatNumber(match.savings.pct_max),
                country: match.savings.home_country,
                range: formatMoneyRange(match.savings.home_min_minor, match.savings.home_max_minor, match.savings.home_currency),
              })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant={selected ? 'secondary' : 'outline'} className="flex-1" onClick={onToggle} aria-pressed={selected}>
            {selected ? (
              <>
                <X className="h-4 w-4" aria-hidden /> {t('screeningResult.remove')}
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4" aria-hidden /> {t('screeningResult.select')}
              </>
            )}
          </Button>
          <ButtonLink variant="ghost" to={d ? `/doctors/${d.id}` : `/hospitals/${h.slug}`} className="flex-1">
            {t('screeningResult.viewDetails')}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/** numeric value per match; `best` = which end wins. Ties all win; nothing wins when every value is equal. */
function winners(values: (number | null)[], best: 'max' | 'min'): Set<number> {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return new Set();
  const target = best === 'max' ? Math.max(...present) : Math.min(...present);
  if (present.every((v) => v === target)) return new Set();
  return new Set(values.flatMap((v, i) => (v === target ? [i] : [])));
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function MatchCompareTable({ matches }: { matches: MatchOut[] }) {
  const { t } = useAppTranslation();
  const rows = compareRows(t, matches);
  return <MatchCompareGrid matches={matches} rows={rows} />;
}

type CompareRow = { label: string; render: (m: MatchOut) => ReactNode; value?: (m: MatchOut) => number | null; best?: 'max' | 'min'; badge?: string };

function compareRows(t: AppT, matches: MatchOut[]): CompareRow[] {
  const sameCurrency = new Set(matches.map((m) => m.currency)).size === 1;
  return [
    { label: t('screeningResult.rows.matchScore'), render: (m) => pctText(m.match_score), value: (m) => m.match_score, best: 'max', badge: t('screeningResult.badges.bestMatch') },
    { label: t('screeningResult.rows.doctor'), render: (m) => m.doctor?.full_name ?? '—' },
    { label: t('screeningResult.rows.specialty'), render: (m) => m.doctor?.specialty.name ?? '—' },
    {
      label: t('screeningResult.rows.experience'),
      render: (m) => (m.doctor?.experience_years ? t('screeningResult.years', { count: m.doctor.experience_years }) : '—'),
      value: (m) => num(m.doctor?.experience_years),
      best: 'max',
      badge: t('screeningResult.badges.mostExperienced'),
    },
    {
      label: t('screeningResult.rows.successRate'),
      render: (m) => (m.doctor?.success_rate_pct != null ? pctText(Number(m.doctor.success_rate_pct)) : '—'),
      value: (m) => num(m.doctor?.success_rate_pct),
      best: 'max',
      badge: t('screeningResult.badges.highest'),
    },
    {
      label: t('screeningResult.rows.rating'),
      render: (m) => {
        const r = m.doctor?.rating_avg ?? m.hospital.rating_avg;
        return r != null ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-current text-warning" aria-hidden /> {t('screeningResult.ratingOutOf5', { rating: formatNumber(Number(r), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
          </span>
        ) : (
          '—'
        );
      },
      value: (m) => num(m.doctor?.rating_avg ?? m.hospital.rating_avg),
      best: 'max',
      badge: t('screeningResult.badges.topRated'),
    },
    { label: t('screeningResult.rows.accreditations'), render: (m) => m.hospital.accreditations.map((a) => a.toUpperCase()).join(', ') || '—' },
    {
      label: t('screeningResult.rows.languages'),
      render: (m) => (
        <span className="inline-flex items-center gap-1">
          <Languages className="h-3.5 w-3.5 text-muted" aria-hidden />
          {(m.doctor?.languages ?? m.hospital.languages).map(languageLabel).join(', ') || '—'}
        </span>
      ),
    },
    { label: t('screeningResult.rows.procedure'), render: (m) => m.procedure?.name ?? '—' },
    { label: t('screeningResult.rows.package'), render: (m) => m.package?.name ?? '—' },
    {
      label: t('screeningResult.rows.estimatedCost'),
      render: (m) => (m.estimated_cost_minor != null ? <Money minor={m.estimated_cost_minor} currency={m.currency} className="font-semibold" /> : '—'),
      value: (m) => (sameCurrency ? num(m.estimated_cost_minor) : null),
      best: 'min',
      badge: t('screeningResult.badges.lowest'),
    },
    {
      label: t('screeningResult.rows.savingsVsHome'),
      render: (m) => (m.savings ? t('screeningResult.pctRange', { min: formatNumber(m.savings.pct_min), max: formatNumber(m.savings.pct_max) }) : '—'),
      value: (m) => num(m.savings?.pct_max),
      best: 'max',
      badge: t('screeningResult.badges.biggest'),
    },
    { label: t('screeningResult.rows.whyItMatches'), render: (m) => <span className="text-muted">{m.reasons.join(' · ') || '—'}</span> },
  ];
}

function MatchCompareGrid({ matches, rows }: { matches: MatchOut[]; rows: CompareRow[] }) {
  const { t } = useAppTranslation();
  return (
    <div className="max-h-[65vh] overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm [&>tbody>tr:not(:last-child)>*]:border-b [&>tbody>tr>*]:border-border">
        <caption className="sr-only">{t('screeningResult.compareCaption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 start-0 z-30 w-36 border-e border-b border-border bg-surface-2 px-3 py-3 text-start text-xs font-semibold text-muted uppercase">
              {t('screeningResult.matchColumn')}
            </th>
            {matches.map((m) => (
              <th key={m.id} scope="col" className="sticky top-0 z-20 min-w-48 border-b border-border bg-surface-2 px-3 py-3 text-start align-top font-normal">
                <span className="block font-semibold text-fg">{m.hospital.name}</span>
                <span className="text-xs text-muted">{m.hospital.city}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const win = row.value && row.best ? winners(matches.map(row.value), row.best) : new Set<number>();
            return (
              <tr key={row.label}>
                <th scope="row" className="sticky start-0 z-10 w-36 border-e border-border bg-surface px-3 py-2.5 text-start align-top text-xs font-semibold text-muted uppercase">
                  {row.label}
                </th>
                {matches.map((m, i) => (
                  <td key={m.id} className={cn('px-3 py-2.5 align-top', win.has(i) && 'bg-success-soft/70')}>
                    <span className={cn(win.has(i) && 'font-medium text-success-ink')}>{row.render(m)}</span>
                    {win.has(i) && row.badge && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-success-ink">
                        <Check className="h-3 w-3" aria-hidden /> {row.badge}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
