import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCircle2, Circle, Send } from 'lucide-react';
import { errorMessage, financeApi, hospitalPortalApi, type HospitalProfileOut } from '@hig/shared/api';
import { Button, Card, CardBody, CardHeader, ErrorState, PageHeader, PageLoader, StatusBadge, Tabs } from '../../components/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { cn } from '../../lib/format';
import { qk, useHospitalProfile } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { MyAccountSection } from '../account/MyAccountSection';
import { PayoutAccountSection } from '../finance/PayoutAccountForm';
import { KycStep, REQUIRED_KYC_KINDS, useKycDocuments } from './KycStep';
import { ProfileStep } from './ProfileStep';
import { ServicesStep } from './ServicesStep';
import { SpecialtiesStep } from './SpecialtiesStep';

type StepKey = 'profile' | 'services' | 'specialties' | 'kyc' | 'payout' | 'review';

const STEPS: { key: StepKey; label: string; description: string }[] = [
  { key: 'profile', label: 'Profile & contact', description: 'Basic details, address and contact for international patients' },
  { key: 'services', label: 'Accreditations', description: 'Accreditations, languages and international desk' },
  { key: 'specialties', label: 'Specialties', description: 'Departments that accept international patients' },
  { key: 'kyc', label: 'KYC documents', description: 'Registration, accreditation, PAN and GST certificates' },
  { key: 'payout', label: 'Payout account', description: 'Bank account for settlements' },
  { key: 'review', label: 'Review & submit', description: 'Check everything and submit for approval' },
];

