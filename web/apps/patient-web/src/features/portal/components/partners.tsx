/**
 * Insurance / pay-later building blocks (CG-18) shared by the "Insurance & pay later" page and the booking flow:
 * the legal disclaimers, request status badges, partner hand-off links, the compact insurance card and the
 * interest-free instalment schedule.
 */
import type { ReactNode } from 'react';
import { ChevronRight, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { useAppTranslation } from '../../../i18n';
import { usePatientProfile } from '../api/queries';
import type { InstallmentRow, PartnerKind, PartnerLeadStatus } from '../api/partners';
import { paths } from '../lib/paths';
import { useMe } from '../lib/session';
import { cn, formatDate, formatMoney } from '../lib/shared';
import { useHomeCountryPref } from '../lib/viewer';
import { Badge, ButtonLink, Card, CardBody, type Tone } from '../ui/primitives';

const ISO2 = /^[A-Z]{2}$/;

/**
 * The patient's home country when known (ISO-2): profile country of residence, else the country chosen in the
 * cost block, else the account's country code. Null for an unknown country.
 */
export function usePatientCountry(): string | null {
  const me = useMe();
  const isGuest = me.data?.is_guest ?? true;
  const profile = usePatientProfile(!!me.data && !isGuest);
  const [pref] = useHomeCountryPref();
  const candidates = [isGuest ? null : profile.data?.country_of_residence, pref, me.data?.country_code];
  for (const c of candidates) {
    const code = c?.toUpperCase();
    if (code && ISO2.test(code)) return code;
  }
  return null;
}

/** Legal notice shown on every insurance / pay-later surface (copy pending legal review). */
export function PartnerDisclaimer({ kind, className }: { kind: PartnerKind; className?: string }) {
  const { t } = useAppTranslation();
  return (
    <div
      role="note"
      className={cn('flex gap-3 rounded-2xl border border-border bg-surface-2 p-4 text-sm text-fg', className)}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <p>{kind === 'insurance' ? t('insurance.disclaimer') : t('financing.disclaimer')}</p>
    </div>
  );
}

const LEAD_TONES: Record<PartnerLeadStatus, Tone> = {
  new: 'blue',
  in_progress: 'amber',
  shared_with_partner: 'violet',
  closed: 'neutral',
  cancelled: 'neutral',
};

export function LeadStatusBadge({ status }: { status: PartnerLeadStatus }) {
  const { t } = useAppTranslation();
  return <Badge tone={LEAD_TONES[status] ?? 'neutral'}>{t(`insurance.status.${status}`, { defaultValue: status })}</Badge>;
}

/** Only https partner pages are linked (the catalog enforces https; this guards older rows). */
export function safePartnerUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** External link to a partner's own site: new tab, no opener, announced to screen readers. */
export function PartnerLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useAppTranslation();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> {t('insurance.newTab')}</span>
    </a>
  );
}

/** Booking flow: compact pointer to the insurance partners, with the short disclaimer. */
export function InsuranceOptionsCard({ caseId, bookingId }: { caseId?: string; bookingId?: string }) {
  const { t } = useAppTranslation();
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">{t('insurance.bookingCard.title')}</h2>
            <p className="mt-0.5 text-sm text-muted">{t('insurance.bookingCard.text')}</p>
          </div>
        </div>
        <p className="text-xs text-muted">{t('insurance.bookingCard.shortDisclaimer')}</p>
        <ButtonLink to={paths.insurance({ case: caseId, booking: bookingId })} variant="outline" size="sm">
          {t('insurance.bookingCard.action')}
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

/** Interest-free pre-payment schedule (seq, due date, amount). */
export function InstallmentSchedule({
  rows,
  currency,
  className,
}: {
  rows: InstallmentRow[];
  currency: string;
  className?: string;
}) {
  const { t } = useAppTranslation();
  return (
    <table className={cn('w-full text-sm', className)}>
      <caption className="mb-1 text-start text-xs font-semibold text-muted">{t('financing.plan.scheduleTitle')}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t('financing.plan.columns.seq')}</th>
          <th scope="col">{t('financing.plan.columns.dueDate')}</th>
          <th scope="col">{t('financing.plan.columns.amount')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.seq} className="border-t border-border first:border-t-0">
            <td className="py-1.5 pe-2 text-muted">{t('financing.plan.seq', { n: row.seq })}</td>
            <td className="py-1.5 pe-2">{formatDate(row.due_date)}</td>
            <td className="py-1.5 text-end font-medium tabular-nums">{formatMoney(row.amount_minor, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
