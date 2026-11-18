/**
 * Privacy & account tab: download my data (DPDP / GDPR access + portability), nominee (DPDP s.14), who viewed my
 * records (PHI access log), data-rights requests / grievances and the Grievance Officer contact.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Mail, UserRoundCheck } from 'lucide-react';
import {
  DATA_RIGHTS_REQUEST_KIND_LABELS,
  DATA_RIGHTS_REQUEST_KINDS,
  DATA_RIGHTS_REQUEST_STATUS_LABELS,
  errorMessage,
  privacyApi,
  type DataRightsRequestKind,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { formatDate, formatDateTime } from '../../lib/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../../ui/primitives';

const keys = {
  nominee: ['privacy', 'nominee'] as const,
  accessLog: ['privacy', 'access-log'] as const,
  requests: ['privacy', 'requests'] as const,
  contact: ['privacy', 'contact'] as const,
};

/** Access-log codes -> catalog keys (`profile.privacyData.log.*`); unknown codes fall back to a generic text. */
const ACTION_KEYS: Record<string, string> = {
  'phi.view': 'view',
  'phi.download': 'download',
  'phi.list': 'list',
  'phi.break_glass': 'breakGlass',
};
const RESOURCE_KEYS: Record<string, string> = {
  document: 'document',
  screening: 'screening',
  document_analysis: 'documentAnalysis',
  voice_transcription: 'voiceTranscription',
  patient_profile: 'patientProfile',
};
const ROLE_KEYS: Record<string, string> = {
  hospital: 'hospital',
  agent: 'agent',
  admin: 'staff',
  super_admin: 'staff',
  support: 'support',
  finance: 'finance',
};

