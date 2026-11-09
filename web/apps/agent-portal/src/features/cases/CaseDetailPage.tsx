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
import { DocumentList, DocumentUploader } from '../documents/Documents';
import { EmergencyAckPanel, PatientUpgradeRequiredNotice, needsEmergencyAck } from '@hig/shared/ui';
import { AcceptQuoteDialog, QuoteDetails, RejectQuoteDialog, isQuoteActionable, type CareGate } from './quotes';

const CANCELLABLE: CaseDetail['status'][] = ['enquiry', 'quoted', 'accepted', 'booked'];

export function CaseDetailPage() {
  const { caseId = '' } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.case(caseId), queryFn: () => casesApi.get(caseId) });
  const c = query.data;
  useDocumentTitle(c ? c.case_number : 'Case');

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
      toast.success('Case cancelled');
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      setCancelCaseOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const cancelBooking = useMutation({
    mutationFn: (reason: string) => bookingsApi.cancel(c?.booking?.id ?? '', { reason }),
    onSuccess: () => {
      toast.success('Booking cancelled. Any refund due under the cancellation policy will be processed automatically.');
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setCancelBookingOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const back = (
    <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Cases
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
              Messages
            </ButtonLink>
            {relatedSiblings.some((s) => s.latest_quote) && c.latest_quote && (
              <ButtonLink
                variant="outline"
                to={`/cases/compare?ids=${[c.id, ...relatedSiblings.filter((s) => s.latest_quote).map((s) => s.id)].slice(0, 3).join(',')}`}
              >
                Compare quotes
              </ButtonLink>
            )}
            {canBook && (
              <ButtonLink to={`/cases/${c.id}/book`} icon={<CalendarCheck className="h-4 w-4" aria-hidden />}>
                Book treatment
              </ButtonLink>
            )}
            {CANCELLABLE.includes(c.status) && !booking && (
              <Button variant="ghost" className="text-danger" onClick={() => setCancelCaseOpen(true)}>
                Cancel case
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
              title="Quotes"
              description={quotes.length ? undefined : 'The hospital has not sent a quote yet. You will be notified when it arrives.'}
            />
            {quotes.length === 0 ? (
              <EmptyState title="Awaiting quote" description="Hospitals usually reply within 48 hours." className="py-8" />
            ) : (
              <div className="divide-y divide-border">
                {quotes.map((q) => (
                  <div key={q.id} className="space-y-4 p-5">
                    <QuoteDetails quote={q} />
                    {isQuoteActionable(c.status, q) && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => setRejecting(q)}>
                          Decline
                        </Button>
                        <Button icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => setAccepting(q)}>
                          Accept quote
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Documents" description="Shared with the hospital on this case" />
            <div className="border-b border-border p-5">
              <DocumentUploader kinds={PATIENT_DOCUMENT_KINDS} target={{ case_id: c.id, patient_id: c.patient.id }} />
            </div>
            <DocumentList documents={c.documents} canDelete={(d) => d.status !== 'verified'} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Case details" />
            <dl className="space-y-3 p-5 text-sm">
              <Row label="Patient">
                <Link to={`/patients/${c.patient.id}`} className="font-medium text-primary-ink hover:underline">
                  {c.patient.full_name}
                </Link>
                {c.patient.age !== null && <span className="text-muted"> · {c.patient.age} yrs</span>}
              </Row>
              <Row label="Hospital">
                <Link to={`/hospitals/${c.hospital.slug}`} className="font-medium hover:underline">
                  {c.hospital.name}
                </Link>
              </Row>
              <Row label="Doctor">{c.doctor ? `${c.doctor.full_name}${c.doctor.specialty_name ? ` · ${c.doctor.specialty_name}` : ''}` : '—'}</Row>
              <Row label="Treatment">{c.procedure?.name ?? c.specialty?.name ?? 'General enquiry'}</Row>
              <Row label="Coordinator">{c.coordinator?.full_name ?? 'Not yet assigned'}</Row>
              <Row label="Created">{formatDateTime(c.created_at)}</Row>
              {c.screening_id && (
                <Row label="Screening">
                  <Link to={`/screenings/${c.screening_id}`} className="font-medium text-primary-ink hover:underline">
                    View results
                  </Link>
                </Row>
              )}
            </dl>
            {(c.patient_notes || c.medical_summary) && (
              <div className="space-y-3 border-t border-border p-5 text-sm">
                {c.patient_notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">Enquiry message</p>
                    <p className="mt-1 whitespace-pre-line">{c.patient_notes}</p>
                  </div>
                )}
                {c.medical_summary && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">Medical summary</p>
                    <p className="mt-1 whitespace-pre-line">{c.medical_summary}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            {c.timeline.length === 0 ? (
              <p className="p-5 text-sm text-muted">No status changes yet.</p>
            ) : (
              <ol className="space-y-4 p-5">
                {[...c.timeline]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((t, i) => (
                    <li key={`${t.created_at}-${i}`} className="relative flex gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      <div>
                        <p className="font-medium">{CASE_STATUS_LABELS[t.to_status]}</p>
                        <p className="text-xs text-muted">
                          {formatDateTime(t.created_at)}
                          {t.changed_by_name ? ` · ${t.changed_by_name}` : ''}
                        </p>
                        {t.note && <p className="mt-0.5 text-muted">{t.note}</p>}
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
        title="Cancel this case?"
        description="The hospital is notified and stops working on this enquiry."
        confirmLabel="Cancel case"
        tone="danger"
        loading={cancelCase.isPending}
        reason={{ label: 'Reason', required: true, placeholder: 'e.g. Patient chose another hospital' }}
      />
      <ConfirmDialog
        open={cancelBookingOpen}
        onClose={() => setCancelBookingOpen(false)}
        onConfirm={(reason) => cancelBooking.mutate(reason)}
        title="Cancel this booking?"
        description="Refunds follow the cancellation policy (full refund 14+ days before admission, 50% from 7 days, none after)."
        confirmLabel="Cancel booking"
        tone="danger"
        loading={cancelBooking.isPending}
        reason={{ label: 'Reason', required: true }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function BookingCard({ booking, onCancel }: { booking: BookingOut; onCancel: () => void }) {
  const payable = ['pending_payment', 'confirmed', 'admitted'].includes(booking.status) && booking.balance_due_minor > 0;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Booking {booking.booking_number} <StatusBadge kind="booking" status={booking.status} />
          </span>
        }
        actions={
          <>
            {payable && (
              <ButtonLink size="sm" to={`/bookings/${booking.id}/pay`} icon={<CreditCard className="h-4 w-4" aria-hidden />}>
                {booking.status === 'pending_payment' ? 'Pay now' : 'Pay balance'}
              </ButtonLink>
            )}
            {['pending_payment', 'confirmed'].includes(booking.status) && (
              <Button size="sm" variant="ghost" className="text-danger" onClick={onCancel}>
                Cancel booking
              </Button>
            )}
          </>
        }
      />
      <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
        <Stat label="Admission">{formatDate(booking.admission_date)}</Stat>
        <Stat label="Duration">{booking.duration_days ? `${booking.duration_days} days` : '—'}</Stat>
        <Stat label="Payment option">
          {PAYMENT_OPTION_LABELS[booking.payment_option]}
          {booking.installment_months ? ` · ${booking.installment_months} months` : ''}
        </Stat>
        <Stat label="Total">
          <Money minor={booking.total_minor} currency={booking.currency} className="font-semibold" />
        </Stat>
        <Stat label="Paid">
          <Money minor={booking.amount_paid_minor - booking.amount_refunded_minor} currency={booking.currency} />
        </Stat>
        <Stat label="Balance due">
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
