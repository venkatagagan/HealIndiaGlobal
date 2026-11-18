/**
 * Sections of the Analytics page. Each one runs its own query (own loading / error / empty state) against
 * /admin/analytics/<section> with the page filters, and offers CSV downloads of every table it shows.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import type { TFunction } from 'i18next';
import { Tabs } from '@hig/shared/ui';
import { useAppTranslation } from '../../../../i18n';
import { ColumnChart, GroupedColumnChart } from '../charts';
import { Field, Select } from '../../ui';
import { countryName } from '../../lib/lookups';
import { formatDate, formatMoney, formatNumber, SUPPORTED_CURRENCIES } from '../../lib/format';
import { opsPaths } from '../../lib/paths';
import {
  analyticsApi,
  FUNNEL_STEPS,
  type AftercarePoint,
  type AgentRow,
  type AiPoint,
  type AiPurposeRow,
  type AnalyticsMeta,
  type AnalyticsParams,
  type BreakdownRow,
  type CurrencyRow,
  type FinanceMonth,
  type FlagCount,
  type FunnelStep,
  type HospitalRow,
  type HospitalSla,
  type InstallmentCurrencyRow,
  type IntroPoint,
  type NotificationKindRow,
  type OverviewOut,
  type OverviewPoint,
} from '../../lib/analyticsApi';
import {
  AnalyticsFunnel,
  AnalyticsSection,
  bucketHeader,
  bucketLabel,
  ChartPanel,
  CountCell,
  countCsv,
  csvFilename,
  hoursText,
  moneyCsv,
  pct,
  pctCsv,
  TablePanel,
  Tile,
  TileGrid,
  useAnalyticsQuery,
  type ACol,
} from './kit';

const int = (v: number) => formatNumber(v);
const intTick = (v: number) => formatNumber(v, { notation: 'compact', maximumFractionDigits: 1 });
const sumOf = <R,>(rows: readonly R[], pick: (r: R) => number) => rows.reduce((n, r) => n + pick(r), 0);

function useNa() {
  const { t } = useAppTranslation();
  return { t, na: t('analytics.na') };
}

/** Footnote when a breakdown hides small cells. */
function suppressedFootnote(rows: readonly { suppressed: boolean }[], meta: AnalyticsMeta, t: TFunction) {
  return rows.some((r) => r.suppressed) ? t('analytics.suppressedNote', { min: meta.min_cell }) : undefined;
}

/** Note for sections the dimension filters do not reach (intro calls, AI usage, notifications). */
function ignoredNote(filtersApplied: boolean, hasDimensionFilter: boolean, t: TFunction) {
  return !filtersApplied && hasDimensionFilter ? t('analytics.filtersIgnored') : null;
}

// =========================================================================================================
// Overview: KPI tiles, trend, funnel
// =========================================================================================================
type TrendMetric = 'cases' | 'quotes_sent' | 'bookings';
const TREND_METRICS: readonly TrendMetric[] = ['cases', 'quotes_sent', 'bookings'];

export function OverviewSection({ params }: { params: AnalyticsParams }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('overview', params, analyticsApi.overview);
  return (
    <AnalyticsSection id="an-overview" title={t('analytics.overview.title')} description={t('analytics.overview.description')} query={q}>
      {(d) => (
        <div className="flex flex-col gap-4">
          <TileGrid className="xl:grid-cols-4">
            <Tile label={t('analytics.overview.kpis.cases')} value={int(d.kpis.cases)} />
            <Tile label={t('analytics.overview.kpis.quotesSent')} value={int(d.kpis.quotes_sent)} />
            <Tile label={t('analytics.overview.kpis.bookings')} value={int(d.kpis.bookings)} />
            <Tile
              label={t('analytics.overview.kpis.conversion')}
              value={pct(d.kpis.conversion_rate, na)}
              help={t('analytics.overview.kpis.conversionHelp')}
            />
            <Tile label={t('analytics.overview.kpis.completed')} value={int(d.kpis.completed)} />
            <Tile label={t('analytics.overview.kpis.reviews')} value={int(d.kpis.reviews)} />
            <Tile
              label={t('analytics.overview.kpis.registrations')}
              value={d.kpis.registrations === null ? na : int(d.kpis.registrations)}
              sub={d.kpis.registrations === null ? t('analytics.naHint') : undefined}
            />
            <Tile
              label={t('analytics.overview.kpis.medianQuote')}
              value={hoursText(d.kpis.median_first_quote_hours, t, na)}
              help={t('analytics.overview.kpis.medianQuoteHelp')}
            />
          </TileGrid>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <TrendPanel d={d} className="xl:col-span-3" />
            <FunnelPanel d={d} className="xl:col-span-2" />
          </div>
        </div>
      )}
    </AnalyticsSection>
  );
}

