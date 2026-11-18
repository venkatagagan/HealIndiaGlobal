/**
 * Analytics (staff): funnel and volumes, quote speed, finance (admin | finance | super_admin only - support never
 * requests it), patients, hospitals, agents, aftercare, free intro calls, AI usage and notification delivery.
 * Filters live in the URL (from, to, granularity, country, specialty, hospital, agent, channel, currency). Every
 * section fetches its own endpoint; all dates are India Standard Time days. Aggregates only.
 */
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, Globe2, Layers, Megaphone, RefreshCw, Stethoscope, Briefcase } from 'lucide-react';
import type { UserRole } from '@hig/shared/api';
import { Button, DateRangeFilter, FilterBar, PageHeader, SelectFilter } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import {
  ANALYTICS_PRESETS,
  CHANNELS,
  GRANULARITIES,
  useAnalyticsFilters,
  useAnalyticsQuery,
} from '../components/analytics/kit';
import {
  AftercareSection,
  AgentsSection,
  AiUsageSection,
  FinanceSection,
  HospitalsSection,
  IntroCallsSection,
  NotificationsSection,
  OverviewSection,
  PatientsSection,
  QuoteSlaSection,
  REPORTING_CURRENCIES,
} from '../components/analytics/sections';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { analyticsApi, analyticsKeys } from '../lib/analyticsApi';
import { countryName, useAdminFacets, useAgentOptions, useHospitalOptions, useSpecialtyOptions } from '../lib/lookups';
import { useOpsPermissions } from '../lib/session';

/** Roles that may see platform money (the API returns 403 to support). */
const FINANCE_ANALYTICS_ROLES: readonly UserRole[] = ['admin', 'finance', 'super_admin'];
const IST = 'Asia/Kolkata';

export default function AnalyticsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('analytics.title'));
  const qc = useQueryClient();
  const perms = useOpsPermissions();
  const showFinance = perms.role !== null && FINANCE_ANALYTICS_ROLES.includes(perms.role);
  const { values, set, params, hasDimensionFilter } = useAnalyticsFilters();
  const currency = REPORTING_CURRENCIES.includes(values.currency.toUpperCase()) ? values.currency.toUpperCase() : 'INR';

  // shares the cache entry of the overview section: used for the time-zone label and "updated at"
  const overview = useAnalyticsQuery('overview', params, analyticsApi.overview);
  const meta = overview.data?.meta;
  const timezoneLabel =
    !meta || meta.timezone === IST ? t('analytics.timezoneIst') : t('analytics.timezoneOther', { timezone: meta.timezone });

  const facets = useAdminFacets();
  const specialties = useSpecialtyOptions();
  const hospitals = useHospitalOptions();
  const agents = useAgentOptions();
  const countryOptions = useMemo(() => {
    const codes = new Set([...(facets.data?.user_countries ?? []), ...(facets.data?.agent_countries ?? [])].map((c) => c.toUpperCase()));
    if (params.country) codes.add(params.country);
    return [...codes]
      .filter((c) => /^[A-Z]{2}$/.test(c))
      .map((c) => ({ value: c, label: countryName(c), description: c }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [facets.data, params.country]);

  // displayed range: the URL, else the server default (last 30 days)
  const range = params.from || params.to ? { from: values.from, to: values.to } : (ANALYTICS_PRESETS.find((p) => p.id === '30d')?.range() ?? { from: '', to: '' });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          className="mb-4"
          title={t('analytics.title')}
          description={t('analytics.description')}
          meta={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {timezoneLabel}
              </span>
              {meta && <span>{t('analytics.generatedAt', { date: formatDateTime(meta.generated_at) })}</span>}
            </span>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="size-3.5" aria-hidden />}
              loading={overview.isFetching}
              onClick={() => void qc.invalidateQueries({ queryKey: analyticsKeys.all })}
            >
              {t('analytics.refresh')}
            </Button>
          }
        />
        <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-border bg-surface/95 px-2 py-1 backdrop-blur">
          <FilterBar
            onReset={() =>
              set({ from: null, to: null, granularity: null, country: null, specialty: null, hospital: null, agent: null, channel: null })
            }
          >
            <DateRangeFilter
              label={t('analytics.filters.dates')}
              value={range}
              presets={ANALYTICS_PRESETS}
              onChange={(r) => set({ from: r.from || null, to: r.to || null })}
            />
            <SelectFilter
              label={t('analytics.filters.granularity')}
              icon={<Layers className="size-3.5 opacity-70" aria-hidden />}
              value={params.granularity ?? ''}
              onChange={(v) => set({ granularity: v || null })}
              options={GRANULARITIES.map((g) => ({ value: g, label: t(`analytics.filters.granularities.${g}`) }))}
            />
            <SelectFilter
              label={t('analytics.filters.country')}
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={params.country ?? ''}
              onChange={(v) => set({ country: v || null })}
              options={countryOptions}
              searchable
              loading={facets.isLoading}
            />
            <SelectFilter
              label={t('analytics.filters.specialty')}
              icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
              value={params.specialty_id ?? ''}
              onChange={(v) => set({ specialty: v || null })}
              options={specialties.data ?? []}
              searchable
              loading={specialties.isLoading}
            />
            <SelectFilter
              label={t('analytics.filters.hospital')}
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={params.hospital_id ?? ''}
              onChange={(v) => set({ hospital: v || null })}
              options={hospitals.data ?? []}
              searchable
              loading={hospitals.isLoading}
            />
            <SelectFilter
              label={t('analytics.filters.agent')}
              icon={<Briefcase className="size-3.5 opacity-70" aria-hidden />}
              value={params.agent_id ?? ''}
              onChange={(v) => set({ agent: v || null })}
              options={agents.data ?? []}
              searchable
              loading={agents.isLoading}
            />
            <SelectFilter
              label={t('analytics.filters.channel')}
              icon={<Megaphone className="size-3.5 opacity-70" aria-hidden />}
              value={params.channel ?? ''}
              onChange={(v) => set({ channel: v || null })}
              options={CHANNELS.map((c) => ({ value: c, label: t(`analytics.filters.channels.${c}`) }))}
            />
          </FilterBar>
        </div>
      </div>

      <OverviewSection params={params} />
      <QuoteSlaSection params={params} />
      {showFinance && (
        <FinanceSection params={params} currency={currency} onCurrencyChange={(c) => set({ currency: c === 'INR' ? null : c })} />
      )}
      <PatientsSection params={params} />
      <HospitalsSection params={params} />
      <AgentsSection params={params} />
      <AftercareSection params={params} />
      <IntroCallsSection params={params} hasDimensionFilter={hasDimensionFilter} />
      <AiUsageSection params={params} hasDimensionFilter={hasDimensionFilter} />
      <NotificationsSection params={params} hasDimensionFilter={hasDimensionFilter} />
    </div>
  );
}
