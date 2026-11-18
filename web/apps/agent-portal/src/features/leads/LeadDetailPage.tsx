import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  Edit3,
  Handshake,
  MessageSquare,
  NotebookPen,
  Phone,
  Repeat,
  Trash2,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  LEAD_STATUSES,
  LOGGABLE_ACTIVITY_KINDS,
  crmApi,
  errorMessage,
  isApiError,
  type LeadActivityOut,
  type LeadDetailOut,
  type LeadStatus,
  type LoggableActivityKind,
} from '@hig/shared/api';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  Textarea,
} from '../../components/ui';
import { countryName } from '../../lib/constants';
import { cn, formatDateTime, formatMoney, formatRelative, intlLocale, useDocumentTitle } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { PatientFormDialog } from '../patients/PatientForm';
import { LeadFormDialog } from './LeadFormDialog';
import { LEAD_SOURCE_TONES, LEAD_STATUS_TONES, fromLocalInput, invalidateLeads, isOverdue, leadKeys, splitName } from './leadMeta';
import { useLeadMove } from './useLeadMove';

const ACTIVITY_ICONS: Record<LeadActivityOut['kind'], LucideIcon> = {
  call: Phone,
  message: MessageSquare,
  meeting: Handshake,
  note: NotebookPen,
  status_change: Repeat,
};