function TrendPanel({ d, className }: { d: OverviewOut; className?: string }) {
  const { t } = useNa();
  const [metric, setMetric] = useState<TrendMetric>('cases');
  const g = d.meta.granularity;
  const metricLabel = (m: TrendMetric) => t(`analytics.overview.trend.metrics.${m}`);
  const rows = d.series.map((p) => ({ bucket: p.bucket, value: p[metric] }));
  const total = sumOf(d.series, (p) => p[metric]);
  const columns: ACol<OverviewPoint>[] = [
    { key: 'bucket', header: bucketHeader(g, t), cell: (p) => bucketLabel(p.bucket, g, t, true), csv: (p) => p.bucket },
    ...TREND_METRICS.map<ACol<OverviewPoint>>((m) => ({ key: m, header: metricLabel(m), align: 'end', cell: (p) => int(p[m]), csv: (p) => p[m] })),
    {
      key: 'registrations',
      header: t('analytics.overview.kpis.registrations'),
      align: 'end',
      cell: (p) => <CountCell value={p.registrations} meta={d.meta} />,
      csv: (p) => countCsv(p.registrations, false, d.meta, t),
    },
  ];
  return (
    <ChartPanel
      className={className}
      title={t('analytics.overview.trend.title')}
      description={t('analytics.overview.trend.description', { metric: metricLabel(metric), total: int(total) })}
      summary={t('analytics.chartSummary', {
        title: metricLabel(metric),
        total: int(total),
        from: formatDate(d.meta.date_from),
        to: formatDate(d.meta.date_to),
      })}
      controls={
        <Tabs
          variant="pills"
          aria-label={t('analytics.overview.trend.metricLabel')}
          idPrefix="an-trend"
          value={metric}
          onChange={setMetric}
          tabs={TREND_METRICS.map((m) => ({ value: m, label: metricLabel(m) }))}
        />
      }
      empty={d.series.length === 0}
      chart={
        <ColumnChart
          data={rows}
          xKey="bucket"
          yKey="value"
          name={metricLabel(metric)}
          integer
          formatTick={intTick}
          formatValue={int}
          formatX={(b) => bucketLabel(b, g, t)}
          formatLabel={(b) => bucketLabel(b, g, t, true)}
        />
      }
      columns={columns}
      rows={d.series}
      rowKey={(p) => p.bucket}
      filename={csvFilename('trend', d.meta)}
    />
  );
}

function FunnelPanel({ d, className }: { d: OverviewOut; className?: string }) {
  const { t, na } = useNa();
  const stepLabel = (s: string) =>
    (FUNNEL_STEPS as readonly string[]).includes(s) ? t(`analytics.funnel.steps.${s}`) : s;
  const columns: ACol<FunnelStep>[] = [
    { key: 'step', header: t('analytics.funnel.columns.step'), cell: (s) => stepLabel(s.step), csv: (s) => stepLabel(s.step) },
    {
      key: 'count',
      header: t('analytics.funnel.columns.count'),
      align: 'end',
      cell: (s) => <CountCell value={s.count} meta={d.meta} />,
      csv: (s) => countCsv(s.count, false, d.meta, t),
    },
    {
      key: 'prev',
      header: t('analytics.funnel.columns.fromPrevious'),
      align: 'end',
      cell: (s) => pct(s.rate_from_previous, na),
      csv: (s) => pctCsv(s.rate_from_previous, na),
    },
    {
      key: 'first',
      header: t('analytics.funnel.columns.fromFirst'),
      align: 'end',
      cell: (s) => pct(s.rate_from_first, na),
      csv: (s) => pctCsv(s.rate_from_first, na),
    },
  ];
  const firstKnown = d.funnel.find((s) => s.count !== null);
  const last = d.funnel[d.funnel.length - 1];
  return (
    <ChartPanel
      className={className}
      title={t('analytics.funnel.title')}
      description={t('analytics.funnel.description')}
      summary={t('analytics.funnel.summary', {
        first: firstKnown ? stepLabel(firstKnown.step) : na,
        firstCount: firstKnown?.count != null ? int(firstKnown.count) : na,
        last: last ? stepLabel(last.step) : na,
        lastCount: last?.count != null ? int(last.count) : na,
      })}
      empty={d.funnel.length === 0}
      chart={
        <AnalyticsFunnel
          stages={d.funnel.map((s) => ({ key: s.step, label: stepLabel(s.step), count: s.count, rateFromPrevious: s.rate_from_previous }))}
        />
      }
      columns={columns}
      rows={d.funnel}
      rowKey={(s) => s.step}
      filename={csvFilename('funnel', d.meta)}
    />
  );
}

