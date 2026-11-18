/** Dashboard prompts: "Rate your hospital" after treatment and the guest's free 15-minute call. */
import type { ReactNode } from 'react';
import { ArrowRight, Star, Video } from 'lucide-react';
import { useAppTranslation } from '../../../i18n';
import { useEligibleReviews, useIntroCall } from '../api/phase1';
import { paths } from '../lib/paths';
import { useMe } from '../lib/session';
import { cn } from '../lib/shared';
import { ButtonLink } from '../ui/primitives';

function Banner({
  icon,
  eyebrow,
  title,
  subtitle,
  to,
  cta,
  className,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  to: string;
  cta: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{eyebrow}</p>
          <p className="font-semibold text-fg">{title}</p>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      <ButtonLink to={to} className="shrink-0" icon={<ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />}>
        {cta}
      </ButtonLink>
    </section>
  );
}

/** First completed booking without a review: "How was your treatment? Rate <hospital>". */
export function ReviewPromptBanner({ className }: { className?: string }) {
  const { t } = useAppTranslation();
  const me = useMe();
  const eligible = useEligibleReviews(!!me.data && !me.data.is_guest);
  const first = eligible.data?.[0];
  if (!first) return null;
  return (
    <Banner
      className={className}
      icon={<Star className="size-5" aria-hidden />}
      eyebrow={t('reviews.banner.eyebrow')}
      title={t('reviews.banner.title', { hospital: first.hospital.name })}
      subtitle={t('reviews.banner.subtitle')}
      to={paths.writeReview(first.booking_id)}
      cta={t('reviews.banner.cta')}
    />
  );
}

/** Guests: the free 15-minute video consultation (or the booked call's status). */
export function FreeCallBanner({ className, screeningId }: { className?: string; screeningId?: string }) {
  const { t } = useAppTranslation();
  const me = useMe();
  const call = useIntroCall(!!me.data?.is_guest);
  if (!me.data?.is_guest) return null;
  if (call.data) {
    return (
      <Banner
        className={className}
        icon={<Video className="size-5" aria-hidden />}
        eyebrow={t('freeCall.banner.eyebrow')}
        title={t(`freeCall.status.${call.data.status}`, { defaultValue: t('freeCall.status.requested') })}
        subtitle={t('freeCall.banner.subtitle')}
        to={paths.freeCallStatus}
        cta={t('freeCall.seeMyCall')}
      />
    );
  }
  return (
    <Banner
      className={className}
      icon={<Video className="size-5" aria-hidden />}
      eyebrow={t('freeCall.banner.eyebrow')}
      title={t('freeCall.banner.title')}
      subtitle={screeningId ? t('freeCall.afterResults') : t('freeCall.banner.subtitle')}
      to={paths.freeCall(screeningId)}
      cta={t('freeCall.banner.cta')}
    />
  );
}
