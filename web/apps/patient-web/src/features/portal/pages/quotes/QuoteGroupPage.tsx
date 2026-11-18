/**
 * Quote comparison of one multi-hospital request (GET /cases/quote-groups/{id}): side by side, totals in the
 * patient's currency, cheapest highlighted, Accept -> booking. Hospitals that have not answered yet show the
 * "Quotes due by" countdown or "Overdue - we're chasing the hospital".
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, BedDouble, CalendarClock } from 'lucide-react';
import { casesApi, errorMessage, type QuoteGroupCase } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { pk, useQuoteGroup } from '../../api/phase1';
import { isEmergencyAckError } from '../../components/CareGates';
import { BackLink, StatusBadge } from '../../components/common';
import { ApproxMoney, QuoteCountdown } from '../../components/phase1';
import { paths } from '../../lib/paths';
import { cn, formatDate, formatMoney, formatNumber, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonList,
} from '../../ui/primitives';

function QuoteColumn({
  row,
  currency,
  cheapest,
  onAccept,
}: {
  row: QuoteGroupCase;
  currency: string;
  cheapest: boolean;
  onAccept: () => void;
}) {
  const { t } = useAppTranslation();
  const q = row.quote;
  const canAccept = q && (q.status === 'sent' || (q.status as string) === 'pending') && row.status === 'quoted';
  const accepted = q?.status === 'accepted';
  return (
    <Card className={cn('flex h-full flex-col p-4', cheapest && 'ring-2 ring-success')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={paths.hospital(row.hospital.slug)} className="font-semibold text-fg hover:underline">
            {row.hospital.name}
          </Link>
          <p className="text-xs text-muted">
            {row.hospital.city}
            {row.doctor ? ` · ${row.doctor.full_name}` : ''}
          </p>
        </div>
        {cheapest ? (
          <Badge tone="green" className="shrink-0">
            <Award className="size-3.5" aria-hidden />
            {t('quoteGroup.cheapest')}
          </Badge>
        ) : null}
      </div>

      {q ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-muted">{t('quoteGroup.total')}</p>
            <p className="text-2xl font-bold text-fg tabular-nums">
              {row.total_in_currency_minor != null && currency.toUpperCase() !== q.currency.toUpperCase()
                ? t('money.approx', { amount: formatMoney(row.total_in_currency_minor, currency, undefined, { trimZeros: true }) })
                : formatMoney(q.total_minor, q.currency, undefined, { trimZeros: true })}
            </p>
            {currency.toUpperCase() !== q.currency.toUpperCase() ? (
              <p className="text-xs text-muted">
                {t('quoteGroup.youPay', { amount: formatMoney(q.total_minor, q.currency, undefined, { trimZeros: true }) })}
              </p>
            ) : null}
          </div>
          <dl className="space-y-1 text-sm">
            {q.estimated_stay_days != null ? (
              <div className="flex items-center gap-2 text-muted">
                <BedDouble className="size-4" aria-hidden />
                <dd>{t('quoteGroup.stay', { count: q.estimated_stay_days, days: formatNumber(q.estimated_stay_days) })}</dd>
              </div>
            ) : null}
            {q.valid_until ? (
              <div className="flex items-center gap-2 text-muted">
                <CalendarClock className="size-4" aria-hidden />
                <dd>{t('quoteGroup.validUntil', { date: formatDate(q.valid_until) })}</dd>
              </div>
            ) : null}
          </dl>
          {q.line_items.length ? (
            <details className="rounded-xl border border-border text-sm">
              <summary className="cursor-pointer px-3 py-2 font-medium">{t('quoteGroup.breakdown')}</summary>
              <ul className="divide-y divide-border border-t border-border">
                {q.line_items.map((li, i) => {
                  const item = li as { description?: string; category?: string; amount_minor?: number; display_amount?: Parameters<typeof ApproxMoney>[0]['display'] };
                  return (
                    <li key={i} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 text-muted">{item.description ?? item.category}</span>
                      <ApproxMoney minor={item.amount_minor} currency={q.currency} display={item.display_amount} className="text-end" />
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
          {q.treatment_plan ? <p className="line-clamp-4 text-sm text-fg/80">{q.treatment_plan}</p> : null}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted">{t('quoteGroup.waiting')}</p>
          <QuoteCountdown dueAt={row.quote_due_at} overdue={row.quote_overdue} hoursLeft={row.hours_left} />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <StatusBadge status={row.status} />
        {accepted ? (
          <ButtonLink to={paths.book(row.case_id)} size="sm">
            {t('quoteGroup.book')}
          </ButtonLink>
        ) : canAccept ? (
          <Button size="sm" onClick={onAccept}>
            {t('quoteGroup.accept')}
          </Button>
        ) : null}
        <ButtonLink to={paths.case(row.case_id)} size="sm" variant="ghost">
          {t('quoteGroup.details')}
        </ButtonLink>
      </div>
    </Card>
  );
}

export function QuoteGroupPage() {
  const { groupId = '' } = useParams();
  const { t } = useAppTranslation();
  useDocumentTitle(t('quoteGroup.title'));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const group = useQuoteGroup(groupId);
  const [confirm, setConfirm] = useState<QuoteGroupCase | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(row: QuoteGroupCase) {
    if (!row.quote) return;
    setBusy(true);
    try {
      await casesApi.acceptQuote(row.case_id, row.quote.id);
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: pk.quoteGroup(groupId) });
      setConfirm(null);
      navigate(paths.book(row.case_id));
    } catch (err) {
      if (isEmergencyAckError(err)) {
        toast.error(t('quoteGroup.emergencyFirst'));
        navigate(paths.case(row.case_id));
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (group.isError) return <ErrorState error={group.error} onRetry={() => void group.refetch()} />;
  const g = group.data;
  const answered = g ? g.cases.filter((c) => c.quote).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink to={paths.cases}>{t('quoteGroup.back')}</BackLink>}
        title={t('quoteGroup.title')}
        description={g ? (g.procedure?.name ?? g.specialty?.name ?? undefined) : <Skeleton className="h-4 w-40" />}
      />
      {!g ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Alert tone={answered === g.cases.length ? 'green' : 'blue'}>
            {t('quoteGroup.replied', { answered: formatNumber(answered), total: formatNumber(g.cases.length) })}
          </Alert>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.cases.map((row) => (
              <li key={row.case_id}>
                <QuoteColumn
                  row={row}
                  currency={g.currency}
                  cheapest={answered > 1 && row.case_id === g.cheapest_case_id}
                  onAccept={() => setConfirm(row)}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('quoteGroup.currencyNote', { currency: g.currency })}</p>
        </>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void accept(confirm)}
        title={t('quoteGroup.accept')}
        confirmLabel={t('quoteGroup.accept')}
        loading={busy}
      >
        {confirm ? t('quoteGroup.acceptConfirm', { hospital: confirm.hospital.name }) : null}
      </ConfirmDialog>
    </div>
  );
}
