/**
 * Privacy requests and grievances (DPDP Act s.13 / GDPR Art. 12): the staff queue. Oldest due date first;
 * overdue requests are flagged. Closing a request needs an answer for the requester, who is notified.
 * Also lists guardian consents (patients under 18) waiting for identity verification.
 */
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import {
  DATA_RIGHTS_REQUEST_KIND_LABELS,
  DATA_RIGHTS_REQUEST_STATUS_LABELS,
  DATA_RIGHTS_REQUEST_STATUSES,
  type DataRightsRequestKind,
  errorMessage,
  privacyAdminApi,
  type AdminDataRightsRequestOut,
  type DataRightsRequestStatus,
} from '@hig/shared/api';
import { useDocumentTitle } from '@hig/shared/lib';
import { useAppTranslation } from '../../../i18n';
import { Badge, Button, Card, CardBody, CardHeader, FormField, PageHeader, Select, Textarea } from '@hig/shared/ui';
import { formatDateTime } from '../lib/format';

type View = 'open' | 'overdue' | 'all';
const keys = {
  list: (view: View, page: number) => ['privacy', 'requests', view, page] as const,
  guardians: ['privacy', 'guardian-consents'] as const,
};

function kindLabel(t: TFunction, kind: DataRightsRequestKind): string {
  return t(`privacy.kinds.${kind}`, { defaultValue: DATA_RIGHTS_REQUEST_KIND_LABELS[kind] ?? kind });
}

function statusLabel(t: TFunction, status: DataRightsRequestStatus): string {
  return t(`privacy.statuses.${status}`, { defaultValue: DATA_RIGHTS_REQUEST_STATUS_LABELS[status] ?? status });
}

function statusTone(status: DataRightsRequestStatus): 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'awaiting_requester') return 'warning';
  return 'info';
}

function RequestEditor({ request, onDone }: { request: AdminDataRightsRequestOut; onDone: () => void }) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<DataRightsRequestStatus>(request.status);
  const [resolution, setResolution] = useState(request.resolution ?? '');
  const [notes, setNotes] = useState(request.internal_notes ?? '');
  const save = useMutation({
    mutationFn: () =>
      privacyAdminApi.updateRequest(request.id, {
        status,
        resolution: resolution.trim() || null,
        internal_notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('privacy.toast.updated', { reference: request.reference }));
      void qc.invalidateQueries({ queryKey: ['privacy', 'requests'] });
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const closing = status === 'completed' || status === 'rejected';
  return (
    <form
      className="mt-3 grid gap-3 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <FormField label={t('privacy.form.status')}>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as DataRightsRequestStatus)}
          options={DATA_RIGHTS_REQUEST_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }))}
        />
      </FormField>
      <FormField
        label={t('privacy.form.answer')}
        hint={t('privacy.form.answerHint')}
        required={closing}
      >
        <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={5000} />
      </FormField>
      <FormField label={t('privacy.form.notes')} hint={t('privacy.form.notesHint')}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending} disabled={closing && !resolution.trim()}>
          {t('privacy.form.save')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('privacy.form.cancel')}
        </Button>
      </div>
    </form>
  );
}

function GuardianQueue() {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: keys.guardians, queryFn: privacyAdminApi.pendingGuardianConsents });
  const verify = useMutation({
    mutationFn: (id: string) => privacyAdminApi.verifyGuardianConsent(id),
    onSuccess: () => {
      toast.success(t('privacy.guardian.verified'));
      void qc.invalidateQueries({ queryKey: keys.guardians });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (!pending.data?.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader
        title={t('privacy.guardian.title')}
        description={t('privacy.guardian.description')}
      />
      <CardBody>
        <ul className="divide-y divide-border">
          {pending.data.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium text-fg">{g.guardian_name}</span> ({g.relationship}) ·{' '}
                {[g.guardian_email, g.guardian_phone].filter(Boolean).join(' · ')} ·{' '}
                {g.verification_reference
                  ? t('privacy.guardian.checkedByRef', { method: g.verification_method, reference: g.verification_reference })
                  : t('privacy.guardian.checkedBy', { method: g.verification_method })}{' '}
                · {formatDateTime(g.created_at)}
              </span>
              <Button size="sm" loading={verify.isPending && verify.variables === g.id} onClick={() => verify.mutate(g.id)}>
                {t('privacy.guardian.markVerified')}
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export default function PrivacyRequestsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('privacy.title'));
  const [view, setView] = useState<View>('open');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const list = useQuery({
    queryKey: keys.list(view, page),
    queryFn: () =>
      privacyAdminApi.requests({
        page,
        page_size: 25,
        open: view === 'open' ? true : undefined,
        overdue: view === 'overdue' ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title={t('privacy.title')}
        description={t('privacy.description')}
      />
      <GuardianQueue />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('privacy.filterLabel')}>
        {(['open', 'overdue', 'all'] as const).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? 'primary' : 'outline'}
            onClick={() => {
              setView(v);
              setPage(1);
            }}
          >
            {t(`privacy.views.${v}`)}
          </Button>
        ))}
      </div>
      {list.isError ? (
        <p className="text-sm text-danger">{errorMessage(list.error)}</p>
      ) : !list.data ? (
        <p className="text-sm text-muted">{t('privacy.loading')}</p>
      ) : list.data.items.length === 0 ? (
        <p className="text-sm text-muted">{t('privacy.empty')}</p>
      ) : (
        <div className="space-y-3">
          {list.data.items.map((r) => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">{r.reference}</span>
                  <span>{kindLabel(t, r.kind)}</span>
                  <Badge tone={statusTone(r.status)}>{statusLabel(t, r.status)}</Badge>
                  {r.overdue ? <Badge tone="danger">{t('privacy.overdue')}</Badge> : null}
                  <span className="ms-auto text-xs text-muted">{t('privacy.due', { date: formatDateTime(r.due_at) })}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {r.requester_name}
                  {r.requester_email ? ` · ${r.requester_email}` : ''}
                  {r.requester_phone ? ` · ${r.requester_phone}` : ''}
                  {r.on_behalf_of ? ` · ${t('privacy.onBehalfOf', { name: r.on_behalf_of })}` : ''}
                  {` · ${r.user_id ? t('privacy.signedIn') : t('privacy.noAccount')} · ${t('privacy.via', { channel: r.channel })}`}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-fg">{r.details}</p>
                {r.resolution ? <p className="mt-2 text-sm text-fg">{t('privacy.answer', { text: r.resolution })}</p> : null}
                {editing === r.id ? (
                  <RequestEditor request={r} onDone={() => setEditing(null)} />
                ) : (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(r.id)}>
                    {t('privacy.work')}
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
          {list.data.pages > 1 ? (
            <div className="flex items-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t('privacy.previous')}
              </Button>
              <span>{t('privacy.page', { page: list.data.page, pages: list.data.pages })}</span>
              <Button size="sm" variant="outline" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)}>
                {t('privacy.next')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
