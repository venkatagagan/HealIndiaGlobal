/**
 * Small building blocks of the phase-1 screens: approximate money in the viewer's currency, earliest-date
 * chips, quote countdown, verified badges and review cards.
 */
import { BadgeCheck, CalendarCheck2, Clock3, Hourglass, ShieldCheck, Star, Video } from 'lucide-react';
import type { AccreditationBadge, DisplayMoney, IsoDate, ReviewOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { cn, formatDate, formatMoney, formatMoneyRange, formatNumber, toDate } from '../lib/shared';
import { Badge } from '../ui/primitives';

// ---------------------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------------------
function showsConversion(display: DisplayMoney | null | undefined, currency: string | null | undefined): display is DisplayMoney {
  return !!display && !!currency && display.currency.toUpperCase() !== currency.toUpperCase();
}

/**
 * Amount in the viewer's currency ("≈ $1,240") with the original amount small underneath ("₹1,03,000").
 * Without a conversion it shows the original amount only.
 */
export function ApproxMoney({
  minor,
  currency,
  display,
  className,
  originalClassName,
  inline = false,
}: {
  minor: number | null | undefined;
  currency: string | null | undefined;
  display?: DisplayMoney | null;
  className?: string;
  originalClassName?: string;
  /** original amount on the same line in brackets */
  inline?: boolean;
}) {
  const { t } = useAppTranslation();
  const original = formatMoney(minor, currency, undefined, { trimZeros: true });
  if (!showsConversion(display, currency) || minor == null) {
    return <span className={cn('tabular-nums', className)}>{original}</span>;
  }
  const approx = t('money.approx', { amount: formatMoney(display.amount_minor, display.currency, undefined, { trimZeros: true }) });
  return (
    <span className={cn(inline ? 'inline-flex flex-wrap items-baseline gap-x-1.5' : 'inline-flex flex-col', className)}>
      <span className="tabular-nums" title={t('money.approxHint')}>
        {approx}
      </span>
      <span className={cn('text-xs font-normal text-muted tabular-nums', originalClassName)}>
        {inline ? t('money.originalInline', { amount: original }) : original}
      </span>
    </span>
  );
}

/** Price range in the viewer's currency ("≈ $3,400 – $4,800") with the original INR range small. */
export function ApproxRange({
  min,
  max,
  currency,
  displayMin,
  displayMax,
  className,
}: {
  min: number | null | undefined;
  max: number | null | undefined;
  currency: string | null | undefined;
  displayMin?: DisplayMoney | null;
  displayMax?: DisplayMoney | null;
  className?: string;
}) {
  const { t } = useAppTranslation();
  const original = formatMoneyRange(min, max, currency);
  const lo = showsConversion(displayMin, currency) ? displayMin : null;
  const hi = showsConversion(displayMax, currency) ? displayMax : null;
  if (!lo && !hi) return <span className={cn('tabular-nums', className)}>{original}</span>;
  const ccy = (lo ?? hi)!.currency;
  const approx = t('money.approx', { amount: formatMoneyRange(lo?.amount_minor ?? hi?.amount_minor, hi?.amount_minor ?? lo?.amount_minor, ccy) });
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <span className="tabular-nums" title={t('money.approxHint')}>
        {approx}
      </span>
      <span className="text-xs font-normal text-muted tabular-nums">{original}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Earliest dates
// ---------------------------------------------------------------------------------------------------------
function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "today" / "tomorrow" / "Mon 24 Nov" for an IST calendar date. */
export function useEarliestLabel() {
  const { t } = useAppTranslation();
  return (date: IsoDate) => {
    const day = date.slice(0, 10);
    if (day <= isoToday()) return t('earliest.today');
    if (day === isoToday(1)) return t('earliest.tomorrow');
    return formatDate(toDate(`${day}T12:00:00`), 'EEE d MMM');
  };
}

export function EarliestChips({
  consultation,
  admission,
  showConsultation = true,
  className,
}: {
  consultation?: IsoDate | null;
  admission?: IsoDate | null;
  showConsultation?: boolean;
  className?: string;
}) {
  const { t } = useAppTranslation();
  const label = useEarliestLabel();
  const c = showConsultation ? consultation : null;
  if (!c && !admission) return null;
  return (
    <span className={cn('inline-flex flex-wrap gap-1.5', className)}>
      {c ? (
        <Badge tone="blue" className="whitespace-normal">
          <Video className="size-3.5 shrink-0" aria-hidden />
          {t('earliest.consultation', { date: label(c) })}
        </Badge>
      ) : null}
      {admission ? (
        <Badge tone="green" className="whitespace-normal">
          <CalendarCheck2 className="size-3.5 shrink-0" aria-hidden />
          {t('earliest.admission', { date: label(admission) })}
        </Badge>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Quote countdown
// ---------------------------------------------------------------------------------------------------------
/** "Quotes due by Tue 18 Nov, 14:00 · 21 h left" or "Overdue — we're chasing the hospital". */
export function QuoteCountdown({
  dueAt,
  overdue,
  hoursLeft,
  className,
  compact = false,
}: {
  dueAt: string | null | undefined;
  overdue?: boolean;
  hoursLeft?: number | null;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useAppTranslation();
  if (!dueAt) return null;
  if (overdue) {
    return (
      <Badge tone="red" className={cn('whitespace-normal', className)}>
        <Hourglass className="size-3.5 shrink-0" aria-hidden />
        {t('quotes.countdown.overdue')}
      </Badge>
    );
  }
  const left = hoursLeft != null ? Math.max(0, hoursLeft) : null;
  const leftText =
    left == null
      ? null
      : left < 1
        ? t('quotes.countdown.lessThanHour')
        : t('quotes.countdown.hoursLeft', { count: Math.floor(left), hours: formatNumber(Math.floor(left)) });
  return (
    <Badge tone={left != null && left < 12 ? 'amber' : 'violet'} className={cn('whitespace-normal', className)}>
      <Clock3 className="size-3.5 shrink-0" aria-hidden />
      {compact && leftText
        ? leftText
        : t('quotes.countdown.dueBy', { date: formatDate(dueAt, 'EEE d MMM, HH:mm') })}
      {!compact && leftText ? <span className="font-semibold"> · {leftText}</span> : null}
    </Badge>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------------------------------------
export function VerifiedAccreditations({ items, fallback }: { items?: AccreditationBadge[] | null; fallback?: string[] }) {
  const { t } = useAppTranslation();
  if (items?.length) {
    return (
      <span className="inline-flex flex-wrap gap-1.5">
        {items.map((a) => (
          <Badge
            key={a.body}
            tone="blue"
            className="uppercase"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            <span>{a.body}</span>
            <span className="sr-only">{t('trust.verifiedAccreditation')}</span>
          </Badge>
        ))}
      </span>
    );
  }
  if (!fallback?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {fallback.map((a) => (
        <Badge key={a} className="uppercase">
          {a}
        </Badge>
      ))}
    </span>
  );
}

export function RegistrationVerified() {
  const { t } = useAppTranslation();
  return (
    <Badge tone="green">
      <BadgeCheck className="size-3.5" aria-hidden />
      {t('trust.registrationVerified')}
    </Badge>
  );
}

export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const { t } = useAppTranslation();
  const cls = size === 'md' ? 'size-5' : 'size-4';
  return (
    <span className="inline-flex items-center" role="img" aria-label={t('reviews.stars', { count: value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(cls, n <= value ? 'fill-amber-400 text-amber-400' : 'text-border-strong')} aria-hidden />
      ))}
    </span>
  );
}

export function ReviewCard({ review }: { review: ReviewOut }) {
  const { t } = useAppTranslation();
  const verified = review.verified_patient ?? true;
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stars value={review.rating} />
        <span className="text-xs text-muted">{formatDate(review.published_at ?? review.created_at)}</span>
      </div>
      {review.title ? <h3 className="mt-2 font-semibold text-fg">{review.title}</h3> : null}
      {review.body ? <p className="mt-1 whitespace-pre-line text-sm text-fg/80">{review.body}</p> : null}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-medium text-fg">{review.patient_name ?? t('reviews.anonymous')}</span>
        {verified ? (
          <span className="inline-flex items-center gap-1 text-success-ink">
            <BadgeCheck className="size-3.5" aria-hidden />
            {review.treatment_name
              ? t('reviews.verifiedFor', { treatment: review.treatment_name })
              : t('reviews.verified')}
          </span>
        ) : null}
        {review.doctor_name ? <span>{t('reviews.doctor', { name: review.doctor_name })}</span> : null}
      </p>
    </article>
  );
}
