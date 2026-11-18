/**
 * Hospital accreditations (trust module): staff see every certificate a hospital claims, admins add / edit /
 * remove them and mark them verified after checking the certificate with the accrediting body. Only verified,
 * unexpired accreditations are shown publicly (`is_public`). Expired or soon-expiring certificates are flagged.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, FileText, Pencil, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { ACCREDITATION_LABELS, ACCREDITATIONS, documentsApi, errorMessage, fieldErrors, type Accreditation } from '@hig/shared/api';
import { toast } from 'sonner';
import { useAppTranslation } from '../../../i18n';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, LoadingState, Modal, Select } from '../ui';
import { Banner, Panel } from '../ui/detail';
import { formatDate, formatNumber } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { phase1AdminApi, phase1Keys, type AccreditationIn, type AccreditationOut } from '../lib/phase1Api';

/** Accrediting bodies offered in the picker; others are typed as a short code. */
export const KNOWN_BODIES = ACCREDITATIONS;
/** Certificates expiring within this many days are flagged. */
export const EXPIRY_WARNING_DAYS = 90;
const DAY_MS = 86_400_000;

export type ExpiryState = { kind: 'none' } | { kind: 'expired'; days: number } | { kind: 'soon'; days: number } | { kind: 'ok'; days: number };