function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([intlLocale()], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function LeadDetailPage() {
  const { leadId = '' } = useParams();
  const { t } = useAppTranslation();
  const lead = useQuery({ queryKey: leadKeys.lead(leadId), queryFn: () => crmApi.get(leadId), enabled: Boolean(leadId) });
  useDocumentTitle(lead.data?.full_name ?? t('crm.title'));

  if (lead.isPending) return <LoadingBlock />;
  if (lead.isError) {
    if (isApiError(lead.error) && lead.error.status === 404) {
      return (
        <EmptyState
          title={t('crm.detail.notFound')}
          action={
            <Link to="/leads" className="font-semibold text-primary-ink hover:underline">
              {t('crm.detail.back')}
            </Link>
          }
        />
      );
    }
    return (
      <Card>
        <ErrorState error={lead.error} onRetry={() => void lead.refetch()} />
      </Card>
    );
  }
  return <LeadDetail lead={lead.data} />;
}

function LeadDetail({ lead }: { lead: LeadDetailOut }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { move, pending: moving, dialog: moveDialog } = useLeadMove();
  const converted = Boolean(lead.converted_patient_id);
  const converting = params.get('convert') === '1' && !converted;
  const setConverting = (open: boolean) => {
    const p = new URLSearchParams(params);
    if (open) p.set('convert', '1');
    else p.delete('convert');
    setParams(p, { replace: true });
  };

  const remove = useMutation({
    mutationFn: () => crmApi.remove(lead.id),
    onSuccess: () => {
      invalidateLeads(qc);
      toast.success(t('crm.detail.deleted'));
      navigate('/leads', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error, t('crm.detail.deleteFailed'))),
  });

  const name = splitName(lead.full_name);
  const prefill = {
    first_name: name.first,
    last_name: name.last,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    whatsapp: lead.whatsapp ?? '',
    nationality: lead.country ?? '',
  };

  const info: [string, ReactNode][] = [
    [t('crm.fields.phone'), lead.phone],
    [t('crm.fields.whatsapp'), lead.whatsapp],
    [t('crm.fields.email'), lead.email],
    [t('crm.fields.country'), lead.country ? countryName(lead.country) : null],
    [t('crm.fields.language'), languageName(lead.preferred_language)],
    [
      t('crm.fields.source'),
      <span key="src" className="inline-flex flex-wrap items-center gap-1.5">
        <Badge tone={LEAD_SOURCE_TONES[lead.source]}>{t(`crm.source.${lead.source}`)}</Badge>
        {lead.source_detail}
      </span>,
    ],
    [t('crm.fields.interest'), lead.interest],
    [t('crm.fields.specialty'), lead.interested_specialty_name],
    [t('crm.fields.procedure'), lead.interested_procedure_name],
    [t('crm.fields.budget'), lead.budget_minor !== null && lead.budget_currency ? formatMoney(lead.budget_minor, lead.budget_currency) : null],
    [t('crm.fields.tags'), lead.tags.length ? lead.tags.join(', ') : null],
    [t('crm.fields.owner'), lead.owner_name],
    [t('crm.fields.created'), formatDateTime(lead.created_at)],
  ];

  return (
    <div>
      <PageHeader
        back={
          <Link to="/leads" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            {t('crm.detail.back')}
          </Link>
        }
        title={lead.full_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={LEAD_STATUS_TONES[lead.status]}>{t(`crm.status.${lead.status}`)}</Badge>
            {lead.status_changed_at ? <span>{t('crm.detail.since', { when: formatRelative(lead.status_changed_at) })}</span> : null}
          </span>
        }
        actions={
          <>
            {!converted && (
              <Button variant="outline" icon={<Edit3 className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>
                {t('crm.detail.edit')}
              </Button>
            )}
            {!converted && (
              <Button icon={<UserCheck className="h-4 w-4" aria-hidden />} onClick={() => setConverting(true)}>
                {t('crm.convert.button')}
              </Button>
            )}
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setDeleting(true)}>
              {t('crm.detail.delete')}
            </Button>
          </>
        }
      />

      {converted && lead.converted_patient_id ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary-ink">
          <span>{t('crm.convert.converted', { date: lead.converted_at ? formatDateTime(lead.converted_at) : '' })}</span>
          <ButtonLink to={`/patients/${lead.converted_patient_id}`} size="sm">
            {t('crm.convert.openPatient')}
          </ButtonLink>
        </div>
      ) : null}
      {lead.status === 'lost' && lead.lost_reason ? (
        <p className="mb-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm">
          <span className="font-medium">{t('crm.detail.lostReason')}</span> {lead.lost_reason}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('crm.detail.stage')} />
            <div className="space-y-3 p-5 text-sm">
              {converted ? (
                <p className="text-muted">{t('crm.detail.stageLocked')}</p>
              ) : (
                <FormField label={t('crm.detail.moveTo')} htmlFor="lead-stage" hint={t('crm.detail.moveHint')}>
                  <Select id="lead-stage" value={lead.status} disabled={moving} onChange={(e) => move(lead, e.target.value as LeadStatus)}>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s === 'won' ? t('crm.board.convertOption') : t(`crm.status.${s}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <div>
                <p className="text-xs font-medium text-muted">{t('crm.fields.nextFollowUp')}</p>
                <p className={cn('mt-0.5 flex items-center gap-1.5', isOverdue(lead) && 'font-medium text-danger-ink')}>
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                  {lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : t('crm.detail.noFollowUp')}
                  {isOverdue(lead) ? ` · ${t('crm.followUp.overdue')}` : ''}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title={t('crm.detail.details')} description={t('crm.form.medicalHint')} />
            <dl className="divide-y divide-border text-sm">
              {info.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 px-5 py-2.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="min-w-0 break-words text-fg">{value || <span className="text-muted">—</span>}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {!converted && <LogActivity leadId={lead.id} />}
          <Card>
            <CardHeader title={t('crm.timeline.title')} />
            {lead.activities.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t('crm.timeline.empty')}</p>
            ) : (
              <ol className="space-y-0 p-5">
                {lead.activities.map((a, i) => {
                  const Icon = ACTIVITY_ICONS[a.kind];
                  return (
                    <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < lead.activities.length - 1 ? <span className="absolute start-4 top-9 bottom-0 w-px bg-border" aria-hidden /> : null}
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium text-fg">
                          {a.kind === 'status_change'
                            ? t('crm.timeline.statusChange', {
                                from: a.from_status ? t(`crm.status.${a.from_status}`) : '—',
                                to: a.to_status ? t(`crm.status.${a.to_status}`) : '—',
                              })
                            : t(`crm.activity.kind.${a.kind}`)}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDateTime(a.occurred_at)}
                          {a.actor_name ? ` · ${a.actor_name}` : ''}
                        </p>
                        {a.body ? <p className="mt-1 whitespace-pre-wrap break-words text-fg">{a.body}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <LeadFormDialog open={editing} onClose={() => setEditing(false)} lead={lead} />
      <PatientFormDialog
        open={converting}
        onClose={() => setConverting(false)}
        prefill={prefill}
        title={t('crm.convert.title')}
        description={t('crm.convert.description')}
        submitLabel={t('crm.convert.submit')}
        createWith={async (body) => {
          const res = await crmApi.convert(lead.id, body);
          invalidateLeads(qc);
          return res.patient;
        }}
        onSaved={(patient) => {
          toast.success(t('crm.convert.done'));
          navigate(`/patients/${patient.id}`);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        title={t('crm.detail.deleteTitle')}
        description={t('crm.detail.deleteDescription', { name: lead.full_name })}
        confirmLabel={t('crm.detail.delete')}
        tone="danger"
        loading={remove.isPending}
      />
      {moveDialog}
    </div>
  );
}

function LogActivity({ leadId }: { leadId: string }) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const [kind, setKind] = useState<LoggableActivityKind>('call');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [followUp, setFollowUp] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      crmApi.addActivity(leadId, {
        kind,
        body: body.trim() || null,
        ...(occurredAt ? { occurred_at: fromLocalInput(occurredAt) } : {}),
        ...(followUp ? { next_follow_up_at: fromLocalInput(followUp) } : {}),
      }),
    onSuccess: (lead) => {
      qc.setQueryData(leadKeys.lead(leadId), lead);
      invalidateLeads(qc);
      toast.success(t('crm.activity.logged'));
      setBody('');
      setOccurredAt('');
      setFollowUp('');
    },
    onError: (error) => toast.error(errorMessage(error, t('crm.activity.failed'))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === 'note' && !body.trim()) {
      toast.error(t('crm.activity.noteRequired'));
      return;
    }
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader title={t('crm.activity.title')} description={t('crm.activity.description')} />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <FormField label={t('crm.activity.kindLabel')} htmlFor="act-kind">
          <Select id="act-kind" value={kind} onChange={(e) => setKind(e.target.value as LoggableActivityKind)}>
            {LOGGABLE_ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`crm.activity.kind.${k}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('crm.activity.when')} htmlFor="act-when" hint={t('crm.activity.whenHint')}>
          <Input id="act-when" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </FormField>
        <FormField label={t('crm.activity.body')} htmlFor="act-body" className="sm:col-span-2" hint={t('crm.form.medicalHint')}>
          <Textarea id="act-body" rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        </FormField>
        <FormField label={t('crm.activity.nextFollowUp')} htmlFor="act-follow" hint={t('crm.activity.nextFollowUpHint')}>
          <Input id="act-follow" type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </FormField>
        <div className="flex items-end justify-end">
          <Button type="submit" loading={mutation.isPending}>
            {t('crm.activity.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
