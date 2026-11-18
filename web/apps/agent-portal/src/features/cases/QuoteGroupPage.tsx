import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Award, Building2, Check, GitCompare, X } from 'lucide-react';
import type { QuoteOut } from '@hig/shared/api';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  PageHeader,
  StatusBadge,
} from '../../components/ui';
import { phase1Api, type QuoteGroupCase } from '../../lib/phase1Api';
import { formatDate, formatDateTime, formatMoney, useDocumentTitle } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { AcceptQuoteDialog, RejectQuoteDialog, isQuoteActionable } from './quotes';
import { QuoteDeadline } from './QuoteDeadline';

/**
 * One multi-hospital quote request (`GET /cases/quote-groups/{id}`): each hospital's answer side by side, a
 * countdown to every hospital's quote deadline while it has not answered, and accept / decline per quote.
 */
export function QuoteGroupPage() {
  const { t } = useAppTranslation();
  const { groupId = '' } = useParams();
  const query = useQuery({
    queryKey: ['cases', 'quote-groups', groupId],
    queryFn: () => phase1Api.quoteGroup(groupId),
    refetchInterval: 60_000,
  });
  const group = query.data;
  useDocumentTitle(t('quoteGroup.title'));
  const [accepting, setAccepting] = useState<{ row: QuoteGroupCase; quote: QuoteOut } | null>(null);
  const [rejecting, setRejecting] = useState<{ row: QuoteGroupCase; quote: QuoteOut } | null>(null);

  const back = (
    <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('quoteGroup.back')}
    </Link>
  );
  if (query.isPending) return <LoadingBlock />;
  if (query.isError || !group) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const quoted = group.cases.filter((row) => row.quote);
  const waiting = group.cases.filter((row) => !row.quote && row.status === 'enquiry').length;
  const treatment = group.procedure?.name ?? group.specialty?.name ?? t('quoteGroup.generalEnquiry');
  const siblings = group.cases.map((row) => ({ id: row.case_id, case_number: row.case_number, hospital: { ...row.hospital, city: row.hospital.city ?? '' }, status: row.status }));

  return (
    <div>
      <PageHeader
        back={back}
        title={t('quoteGroup.title')}
        description={t('quoteGroup.description', { patient: group.patient.full_name, treatment, date: formatDate(group.created_at) })}
        actions={
          quoted.length >= 2 ? (
            <ButtonLink
              variant="outline"
              to={`/cases/compare?ids=${quoted.map((row) => row.case_id).join(',')}`}
              icon={<GitCompare className="h-4 w-4" aria-hidden />}
            >
              {t('quoteGroup.compareDetail')}
            </ButtonLink>
          ) : undefined
        }
      />
      <p className="mb-4 text-sm text-muted" role="status">
        {waiting > 0 ? t('quoteGroup.waiting', { count: waiting }) : t('quoteGroup.allAnswered')}
      </p>
      {group.cases.length === 0 ? (
        <Card>
          <EmptyState title={t('quoteGroup.empty')} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {group.cases.map((row) => {
            const quote = row.quote;
            const cheapest = group.cheapest_case_id === row.case_id && quoted.length > 1;
            const converted =
              quote && row.total_in_currency_minor != null && group.currency.toUpperCase() !== quote.currency.toUpperCase();
            return (
              <Card key={row.case_id} className={cheapest ? 'ring-2 ring-success/40' : undefined}>
                <div className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <Link to={`/hospitals/${row.hospital.slug}`} className="block font-semibold leading-tight hover:underline">
                        {row.hospital.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {[row.hospital.city, row.doctor?.full_name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {cheapest && (
                      <Badge tone="success">
                        <Award className="h-3 w-3" aria-hidden /> {t('quoteGroup.lowest')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Link to={`/cases/${row.case_id}`} className="font-mono text-primary-ink hover:underline">
                      {row.case_number}
                    </Link>
                    <StatusBadge kind="case" status={row.status} />
                  </div>
                  {quote ? (
                    <div className="rounded-lg bg-surface-2 px-4 py-3">
                      <p className="text-xs font-semibold text-muted uppercase">{t('quoteGroup.total')}</p>
                      <Money minor={quote.total_minor} currency={quote.currency} className="text-xl font-bold" />
                      {converted && (
                        <span className="block text-xs text-muted tabular-nums" title={t('displayCurrency.approxTitle', { currency: group.currency })}>
                          ≈ {formatMoney(row.total_in_currency_minor, group.currency, undefined, { trimZeros: true })}
                          <span className="sr-only"> {t('displayCurrency.approxSr')}</span>
                        </span>
                      )}
                      <p className="mt-1 text-xs text-muted">
                        {quote.valid_until ? t('quotes.validUntil', { date: formatDate(quote.valid_until) }) : t('quoteGroup.sentAt', { date: formatDateTime(quote.created_at) })}
                      </p>
                    </div>
                  ) : row.status === 'enquiry' ? (
                    <div className="space-y-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
                      <p className="text-muted">{t('quoteGroup.awaiting')}</p>
                      <QuoteDeadline dueAt={row.quote_due_at} overdue={row.quote_overdue} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{t('quoteGroup.noQuote')}</p>
                  )}
                  <div className="mt-auto flex flex-wrap justify-end gap-2">
                    {quote && isQuoteActionable(row.status, quote) && (
                      <>
                        <Button size="sm" variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => setRejecting({ row, quote })}>
                          {t('caseDetail.decline')}
                        </Button>
                        <Button size="sm" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => setAccepting({ row, quote })}>
                          {t('caseDetail.acceptQuote')}
                        </Button>
                      </>
                    )}
                    <ButtonLink size="sm" variant="ghost" to={`/cases/${row.case_id}`}>
                      {t('quoteGroup.openCase')}
                    </ButtonLink>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AcceptQuoteDialog
        open={accepting !== null}
        onClose={() => setAccepting(null)}
        caseItem={
          accepting
            ? { id: accepting.row.case_id, case_number: accepting.row.case_number, hospital: { ...accepting.row.hospital, city: accepting.row.hospital.city ?? '' } }
            : { id: '', case_number: '', hospital: { id: '', slug: '', name: '', city: '' } }
        }
        quote={accepting?.quote ?? null}
        siblings={siblings}
      />
      <RejectQuoteDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        caseId={rejecting?.row.case_id ?? ''}
        quote={rejecting?.quote ?? null}
      />
    </div>
  );
}