export function DownloadMyDataCard() {
  const { t } = useAppTranslation();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await privacyApi.downloadMyData('zip');
      toast.success(t('profile.privacyData.download.started'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title={t('profile.privacyData.download.title')}
        description={t('profile.privacyData.download.description')}
      />
      <CardBody>
        <Button icon={<Download className="size-4" aria-hidden />} loading={busy} onClick={() => void download()}>
          {t('profile.privacyData.download.button')}
        </Button>
      </CardBody>
    </Card>
  );
}

export function NomineeCard() {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const nominee = useQuery({ queryKey: keys.nominee, queryFn: privacyApi.nominee });
  const [form, setForm] = useState({ full_name: '', relationship: '', email: '', phone: '' });
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      privacyApi.setNominee({
        full_name: form.full_name,
        relationship: form.relationship,
        email: form.email || null,
        phone: form.phone || null,
      }),
    onSuccess: () => {
      toast.success(t('profile.privacyData.nominee.saved'));
      setEditing(false);
      void qc.invalidateQueries({ queryKey: keys.nominee });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: privacyApi.removeNominee,
    onSuccess: () => {
      toast.success(t('profile.privacyData.nominee.removed'));
      void qc.invalidateQueries({ queryKey: keys.nominee });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const startEdit = () => {
    const n = nominee.data;
    setForm({
      full_name: n?.full_name ?? '',
      relationship: n?.relationship ?? '',
      email: n?.email ?? '',
      phone: n?.phone ?? '',
    });
    setEditing(true);
  };

  return (
    <Card>
      <CardHeader
        title={t('profile.privacyData.nominee.title')}
        description={t('profile.privacyData.nominee.description')}
      />
      <CardBody className="space-y-4">
        {nominee.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : nominee.isError ? (
          <ErrorState error={nominee.error} onRetry={() => void nominee.refetch()} />
        ) : editing ? (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label={t('profile.privacyData.nominee.fullName')} htmlFor="nominee-name" required>
              <Input
                id="nominee-name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                minLength={2}
              />
            </Field>
            <Field label={t('profile.privacyData.nominee.relationship')} htmlFor="nominee-rel" required>
              <Input
                id="nominee-rel"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                required
                minLength={2}
              />
            </Field>
            <Field label={t('profile.privacyData.nominee.email')} htmlFor="nominee-email" hint={t('profile.privacyData.nominee.contactHint')}>
              <Input id="nominee-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t('profile.privacyData.nominee.phone')} htmlFor="nominee-phone">
              <Input id="nominee-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={save.isPending}>
                {t('profile.privacyData.nominee.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t('profile.privacyData.cancel')}
              </Button>
            </div>
          </form>
        ) : nominee.data ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-fg">
                {nominee.data.full_name} <span className="text-muted">({nominee.data.relationship})</span>
              </p>
              <p className="text-sm text-muted">{[nominee.data.email, nominee.data.phone].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={startEdit}>
                {t('profile.privacyData.nominee.change')}
              </Button>
              <Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>
                {t('profile.privacyData.nominee.remove')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" icon={<UserRoundCheck className="size-4" aria-hidden />} onClick={startEdit}>
            {t('profile.privacyData.nominee.add')}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

export function AccessLogCard() {
  const { t } = useAppTranslation();
  const roleLabel = (role: string | null | undefined) =>
    role && ROLE_KEYS[role] ? t(`profile.privacyData.log.roles.${ROLE_KEYS[role]}`) : (role ?? '');
  const log = useQuery({ queryKey: keys.accessLog, queryFn: privacyApi.accessLog });
  return (
    <Card>
      <CardHeader
        title={t('profile.privacyData.log.title')}
        description={t('profile.privacyData.log.description')}
      />
      <CardBody>
        {log.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : log.isError ? (
          <ErrorState error={log.error} onRetry={() => void log.refetch()} />
        ) : log.data.length === 0 ? (
          <EmptyState icon={<Eye className="size-6" aria-hidden />} title={t('profile.privacyData.log.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {log.data.slice(0, 50).map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span>
                  {t(`profile.privacyData.log.actions.${ACTION_KEYS[entry.action] ?? 'view'}`, {
                    who: entry.viewer_name || roleLabel(entry.viewer_role) || t('profile.privacyData.log.someone'),
                    role: roleLabel(entry.viewer_role),
                    what: t(`profile.privacyData.log.resources.${RESOURCE_KEYS[entry.resource_type ?? ''] ?? 'record'}`),
                  })}
                  {entry.reason ? (
                    <span className="block text-xs text-muted">{t('profile.privacyData.log.reason', { reason: entry.reason })}</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted">{formatDateTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function PrivacyRequestsCard() {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const requests = useQuery({ queryKey: keys.requests, queryFn: privacyApi.myRequests });
  const contact = useQuery({ queryKey: keys.contact, queryFn: privacyApi.contact, staleTime: 5 * 60_000 });
  const [kind, setKind] = useState<DataRightsRequestKind>('access');
  const [details, setDetails] = useState('');
  const create = useMutation({
    mutationFn: () => privacyApi.createRequest({ kind, details, channel: 'web' }),
    onSuccess: (out) => {
      toast.success(t('profile.privacyData.requests.sent', { reference: out.reference }));
      setDetails('');
      void qc.invalidateQueries({ queryKey: keys.requests });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const officer = contact.data?.grievance_officer;

  return (
    <Card>
      <CardHeader
        title={t('profile.privacyData.requests.title')}
        description={t('profile.privacyData.requests.description', { count: contact.data?.response_days ?? 30 })}
      />
      <CardBody className="space-y-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label={t('profile.privacyData.requests.kind')} htmlFor="privacy-kind">
            <Select id="privacy-kind" value={kind} onChange={(e) => setKind(e.target.value as DataRightsRequestKind)}>
              {DATA_RIGHTS_REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DATA_RIGHTS_REQUEST_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.privacyData.requests.details')} htmlFor="privacy-details" hint={t('profile.privacyData.requests.detailsHint')} required>
            <Textarea
              id="privacy-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              minLength={10}
              maxLength={5000}
              required
            />
          </Field>
          <Button type="submit" loading={create.isPending} disabled={details.trim().length < 10}>
            {t('profile.privacyData.requests.send')}
          </Button>
        </form>

        {requests.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : requests.data.length ? (
          <ul className="divide-y divide-border">
            {requests.data.map((r) => (
              <li key={r.id} className="space-y-1 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{r.reference}</span>
                  <span>{DATA_RIGHTS_REQUEST_KIND_LABELS[r.kind]}</span>
                  <Badge tone={r.status === 'completed' ? 'green' : r.status === 'rejected' ? 'red' : 'blue'}>
                    {DATA_RIGHTS_REQUEST_STATUS_LABELS[r.status]}
                  </Badge>
                  <span className="text-xs text-muted">{t('profile.privacyData.requests.replyBy', { date: formatDate(r.due_at) })}</span>
                </div>
                {r.resolution ? <p className="text-muted">{t('profile.privacyData.requests.answer', { answer: r.resolution })}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-fg">
            <Mail className="size-4" aria-hidden /> {t('profile.privacyData.officer.title')}
          </p>
          {officer?.email || officer?.name ? (
            <p className="text-muted">{[officer.name, officer.email, officer.phone].filter(Boolean).join(' · ')}</p>
          ) : (
            <p className="text-muted">{t('profile.privacyData.officer.inPolicy')}</p>
          )}
          <p className="mt-1 text-xs text-muted">{t('profile.privacyData.officer.board')}</p>
        </div>
      </CardBody>
    </Card>
  );
}
