import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, PartyPopper, Send, ShieldCheck } from 'lucide-react';
import {
  AGENT_TIER_LABELS,
  DOCUMENT_KIND_LABELS,
  KYC_DOCUMENT_KINDS,
  agentPortalApi,
  authApi,
  documentsApi,
  errorMessage,
  fieldErrors,
  type AgentProfileOut,
} from '@hig/shared/api';
import { DeleteAccountSection } from '@hig/shared/auth';
import { useAuth } from '../../auth/AuthProvider';
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  FormField,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  StatusBadge,
} from '../../components/ui';
import { COUNTRY_OPTIONS } from '../../lib/constants';
import { qk, useAgentProfile } from '../../lib/queries';
import { formatBps, formatDate, useDocumentTitle } from '../../lib/shared';
import { DocumentList, DocumentUploader } from '../documents/Documents';

const REQUIRED_KYC = ['kyc_registration', 'kyc_id_proof'] as const;

const profileSchema = z.object({
  agency_name: z.string().trim().min(2, 'Enter your agency name').max(160),
  country: z.string().length(2, 'Select a country'),
  city: z.string().trim().min(2, 'Enter your city').max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((v) => /^\+?[0-9 ()-]{6,}$/.test(v), 'Enter a valid phone number with country code'),
  website: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === '' || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), 'Enter a full URL, e.g. https://example.com'),
});
type ProfileValues = z.infer<typeof profileSchema>;

export function ProfilePage() {
  useDocumentTitle('Profile & KYC');
  const [params] = useSearchParams();
  const profile = useAgentProfile();

  if (profile.isPending) return <LoadingBlock />;
  if (profile.isError) {
    return (
      <div className="space-y-6">
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        <AccountDeletionCard />
      </div>
    );
  }
  const p = profile.data;

  return (
    <div>
      <PageHeader title="Profile & KYC" description="Your agency details and verification documents." />
      {params.get('welcome') === '1' && p.kyc_status === 'not_submitted' && (
        <div className="mb-6 flex gap-3 rounded-xl border border-primary/40 bg-primary-soft p-4 text-sm">
          <PartyPopper className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
          <div>
            <p className="font-semibold">Welcome to Heal India Global!</p>
            <p className="text-muted">
              Complete your agency details and upload your registration certificate and ID proof, then submit for review.
              You can add patients and send enquiries while we verify your agency.
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <AgencyForm profile={p} />
          <KycSection profile={p} />
        </div>
        <div className="space-y-6">
          <StatusCard profile={p} />
          <PasswordCard />
          <AccountDeletionCard />
        </div>
      </div>
    </div>
  );
}

function AccountDeletionCard() {
  const { user } = useAuth();
  return <DeleteAccountSection user={user} audience="agent" />;
}

function StatusCard({ profile: p }: { profile: AgentProfileOut }) {
  return (
    <Card>
      <CardHeader title="Account status" />
      <dl className="space-y-3 p-5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Agent code</dt>
          <dd className="font-mono font-semibold">{p.agent_code}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Account</dt>
          <dd>
            <StatusBadge kind="agent" status={p.status} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">KYC</dt>
          <dd>
            <StatusBadge kind="kyc" status={p.kyc_status} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Tier</dt>
          <dd>{AGENT_TIER_LABELS[p.tier]}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Commission rate</dt>
          <dd>{p.commission_rate_bps != null ? formatBps(p.commission_rate_bps) : 'Platform standard'}</dd>
        </div>
        {p.approved_at && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Approved</dt>
            <dd>{formatDate(p.approved_at)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Member since</dt>
          <dd>{formatDate(p.created_at)}</dd>
        </div>
      </dl>
      {p.rejection_reason && (p.kyc_status === 'rejected' || p.status === 'rejected') && (
        <p className="border-t border-border px-5 py-3 text-sm text-danger">Reason: {p.rejection_reason}</p>
      )}
    </Card>
  );
}

function AgencyForm({ profile: p }: { profile: AgentProfileOut }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      agency_name: p.agency_name,
      country: p.country ?? '',
      city: p.city ?? '',
      phone: p.phone ?? '',
      website: p.website ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (v: ProfileValues) =>
      agentPortalApi.updateProfile({ agency_name: v.agency_name, country: v.country, city: v.city, phone: v.phone, website: v.website || null }),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.profile, updated);
      toast.success('Agency details saved');
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      let mapped = false;
      for (const [key, message] of Object.entries(fields)) {
        if (key in profileSchema.shape) {
          setError(key as keyof ProfileValues, { message });
          mapped = true;
        }
      }
      if (!mapped) toast.error(errorMessage(error));
    },
  });
  return (
    <Card>
      <CardHeader title="Agency details" description="Shown to hospitals and our verification team" />
      <form noValidate className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormField label="Agency name" htmlFor="ag-name" error={errors.agency_name?.message} required className="sm:col-span-2">
          <Input id="ag-name" autoComplete="organization" {...register('agency_name')} />
        </FormField>
        <FormField label="Country" htmlFor="ag-country" error={errors.country?.message} required>
          <Select id="ag-country" {...register('country')}>
            <option value="">Select…</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="City" htmlFor="ag-city" error={errors.city?.message} required>
          <Input id="ag-city" autoComplete="address-level2" {...register('city')} />
        </FormField>
        <FormField label="Phone / WhatsApp" htmlFor="ag-phone" error={errors.phone?.message} required>
          <Input id="ag-phone" type="tel" autoComplete="tel" {...register('phone')} />
        </FormField>
        <FormField label="Website" htmlFor="ag-web" error={errors.website?.message}>
          <Input id="ag-web" type="url" placeholder="https://" {...register('website')} />
        </FormField>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save details
          </Button>
        </div>
      </form>
    </Card>
  );
}

