import { useQuery } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Gift, Link2, Mail, MessageCircle, Send, Share2, Users, Wallet } from 'lucide-react';
import {
  patientReferralsApi,
  type CreditMovementOut,
  type MyReferralOut,
  type ReferralOverviewOut,
  type ReferralStatus,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { referralKeys, referralTermsUrl } from '../../api/referrals';
import { Money } from '../../components/common';
import { cn, formatDate, useDocumentTitle } from '../../lib/shared';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, type Tone } from '../../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

const STATUS_TONES: Record<ReferralStatus, Tone> = { pending: 'blue', qualified: 'violet', rewarded: 'green', void: 'neutral' };
const MOVEMENT_TONES: Record<CreditMovementOut['kind'], Tone> = {
  grant: 'green',
  redeem: 'blue',
  reinstate: 'violet',
  expire: 'amber',
  void: 'neutral',
};

function copyText(value: string, t: TFn) {
  if (!navigator.clipboard) {
    toast.error(t('referral.code.copyFailed'));
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => toast.success(t('referral.code.copied')),
    () => toast.error(t('referral.code.copyFailed')),
  );
}

export function ReferralsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('referral.title'));
  const overview = useQuery({ queryKey: referralKeys.overview, queryFn: patientReferralsApi.overview });
  const credits = useQuery({ queryKey: referralKeys.credits, queryFn: patientReferralsApi.credits });

  return (
    <div>
      <PageHeader title={t('referral.title')} description={t('referral.description')} />
      {overview.isPending ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-56 lg:col-span-2" />
          <Skeleton className="h-56" />
        </div>
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {overview.data.enabled && overview.data.code ? (
                <ShareCard data={overview.data} />
              ) : (
                <EmptyState
                  icon={<Gift className="h-8 w-8" aria-hidden />}
                  title={t('referral.disabled.title')}
                  description={t('referral.disabled.description')}
                />
              )}
              <RewardsCard data={overview.data} />
            </div>
            <BalanceCard data={overview.data} />
          </div>
          <FriendsCard data={overview.data} />
          <Card>
            <CardHeader title={t('referral.history.title')} description={t('referral.history.description')} />
            <CardBody>
              {credits.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : credits.isError ? (
                <ErrorState error={credits.error} onRetry={() => void credits.refetch()} />
              ) : credits.data.movements.length === 0 ? (
                <p className="text-sm text-muted">{t('referral.history.empty')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {credits.data.movements.map((m) => {
                    const credit = credits.data.credits.find((c) => c.id === m.credit_id);
                    const negative = m.kind === 'redeem' || m.kind === 'expire' || m.kind === 'void';
                    return (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                            <Badge tone={MOVEMENT_TONES[m.kind]}>{t(`referral.history.kind.${m.kind}`)}</Badge>
                            {credit ? <span className="text-muted">{t(`referral.history.creditKind.${credit.kind}`)}</span> : null}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatDate(m.created_at)}
                            {m.kind === 'grant' && credit?.expires_at
                              ? ` · ${t('referral.history.expires', { date: formatDate(credit.expires_at) })}`
                              : ''}
                          </p>
                        </div>
                        <span className={cn('text-sm font-semibold tabular-nums', negative ? 'text-muted' : 'text-success-ink')}>
                          {negative ? '−' : '+'}
                          <Money minor={Math.abs(m.display_amount_minor)} currency={m.display_currency} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          <p className="text-xs text-muted">
            <Trans
              t={t}
              i18nKey="referral.terms"
              components={{
                0: <a href={referralTermsUrl()} target="_blank" rel="noreferrer" className="font-medium text-primary-ink underline underline-offset-2" />,
              }}
            />
          </p>
        </div>
      )}
    </div>
  );
}

function ShareCard({ data }: { data: ReferralOverviewOut }) {
  const { t } = useAppTranslation();
  const code = data.code ?? '';
  const link = data.share_url ?? data.patient_web_url ?? '';
  const message = t('referral.code.shareText', { code, url: link });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function share() {
    try {
      await navigator.share({ title: t('referral.code.shareTitle'), text: message, url: link || undefined });
    } catch {
      /* cancelled by the user */
    }
  }

  const links = [
    { key: 'whatsapp', label: t('referral.code.whatsapp'), href: `https://wa.me/?text=${encodeURIComponent(message)}`, icon: MessageCircle },
    {
      key: 'telegram',
      label: t('referral.code.telegram'),
      href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t('referral.code.shareShort', { code }))}`,
      icon: Send,
    },
    {
      key: 'email',
      label: t('referral.code.email'),
      href: `mailto:?subject=${encodeURIComponent(t('referral.code.emailSubject'))}&body=${encodeURIComponent(message)}`,
      icon: Mail,
    },
  ];

  return (
    <Card>
      <CardHeader title={t('referral.code.title')} description={t('referral.code.description')} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl border border-dashed border-primary/50 bg-primary-soft px-4 py-2 font-mono text-2xl font-bold tracking-widest text-primary-ink" dir="ltr">
            {code}
          </span>
          <Button variant="outline" size="sm" onClick={() => copyText(code, t)}>
            <Copy className="h-4 w-4" aria-hidden />
            {t('referral.code.copyCode')}
          </Button>
        </div>
        {link ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted">{t('referral.code.linkLabel')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm text-fg" dir="ltr">
                {link}
              </span>
              <Button variant="outline" size="sm" onClick={() => copyText(link, t)}>
                <Link2 className="h-4 w-4" aria-hidden />
                {t('referral.code.copyLink')}
              </Button>
              {canShare ? (
                <Button size="sm" onClick={() => void share()}>
                  <Share2 className="h-4 w-4" aria-hidden />
                  {t('referral.code.share')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-xs font-medium text-muted">{t('referral.code.shareVia')}</p>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.key}
                href={l.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-sm font-medium text-fg hover:border-primary"
              >
                <l.icon className="h-4 w-4" aria-hidden />
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function RewardsCard({ data }: { data: ReferralOverviewOut }) {
  const { t } = useAppTranslation();
  const { referrer, referee, max_rewards_per_year, credit_validity_days } = data.rewards;
  return (
    <Card>
      <CardHeader title={t('referral.rewards.title')} />
      <CardBody className="space-y-4 text-sm">
        <ol className="space-y-2">
          {(['step1', 'step2', 'step3'] as const).map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink">
                {i + 1}
              </span>
              <span className="text-fg">{t(`referral.rewards.${step}`)}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-success-soft p-3 text-success-ink">
            <p className="text-xs font-medium uppercase tracking-wide">{t('referral.rewards.youLabel')}</p>
            <p className="mt-1 text-base font-semibold">
              {referrer ? <Trans t={t} i18nKey="referral.rewards.you" components={{ 0: <Money minor={referrer.amount_minor} currency={referrer.currency} trim /> }} /> : t('referral.rewards.none')}
            </p>
          </div>
          <div className="rounded-xl bg-accent-soft p-3 text-accent-ink">
            <p className="text-xs font-medium uppercase tracking-wide">{t('referral.rewards.friendLabel')}</p>
            <p className="mt-1 text-base font-semibold">
              {referee ? <Trans t={t} i18nKey="referral.rewards.friend" components={{ 0: <Money minor={referee.amount_minor} currency={referee.currency} trim /> }} /> : t('referral.rewards.none')}
            </p>
          </div>
        </div>
        <ul className="list-disc space-y-1 ps-5 text-muted">
          {max_rewards_per_year > 0 ? <li>{t('referral.rewards.cap', { count: max_rewards_per_year })}</li> : null}
          {credit_validity_days > 0 ? <li>{t('referral.rewards.validity', { count: credit_validity_days })}</li> : null}
          <li>{t('referral.rewards.use')}</li>
        </ul>
      </CardBody>
    </Card>
  );
}

function BalanceCard({ data }: { data: ReferralOverviewOut }) {
  const { t } = useAppTranslation();
  const c = data.credit;
  return (
    <Card className="h-fit">
      <CardHeader title={t('referral.balance.title')} action={<Wallet className="h-5 w-5 text-muted" aria-hidden />} />
      <CardBody className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t('referral.balance.available')}</p>
          <p className="text-3xl font-bold text-fg">
            <Money minor={c.amount_minor} currency={c.currency} />
          </p>
          {c.currency !== c.base_currency ? (
            <p className="text-xs text-muted">
              <Trans t={t} i18nKey="referral.balance.base" components={{ 0: <Money minor={c.base_amount_minor} currency={c.base_currency} /> }} />
            </p>
          ) : null}
        </div>
        {c.expiring_soon_minor > 0 ? (
          <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
            <Trans t={t} i18nKey="referral.balance.expiringSoon" components={{ 0: <Money minor={c.expiring_soon_minor} currency={c.currency} className="font-semibold" /> }} />
          </div>
        ) : null}
        {c.next_expiry_at ? <p className="text-xs text-muted">{t('referral.balance.nextExpiry', { date: formatDate(c.next_expiry_at) })}</p> : null}
        <p className="text-xs text-muted">{t('referral.balance.useHint')}</p>
      </CardBody>
    </Card>
  );
}

function FriendsCard({ data }: { data: ReferralOverviewOut }) {
  const { t } = useAppTranslation();
  const statuses: ReferralStatus[] = ['pending', 'qualified', 'rewarded', 'void'];
  return (
    <Card>
      <CardHeader
        title={t('referral.friends.title')}
        description={t('referral.friends.description')}
        action={
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((s) =>
              data.counts[s] ? (
                <Badge key={s} tone={STATUS_TONES[s]}>
                  {t(`referral.friends.status.${s}`)}: {data.counts[s]}
                </Badge>
              ) : null,
            )}
          </div>
        }
      />
      <CardBody>
        {data.referrals.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden />}
            title={t('referral.friends.empty')}
            description={t('referral.friends.emptyDescription')}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.referrals.map((r) => (
              <FriendRow key={r.id} referral={r} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function FriendRow({ referral: r }: { referral: MyReferralOut }) {
  const { t } = useAppTranslation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{r.friend_name}</p>
        <p className="text-xs text-muted">
          {t('referral.friends.joined', { date: formatDate(r.created_at) })}
          {r.rewarded_at ? ` · ${t('referral.friends.rewardedOn', { date: formatDate(r.rewarded_at) })}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {r.reward ? (
          <span className="text-sm font-semibold text-success-ink">
            +<Money minor={r.reward.amount_minor} currency={r.reward.currency} />
          </span>
        ) : null}
        <Badge tone={STATUS_TONES[r.status]}>{t(`referral.friends.status.${r.status}`)}</Badge>
      </div>
    </li>
  );
}
