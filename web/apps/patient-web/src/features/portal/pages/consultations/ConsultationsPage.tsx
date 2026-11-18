/** /app/consultations (list) and /app/consultations/:id (status, time, Join link, reminders, fee and payment). */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { BellRing, CalendarClock, CreditCard, ExternalLink, Video } from 'lucide-react';
import type { ConsultationOut, ConsultationStatus } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { canPayFee, feeState, useCancelConsultation, useConsultation, useConsultationOrders, useConsultations, type FeeState } from '../../api/consultations';
import { Avatar, BackLink, Money, StatusBadge } from '../../components/common';
import { paths } from '../../lib/paths';
import { formatDateTime, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  KeyValue,
  PageHeader,
  Pagination,
  SkeletonList,
  Tabs,
  type Tone,
} from '../../ui/primitives';
import { consultationErrorMessage } from './BookConsultationPage';

type Filter = 'all' | ConsultationStatus;
const OPEN: ConsultationStatus[] = ['requested', 'scheduled'];

export function ConsultationsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('consult.list.title'));
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const list = useConsultations({ page, page_size: 20, ...(filter !== 'all' ? { status: filter } : {}) });

  return (
    <div>
      <PageHeader
        title={t('consult.list.title')}
        description={t('consult.list.description')}
        actions={
          <ButtonLink to={paths.browse({ tab: 'doctors' })} icon={<Video className="size-4" aria-hidden />}>
            {t('consult.list.book')}
          </ButtonLink>
        }
      />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        tabs={[
          { value: 'all', label: t('consult.list.all') },
          { value: 'requested', label: t('status.requested') },
          { value: 'scheduled', label: t('status.scheduled') },
          { value: 'completed', label: t('status.completed') },
          { value: 'cancelled', label: t('status.cancelled') },
        ]}
      />
      {list.isPending ? (
        <SkeletonList rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          title={t('consult.list.emptyTitle')}
          description={t('consult.list.emptyText')}
          action={<ButtonLink to={paths.browse({ tab: 'doctors' })}>{t('consult.list.book')}</ButtonLink>}
        />
      ) : (
        <div className="space-y-3">
          {list.data.items.map((c) => (
            <ConsultationRow key={c.id} consultation={c} />
          ))}
          {list.data.pages > 1 ? <Pagination page={page} pages={list.data.pages} onChange={setPage} /> : null}
        </div>
      )}
    </div>
  );
}

function ConsultationRow({ consultation: c }: { consultation: ConsultationOut }) {
  const { t } = useAppTranslation();
  const name = c.doctor?.full_name ?? c.hospital?.name ?? t('consult.title');
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <Avatar name={name} size={48} />
      <div className="min-w-0 flex-1">
        <Link to={paths.consultation(c.id)} className="font-semibold text-fg hover:underline">
          {name}
        </Link>
        <p className="text-sm text-muted">
          {[c.doctor?.specialty_name, c.hospital?.name].filter(Boolean).join(' · ')}
          {c.kind === 'followup' ? ` · ${t('consult.kind.followup')}` : ''}
        </p>
        <p className="mt-1 flex items-center gap-1 text-sm">
          <CalendarClock className="size-4 text-muted" aria-hidden />
          {c.scheduled_at
            ? formatDateTime(c.scheduled_at)
            : c.due_at
              ? t('consult.detail.preferred', { time: formatDateTime(c.due_at) })
              : t('consult.detail.awaitingTime')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        {c.status === 'scheduled' && c.meeting_url ? <JoinButton url={c.meeting_url} size="sm" /> : null}
        <ButtonLink to={paths.consultation(c.id)} variant="outline" size="sm">
          {t('consult.list.open')}
        </ButtonLink>
      </div>
    </Card>
  );
}

function JoinButton({ url, size = 'md' }: { url: string; size?: 'sm' | 'md' }) {
  const { t } = useAppTranslation();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass('primary', size)}
    >
      <Video className="size-4" aria-hidden />
      {t('consult.detail.join')}
      <ExternalLink className="size-3.5 rtl:-scale-x-100" aria-hidden />
    </a>
  );
}

const FEE_TONES: Record<FeeState, Tone> = { free: 'green', paid: 'green', pending: 'amber', unpaid: 'red' };

