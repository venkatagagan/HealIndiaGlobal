import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, CalendarCheck, Check, CreditCard, MessageSquare, X } from 'lucide-react';
import {
  CASE_STATUS_LABELS,
  PATIENT_DOCUMENT_KINDS,
  PAYMENT_OPTION_LABELS,
  bookingsApi,
  casesApi,
  errorMessage,
  type BookingOut,
  type CaseDetail,
  type QuoteOut,
} from '@hig/shared/api';
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  PageHeader,
  StatusBadge,
} from '../../components/ui';
import { qk } from '../../lib/queries';
import { formatDate, formatDateTime, useDocumentTitle } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { DocumentList, DocumentUploader } from '../documents/Documents';
import { EmergencyAckPanel, PatientUpgradeRequiredNotice, needsEmergencyAck } from '@hig/shared/ui';
import { AcceptQuoteDialog, QuoteDetails, RejectQuoteDialog, isQuoteActionable, type CareGate } from './quotes';

const CANCELLABLE: CaseDetail['status'][] = ['enquiry', 'quoted', 'accepted', 'booked'];

export function CaseDetailPage() {
  const { t } = useAppTranslation();
  const { caseId = '' } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.case(caseId), queryFn: () => casesApi.get(caseId) });
  const c = query.data;
  useDocumentTitle(c ? c.case_number : t('caseDetail.fallbackTitle'));

  const siblings = useQuery({
    queryKey: qk.cases({ patient_id: c?.patient.id, page_size: 50 }),
    queryFn: () => casesApi.list({ patient_id: c?.patient.id, page_size: 50 }),
    enabled: Boolean(c),
  });

  const [accepting, setAccepting] = useState<QuoteOut | null>(null);
  const [rejecting, setRejecting] = useState<QuoteOut | null>(null);
  const [cancelCaseOpen, setCancelCaseOpen] = useState(false);
  const [cancelBookingOpen, setCancelBookingOpen] = useState(false);
  const [gate, setGate] = useState<CareGate | null>(null);

  const cancelCase = useMutation({
    mutationFn: (note: string) => casesApi.changeStatus(caseId, { to_status: 'cancelled', ...(note ? { note } : {}) }),
    onSuccess: () => {
      toast.success(t('caseDetail.caseCancelled'));
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      setCancelCaseOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const cancelBooking = useMutation({
    mutationFn: (reason: string) => bookingsApi.cancel(c?.booking?.id ?? '', { reason }),
    onSuccess: () => {
      toast.success(t('caseDetail.bookingCancelled'));
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setCancelBookingOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const back = (
    <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('caseDetail.back')}
    </Link>
  );
  if (query.isPending) return <LoadingBlock />;
  if (query.isError || !c) {
    return (
      <>
        {back}
        <Card className="mt-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      </>
    );
  }

  const quotes = [...c.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const relatedSiblings = (siblings.data?.items ?? []).filter(
    (s) => s.id !== c.id && (c.screening_id ? s.screening_id === c.screening_id : true),
  );
  const booking = c.booking;
  const canBook = c.status === 'accepted' && !booking;
  const showEmergency = needsEmergencyAck(c) || gate === 'emergency';

  return (
    <div>
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.case_number} <StatusBadge kind="case" status={c.status} />
          </span>
        }
        description={`${c.patient.full_name} · ${c.hospital.name}, ${c.hospital.city}`}
        actions={
          <>
            <ButtonLink to={`/messages?case=${c.id}`} variant="outline" icon={<MessageSquare className="h-4 w-4" aria-hidden />}>
              {t('caseDetail.messages')}
            </ButtonLink>
            {relatedSiblings.some((s) => s.latest_quote) && c.latest_quote && (
              <ButtonLink
                variant="outline"
                to={`/cases/compare?ids=${[c.id, ...relatedSiblings.filter((s) => s.latest_quote).map((s) => s.id)].slice(0, 3).join(',')}`}
              >
                {t('caseDetail.compareQuotes')}
              </ButtonLink>
            )}
            {canBook && (
              <ButtonLink to={`/cases/${c.id}/book`} icon={<CalendarCheck className="h-4 w-4" aria-hidden />}>
                {t('caseDetail.bookTreatment')}
              </ButtonLink>
            )}
            {CANCELLABLE.includes(c.status) && !booking && (
              <Button variant="ghost" className="text-danger" onClick={() => setCancelCaseOpen(true)}>
                {t('caseDetail.cancelCase')}
              </Button>
            )}
          </>
        }
      />

      {showEmergency && (
        <EmergencyAckPanel caseId={c.id} audience="agent" className="mb-6" onAcknowledged={() => setGate(null)} />
      )}
      {gate === 'guest' && <PatientUpgradeRequiredNotice patientName={c.patient.full_name} className="mb-6" />}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {booking && <BookingCard booking={booking} onCancel={() => setCancelBookingOpen(true)} />}

          <Card>
            <CardHeader
              title={t('caseDetail.quotes')}
              description={quotes.length ? undefined : t('caseDetail.noQuoteYet')}
            />
            {quotes.length === 0 ? (
              <EmptyState title={t('caseDetail.awaitingQuote')} description={t('caseDetail.replyTime')} className="py-8" />
            ) : (
              <div className="divide-y divide-border">
                {quotes.map((q) => (
                  <div key={q.id} className="space-y-4 p-5">
                    <QuoteDetails quote={q} />
                    {isQuoteActionable(c.status, q) && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => setRejecting(q)}>
                          {t('caseDetail.decline')}
                        </Button>
                        <Button icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => setAccepting(q)}>
                          {t('caseDetail.acceptQuote')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t('caseDetail.documents')} description={t('caseDetail.documentsHint')} />
            <div className="border-b border-border p-5">
              <DocumentUploader kinds={PATIENT_DOCUMENT_KINDS} target={{ case_id: c.id, patient_id: c.patient.id }} />
            </div>
            <DocumentList documents={c.documents} canDelete={(d) => d.status !== 'verified'} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t('caseDetail.details')} />
            <dl className="space-y-3 p-5 text-sm">
              <Row label={t('caseDetail.patient')}>
                <Link to={`/patients/${c.patient.id}`} className="font-medium text-primary-ink hover:underline">
                  {c.patient.full_name}
                </Link>
                {c.patient.age !== null && <span className="text-muted"> · {t('caseDetail.ageYears', { count: c.patient.age })}</span>}
              </Row>
              <Row label={t('caseDetail.hospital')}>
                <Link to={`/hospitals/${c.hospital.slug}`} className="font-medium hover:underline">
                  {c.hospital.name}
                </Link>
              </Row>
              <Row label={t('caseDetail.doctor')}>{c.doctor ? `${c.doctor.full_name}${c.doctor.specialty_name ? ` · ${c.doctor.specialty_name}` : ''}` : '—'}</Row>
              <Row label={t('caseDetail.treatment')}>{c.procedure?.name ?? c.specialty?.name ?? t('caseDetail.generalEnquiry')}</Row>
              <Row label={t('caseDetail.coordinator')}>{c.coordinator?.full_name ?? t('caseDetail.notAssigned')}</Row>
              <Row label={t('caseDetail.created')}>{formatDateTime(c.created_at)}</Row>
              {c.screening_id && (
                <Row label={t('caseDetail.screening')}>
                  <Link to={`/screenings/${c.screening_id}`} className="font-medium text-primary-ink hover:underline">
                    {t('caseDetail.viewResults')}
                  </Link>
                </Row>
              )}
            </dl>
            {(c.patient_notes || c.medical_summary) && (
              <div className="space-y-3 border-t border-border p-5 text-sm">
                {c.patient_notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">{t('caseDetail.enquiryMessage')}</p>
                    <p className="mt-1 whitespace-pre-line">{c.patient_notes}</p>
                  </div>
                )}
                {c.medical_summary && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">{t('caseDetail.medicalSummary')}</p>
                    <p className="mt-1 whitespace-pre-line">{c.medical_summary}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t('caseDetail.timeline')} />
            {c.timeline.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t('caseDetail.noTimeline')}</p>
            ) : (
              <ol className="space-y-4 p-5">
                {[...c.timeline]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((entry, i) => (
                    <li key={`${entry.created_at}-${i}`} className="relative flex gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      <div>
                        <p className="font-medium">{CASE_STATUS_LABELS[entry.to_status]}</p>
                        <p className="text-xs text-muted">
                          {formatDateTime(entry.created_at)}
                          {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ''}
                        </p>
                        {entry.note && <p className="mt-0.5 text-muted">{entry.note}</p>}
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <AcceptQuoteDialog
        open={accepting !== null}
        onClose={() => setAccepting(null)}
        caseItem={c}
        quote={accepting}
        siblings={relatedSiblings}
        onBlocked={setGate}
      />
      <RejectQuoteDialog open={rejecting !== null} onClose={() => setRejecting(null)} caseId={c.id} quote={rejecting} />
      <ConfirmDialog
        open={cancelCaseOpen}
        onClose={() => setCancelCaseOpen(false)}
        onConfirm={(note) => cancelCase.mutate(note)}
        title={t('caseDetail.cancelCaseTitle')}
        description={t('caseDetail.cancelCaseDescription')}
        confirmLabel={t('caseDetail.cancelCase')}
        tone="danger"
        loading={cancelCase.isPending}
        reason={{ label: t('caseDetail.reason'), required: true, placeholder: t('caseDetail.cancelCasePlaceholder') }}
      />
      <ConfirmDialog
        open={cancelBookingOpen}
        onClose={() => setCancelBookingOpen(false)}
        onConfirm={(reason) => cancelBooking.mutate(reason)}
        title={t('caseDetail.cancelBookingTitle')}
        description={t('caseDetail.cancelBookingDescription')}
        confirmLabel={t('caseDetail.cancelBooking')}
        tone="danger"
        loading={cancelBooking.isPending}
        reason={{ label: t('caseDetail.reason'), required: true }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

function BookingCard({ booking, onCancel }: { booking: BookingOut; onCancel: () => void }) {
  const { t } = useAppTranslation();
  const payable = ['pending_payment', 'confirmed', 'admitted'].includes(booking.status) && booking.balance_due_minor > 0;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t('caseDetail.booking.title', { number: booking.booking_number })} <StatusBadge kind="booking" status={booking.status} />
          </span>
        }
        actions={
          <>
            {payable && (
              <ButtonLink size="sm" to={`/bookings/${booking.id}/pay`} icon={<CreditCard className="h-4 w-4" aria-hidden />}>
                {booking.status === 'pending_payment' ? t('caseDetail.booking.payNow') : t('caseDetail.booking.payBalance')}
              </ButtonLink>
            )}
            {['pending_payment', 'confirmed'].includes(booking.status) && (
              <Button size="sm" variant="ghost" className="text-danger" onClick={onCancel}>
                {t('caseDetail.cancelBooking')}
              </Button>
            )}
          </>
        }
      />
      <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
        <Stat label={t('caseDetail.booking.admission')}>{formatDate(booking.admission_date)}</Stat>
        <Stat label={t('caseDetail.booking.duration')}>{booking.duration_days ? t('caseDetail.booking.days', { count: booking.duration_days }) : '—'}</Stat>
        <Stat label={t('caseDetail.booking.paymentOption')}>
          {PAYMENT_OPTION_LABELS[booking.payment_option]}
          {booking.installment_months ? ` · ${t('caseDetail.booking.months', { count: booking.installment_months })}` : ''}
        </Stat>
        <Stat label={t('caseDetail.booking.total')}>
          <Money minor={booking.total_minor} currency={booking.currency} className="font-semibold" />
        </Stat>
        <Stat label={t('caseDetail.booking.paid')}>
          <Money minor={booking.amount_paid_minor - booking.amount_refunded_minor} currency={booking.currency} />
        </Stat>
        <Stat label={t('caseDetail.booking.balanceDue')}>
          <Money minor={booking.balance_due_minor} currency={booking.currency} className={booking.balance_due_minor > 0 ? 'font-semibold text-danger' : ''} />
        </Stat>
      </dl>
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted uppercase">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