// =========================================================================================================
// Quote SLA
// =========================================================================================================
export function QuoteSlaSection({ params }: { params: AnalyticsParams }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('quote-sla', params, analyticsApi.quoteSla);
  return (
    <AnalyticsSection
      id="an-sla"
      title={t('analytics.sla.title')}
      description={q.data ? t('analytics.sla.description', { hours: formatNumber(q.data.sla_hours) }) : undefined}
      query={q}
    >
      {(d) => {
        const h = formatNumber(d.sla_hours);
        const columns: ACol<HospitalSla>[] = [
          {
            key: 'hospital',
            header: t('analytics.sla.columns.hospital'),
            cell: (r) => (
              <Link to={opsPaths.hospital(r.hospital_id)} className="font-medium hover:underline">
                {r.hospital_name}
              </Link>
            ),
            csv: (r) => r.hospital_name,
          },
          { key: 'cases', header: t('analytics.sla.columns.enquiries'), align: 'end', cell: (r) => int(r.cases), csv: (r) => r.cases },
          { key: 'quoted', header: t('analytics.sla.columns.quoted'), align: 'end', cell: (r) => int(r.quoted), csv: (r) => r.quoted },
          { key: 'median', header: t('analytics.sla.columns.median'), align: 'end', cell: (r) => hoursText(r.median_hours, t, na), csv: (r) => r.median_hours ?? na },
          { key: 'p90', header: t('analytics.sla.columns.p90'), align: 'end', cell: (r) => hoursText(r.p90_hours, t, na), csv: (r) => r.p90_hours ?? na },
          { key: 'w24', header: t('analytics.sla.columns.within24'), align: 'end', cell: (r) => pct(r.within_24h_pct, na), csv: (r) => pctCsv(r.within_24h_pct, na) },
          { key: 'w48', header: t('analytics.sla.columns.within48'), align: 'end', cell: (r) => pct(r.within_48h_pct, na), csv: (r) => pctCsv(r.within_48h_pct, na) },
          {
            key: 'wsla',
            header: t('analytics.sla.columns.withinSla', { hours: h }),
            align: 'end',
            cell: (r) => pct(r.within_sla_pct, na),
            csv: (r) => pctCsv(r.within_sla_pct, na),
          },
          {
            key: 'overdue',
            header: t('analytics.sla.columns.overdue'),
            align: 'end',
            cell: (r) => <span className={r.overdue_now > 0 ? 'font-semibold text-warning-ink' : undefined}>{int(r.overdue_now)}</span>,
            csv: (r) => r.overdue_now,
          },
        ];
        return (
          <div className="flex flex-col gap-4">
            <TileGrid>
              <Tile label={t('analytics.sla.median')} value={hoursText(d.totals.median_hours, t, na)} sub={t('analytics.sla.quotedOf', { quoted: int(d.totals.quoted), cases: int(d.totals.cases) })} />
              <Tile label={t('analytics.sla.p90')} value={hoursText(d.totals.p90_hours, t, na)} help={t('analytics.sla.p90Help')} />
              <Tile label={t('analytics.sla.within24')} value={pct(d.totals.within_24h_pct, na)} />
              <Tile label={t('analytics.sla.within48')} value={pct(d.totals.within_48h_pct, na)} />
              <Tile label={t('analytics.sla.withinSla', { hours: h })} value={pct(d.totals.within_sla_pct, na)} />
              <Tile
                label={t('analytics.sla.overdueNow')}
                value={int(d.overdue_now)}
                help={t('analytics.sla.overdueHelp')}
                tone={d.overdue_now > 0 ? 'warning' : 'default'}
              />
            </TileGrid>
            <TablePanel
              title={t('analytics.sla.byHospital')}
              columns={columns}
              rows={d.by_hospital}
              rowKey={(r) => r.hospital_id}
              filename={csvFilename('quote-sla', d.meta)}
            />
          </div>
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Finance (admin | finance | super_admin only - never rendered for support)
// =========================================================================================================
export const REPORTING_CURRENCIES: readonly string[] = ['INR', ...SUPPORTED_CURRENCIES.filter((c) => c !== 'INR')];

export function FinanceSection({
  params,
  currency,
  onCurrencyChange,
}: {
  params: AnalyticsParams;
  currency: string;
  onCurrencyChange: (currency: string) => void;
}) {
  const { t } = useNa();
  const q = useAnalyticsQuery('finance', { ...params, currency }, analyticsApi.finance);
  return (
    <AnalyticsSection
      id="an-finance"
      title={t('analytics.finance.title')}
      description={t('analytics.finance.description')}
      query={q}
      actions={
        <Field label={t('analytics.finance.currency')} className="w-44">
          {(id) => (
            <Select
              id={id}
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              options={REPORTING_CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          )}
        </Field>
      }
      note={(d) =>
        d.fx
          ? d.fx.as_of
            ? t('analytics.finance.fx', {
                currency: d.fx.currency,
                rate: formatNumber(Number(d.fx.rate_inr_per_unit), { maximumFractionDigits: 4 }),
                date: formatDate(d.fx.as_of),
              })
            : t('analytics.finance.fxNoDate', {
                currency: d.fx.currency,
                rate: formatNumber(Number(d.fx.rate_inr_per_unit), { maximumFractionDigits: 4 }),
              })
          : t('analytics.finance.baseCurrency')
      }
    >
      {(d) => {
        const ccy = d.reporting_currency;
        const money = (minor: number) => formatMoney(minor, ccy, undefined, { compact: true });
        const full = (minor: number) => formatMoney(minor, ccy);
        const withCcy = (label: string) => t('analytics.finance.inCurrency', { label, currency: ccy });
        const monthColumns: ACol<FinanceMonth>[] = [
          { key: 'month', header: t('analytics.finance.columns.month'), cell: (m) => bucketLabel(m.month, 'month', t, true), csv: (m) => m.month },
          { key: 'gmv', header: t('analytics.finance.totals.gmv'), csvHeader: withCcy(t('analytics.finance.totals.gmv')), align: 'end', cell: (m) => full(m.gmv_minor), csv: (m) => moneyCsv(m.gmv_minor, ccy) },
          { key: 'refunds', header: t('analytics.finance.totals.refunds'), csvHeader: withCcy(t('analytics.finance.totals.refunds')), align: 'end', cell: (m) => full(m.refunds_minor), csv: (m) => moneyCsv(m.refunds_minor, ccy) },
          { key: 'commission', header: t('analytics.finance.totals.commission'), csvHeader: withCcy(t('analytics.finance.totals.commission')), align: 'end', cell: (m) => full(m.commission_minor), csv: (m) => moneyCsv(m.commission_minor, ccy) },
          { key: 'fee', header: t('analytics.finance.totals.serviceFee'), csvHeader: withCcy(t('analytics.finance.totals.serviceFee')), align: 'end', cell: (m) => full(m.service_fee_minor), csv: (m) => moneyCsv(m.service_fee_minor, ccy) },
        ];
        const currencyColumns: ACol<CurrencyRow>[] = [
          { key: 'currency', header: t('analytics.finance.columns.currency'), cell: (r) => <span className="font-mono">{r.currency}</span>, csv: (r) => r.currency },
          { key: 'payments', header: t('analytics.finance.columns.payments'), align: 'end', cell: (r) => int(r.payments), csv: (r) => r.payments },
          { key: 'amount', header: t('analytics.finance.columns.amount'), align: 'end', cell: (r) => formatMoney(r.amount_minor, r.currency), csv: (r) => moneyCsv(r.amount_minor, r.currency) },
          { key: 'base', header: t('analytics.finance.columns.base'), align: 'end', cell: (r) => formatMoney(r.base_amount_minor, d.base_currency), csv: (r) => moneyCsv(r.base_amount_minor, d.base_currency) },
          {
            key: 'reporting',
            header: t('analytics.finance.columns.reporting', { currency: ccy }),
            align: 'end',
            cell: (r) => full(r.reporting_amount_minor),
            csv: (r) => moneyCsv(r.reporting_amount_minor, ccy),
          },
        ];
        const inst = d.outstanding_installments;
        const instColumns: ACol<InstallmentCurrencyRow>[] = [
          { key: 'currency', header: t('analytics.finance.columns.currency'), cell: (r) => <span className="font-mono">{r.currency}</span>, csv: (r) => r.currency },
          { key: 'count', header: t('analytics.finance.installments.count'), align: 'end', cell: (r) => int(r.count), csv: (r) => r.count },
          { key: 'overdue', header: t('analytics.finance.installments.overdue'), align: 'end', cell: (r) => int(r.overdue_count), csv: (r) => r.overdue_count },
          { key: 'amount', header: t('analytics.finance.columns.amount'), align: 'end', cell: (r) => formatMoney(r.amount_minor, r.currency), csv: (r) => moneyCsv(r.amount_minor, r.currency) },
        ];
        const tot = d.totals;
        const gmvTotal = sumOf(d.by_month, (m) => m.gmv_minor);
        const commissionTotal = sumOf(d.by_month, (m) => m.commission_minor);
        return (
          <div className="flex flex-col gap-4">
            <TileGrid>
              <Tile
                label={t('analytics.finance.totals.gmv')}
                value={money(tot.gmv_minor)}
                title={full(tot.gmv_minor)}
                sub={t('analytics.finance.payments', { count: tot.payments, value: int(tot.payments) })}
                help={t('analytics.finance.gmvHelp')}
              />
              <Tile label={t('analytics.finance.totals.refunds')} value={money(tot.refunds_minor)} title={full(tot.refunds_minor)} />
              <Tile label={t('analytics.finance.totals.netGmv')} value={money(tot.net_gmv_minor)} title={full(tot.net_gmv_minor)} />
              <Tile label={t('analytics.finance.totals.commission')} value={money(tot.commission_minor)} title={full(tot.commission_minor)} />
              <Tile label={t('analytics.finance.totals.serviceFee')} value={money(tot.service_fee_minor)} title={full(tot.service_fee_minor)} />
              <Tile
                label={t('analytics.finance.totals.revenue')}
                value={money(tot.revenue_minor)}
                title={full(tot.revenue_minor)}
                help={t('analytics.finance.revenueHelp')}
              />
            </TileGrid>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <ChartPanel
                className="xl:col-span-3"
                title={t('analytics.finance.byMonth')}
                description={t('analytics.finance.byMonthDescription', { currency: ccy })}
                summary={t('analytics.finance.byMonthSummary', { gmv: full(gmvTotal), commission: full(commissionTotal), months: int(d.by_month.length) })}
                empty={d.by_month.length === 0}
                chart={
                  <GroupedColumnChart
                    data={d.by_month}
                    xKey="month"
                    series={[
                      { key: 'gmv_minor', name: t('analytics.finance.totals.gmv') },
                      { key: 'commission_minor', name: t('analytics.finance.totals.commission') },
                    ]}
                    formatTick={money}
                    formatValue={full}
                    formatX={(m) => bucketLabel(m, 'month', t)}
                    formatLabel={(m) => bucketLabel(m, 'month', t, true)}
                  />
                }
                columns={monthColumns}
                rows={d.by_month}
                rowKey={(m) => m.month}
                filename={csvFilename('finance-by-month', d.meta)}
              />
              <TablePanel
                className="xl:col-span-2"
                title={t('analytics.finance.byCurrency')}
                description={t('analytics.finance.byCurrencyDescription')}
                columns={currencyColumns}
                rows={d.by_currency}
                rowKey={(r) => r.currency}
                filename={csvFilename('finance-by-currency', d.meta)}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">{t('analytics.finance.installments.title')}</h3>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <div className="grid grid-cols-2 gap-3 xl:col-span-3">
                  <Tile label={t('analytics.finance.installments.count')} value={int(inst.count)} />
                  <Tile
                    label={t('analytics.finance.installments.overdue')}
                    value={int(inst.overdue_count)}
                    tone={inst.overdue_count > 0 ? 'warning' : 'default'}
                  />
                  <Tile label={t('analytics.finance.installments.amount')} value={money(inst.amount_minor)} title={full(inst.amount_minor)} />
                  <Tile
                    label={t('analytics.finance.installments.pastTreatment')}
                    value={int(inst.past_treatment_count)}
                    tone={inst.past_treatment_count > 0 ? 'danger' : 'success'}
                    sub={inst.past_treatment_count > 0 ? t('analytics.finance.installments.pastTreatmentWarning') : t('analytics.finance.installments.pastTreatmentOk')}
                    help={t('analytics.finance.installments.pastTreatmentHelp')}
                  />
                </div>
                <TablePanel
                  className="xl:col-span-2"
                  title={t('analytics.finance.installments.byCurrency')}
                  columns={instColumns}
                  rows={inst.by_currency}
                  rowKey={(r) => r.currency}
                  filename={csvFilename('installments', d.meta)}
                />
              </div>
            </div>
          </div>
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Patients (breakdowns with small-cell suppression)
// =========================================================================================================
export function PatientsSection({ params }: { params: AnalyticsParams }) {
  const { t } = useNa();
  const q = useAnalyticsQuery('patients', params, analyticsApi.patients);
  return (
    <AnalyticsSection
      id="an-patients"
      title={t('analytics.patients.title')}
      description={t('analytics.patients.description')}
      query={q}
      isEmpty={(d) => d.by_country.length + d.by_specialty.length + d.by_procedure.length === 0}
    >
      {(d) => {
        const columns = (first: string, label: (r: BreakdownRow) => string): ACol<BreakdownRow>[] => [
          { key: 'label', header: first, cell: (r) => label(r), csv: (r) => label(r) },
          ...(['patients', 'cases', 'bookings'] as const).map<ACol<BreakdownRow>>((k) => ({
            key: k,
            header: t(`analytics.patients.columns.${k}`),
            align: 'end',
            cell: (r) => <CountCell value={r[k]} suppressed={r.suppressed} meta={d.meta} />,
            csv: (r) => countCsv(r[k], r.suppressed, d.meta, t),
          })),
        ];
        const countryLabel = (r: BreakdownRow) => (/^[A-Z]{2}$/.test(r.key) ? countryName(r.key) : r.label) || r.label;
        const plain = (r: BreakdownRow) => r.label;
        const tables = [
          { id: 'country', title: t('analytics.patients.byCountry'), rows: d.by_country, cols: columns(t('analytics.patients.columns.country'), countryLabel) },
          { id: 'specialty', title: t('analytics.patients.bySpecialty'), rows: d.by_specialty, cols: columns(t('analytics.patients.columns.specialty'), plain) },
          { id: 'procedure', title: t('analytics.patients.byProcedure'), rows: d.by_procedure, cols: columns(t('analytics.patients.columns.procedure'), plain) },
        ];
        return (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {tables.map((tb) => (
              <TablePanel
                key={tb.id}
                title={tb.title}
                columns={tb.cols}
                rows={tb.rows}
                rowKey={(r) => r.key}
                filename={csvFilename(`patients-by-${tb.id}`, d.meta)}
                footnote={suppressedFootnote(tb.rows, d.meta, t)}
                maxHeight={360}
              />
            ))}
          </div>
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Top hospitals
// =========================================================================================================
export function HospitalsSection({ params }: { params: AnalyticsParams }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('hospitals', params, analyticsApi.hospitals);
  return (
    <AnalyticsSection
      id="an-hospitals"
      title={t('analytics.hospitals.title')}
      description={t('analytics.hospitals.description')}
      query={q}
      isEmpty={(d) => d.rows.length === 0}
    >
      {(d) => {
        const rating = (v: number | null) => (v === null ? na : formatNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
        const columns: ACol<HospitalRow>[] = [
          {
            key: 'hospital',
            header: t('analytics.hospitals.columns.hospital'),
            cell: (r) => (
              <span className="block">
                <Link to={opsPaths.hospital(r.hospital_id)} className="font-medium hover:underline">
                  {r.name}
                </Link>
                {r.city && <span className="block text-xs text-muted">{r.city}</span>}
              </span>
            ),
            csv: (r) => (r.city ? `${r.name}, ${r.city}` : r.name),
          },
          { key: 'enquiries', header: t('analytics.hospitals.columns.enquiries'), align: 'end', cell: (r) => int(r.enquiries), csv: (r) => r.enquiries },
          { key: 'quoted', header: t('analytics.hospitals.columns.quoted'), align: 'end', cell: (r) => int(r.quoted), csv: (r) => r.quoted },
          { key: 'bookings', header: t('analytics.hospitals.columns.bookings'), align: 'end', cell: (r) => int(r.bookings), csv: (r) => r.bookings },
          { key: 'completed', header: t('analytics.hospitals.columns.completed'), align: 'end', cell: (r) => int(r.completed), csv: (r) => r.completed },
          { key: 'conversion', header: t('analytics.hospitals.columns.conversion'), align: 'end', cell: (r) => pct(r.conversion_rate, na), csv: (r) => pctCsv(r.conversion_rate, na) },
          {
            key: 'median',
            header: t('analytics.hospitals.columns.medianQuote'),
            align: 'end',
            cell: (r) => hoursText(r.median_first_quote_hours, t, na),
            csv: (r) => r.median_first_quote_hours ?? na,
          },
          {
            key: 'sla',
            header: t('analytics.hospitals.columns.withinSla', { hours: formatNumber(d.sla_hours) }),
            align: 'end',
            cell: (r) => pct(r.within_sla_pct, na),
            csv: (r) => pctCsv(r.within_sla_pct, na),
          },
          { key: 'rating', header: t('analytics.hospitals.columns.rating'), align: 'end', cell: (r) => rating(r.rating_avg), csv: (r) => r.rating_avg ?? na },
          { key: 'ratingCount', header: t('analytics.hospitals.columns.ratingCount'), align: 'end', cell: (r) => int(r.rating_count), csv: (r) => r.rating_count },
          { key: 'reviews', header: t('analytics.hospitals.columns.newReviews'), align: 'end', cell: (r) => int(r.reviews_in_period), csv: (r) => r.reviews_in_period },
          {
            key: 'reviewsAvg',
            header: t('analytics.hospitals.columns.newReviewsRating'),
            align: 'end',
            cell: (r) => rating(r.avg_rating_in_period),
            csv: (r) => r.avg_rating_in_period ?? na,
          },
        ];
        return (
          <TablePanel
            title={t('analytics.hospitals.tableTitle')}
            columns={columns}
            rows={d.rows}
            rowKey={(r) => r.hospital_id}
            filename={csvFilename('hospitals', d.meta)}
          />
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Agents
// =========================================================================================================
export function AgentsSection({ params }: { params: AnalyticsParams }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('agents', params, analyticsApi.agents);
  return (
    <AnalyticsSection
      id="an-agents"
      title={t('analytics.agents.title')}
      description={t('analytics.agents.description')}
      query={q}
      isEmpty={(d) => d.rows.length === 0}
    >
      {(d) => {
        const columns: ACol<AgentRow>[] = [
          {
            key: 'agent',
            header: t('analytics.agents.columns.agent'),
            cell: (r) => (
              <span className="block">
                <span className="font-medium">{r.agency_name}</span>
                <span className="block font-mono text-xs text-muted">{r.agent_code}</span>
              </span>
            ),
            csv: (r) => `${r.agency_name} (${r.agent_code})`,
          },
          { key: 'country', header: t('analytics.agents.columns.country'), cell: (r) => (r.country ? countryName(r.country) : '—'), csv: (r) => r.country ?? '' },
          ...(['leads', 'patients', 'cases', 'bookings', 'completed'] as const).map<ACol<AgentRow>>((k) => ({
            key: k,
            header: t(`analytics.agents.columns.${k}`),
            align: 'end',
            cell: (r) => int(r[k]),
            csv: (r) => r[k],
          })),
          { key: 'conversion', header: t('analytics.agents.columns.conversion'), align: 'end', cell: (r) => pct(r.conversion_rate, na), csv: (r) => pctCsv(r.conversion_rate, na) },
          ...(d.commission_visible
            ? [
                {
                  key: 'commission',
                  header: t('analytics.agents.columns.commission'),
                  csvHeader: t('analytics.finance.inCurrency', { label: t('analytics.agents.columns.commission'), currency: d.currency }),
                  align: 'end',
                  cell: (r) => (r.commission_minor === null ? na : formatMoney(r.commission_minor, d.currency)),
                  csv: (r) => (r.commission_minor === null ? na : moneyCsv(r.commission_minor, d.currency)),
                } satisfies ACol<AgentRow>,
              ]
            : []),
        ];
        return (
          <TablePanel
            title={t('analytics.agents.tableTitle')}
            columns={columns}
            rows={d.rows}
            rowKey={(r) => r.agent_id}
            filename={csvFilename('agents', d.meta)}
            footnote={d.commission_visible ? undefined : t('analytics.agents.commissionHidden')}
          />
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Aftercare
// =========================================================================================================
const RED_FLAGS = ['fever', 'breathlessness', 'severe_pain', 'wound_concerns'] as const;

export function AftercareSection({ params }: { params: AnalyticsParams }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('aftercare', params, analyticsApi.aftercare);
  return (
    <AnalyticsSection id="an-aftercare" title={t('analytics.aftercare.title')} description={t('analytics.aftercare.description')} query={q}>
      {(d) => {
        const g = d.meta.granularity;
        const flagLabel = (f: string) => ((RED_FLAGS as readonly string[]).includes(f) ? t(`analytics.aftercare.flags.${f}`) : f);
        const flagColumns: ACol<FlagCount>[] = [
          { key: 'flag', header: t('analytics.aftercare.columns.flag'), cell: (r) => flagLabel(r.flag), csv: (r) => flagLabel(r.flag) },
          {
            key: 'count',
            header: t('analytics.aftercare.columns.checkins'),
            align: 'end',
            cell: (r) => <CountCell value={r.count} suppressed={r.suppressed} meta={d.meta} />,
            csv: (r) => countCsv(r.count, r.suppressed, d.meta, t),
          },
        ];
        const seriesColumns: ACol<AftercarePoint>[] = [
          { key: 'bucket', header: bucketHeader(g, t), cell: (p) => bucketLabel(p.bucket, g, t, true), csv: (p) => p.bucket },
          { key: 'due', header: t('analytics.aftercare.due'), align: 'end', cell: (p) => int(p.due), csv: (p) => p.due },
          { key: 'submitted', header: t('analytics.aftercare.submitted'), align: 'end', cell: (p) => int(p.submitted), csv: (p) => p.submitted },
          { key: 'red', header: t('analytics.aftercare.redFlagCheckins'), align: 'end', cell: (p) => int(p.red_flags), csv: (p) => p.red_flags },
        ];
        return (
          <div className="flex flex-col gap-4">
            <TileGrid className="xl:grid-cols-5">
              <Tile label={t('analytics.aftercare.due')} value={int(d.due)} />
              <Tile label={t('analytics.aftercare.submitted')} value={int(d.submitted)} />
              <Tile label={t('analytics.aftercare.completion')} value={pct(d.completion_rate, na)} />
              <Tile label={t('analytics.aftercare.overdue')} value={int(d.overdue)} tone={d.overdue > 0 ? 'warning' : 'default'} />
              <Tile
                label={t('analytics.aftercare.redFlagCheckins')}
                value={int(d.red_flag_checkins)}
                help={t('analytics.aftercare.redFlagHelp')}
                tone={d.red_flag_checkins > 0 ? 'warning' : 'default'}
              />
            </TileGrid>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <ChartPanel
                className="xl:col-span-3"
                title={t('analytics.aftercare.seriesTitle')}
                summary={t('analytics.aftercare.seriesSummary', { due: int(d.due), submitted: int(d.submitted) })}
                empty={d.series.length === 0}
                chart={
                  <GroupedColumnChart
                    data={d.series}
                    xKey="bucket"
                    integer
                    series={[
                      { key: 'due', name: t('analytics.aftercare.due') },
                      { key: 'submitted', name: t('analytics.aftercare.submitted') },
                    ]}
                    formatTick={intTick}
                    formatValue={int}
                    formatX={(b) => bucketLabel(b, g, t)}
                    formatLabel={(b) => bucketLabel(b, g, t, true)}
                  />
                }
                columns={seriesColumns}
                rows={d.series}
                rowKey={(p) => p.bucket}
                filename={csvFilename('aftercare', d.meta)}
              />
              <TablePanel
                className="xl:col-span-2"
                title={t('analytics.aftercare.redFlags')}
                columns={flagColumns}
                rows={d.red_flags_by_kind}
                rowKey={(r) => r.flag}
                filename={csvFilename('aftercare-red-flags', d.meta)}
                footnote={suppressedFootnote(d.red_flags_by_kind, d.meta, t)}
                emptyText={t('analytics.aftercare.noRedFlags')}
              />
            </div>
          </div>
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Free intro calls (only the dates apply)
// =========================================================================================================
export function IntroCallsSection({ params, hasDimensionFilter }: { params: AnalyticsParams; hasDimensionFilter: boolean }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('intro-calls', params, analyticsApi.introCalls);
  return (
    <AnalyticsSection
      id="an-intro"
      title={t('analytics.intro.title')}
      description={t('analytics.intro.description')}
      query={q}
      note={(d) => ignoredNote(d.filters_applied, hasDimensionFilter, t)}
    >
      {(d) => {
        const g = d.meta.granularity;
        const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
        const stages = [
          { key: 'requested', label: t('analytics.intro.requested'), count: d.requested, rateFromPrevious: null },
          { key: 'scheduled', label: t('analytics.intro.scheduled'), count: d.scheduled, rateFromPrevious: ratio(d.scheduled, d.requested) },
          { key: 'completed', label: t('analytics.intro.completed'), count: d.completed, rateFromPrevious: ratio(d.completed, d.scheduled) },
          { key: 'converted', label: t('analytics.intro.converted'), count: d.converted, rateFromPrevious: ratio(d.converted, d.completed) },
        ];
        const stageColumns: ACol<(typeof stages)[number]>[] = [
          { key: 'step', header: t('analytics.funnel.columns.step'), cell: (s) => s.label, csv: (s) => s.label },
          { key: 'count', header: t('analytics.funnel.columns.count'), align: 'end', cell: (s) => int(s.count), csv: (s) => s.count },
          { key: 'prev', header: t('analytics.funnel.columns.fromPrevious'), align: 'end', cell: (s) => pct(s.rateFromPrevious, na), csv: (s) => pctCsv(s.rateFromPrevious, na) },
        ];
        const seriesColumns: ACol<IntroPoint>[] = [
          { key: 'bucket', header: bucketHeader(g, t), cell: (p) => bucketLabel(p.bucket, g, t, true), csv: (p) => p.bucket },
          { key: 'requested', header: t('analytics.intro.requested'), align: 'end', cell: (p) => int(p.requested), csv: (p) => p.requested },
          { key: 'completed', header: t('analytics.intro.completed'), align: 'end', cell: (p) => int(p.completed), csv: (p) => p.completed },
        ];
        return (
          <div className="flex flex-col gap-4">
            <TileGrid>
              <Tile label={t('analytics.intro.requested')} value={int(d.requested)} />
              <Tile label={t('analytics.intro.scheduled')} value={int(d.scheduled)} />
              <Tile label={t('analytics.intro.completed')} value={int(d.completed)} />
              <Tile label={t('analytics.intro.cancelled')} value={int(d.cancelled)} />
              <Tile label={t('analytics.intro.converted')} value={int(d.converted)} help={t('analytics.intro.convertedHelp')} />
              <Tile label={t('analytics.intro.conversion')} value={pct(d.conversion_rate, na)} />
            </TileGrid>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <ChartPanel
                className="xl:col-span-2"
                title={t('analytics.intro.stepsTitle')}
                description={t('analytics.funnel.eventsHint')}
                summary={t('analytics.intro.stepsSummary', {
                  requested: int(d.requested),
                  scheduled: int(d.scheduled),
                  completed: int(d.completed),
                  converted: int(d.converted),
                })}
                chart={<AnalyticsFunnel stages={stages} />}
                columns={stageColumns}
                rows={stages}
                rowKey={(s) => s.key}
                filename={csvFilename('intro-calls-steps', d.meta)}
              />
              <ChartPanel
                className="xl:col-span-3"
                title={t('analytics.intro.seriesTitle')}
                summary={t('analytics.intro.seriesSummary', { requested: int(d.requested), completed: int(d.completed) })}
                empty={d.series.length === 0}
                chart={
                  <GroupedColumnChart
                    data={d.series}
                    xKey="bucket"
                    integer
                    series={[
                      { key: 'requested', name: t('analytics.intro.requested') },
                      { key: 'completed', name: t('analytics.intro.completed') },
                    ]}
                    formatTick={intTick}
                    formatValue={int}
                    formatX={(b) => bucketLabel(b, g, t)}
                    formatLabel={(b) => bucketLabel(b, g, t, true)}
                  />
                }
                columns={seriesColumns}
                rows={d.series}
                rowKey={(p) => p.bucket}
                filename={csvFilename('intro-calls', d.meta)}
              />
            </div>
          </div>
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// AI usage vs quotas (only the dates apply)
// =========================================================================================================
const humanize = (code: string) => code.replace(/[_.-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function AiUsageSection({ params, hasDimensionFilter }: { params: AnalyticsParams; hasDimensionFilter: boolean }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('ai-usage', params, analyticsApi.aiUsage);
  return (
    <AnalyticsSection
      id="an-ai"
      title={t('analytics.ai.title')}
      description={t('analytics.ai.description')}
      query={q}
      note={(d) => ignoredNote(d.filters_applied, hasDimensionFilter, t)}
    >
      {(d) => {
        const g = d.meta.granularity;
        const peak = d.peak_day;
        const peakTone = peak?.pct_of_limit == null ? 'default' : peak.pct_of_limit >= 1 ? 'danger' : peak.pct_of_limit >= 0.8 ? 'warning' : 'default';
        const limits = Object.entries(d.user_daily_limits);
        const purposeColumns: ACol<AiPurposeRow>[] = [
          { key: 'purpose', header: t('analytics.ai.columns.purpose'), cell: (r) => humanize(r.purpose), csv: (r) => r.purpose },
          ...(['requests', 'errors', 'refusals', 'fallbacks'] as const).map<ACol<AiPurposeRow>>((k) => ({
            key: k,
            header: t(`analytics.ai.columns.${k}`),
            align: 'end',
            cell: (r) => int(r[k]),
            csv: (r) => r[k],
          })),
          {
            key: 'latency',
            header: t('analytics.ai.columns.latency'),
            align: 'end',
            cell: (r) => (r.avg_latency_ms === null ? na : t('analytics.ms', { value: formatNumber(Math.round(r.avg_latency_ms)) })),
            csv: (r) => (r.avg_latency_ms === null ? na : Math.round(r.avg_latency_ms)),
          },
          { key: 'in', header: t('analytics.ai.columns.inputTokens'), align: 'end', cell: (r) => int(r.input_tokens), csv: (r) => r.input_tokens },
          { key: 'out', header: t('analytics.ai.columns.outputTokens'), align: 'end', cell: (r) => int(r.output_tokens), csv: (r) => r.output_tokens },
        ];
        const seriesColumns: ACol<AiPoint>[] = [
          { key: 'bucket', header: bucketHeader(g, t), cell: (p) => bucketLabel(p.bucket, g, t, true), csv: (p) => p.bucket },
          { key: 'requests', header: t('analytics.ai.requests'), align: 'end', cell: (p) => int(p.requests), csv: (p) => p.requests },
        ];
        return (
          <div className="flex flex-col gap-4">
            <TileGrid className="xl:grid-cols-5">
              <Tile label={t('analytics.ai.requests')} value={int(d.requests)} />
              <Tile
                label={t('analytics.ai.errors')}
                value={int(d.errors)}
                sub={d.requests > 0 ? t('analytics.ai.errorRate', { value: pct(d.errors / d.requests, na) }) : undefined}
                tone={d.errors > 0 ? 'warning' : 'default'}
              />
              <Tile label={t('analytics.ai.guestScans')} value={int(d.guest_scans)} />
              <Tile
                label={t('analytics.ai.peak')}
                value={peak ? int(peak.requests) : na}
                sub={
                  peak
                    ? t('analytics.ai.peakSub', {
                        date: formatDate(peak.day),
                        value: pct(peak.pct_of_limit, na),
                        limit: int(d.global_daily_limit),
                      })
                    : undefined
                }
                tone={peakTone}
                help={t('analytics.ai.peakHelp')}
              />
              <Tile
                label={t('analytics.ai.globalLimit')}
                value={int(d.global_daily_limit)}
                sub={
                  limits.length > 0
                    ? t('analytics.ai.userLimits', {
                        list: limits.map(([who, n]) => `${humanize(who)} ${formatNumber(n)}`).join(' · '),
                      })
                    : undefined
                }
              />
            </TileGrid>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <ChartPanel
                className="xl:col-span-2"
                title={t('analytics.ai.seriesTitle')}
                summary={t('analytics.chartSummary', {
                  title: t('analytics.ai.requests'),
                  total: int(d.requests),
                  from: formatDate(d.meta.date_from),
                  to: formatDate(d.meta.date_to),
                })}
                empty={d.series.length === 0}
                chart={
                  <ColumnChart
                    data={d.series}
                    xKey="bucket"
                    yKey="requests"
                    name={t('analytics.ai.requests')}
                    integer
                    formatTick={intTick}
                    formatValue={int}
                    formatX={(b) => bucketLabel(b, g, t)}
                    formatLabel={(b) => bucketLabel(b, g, t, true)}
                  />
                }
                columns={seriesColumns}
                rows={d.series}
                rowKey={(p) => p.bucket}
                filename={csvFilename('ai-usage', d.meta)}
              />
              <TablePanel
                className="xl:col-span-3"
                title={t('analytics.ai.byPurpose')}
                columns={purposeColumns}
                rows={d.by_purpose}
                rowKey={(r) => r.purpose}
                filename={csvFilename('ai-usage-by-purpose', d.meta)}
              />
            </div>
          </div>
        );
      }}
    </AnalyticsSection>
  );
}

// =========================================================================================================
// Notification delivery (only the dates apply)
// =========================================================================================================
export function NotificationsSection({ params, hasDimensionFilter }: { params: AnalyticsParams; hasDimensionFilter: boolean }) {
  const { t, na } = useNa();
  const q = useAnalyticsQuery('notifications', params, analyticsApi.notifications);
  return (
    <AnalyticsSection
      id="an-notifications"
      title={t('analytics.notifications.title')}
      description={t('analytics.notifications.description')}
      query={q}
      note={(d) => ignoredNote(d.filters_applied, hasDimensionFilter, t)}
    >
      {(d) => {
        const columns: ACol<NotificationKindRow>[] = [
          { key: 'kind', header: t('analytics.notifications.columns.kind'), cell: (r) => <span className="font-mono text-xs">{r.kind}</span>, csv: (r) => r.kind },
          ...(['sent', 'read', 'emailed', 'pushed'] as const).map<ACol<NotificationKindRow>>((k) => ({
            key: k,
            header: t(`analytics.notifications.${k}`),
            align: 'end',
            cell: (r) => int(r[k]),
            csv: (r) => r[k],
          })),
          { key: 'rate', header: t('analytics.notifications.readRate'), align: 'end', cell: (r) => pct(r.read_rate, na), csv: (r) => pctCsv(r.read_rate, na) },
        ];
        return (
          <div className="flex flex-col gap-4">
            <TileGrid className="xl:grid-cols-5">
              <Tile label={t('analytics.notifications.sent')} value={int(d.sent)} />
              <Tile label={t('analytics.notifications.read')} value={int(d.read)} />
              <Tile label={t('analytics.notifications.readRate')} value={pct(d.read_rate, na)} />
              <Tile label={t('analytics.notifications.emailed')} value={int(d.emailed)} />
              <Tile label={t('analytics.notifications.pushed')} value={int(d.pushed)} />
            </TileGrid>
            <TablePanel
              title={t('analytics.notifications.byKind')}
              columns={columns}
              rows={d.by_kind}
              rowKey={(r) => r.kind}
              filename={csvFilename('notifications', d.meta)}
            />
          </div>
        );
      }}
    </AnalyticsSection>
  );
}
