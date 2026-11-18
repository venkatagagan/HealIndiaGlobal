import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, Gift, Mail, MessageCircle, Share2 } from 'lucide-react';
import { agentPortalApi } from '@hig/shared/api';
import { Button, Card, CardHeader, ErrorState, Input, LoadingBlock, PageHeader, useCopy } from '../../components/ui';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';

export function ReferralPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('referral.title'));
  const query = useQuery({ queryKey: qk.referral, queryFn: agentPortalApi.referral });
  const [codeCopied, copyCode] = useCopy();
  const [linkCopied, copyLink] = useCopy();

  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { agent_code, referral_url } = query.data;
  const message = t('referral.shareMessage', { url: referral_url });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div>
      <PageHeader
        title={t('referral.title')}
        description={t('referral.description')}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('referral.codeTitle')} />
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className="rounded-xl bg-accent-soft px-5 py-3 font-mono text-2xl font-bold tracking-widest text-violet-700 dark:text-violet-300">
              {agent_code}
            </span>
            <Button
              variant="outline"
              icon={codeCopied ? <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              onClick={() => void copyCode(agent_code)}
            >
              {codeCopied ? t('referral.copied') : t('referral.copyCode')}
            </Button>
          </div>
          <p className="px-5 pb-5 text-sm text-muted">{t('referral.codeHint')}</p>
        </Card>
        <Card>
          <CardHeader title={t('referral.linkTitle')} />
          <div className="space-y-4 p-5">
            <div className="flex gap-2">
              <Input readOnly value={referral_url} aria-label={t('referral.linkTitle')} onFocus={(e) => e.target.select()} />
              <Button
                icon={linkCopied ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                onClick={() => void copyLink(referral_url)}
              >
                {linkCopied ? t('referral.copied') : t('referral.copy')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> {t('referral.whatsapp')}
              </a>
              <a
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
                href={`mailto:?subject=${encodeURIComponent(t('referral.emailSubject'))}&body=${encodeURIComponent(message)}`}
              >
                <Mail className="h-4 w-4" aria-hidden /> {t('referral.email')}
              </a>
              {canShare && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  icon={<Share2 className="h-4 w-4" aria-hidden />}
                  onClick={() => void navigator.share({ title: 'Heal India Global', text: message, url: referral_url }).catch(() => undefined)}
                >
                  {t('referral.share')}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
      <Card className="mt-6 p-5">
        <div className="flex gap-3">
          <Gift className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t('referral.howTitle')}</p>
            <p className="text-muted">
              {t('referral.howBody')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