/** Days until `valid_until` (local calendar days; negative when expired). */
export function expiryState(validUntil: string | null | undefined, now = new Date()): ExpiryState {
  if (!validUntil) return { kind: 'none' };
  const [y, m, d] = validUntil.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return { kind: 'none' };
  const end = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((end - today) / DAY_MS);
  if (days < 0) return { kind: 'expired', days: -days };
  if (days <= EXPIRY_WARNING_DAYS) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

/** "jci" -> "JCI" (shared, translated enum labels for the known bodies; other codes upper-cased). */
function useBodyLabel() {
  return (code: string) => ACCREDITATION_LABELS[code as Accreditation] ?? code.toUpperCase();
}

export function ExpiryBadge({ validUntil }: { validUntil: string | null }) {
  const { t } = useAppTranslation();
  const state = expiryState(validUntil);
  if (state.kind === 'expired') return <Badge tone="red">{t('accreditations.expiry.expired', { count: state.days })}</Badge>;
  if (state.kind === 'soon')
    return (
      <Badge tone="amber">
        {state.days === 0 ? t('accreditations.expiry.today') : t('accreditations.expiry.soon', { count: state.days })}
      </Badge>
    );
  return null;
}

export function AccreditationsPanel({ hospitalId, canEdit }: { hospitalId: string; canEdit: boolean }) {
  const { t } = useAppTranslation();
  const bodyLabel = useBodyLabel();
  const key = [...phase1Keys.accreditations, hospitalId] as const;
  const list = useQuery({ queryKey: key, queryFn: () => phase1AdminApi.listAccreditations(hospitalId) });
  const [editing, setEditing] = useState<{ row: AccreditationOut | null } | null>(null);
  const [deleting, setDeleting] = useState<AccreditationOut | null>(null);
  const invalidate = [phase1Keys.accreditations, opsKeys.hospitals] as const;

  const verify = useOpsMutation({
    mutationFn: ({ row, verified }: { row: AccreditationOut; verified: boolean }) => phase1AdminApi.verifyAccreditation(row.id, verified),
    success: (a) =>
      a.verified
        ? t('accreditations.toast.verified', { body: bodyLabel(a.body) })
        : t('accreditations.toast.unverified', { body: bodyLabel(a.body) }),
    invalidate,
  });
  const remove = useOpsMutation({
    mutationFn: (row: AccreditationOut) => phase1AdminApi.deleteAccreditation(row.id),
    success: t('accreditations.toast.deleted'),
    invalidate,
    onSuccess: () => setDeleting(null),
  });

  const rows = useMemo(
    () =>
      [...(list.data ?? [])].sort((a, b) => {
        // unverified first, then soonest expiry
        if (a.verified !== b.verified) return a.verified ? 1 : -1;
        return (a.valid_until ?? '9999').localeCompare(b.valid_until ?? '9999');
      }),
    [list.data],
  );
  const expired = rows.filter((r) => expiryState(r.valid_until).kind === 'expired').length;
  const soon = rows.filter((r) => expiryState(r.valid_until).kind === 'soon').length;
  const unverified = rows.filter((r) => !r.verified).length;

  const openCertificate = async (row: AccreditationOut) => {
    if (!row.document_id) return;
    try {
      const file = await documentsApi.download(row.document_id);
      const url = URL.createObjectURL(file.blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Panel
      title={t('accreditations.title')}
      description={t('accreditations.description')}
      actions={
        canEdit ? (
          <Button size="sm" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setEditing({ row: null })}>
            {t('accreditations.add')}
          </Button>
        ) : undefined
      }
    >
      {list.isLoading ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('accreditations.empty')} description={t('accreditations.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {(expired > 0 || soon > 0) && (
            <Banner tone={expired > 0 ? 'danger' : 'warning'} icon={<AlertTriangle className="size-5" aria-hidden />} title={t('accreditations.expiryTitle')}>
              {[
                expired > 0 ? t('accreditations.expiredCount', { count: expired }) : null,
                soon > 0 ? t('accreditations.soonCount', { count: soon, days: EXPIRY_WARNING_DAYS }) : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Banner>
          )}
          {unverified > 0 && <p className="text-xs text-muted">{t('accreditations.unverifiedCount', { count: unverified })}</p>}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    {bodyLabel(a.body)}
                    {a.verified ? (
                      a.is_public ? (
                        <Badge tone="green">
                          <BadgeCheck className="size-3" aria-hidden /> {t('accreditations.status.public')}
                        </Badge>
                      ) : (
                        <Badge tone="amber">{t('accreditations.status.verifiedExpired')}</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">{t('accreditations.status.unverified')}</Badge>
                    )}
                    <ExpiryBadge validUntil={a.valid_until} />
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[
                      a.certificate_number ? t('accreditations.certificateNo', { number: a.certificate_number }) : t('accreditations.noCertificateNo'),
                      a.valid_until ? t('accreditations.validUntil', { date: formatDate(a.valid_until) }) : t('accreditations.noExpiry'),
                      a.verified && a.verified_at ? t('accreditations.verifiedOn', { date: formatDate(a.verified_at) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.document_id && (
                    <Button size="sm" variant="ghost" icon={<FileText className="size-3.5" aria-hidden />} onClick={() => void openCertificate(a)}>
                      {t('accreditations.certificate')}
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      {a.verified ? (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<ShieldOff className="size-3.5" aria-hidden />}
                          loading={verify.isPending && verify.variables?.row.id === a.id}
                          disabled={verify.isPending}
                          onClick={() => verify.mutate({ row: a, verified: false })}
                        >
                          {t('accreditations.unverify')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<BadgeCheck className="size-3.5" aria-hidden />}
                          loading={verify.isPending && verify.variables?.row.id === a.id}
                          disabled={verify.isPending || expiryState(a.valid_until).kind === 'expired'}
                          title={expiryState(a.valid_until).kind === 'expired' ? t('accreditations.cannotVerifyExpired') : undefined}
                          onClick={() => verify.mutate({ row: a, verified: true })}
                        >
                          {t('accreditations.verify')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('accreditations.editLabel', { body: bodyLabel(a.body) })}
                        icon={<Pencil className="size-3.5" aria-hidden />}
                        onClick={() => setEditing({ row: a })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger-ink"
                        aria-label={t('accreditations.deleteLabel', { body: bodyLabel(a.body) })}
                        icon={<Trash2 className="size-3.5" aria-hidden />}
                        onClick={() => setDeleting(a)}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('accreditations.verifyHint')}</p>
        </div>
      )}
      <AccreditationForm
        open={!!editing}
        row={editing?.row ?? null}
        hospitalId={hospitalId}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title={t('accreditations.deleteTitle')}
        message={t('accreditations.deleteMessage', { body: deleting ? bodyLabel(deleting.body) : '' })}
        confirmLabel={t('accreditations.delete')}
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Panel>
  );
}

const OTHER = '__other';

function AccreditationForm({
  open,
  row,
  hospitalId,
  onClose,
}: {
  open: boolean;
  row: AccreditationOut | null;
  hospitalId: string;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const bodyLabel = useBodyLabel();
  const [body, setBody] = useState('');
  const [other, setOther] = useState('');
  const [certificate, setCertificate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const known = row && (KNOWN_BODIES as readonly string[]).includes(row.body);
    setBody(row ? (known ? row.body : OTHER) : '');
    setOther(row && !known ? row.body : '');
    setCertificate(row?.certificate_number ?? '');
    setValidUntil(row?.valid_until?.slice(0, 10) ?? '');
    setError(null);
  }, [open, row]);

  const save = useOpsMutation({
    mutationFn: (payload: AccreditationIn) =>
      row ? phase1AdminApi.updateAccreditation(row.id, payload) : phase1AdminApi.createAccreditation(hospitalId, payload),
    success: row ? t('accreditations.toast.updated') : t('accreditations.toast.created'),
    invalidate: [phase1Keys.accreditations, opsKeys.hospitals],
    onSuccess: onClose,
  });
  const serverErrors = fieldErrors(save.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = (body === OTHER ? other : body).trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9][a-z0-9-]{1,19}$/.test(code)) {
      setError(t('accreditations.form.bodyError'));
      return;
    }
    setError(null);
    save.mutate({
      body: code,
      certificate_number: certificate.trim() || null,
      valid_until: validUntil || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('accreditations.form.editTitle') : t('accreditations.form.newTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button type="submit" form="accreditation-form" loading={save.isPending}>
            {row ? t('accreditations.form.save') : t('accreditations.form.create')}
          </Button>
        </>
      }
    >
      <form id="accreditation-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label={t('accreditations.form.body')} required error={error ?? serverErrors.body ?? null}>
          {(id) => (
            <Select
              id={id}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('accreditations.form.choose')}
              options={[
                ...KNOWN_BODIES.map((code) => ({ value: code, label: bodyLabel(code) })),
                { value: OTHER, label: t('accreditations.form.other') },
              ]}
            />
          )}
        </Field>
        {body === OTHER ? (
          <Field label={t('accreditations.form.code')} required hint={t('accreditations.form.codeHint')}>
            {(id) => <Input id={id} value={other} maxLength={20} dir="ltr" onChange={(e) => setOther(e.target.value)} />}
          </Field>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Field label={t('accreditations.form.certificateNumber')} error={serverErrors.certificate_number ?? null}>
          {(id) => <Input id={id} value={certificate} maxLength={100} onChange={(e) => setCertificate(e.target.value)} />}
        </Field>
        <Field label={t('accreditations.form.validUntil')} error={serverErrors.valid_until ?? null}>
          {(id) => <Input id={id} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />}
        </Field>
        {row?.verified && <p className="text-xs text-warning-ink sm:col-span-2">{t('accreditations.form.reverifyNote')}</p>}
        <p className="text-xs text-muted sm:col-span-2">
          {t('accreditations.form.certificateNote', { days: formatNumber(EXPIRY_WARNING_DAYS) })}
        </p>
      </form>
    </Modal>
  );
}
