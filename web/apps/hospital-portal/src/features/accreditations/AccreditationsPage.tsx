import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Download, FileCheck2, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { api, documentsApi, errorMessage, type AccreditationIn, type AccreditationOut } from '@hig/shared/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FileButton,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { useAppTranslation } from '../../i18n';
import { formatDate, toDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const BASE = '/hospital-portal/accreditations';
const accreditationsKey = ['hospital-accreditations'] as const;

/** Common accrediting bodies (codes as stored by the API); anything else is typed as a short code. */
const KNOWN_BODIES = ['jci', 'nabh', 'nabl', 'iso', 'nabh-entry', 'cap'] as const;
const BODY_LABELS: Record<string, string> = {
  jci: 'JCI',
  nabh: 'NABH',
  'nabh-entry': 'NABH Entry Level',
  nabl: 'NABL',
  iso: 'ISO',
  cap: 'CAP',
};
const bodyLabel = (code: string) => BODY_LABELS[code] ?? code.toUpperCase();

/** Days until `valid_until` (negative = expired); null without a date. */
function daysLeft(validUntil: string | null): number | null {
  const d = toDate(validUntil);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

const EXPIRY_WARNING_DAYS = 90;

function ExpiryNote({ value }: { value: AccreditationOut }) {
  const { t } = useAppTranslation();
  const left = daysLeft(value.valid_until);
  if (left === null) return <span className="text-muted">{t('accreditations.noExpiry')}</span>;
  if (left < 0)
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge tone="red">{t('accreditations.expired')}</Badge>
        <span className="text-xs text-muted">{formatDate(value.valid_until)}</span>
      </span>
    );
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{formatDate(value.valid_until)}</span>
      {left <= EXPIRY_WARNING_DAYS && (
        <Badge tone="amber">{left === 0 ? t('accreditations.expiresToday') : t('accreditations.expiresIn', { count: left })}</Badge>
      )}
    </span>
  );
}

function VerificationBadge({ value }: { value: AccreditationOut }) {
  const { t } = useAppTranslation();
  if (value.is_public) return <Badge tone="green">{t('accreditations.status.public')}</Badge>;
  if (value.verified) return <Badge tone="red">{t('accreditations.status.verifiedExpired')}</Badge>;
  return <Badge tone="amber">{t('accreditations.status.pending')}</Badge>;
}