function KycSection({ profile: p }: { profile: AgentProfileOut }) {
  const queryClient = useQueryClient();
  // one request per KYC kind so the agent's own KYC files are never crowded out by patient documents
  const docs = useQueries({
    queries: KYC_DOCUMENT_KINDS.map((kind) => ({
      queryKey: qk.documents({ kind }),
      queryFn: () => documentsApi.list({ kind }),
    })),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
      error: results.find((r) => r.error)?.error ?? null,
      refetch: () => results.forEach((r) => void r.refetch()),
    }),
  });
  const kycDocs = docs.data
    .filter((d) => !d.patient_id && !d.case_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const missing = REQUIRED_KYC.filter((k) => !kycDocs.some((d) => d.kind === k && d.status !== 'rejected'));
  const profileComplete = Boolean(p.agency_name && p.country && p.city && p.phone);
  const canSubmit = (p.kyc_status === 'not_submitted' || p.kyc_status === 'rejected') && missing.length === 0 && profileComplete;
  const locked = p.kyc_status === 'pending' || p.kyc_status === 'approved';

  const submit = useMutation({
    mutationFn: agentPortalApi.submitKyc,
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.profile, updated);
      toast.success('KYC submitted for review. We will notify you once it is reviewed.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> KYC documents
          </span>
        }
        description="Registration certificate and ID proof are required. Add PAN/GST and a bank proof if available."
        actions={<StatusBadge kind="kyc" status={p.kyc_status} />}
      />
      <div className="space-y-4 border-b border-border p-5">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {REQUIRED_KYC.map((k) => {
            const done = !missing.includes(k);
            return (
              <li key={k} className="flex items-center gap-2">
                <CheckCircle2 className={done ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-border'} aria-hidden />
                <span className={done ? '' : 'text-muted'}>{DOCUMENT_KIND_LABELS[k]}</span>
                <span className="sr-only">{done ? 'uploaded' : 'missing'}</span>
              </li>
            );
          })}
          <li className="flex items-center gap-2">
            <CheckCircle2 className={profileComplete ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-border'} aria-hidden />
            <span className={profileComplete ? '' : 'text-muted'}>Agency details complete</span>
          </li>
        </ul>
        {!locked && <DocumentUploader kinds={KYC_DOCUMENT_KINDS} target={{}} />}
        {locked && (
          <p className="text-sm text-muted">
            {p.kyc_status === 'pending' ? 'Your documents are under review and cannot be changed right now.' : 'Your agency is verified.'}
          </p>
        )}
      </div>
      {docs.isPending ? (
        <LoadingBlock />
      ) : docs.isError ? (
        <ErrorState error={docs.error} onRetry={docs.refetch} />
      ) : (
        <DocumentList documents={kycDocs} emptyText="No KYC documents uploaded yet." canDelete={(d) => !locked && d.status !== 'verified'} />
      )}
      {!locked && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border p-5">
          {!canSubmit && (
            <p className="text-xs text-muted">
              {missing.length > 0
                ? `Upload: ${missing.map((k) => DOCUMENT_KIND_LABELS[k].replace('KYC - ', '')).join(', ')}`
                : !profileComplete
                  ? 'Complete your agency details first'
                  : ''}
            </p>
          )}
          <Button icon={<Send className="h-4 w-4" aria-hidden />} disabled={!canSubmit} loading={submit.isPending} onClick={() => submit.mutate()}>
            {p.kyc_status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}
          </Button>
        </div>
      )}
    </Card>
  );
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .max(128)
      .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one digit'),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });
  const change = useMutation({
    mutationFn: (v: PasswordValues) => authApi.changePassword({ current_password: v.current_password, new_password: v.new_password }),
    onSuccess: () => {
      toast.success('Password changed');
      reset();
      setOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader title="Sign-in & security" />
      <div className="space-y-3 p-5 text-sm">
        <p>
          <span className="text-muted">Signed in as</span> <span className="font-medium">{user?.email}</span>
        </p>
        <p>
          <span className="text-muted">Two-factor authentication:</span> {user?.mfa_enabled ? 'On' : 'Off'}
        </p>
        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Change password
          </Button>
        ) : (
          <form noValidate className="space-y-3" onSubmit={handleSubmit((v) => change.mutate(v))}>
            <FormField label="Current password" htmlFor="pw-cur" error={errors.current_password?.message}>
              <Input id="pw-cur" type="password" autoComplete="current-password" {...register('current_password')} />
            </FormField>
            <FormField label="New password" htmlFor="pw-new" error={errors.new_password?.message}>
              <Input id="pw-new" type="password" autoComplete="new-password" {...register('new_password')} />
            </FormField>
            <FormField label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm?.message}>
              <Input id="pw-confirm" type="password" autoComplete="new-password" {...register('confirm')} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={change.isPending}>
                Update password
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
