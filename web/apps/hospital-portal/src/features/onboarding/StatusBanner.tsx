import { useLocation } from 'react-router';
import { AlertTriangle, Ban, Clock, Rocket } from 'lucide-react';
import { Alert, LinkButton } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useHospitalProfile } from '../../lib/queries';

/** Hospital approval status banner: draft (finish onboarding), pending_review, rejected (with reason), suspended. */
export function StatusBanner() {
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
            title="Finish onboarding to go live"
            actions={
              <LinkButton to="/onboarding" size="sm" variant="accent">
                Continue setup
              </LinkButton>
            }
          >
            Complete your profile, accreditations, specialties, KYC documents and payout account, then submit for
            review. Patients cannot find your hospital until it is approved.
          </Alert>
        );
      case 'pending_review':
        return (
          <Alert tone="amber" icon={<Clock className="h-5 w-5" aria-hidden />} title="Your hospital is under review">
            Our team is verifying your profile and KYC documents. You will be notified once it is approved
            {profile.updated_at ? ` (submitted ${formatDate(profile.updated_at)})` : ''}.
          </Alert>
        );
      case 'rejected':
        return (
          <Alert
            tone="red"
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            title="Your application needs changes"
            actions={
              onOnboarding ? undefined : (
                <LinkButton to="/onboarding" size="sm" variant="danger">
                  Update &amp; resubmit
                </LinkButton>
              )
            }
          >
            {profile.rejection_reason ? `Reason: ${profile.rejection_reason}` : 'Please review your details and resubmit.'}
          </Alert>
        );
      case 'suspended':
        return (
          <Alert tone="red" icon={<Ban className="h-5 w-5" aria-hidden />} title="Your hospital is suspended">
            New enquiries are paused. Please contact Heal India Global support.
            {profile.rejection_reason ? ` Reason: ${profile.rejection_reason}` : ''}
          </Alert>
        );
      default:
        return null;
    }
  })();

  return content ? <div className="mb-6">{content}</div> : null;
}