export function AccreditationsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('accreditations.title'));
  const { canManage, current } = useHospital();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AccreditationOut | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AccreditationOut | null>(null);
  const list = useQuery({ queryKey: [...accreditationsKey, current?.id], queryFn: () => api.get<AccreditationOut[]>(BASE) });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success(t('accreditations.deleted'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: accreditationsKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const download = async (a: AccreditationOut) => {
    if (!a.document_id) return;
    try {
      const doc = await documentsApi.get(a.document_id);
      await documentsApi.downloadAndSave(doc);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const items = [...(list.data ?? [])].sort((a, b) => (daysLeft(a.valid_until) ?? 1e9) - (daysLeft(b.valid_until) ?? 1e9));
  const expiring = items.filter((a) => {
    const left = daysLeft(a.valid_until);
    return left !== null && left <= EXPIRY_WARNING_DAYS;
  });

  return (
    <>
      <PageHeader
        title={t('accreditations.title')}
        description={t('accreditations.description')}
        actions={
          canManage ? (
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
              {t('accreditations.add')}
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <Alert tone="blue" icon={<FileCheck2 className="size-5" aria-hidden />} title={t('accreditations.howTitle')}>
          {t('accreditations.howBody')}
        </Alert>
        {expiring.length > 0 && (
          <Alert tone="amber" icon={<ShieldAlert className="size-5" aria-hidden />} title={t('accreditations.expiringTitle', { count: expiring.length })}>
            {t('accreditations.expiringBody')}
          </Alert>
        )}
        <Card>
          {list.isPending ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Award className="size-6" aria-hidden />}
              title={t('accreditations.emptyTitle')}
              description={t('accreditations.emptyDescription')}
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={a.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-fg">
                      <Award className="size-4 text-accent-ink" aria-hidden /> {bodyLabel(a.body)}
                    </p>
                    <p className="text-xs text-muted">
                      {a.certificate_number ? t('accreditations.certificateNo', { number: a.certificate_number }) : t('accreditations.noCertificateNo')}
                    </p>
                  </div>
                  <div className="text-sm">
                    <span className="block text-xs text-muted sm:sr-only">{t('accreditations.validUntil')}</span>
                    <ExpiryNote value={a} />
                  </div>
                  <div>
                    <VerificationBadge value={a} />
                    {a.verified_at && <p className="mt-1 text-xs text-muted">{t('accreditations.verifiedOn', { date: formatDate(a.verified_at) })}</p>}
                  </div>
                  <div className="flex flex-wrap justify-start gap-1 sm:justify-end">
                    {a.document_id && (
                      <Button variant="ghost" size="icon" aria-label={t('accreditations.downloadAria', { body: bodyLabel(a.body) })} onClick={() => void download(a)}>
                        <Download className="size-4" aria-hidden />
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <Button variant="ghost" size="icon" aria-label={t('accreditations.editAria', { body: bodyLabel(a.body) })} onClick={() => setEditing(a)}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={t('accreditations.deleteAria', { body: bodyLabel(a.body) })} onClick={() => setDeleting(a)}>
                          <Trash2 className="size-4 text-danger-ink" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && <AccreditationFormModal value={editing === 'new' ? null : editing} hospitalId={current?.id} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        tone="danger"
        title={t('accreditations.deleteTitle', { body: deleting ? bodyLabel(deleting.body) : '' })}
        description={t('accreditations.deleteDescription')}
        confirmLabel={t('common.delete')}
      />
    </>
  );
}

function AccreditationFormModal({ value, hospitalId, onClose }: { value: AccreditationOut | null; hospitalId?: string; onClose: () => void }) {
  const { t } = useAppTranslation();
  const ids = useId();
  const queryClient = useQueryClient();
  const known = value ? (KNOWN_BODIES as readonly string[]).includes(value.body) : true;
  const [bodyChoice, setBodyChoice] = useState<string>(value ? (known ? value.body : 'other') : 'nabh');
  const [otherBody, setOtherBody] = useState(value && !known ? value.body : '');
  const [certificate, setCertificate] = useState(value?.certificate_number ?? '');
  const [validUntil, setValidUntil] = useState(value?.valid_until ?? '');
  const [documentId, setDocumentId] = useState<string | null>(value?.document_id ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload({ file, kind: 'kyc_accreditation', hospital_id: hospitalId }),
    onSuccess: (doc) => {
      setDocumentId(doc.id);
      setFileName(doc.file_name);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: (body: AccreditationIn) =>
      value ? api.patch<AccreditationOut>(`${BASE}/${encodeURIComponent(value.id)}`, body) : api.post<AccreditationOut>(BASE, body),
    onSuccess: () => {
      toast.success(value ? t('accreditations.updated') : t('accreditations.added'));
      void queryClient.invalidateQueries({ queryKey: accreditationsKey });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    const body = (bodyChoice === 'other' ? otherBody : bodyChoice).trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9][a-z0-9-]{1,19}$/.test(body)) {
      setError(t('accreditations.form.bodyError'));
      return;
    }
    setError(null);
    save.mutate({
      body,
      certificate_number: certificate.trim() || null,
      valid_until: validUntil || null,
      document_id: documentId,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={value ? t('accreditations.form.editTitle') : t('accreditations.form.addTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={upload.isPending} onClick={submit}>
            {value ? t('common.saveChanges') : t('accreditations.add')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {value?.verified && (
          <Alert tone="amber" icon={<ShieldAlert className="size-5" aria-hidden />} title={t('accreditations.form.reverifyTitle')}>
            {t('accreditations.form.reverifyBody')}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('accreditations.form.body')} htmlFor={`${ids}-body`} required>
            <Select
              id={`${ids}-body`}
              value={bodyChoice}
              onChange={(e) => setBodyChoice(e.target.value)}
              options={[...KNOWN_BODIES.map((b) => ({ value: b, label: bodyLabel(b) })), { value: 'other', label: t('accreditations.form.otherBody') }]}
            />
          </FormField>
          {bodyChoice === 'other' && (
            <FormField label={t('accreditations.form.otherCode')} htmlFor={`${ids}-other`} hint={t('accreditations.form.otherHint')} required>
              <Input id={`${ids}-other`} dir="ltr" value={otherBody} maxLength={20} onChange={(e) => setOtherBody(e.target.value)} />
            </FormField>
          )}
          <FormField label={t('accreditations.form.certificateNo')} htmlFor={`${ids}-cert`}>
            <Input id={`${ids}-cert`} dir="ltr" value={certificate} maxLength={100} onChange={(e) => setCertificate(e.target.value)} />
          </FormField>
          <FormField label={t('accreditations.validUntil')} htmlFor={`${ids}-valid`}>
            <Input id={`${ids}-valid`} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </FormField>
        </div>
        <FormField label={t('accreditations.form.certificate')} hint={t('accreditations.form.certificateHint')}>
          <div className="flex flex-wrap items-center gap-2">
            <FileButton loading={upload.isPending} onFile={(file) => upload.mutate(file)} onInvalid={(m) => toast.error(m)} accept=".pdf,application/pdf,image/*">
              {documentId ? t('accreditations.form.replaceFile') : t('accreditations.form.uploadFile')}
            </FileButton>
            {documentId && (
              <span className="text-sm text-muted">{fileName ?? t('accreditations.form.fileAttached')}</span>
            )}
          </div>
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