function Stepper({ current, onSelect, done }: { current: number; onSelect: (i: number) => void; done: boolean[] }) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
      {STEPS.map((step, i) => {
        const active = i === current;
        return (
          <li key={step.key} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                active
                  ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-raised-dark',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  done[i]
                    ? 'bg-brand-700 text-white'
                    : active
                      ? 'border-2 border-brand-500 text-brand-600'
                      : 'border border-slate-300 text-slate-500 dark:border-slate-600',
                )}
              >
                {done[i] ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function useCompleteness(profile: HospitalProfileOut | undefined) {
  const kyc = useKycDocuments(profile?.id ?? '');
  const accounts = useQuery({ queryKey: qk.payoutAccounts, queryFn: async () => (await financeApi.listPayoutAccountsPage({ page_size: 100 })).items, enabled: !!profile });
  if (!profile) return null;
  const profileDone = Boolean(profile.name && profile.city && profile.address && profile.phone);
  const servicesDone = (profile.languages?.length ?? 0) > 0;
  const specialtiesDone = (profile.specialty_ids?.length ?? profile.specialties?.length ?? 0) > 0;
  const kycDone = REQUIRED_KYC_KINDS.every((r) => (kyc.data ?? []).some((d) => d.kind === r.kind && d.status !== 'rejected'));
  const payoutDone = (accounts.data ?? []).some((a) => a.status === 'active');
  return {
    loading: kyc.isPending || accounts.isPending,
    checks: [profileDone, servicesDone, specialtiesDone, kycDone, payoutDone],
  };
}

function ReviewStep({ profile, checks }: { profile: HospitalProfileOut; checks: boolean[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const submit = useMutation({
    mutationFn: hospitalPortalApi.submitForReview,
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.profile, updated);
      toast.success('Submitted for review. We will notify you once your hospital is approved.');
      navigate('/');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const ready = checks.every(Boolean);
  const canSubmit = profile.status === 'draft' || profile.status === 'rejected';

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {STEPS.slice(0, 5).map((step, i) => (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            {checks[i] ? (
              <CheckCircle2 className="h-5 w-5 text-brand-500" aria-hidden />
            ) : (
              <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" aria-hidden />
            )}
            <span className={checks[i] ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500'}>
              {step.label}
              {!checks[i] && ' - incomplete'}
            </span>
          </li>
        ))}
      </ul>
      {profile.status === 'rejected' && profile.rejection_reason && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
          Previous review feedback: {profile.rejection_reason}
        </p>
      )}
      <p className="text-sm text-slate-500 dark:text-slate-400">
        By submitting you confirm the information and documents are accurate. Our team usually reviews new hospitals
        within 2–3 business days.
      </p>
      {canSubmit ? (
        <Button
          size="lg"
          loading={submit.isPending}
          disabled={!ready}
          icon={<Send className="h-4 w-4" aria-hidden />}
          onClick={() => submit.mutate()}
        >
          Submit for review
        </Button>
      ) : (
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Current status: <StatusBadge status={profile.status} />
        </p>
      )}
    </div>
  );
}

/**
 * Onboarding wizard (draft / rejected hospitals) and the editable hospital profile (all statuses).
 * `mode="onboarding"` shows a stepper with "Save & continue"; `mode="profile"` shows tabs.
 */
export function HospitalSetupPage({ mode }: { mode: 'onboarding' | 'profile' }) {
  useDocumentTitle(mode === 'onboarding' ? 'Onboarding' : 'Hospital profile');
  const profile = useHospitalProfile();
  const { canManage } = useHospital();
  const completeness = useCompleteness(profile.data);
  const [step, setStep] = useState(0);

  if (profile.isPending) return <PageLoader />;
  if (profile.isError) {
    return (
      <>
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        {mode === 'profile' && <MyAccountSection className="mt-8" />}
      </>
    );
  }

  const data = profile.data;
  const checks = completeness?.checks ?? [false, false, false, false, false];
  const done = [...checks, data.status === 'pending_review' || data.status === 'active'];
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const current = STEPS[step]!;
  const readOnly = !canManage;

  const body = (key: StepKey, guided: boolean): ReactNode => {
    if (readOnly && key !== 'review') {
      return key === 'profile' ? (
        <ProfileStep profile={data} readOnly />
      ) : (
        <p className="text-sm text-slate-500">Only hospital owners and admins can edit these settings.</p>
      );
    }
    switch (key) {
      case 'profile':
        return <ProfileStep key={data.updated_at} profile={data} onSaved={guided ? next : undefined} />;
      case 'services':
        return <ServicesStep profile={data} onSaved={guided ? next : undefined} />;
      case 'specialties':
        return <SpecialtiesStep profile={data} onSaved={guided ? next : undefined} />;
      case 'kyc':
        return <KycStep profile={data} onContinue={guided ? next : undefined} />;
      case 'payout':
        return (
          <div className="space-y-4">
            <PayoutAccountSection />
            {guided && (
              <div className="flex justify-end">
                <Button onClick={next}>Continue</Button>
              </div>
            )}
          </div>
        );
      case 'review':
        return <ReviewStep profile={data} checks={checks} />;
    }
  };

  if (mode === 'profile') {
    const tabs = STEPS.filter((s) => s.key !== 'review' || data.status === 'draft' || data.status === 'rejected');
    const active = tabs[Math.min(step, tabs.length - 1)]!;
    return (
      <>
        <PageHeader
          title="Hospital profile"
          description="Keep your public profile, accreditations, KYC and payout details up to date."
          actions={<StatusBadge status={data.status} />}
        />
        <Card>
          <Tabs
            className="px-3"
            tabs={tabs.map((t) => ({ value: t.key, label: t.label }))}
            value={active.key}
            onChange={(key) => setStep(tabs.findIndex((t) => t.key === key))}
          />
          <CardBody>{body(active.key, false)}</CardBody>
        </Card>
        <MyAccountSection className="mt-8" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Set up your hospital"
        description="Complete these steps to list your hospital on Heal India Global and receive international enquiries."
        actions={<StatusBadge status={data.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <Stepper current={step} onSelect={setStep} done={done} />
        <Card>
          <CardHeader title={`${step + 1}. ${current.label}`} description={current.description} />
          <CardBody>{body(current.key, true)}</CardBody>
        </Card>
      </div>
    </>
  );
}
