import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, Gift, Mail, MessageCircle, Share2 } from 'lucide-react';
import { agentPortalApi } from '@hig/shared/api';
import { Button, Card, CardHeader, ErrorState, Input, LoadingBlock, PageHeader, useCopy } from '../../components/ui';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/shared';

export function ReferralPage() {
  useDocumentTitle('Referral');
  const query = useQuery({ queryKey: qk.referral, queryFn: agentPortalApi.referral });
  const [codeCopied, copyCode] = useCopy();
  const [linkCopied, copyLink] = useCopy();

  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { agent_code, referral_url } = query.data;
  const message = `Explore world-class treatment in India with Heal India Global. Start here: ${referral_url}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div>
      <PageHeader
        title="Referral"
        description="Patients who sign up with your link or code are linked to your agency, so their bookings count towards your commission."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your agent code" />
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className="rounded-xl bg-accent-soft px-5 py-3 font-mono text-2xl font-bold tracking-widest text-violet-700 dark:text-violet-300">
              {agent_code}
            </span>
            <Button
              variant="outline"
              icon={codeCopied ? <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              onClick={() => void copyCode(agent_code)}
            >
              {codeCopied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
          <p className="px-5 pb-5 text-sm text-muted">Patients can enter this code when registering on the Heal India Global app or website.</p>
        </Card>
        <Card>
          <CardHeader title="Referral link" />
          <div className="space-y-4 p-5">
            <div className="flex gap-2">
              <Input readOnly value={referral_url} aria-label="Referral link" onFocus={(e) => e.target.select()} />
              <Button
                icon={linkCopied ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                onClick={() => void copyLink(referral_url)}
              >
                {linkCopied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
              <a
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
                href={`mailto:?subject=${encodeURIComponent('Treatment in India with Heal India Global')}&body=${encodeURIComponent(message)}`}
              >
                <Mail className="h-4 w-4" aria-hidden /> Email
              </a>
              {canShare && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  icon={<Share2 className="h-4 w-4" aria-hidden />}
                  onClick={() => void navigator.share({ title: 'Heal India Global', text: message, url: referral_url }).catch(() => undefined)}
                >
                  Share
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
            <p className="font-medium">How referral commission works</p>
            <p className="text-muted">
              When a referred or managed patient completes a treatment booked through the platform, your commission is
              calculated on the hospital amount and appears under Commissions. It becomes eligible after the holding period and is
              paid to your verified payout account on the next settlement cycle.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
