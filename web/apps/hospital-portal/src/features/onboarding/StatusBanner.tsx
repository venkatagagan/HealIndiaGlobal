import { useLocation } from 'react-router';
import { AlertTriangle, Ban, Clock, Rocket } from 'lucide-react';
import { Alert, LinkButton } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useHospitalProfile } from '../../lib/queries';

/** Hospital approval status banner: draft (finish onboarding), pending_review, rejected (with reason), suspended. */
export function StatusBanner() {
  const { t } = useAppTranslation();
  const { data: profile } = useHospitalProfile();
  const { pathname } = useLocation();
  if (!profile || profile.status === 'active') return null;
  const onOnboarding = pathname.startsWith('/profile') || pathname.startsWith('/onboarding');

  const content = (() => {
    switch (profile.status) {
      case 'draft':
        return onOnboarding ? null : (
          <Alert
            tone="violet"
            icon={<Rocket className="h-5 w-5" aria-hidden />}
            title={t('onboarding.banner.draftTitle')}
            actions={
              <LinkButton to="/onboarding" size="sm" variant="accent">
                {t('onboarding.banner.continueSetup')}
              </LinkButton>
            }
          >
            {t('onboarding.banner.draftBody')}
          </Alert>
        );
      case 'pending_review':
        return (
          <Alert tone="amber" icon={<Clock className="h-5 w-5" aria-hidden />} title={t('onboarding.banner.reviewTitle')}>
            {profile.updated_at
              ? t('onboarding.banner.reviewBodySubmitted', { date: formatDate(profile.updated_at) })
              : t('onboarding.banner.reviewBody')}
          </Alert>
        );
      case 'rejected':
        return (
          <Alert
            tone="red"
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            title={t('onboarding.banner.rejectedTitle')}
            actions={
              onOnboarding ? undefined : (
                <LinkButton to="/onboarding" size="sm" variant="danger">
                  {t('onboarding.banner.resubmit')}
                </LinkButton>
              )
            }
          >
            {profile.rejection_reason
              ? t('onboarding.banner.reason', { reason: profile.rejection_reason })
              : t('onboarding.banner.rejectedBody')}
          </Alert>
        );
      case 'suspended':
        return (
          <Alert tone="red" icon={<Ban className="h-5 w-5" aria-hidden />} title={t('onboarding.banner.suspendedTitle')}>
            {profile.rejection_reason
              ? t('onboarding.banner.suspendedBodyReason', { reason: profile.rejection_reason })
              : t('onboarding.banner.suspendedBody')}
          </Alert>
        );
      default:
        return null;
    }
  })();

  return content ? <div className="mb-6">{content}</div> : null;
}
