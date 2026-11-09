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

const ACTION_LABELS: Record<string, string> = {
  'phi.view': 'Viewed',
  'phi.download': 'Downloaded',
  'phi.list': 'Saw in a list',
  'phi.break_glass': 'Emergency access',
};
const RESOURCE_LABELS: Record<string, string> = {
  document: 'a document',
  screening: 'a screening',
  document_analysis: 'an AI report reading',
  voice_transcription: 'a voice transcript',
  patient_profile: 'your medical history',
};
const ROLE_LABELS: Record<string, string> = {
  hospital: 'Hospital',
  agent: 'Your agent',
  admin: 'Heal India Global staff',
  super_admin: 'Heal India Global staff',
  support: 'Care coordinator',
  finance: 'Finance team',
};

export function DownloadMyDataCard() {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await privacyApi.downloadMyData('zip');
      toast.success('Your data is downloading');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Download my data"
        description="Get a copy of everything we hold about you: a ZIP file with your data in a machine-readable format (JSON) and your documents."
      />
      <CardBody>
        <Button icon={<Download className="size-4" aria-hidden />} loading={busy} onClick={() => void download()}>
          Download my data
        </Button>
      </CardBody>
    </Card>
  );
}

export function NomineeCard() {
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
      toast.success('Nominee saved');
      setEditing(false);
      void qc.invalidateQueries({ queryKey: keys.nominee });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: privacyApi.removeNominee,
    onSuccess: () => {
      toast.success('Nominee removed');
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
        title="Nominee"
        description="Choose someone who can use your privacy rights for you if you die or cannot act yourself."
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
            <Field label="Full name" htmlFor="nominee-name" required>
              <Input
                id="nominee-name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                minLength={2}
              />
            </Field>
            <Field label="Relationship to you" htmlFor="nominee-rel" required>
              <Input
                id="nominee-rel"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                required
                minLength={2}
              />
            </Field>
            <Field label="Email" htmlFor="nominee-email" hint="Email or phone is needed">
              <Input id="nominee-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone" htmlFor="nominee-phone">
              <Input id="nominee-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={save.isPending}>
                Save nominee
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
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
                Change
              </Button>
              <Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" icon={<UserRoundCheck className="size-4" aria-hidden />} onClick={startEdit}>
            Add a nominee
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

export function AccessLogCard() {
  const log = useQuery({ queryKey: keys.accessLog, queryFn: privacyApi.accessLog });
  return (
    <Card>
      <CardHeader
        title="Who viewed my records"
        description="Every time someone other than you opens your documents, screenings, AI results or medical history, we record it here."
      />
      <CardBody>
        {log.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : log.isError ? (
          <ErrorState error={log.error} onRetry={() => void log.refetch()} />
        ) : log.data.length === 0 ? (
          <EmptyState icon={<Eye className="size-6" aria-hidden />} title="Nobody else has viewed your records yet" />
        ) : (
          <ul className="divide-y divide-border">
            {log.data.slice(0, 50).map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium text-fg">
                    {entry.viewer_name || ROLE_LABELS[entry.viewer_role ?? ''] || 'Someone'}
                  </span>{' '}
                  <span className="text-muted">({ROLE_LABELS[entry.viewer_role ?? ''] ?? entry.viewer_role})</span>{' '}
                  {(ACTION_LABELS[entry.action] ?? 'Viewed').toLowerCase()} {RESOURCE_LABELS[entry.resource_type ?? ''] ?? 'a record'}
                  {entry.reason ? <span className="block text-xs text-muted">Reason: {entry.reason}</span> : null}
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
  const qc = useQueryClient();
  const requests = useQuery({ queryKey: keys.requests, queryFn: privacyApi.myRequests });
  const contact = useQuery({ queryKey: keys.contact, queryFn: privacyApi.contact, staleTime: 5 * 60_000 });
  const [kind, setKind] = useState<DataRightsRequestKind>('access');
  const [details, setDetails] = useState('');
  const create = useMutation({
    mutationFn: () => privacyApi.createRequest({ kind, details, channel: 'web' }),
    onSuccess: (out) => {
      toast.success(`Request sent. Your reference is ${out.reference}.`);
      setDetails('');
      void qc.invalidateQueries({ queryKey: keys.requests });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const officer = contact.data?.grievance_officer;

  return (
    <Card>
      <CardHeader
        title="Privacy requests and complaints"
        description={`Ask us to correct or erase data, withdraw a consent, or raise a complaint. We reply within ${contact.data?.response_days ?? 30} days.`}
      />
      <CardBody className="space-y-5">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="What do you need?" htmlFor="privacy-kind">
            <Select id="privacy-kind" value={kind} onChange={(e) => setKind(e.target.value as DataRightsRequestKind)}>
              {DATA_RIGHTS_REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DATA_RIGHTS_REQUEST_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details" htmlFor="privacy-details" hint="At least 10 characters" required>
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
            Send request
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
                  <span className="text-xs text-muted">Reply by {formatDate(r.due_at)}</span>
                </div>
                {r.resolution ? <p className="text-muted">Our answer: {r.resolution}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-fg">
            <Mail className="size-4" aria-hidden /> Grievance Officer
          </p>
          {officer?.email || officer?.name ? (
            <p className="text-muted">{[officer.name, officer.email, officer.phone].filter(Boolean).join(' · ')}</p>
          ) : (
            <p className="text-muted">Contact details are listed in our privacy policy.</p>
          )}
          <p className="mt-1 text-xs text-muted">
            If you are not happy with our answer, you can complain to the Data Protection Board of India.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