export function ConsultationDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const justPaid = !!params.get('order');
  const { t } = useAppTranslation();
  const consultation = useConsultation(id);
  const c = consultation.data;
  const orders = useConsultationOrders(c, { pollMs: justPaid ? 3000 : false });
  const cancel = useCancelConsultation();
  const [confirmCancel, setConfirmCancel] = useState(false);
  useDocumentTitle(c?.doctor?.full_name ?? t('consult.title'));

  if (consultation.isPending) return <SkeletonList rows={4} />;
  if (consultation.isError) return <ErrorState error={consultation.error} onRetry={() => void consultation.refetch()} />;
  const data = consultation.data;
  const fee = feeState(data, orders.data);
  const open = OPEN.includes(data.status);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={<BackLink to={paths.consultations}>{t('consult.list.title')}</BackLink>}
        title={data.doctor?.full_name ?? t('consult.title')}
        description={[data.doctor?.specialty_name, data.hospital ? `${data.hospital.name}${data.hospital.city ? `, ${data.hospital.city}` : ''}` : null]
          .filter(Boolean)
          .join(' · ')}
        actions={<StatusBadge status={data.status} className="text-sm" />}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title={t('consult.detail.when')} />
          <CardBody className="space-y-4">
            {data.status === 'scheduled' && data.scheduled_at ? (
              <>
                <p className="text-lg font-semibold">{formatDateTime(data.scheduled_at, 'EEEE d MMMM yyyy, HH:mm')}</p>
                <p className="text-sm text-muted">{t('consult.detail.localTimeNote', { minutes: data.duration_min })}</p>
                {data.mode === 'video' ? (
                  data.meeting_url ? (
                    <div className="space-y-2">
                      <JoinButton url={data.meeting_url} />
                      <p className="text-xs text-muted">{t('consult.detail.joinHint')}</p>
                    </div>
                  ) : (
                    <Alert tone="blue">{t('consult.detail.linkSoon')}</Alert>
                  )
                ) : (
                  <Alert tone="blue">{t('consult.detail.phoneCall')}</Alert>
                )}
              </>
            ) : data.status === 'requested' ? (
              <>
                <p className="font-medium">
                  {data.due_at ? t('consult.detail.preferred', { time: formatDateTime(data.due_at) }) : t('consult.detail.awaitingTime')}
                </p>
                <p className="text-sm text-muted">{t('consult.detail.requestedText')}</p>
              </>
            ) : data.status === 'completed' ? (
              <p className="text-sm">{t('consult.detail.completedText')}</p>
            ) : (
              <p className="text-sm">{t('consult.detail.cancelledText')}</p>
            )}
            {open ? (
              <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                <BellRing className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                {t('consult.detail.reminders')}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('consult.detail.feeTitle')} />
          <CardBody className="space-y-3 text-sm">
            <KeyValue label={t('doctor.fee')}>
              {data.fee_minor > 0 ? <Money minor={data.fee_minor} currency={data.currency} /> : t('consult.fee.free')}
            </KeyValue>
            <KeyValue label={t('consult.detail.paymentStatus')}>
              <Badge tone={FEE_TONES[fee]}>{t(`consult.fee.${fee}`)}</Badge>
            </KeyValue>
            {justPaid && fee !== 'paid' && fee !== 'free' ? <Alert tone="blue">{t('consult.detail.confirmingPayment')}</Alert> : null}
            {canPayFee(data, fee) ? (
              <ButtonLink to={paths.payConsultation(data.id)} icon={<CreditCard className="size-4" aria-hidden />}>
                {fee === 'pending' ? t('consult.detail.payAgain') : t('consult.detail.pay')}
              </ButtonLink>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('consult.detail.detailsTitle')} />
          <CardBody className="space-y-3 text-sm">
            <KeyValue label={t('consult.detail.mode')}>{t(`consult.mode.${data.mode}`)}</KeyValue>
            {data.case_number ? (
              <KeyValue label={t('consult.detail.case')}>
                <Link to={paths.case(data.case_id)} className="text-primary-ink hover:underline">
                  {data.case_number}
                </Link>
              </KeyValue>
            ) : null}
            <KeyValue label={t('consult.detail.requestedOn')}>{formatDateTime(data.created_at)}</KeyValue>
            {data.notes ? (
              <KeyValue label={t('consult.detail.notes')}>
                <span className="whitespace-pre-line">{data.notes}</span>
              </KeyValue>
            ) : null}
          </CardBody>
        </Card>

        {open ? (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setConfirmCancel(true)}>
              {t('consult.detail.cancel')}
            </Button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        tone="danger"
        title={t('consult.detail.cancelTitle')}
        confirmLabel={t('consult.detail.cancel')}
        loading={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(data.id, {
            onSuccess: () => {
              setConfirmCancel(false);
              toast.success(t('consult.detail.cancelled'));
            },
            onError: (err) => toast.error(consultationErrorMessage(t, err)),
          })
        }
      >
        {fee === 'paid' ? t('consult.detail.cancelPaidText') : t('consult.detail.cancelText')}
      </ConfirmDialog>
    </div>
  );
}
