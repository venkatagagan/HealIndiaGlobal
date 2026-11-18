import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, CheckCircle2, FileText, MessageSquare, Sparkles, Stethoscope, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ReportAiPanel } from '@hig/shared/docai';
import {
  CASE_STATUS_LABELS,
  errorMessage,
  QUOTE_LINE_CATEGORY_LABELS,
  type CaseDetail,
  type QuoteOut,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useCancelCase, useCase,useConversations, useCreateConversation, useQuoteDecision } from '../../api/queries';
import { BackLink, Money, StatusBadge, UploadButton } from '../../components/common';
import { documentColumns, useAiReadings, useDocumentActions } from '../../components/DocumentsTable';
import { ItineraryTable } from '../../components/ItineraryTable';
import { PatientStatus } from '../../components/listing';
import { PaymentsTable } from '../../components/payments';
import { EmergencyAckPanel, isEmergencyAckError, needsEmergencyAck, useGuestGate } from '../../components/CareGates';
import { paths } from '../../lib/paths';
import { cn, daysUntil, formatDate, formatDateTime, formatMoney, formatNumber, useDocumentTitle } from '../../lib/shared';
import { DataTable, DateCell, MoneyCell, TBody, TFoot, THead, Table, Td, Th, Tr, type DataTableColumn } from '@hig/shared/ui';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Field,
  KeyValue,
  Modal,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../ui/primitives';
import { screeningHref } from '../screening/ScreeningsListPage';

type TFn = ReturnType<typeof useAppTranslation>['t'];

export function CaseDetailPage() {
  const { t } = useAppTranslation();
  const { id = '' } = useParams();
  const query = useCase(id);
  useDocumentTitle(query.data ? t('cases.detail.docTitle', { number: query.data.case_number }) : t('cases.detail.docTitleFallback'));

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <CaseDetailView data={query.data} />;
}

function CaseDetailView({ data }: { data: CaseDetail }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showReportAi, setShowReportAi] = useState(false);
  const [emergencyPrompt, setEmergencyPrompt] = useState(false);
  const guestGate = useGuestGate();
  const emergencyRequired = needsEmergencyAck(data);
  const showEmergency = emergencyRequired || emergencyPrompt;
  function promptEmergency() {
    setEmergencyPrompt(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const decision = useQuoteDecision(data.id);
  const cancel = useCancelCase(data.id);
  const conversations = useConversations();
  const createConversation = useCreateConversation();
  const [rejecting, setRejecting] = useState<QuoteOut | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [accepting, setAccepting] = useState<QuoteOut | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');

  const conversation = conversations.data?.find((c) => c.case_id === data.id);
  const quotes = [...data.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const acceptedQuote = quotes.find((q) => q.status === 'accepted');
  // the quote that matters now (accepted, else the newest); the others are listed in a compact history table
  const mainQuote = acceptedQuote ?? quotes[0] ?? null;
  const otherQuotes = quotes.filter((q) => q.id !== mainQuote?.id);
  const [viewQuote, setViewQuote] = useState<QuoteOut | null>(null);
  const readings = useAiReadings(data.documents);
  const docActions = useDocumentActions();
  const docColumns = useMemo(
    () => documentColumns({ renderActions: docActions.renderActions, readings }),
    [docActions.renderActions, readings],
  );
  const quoteHistoryColumns = useMemo(() => quoteHistoryColumnsFor(t), [t]);
  const quoteActions = (q: QuoteOut) => ({
    actionable: q.status === 'sent' && !closed && !acceptedQuote,
    onAccept: () => {
      if (emergencyRequired) promptEmergency();
      else if (!guestGate.requireAccount()) setAccepting(q);
    },
    onReject: () => setRejecting(q),
  });
  const booking = data.booking;
  const canBook = !booking || booking.status === 'cancelled';
  const cancellable = ['enquiry', 'quoted', 'accepted'].includes(data.status);
  const closed = ['cancelled', 'declined', 'completed'].includes(data.status);

  async function openConversation() {
    if (conversation) {
      navigate(paths.conversation(conversation.id));
      return;
    }
    try {
      // stored data, read by hospital staff too: kept in English
      const created = await createConversation.mutateAsync({ case_id: data.id, subject: `Case ${data.case_number}` });
      navigate(paths.conversation(created.id));
    } catch (err) {
      toast.error(errorMessage(err, t('cases.detail.conversationFailed')));
    }
  }

  return (
    <div>
      <PageHeader
        back={<BackLink to={paths.cases}>{t('cases.list.title')}</BackLink>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {data.procedure?.name ?? data.specialty?.name ?? t('cases.list.treatmentEnquiry')}
            <StatusBadge status={data.status} className="text-sm" />
          </span>
        }
        description={`${data.case_number} · ${data.hospital.name}, ${data.hospital.city}`}
        actions={
          <>
            <Button
              variant="outline"
              icon={<MessageSquare className="h-4 w-4" aria-hidden />}
              onClick={() => void openConversation()}
              loading={createConversation.isPending}
            >
              {conversation?.unread_count
                ? t('cases.detail.messagesUnread', { n: formatNumber(conversation.unread_count) })
                : t('cases.detail.messages')}
            </Button>
            {canBook && !closed && !showEmergency && (acceptedQuote || data.status === 'quoted') ? (
              <ButtonLink to={paths.book(data.id)} icon={<CalendarCheck className="h-4 w-4" aria-hidden />}>
                {t('cases.detail.bookTreatment')}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {showEmergency && !closed ? (
        <EmergencyAckPanel caseId={data.id} className="mb-6" onAcknowledged={() => setEmergencyPrompt(false)} />
      ) : null}
      {guestGate.dialog}

      {data.status === 'enquiry' ? (
        <Alert tone="blue" className="mb-6" title={t('cases.detail.waitingTitle')}>
          {t('cases.detail.waitingBody', { hospital: data.hospital.name })}
        </Alert>
      ) : data.status === 'declined' ? (
        <Alert tone="red" className="mb-6" title={t('cases.detail.declinedTitle')}>
          {t('cases.detail.declinedBody')}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Booking */}
          {booking ? (
            <Card className="border-success/40">
              <CardHeader
                title={t('cases.detail.bookingTitle', { number: booking.booking_number })}
                action={<StatusBadge status={booking.status} />}
                description={t('cases.detail.admission', { date: formatDate(booking.admission_date) })}
              />
              <CardBody>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <KeyValue label={t('cases.detail.total')}>
                    <Money minor={booking.total_minor} currency={booking.currency} />
                  </KeyValue>
                  <KeyValue label={t('cases.detail.paid')}>
                    <Money minor={booking.amount_paid_minor} currency={booking.currency} />
                  </KeyValue>
                  <KeyValue label={t('cases.detail.balance')}>
                    <Money minor={booking.balance_due_minor} currency={booking.currency} />
                  </KeyValue>
                  <KeyValue label={t('cases.detail.payment')}>
                    {t(`cases.detail.paymentOption.${booking.payment_option}`, {
                      defaultValue: booking.payment_option.replace('_', ' '),
                    })}
                  </KeyValue>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {booking.status === 'pending_payment' ? (
                    <ButtonLink to={paths.pay(booking.id)}>{t('cases.detail.payNow')}</ButtonLink>
                  ) : null}
                  <ButtonLink to={paths.booking(booking.id)} variant="outline">
                    {t('cases.detail.bookingDetails')}
                  </ButtonLink>
                  {booking.status !== 'cancelled' ? (
                    <ButtonLink to={paths.trip(booking.id)} variant="accent">
                      {t('cases.detail.tripHub')}
                    </ButtonLink>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {booking && booking.status !== 'cancelled' ? (
            <Card>
              <CardHeader
                title={t('cases.detail.itineraryTitle')}
                description={t('cases.detail.itineraryDescription')}
                action={
                  <ButtonLink to={paths.trip(booking.id)} variant="outline" size="sm">
                    {t('cases.detail.openTripHub')}
                  </ButtonLink>
                }
              />
              <CardBody>
                <ItineraryTable bookingId={booking.id} />
              </CardBody>
            </Card>
          ) : null}

          {booking ? (
            <Card>
              <CardHeader
                title={t('cases.detail.paymentsTitle')}
                description={t('cases.detail.paymentsDescription')}
                action={
                  <ButtonLink to={paths.payments} variant="outline" size="sm">
                    {t('cases.detail.allPayments')}
                  </ButtonLink>
                }
              />
              <CardBody>
                <PaymentsTable bookingId={booking.id} />
              </CardBody>
            </Card>
          ) : null}

          {/* Quotes */}
          <Card>
            <CardHeader title={t('cases.detail.quotesTitle')} description={t('cases.detail.quotesDescription')} />
            <CardBody className="space-y-5">
              {!mainQuote ? (
                <p className="text-sm text-muted">{t('cases.detail.noQuotes')}</p>
              ) : (
                <QuoteCard quote={mainQuote} {...quoteActions(mainQuote)} />
              )}
              {otherQuotes.length ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t('cases.detail.earlierQuotes')}</h3>
                  <DataTable
                    caption={t('cases.detail.earlierQuotes')}
                    columns={quoteHistoryColumns}
                    rows={otherQuotes}
                    defaultSort={{ key: 'created_at', direction: 'desc' }}
                    density="compact"
                    responsive="cards"
                    showViewOptions={false}
                    className="shadow-none"
                    onRowClick={setViewQuote}
                    rowLabel={(q) => t('cases.detail.viewQuoteSent', { date: formatDate(q.created_at) })}
                  />
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader
              title={t('cases.detail.documentsTitle')}
              description={t('cases.detail.documentsDescription')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Sparkles className="h-4 w-4" aria-hidden />}
                    onClick={() => setShowReportAi((v) => !v)}
                    aria-expanded={showReportAi}
                  >
                    {t('cases.detail.readReportAi')}
                  </Button>
                  <UploadButton kind="medical_report" caseId={data.id} size="sm" label={t('cases.detail.upload')} multiple />
                </div>
              }
            />
            <CardBody>
              {showReportAi ? (
                <ReportAiPanel
                  className="mb-6 border-b border-border pb-6"
                  caseId={data.id}
                  defaultKind="medical_report"
                  audience="patient"
                  existing="pending"
                  onUploaded={() => void qc.invalidateQueries({ queryKey: ['cases'] })}
                />
              ) : null}
              <DataTable
                caption={t('cases.detail.documentsCaption')}
                columns={docColumns}
                rows={data.documents}
                defaultSort={{ key: 'created_at', direction: 'desc' }}
                density="compact"
                responsive="cards"
                showViewOptions={false}
                className="shadow-none"
                emptyIcon={<FileText className="size-7" aria-hidden />}
                emptyTitle={t('cases.detail.documentsEmptyTitle')}
                emptyDescription={t('cases.detail.documentsEmptyDescription')}
              />
              {docActions.dialog}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t('cases.detail.details')} />
            <CardBody>
              <dl className="space-y-3">
                <KeyValue label={t('cases.detail.hospital')}>
                  <Link to={paths.hospital(data.hospital.slug)} className="font-medium text-primary-ink hover:underline">
                    {data.hospital.name}
                  </Link>
                  , {data.hospital.city}
                </KeyValue>
                {data.doctor ? (
                  <KeyValue label={t('cases.detail.doctor')}>
                    {data.doctor.full_name}
                    {data.doctor.specialty_name ? ` · ${data.doctor.specialty_name}` : ''}
                  </KeyValue>
                ) : null}
                {data.coordinator ? <KeyValue label={t('cases.detail.coordinator')}>{data.coordinator.full_name}</KeyValue> : null}
                {data.agent ? <KeyValue label={t('cases.detail.agent')}>{data.agent.agency_name}</KeyValue> : null}
                {data.patient_notes ? <KeyValue label={t('cases.detail.yourNote')}>{data.patient_notes}</KeyValue> : null}
                {data.medical_summary ? <KeyValue label={t('cases.detail.medicalSummary')}>{data.medical_summary}</KeyValue> : null}
                {data.screening ? (
                  <KeyValue label={t('cases.detail.screening')}>
                    <Link
                      to={screeningHref(data.screening)}
                      className="inline-flex items-center gap-1 text-primary-ink hover:underline"
                    >
                      <Stethoscope className="h-4 w-4" aria-hidden /> {t('cases.detail.viewScreening')}
                    </Link>
                  </KeyValue>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('cases.detail.timeline')} />
            <CardBody>
              {data.timeline.length ? (
                <ol className="relative space-y-4 border-s border-border ps-5">
                  {[...data.timeline]
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((entry, i) => (
                      <li key={`${entry.created_at}-${i}`} className="relative">
                        <span className="absolute -start-[26px] top-1 h-3 w-3 rounded-full border-2 border-surface bg-success" aria-hidden />
                        <p className="text-sm font-medium">{CASE_STATUS_LABELS[entry.to_status] ?? entry.to_status}</p>
                        <p className="text-xs text-muted">
                          {formatDateTime(entry.created_at)}
                          {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ''}
                        </p>
                        {entry.note ? <p className="mt-1 text-sm text-muted">{entry.note}</p> : null}
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">{t('cases.list.openedOn', { date: formatDateTime(data.created_at) })}</p>
              )}
            </CardBody>
          </Card>

          {cancellable ? (
            <Button variant="outline" className="w-full text-danger" onClick={() => setCancelOpen(true)}>
              {t('cases.detail.cancelCase')}
            </Button>
          ) : null}
        </div>
      </div>

      <Modal open={!!viewQuote} onClose={() => setViewQuote(null)} title={t('cases.detail.quoteDetails')} size="lg">
        {viewQuote ? (
          <QuoteCard
            quote={viewQuote}
            {...quoteActions(viewQuote)}
            onAccept={() => {
              setViewQuote(null);
              quoteActions(viewQuote).onAccept();
            }}
            onReject={() => {
              setViewQuote(null);
              setRejecting(viewQuote);
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!accepting}
        onClose={() => setAccepting(null)}
        title={t('cases.detail.acceptTitle')}
        confirmLabel={t('cases.detail.acceptQuote')}
        loading={decision.isPending}
        onConfirm={() => {
          if (!accepting) return;
          decision.mutate(
            { quoteId: accepting.id, accept: true },
            {
              onSuccess: () => {
                toast.success(t('cases.detail.acceptedToast'));
                setAccepting(null);
                navigate(paths.book(data.id));
              },
              onError: (err) => {
                setAccepting(null);
                if (isEmergencyAckError(err)) promptEmergency();
                else if (!guestGate.handleError(err)) toast.error(errorMessage(err));
              },
            },
          );
        }}
      >
        {accepting ? (
          <Trans
            t={t}
            i18nKey="cases.detail.acceptBody"
            values={{ amount: formatMoney(accepting.total_minor, accepting.currency) }}
            components={{ 0: <strong className="tabular-nums" /> }}
          />
        ) : null}
      </ConfirmDialog>

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('cases.detail.declineTitle')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              {t('cases.detail.back')}
            </Button>
            <Button
              variant="danger"
              loading={decision.isPending}
              onClick={() => {
                if (!rejecting) return;
                decision.mutate(
                  { quoteId: rejecting.id, accept: false, reason: rejectReason.trim() || undefined },
                  {
                    onSuccess: () => {
                      toast.success(t('cases.detail.declinedToast'));
                      setRejecting(null);
                      setRejectReason('');
                    },
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                );
              }}
            >
              {t('cases.detail.declineQuote')}
            </Button>
          </>
        }
      >
        <Field label={t('cases.detail.declineReason')} htmlFor="reject-reason">
          <Textarea id="reject-reason" maxLength={1000} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('cases.detail.cancelTitle')}
        confirmLabel={t('cases.detail.cancelConfirm')}
        tone="danger"
        loading={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(cancelNote.trim() || undefined, {
            onSuccess: () => {
              toast.success(t('cases.detail.cancelledToast'));
              setCancelOpen(false);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        <p>{t('cases.detail.cancelBody')}</p>
        <label htmlFor="cancel-note" className="mt-3 block text-sm font-medium">
          {t('cases.detail.cancelReason')}
        </label>
        <Textarea id="cancel-note" className="mt-1" maxLength={1000} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}

function QuoteCard({
  quote,
  actionable,
  onAccept,
  onReject,
}: {
  quote: QuoteOut;
  actionable: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t } = useAppTranslation();
  const validDays = daysUntil(quote.valid_until);
  const expired = validDays !== null && validDays < 0;
  const meta = [
    quote.prepared_by_name
      ? t('cases.quote.sentBy', { date: formatDate(quote.created_at), name: quote.prepared_by_name })
      : t('cases.quote.sent', { date: formatDate(quote.created_at) }),
    quote.valid_until ? t('cases.quote.validUntil', { date: formatDate(quote.valid_until) }) : null,
    quote.estimated_stay_days ? t('cases.quote.stayDays', { count: quote.estimated_stay_days, n: formatNumber(quote.estimated_stay_days) }) : null,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        quote.status === 'accepted' ? 'border-success/50 bg-success-soft/40' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold">
            <Money minor={quote.total_minor} currency={quote.currency} />
          </p>
          <p className="text-xs text-muted">{meta.join(' · ')}</p>
        </div>
        <StatusBadge status={quote.status} />
      </div>
      {quote.treatment_plan ? (
        <p className="mt-3 whitespace-pre-line text-sm text-fg/80">{quote.treatment_plan}</p>
      ) : null}
      {quote.line_items.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <Table caption={<span className="sr-only">{t('cases.quote.lineItems')}</span>}>
            <THead>
              <Tr>
                <Th>{t('cases.quote.included')}</Th>
                <Th className="hidden w-40 sm:table-cell">{t('cases.quote.share')}</Th>
                <Th className="text-end">{t('cases.quote.amount')}</Th>
              </Tr>
            </THead>
            <TBody>
              {quote.line_items.map((li, i) => {
                const pct = quote.total_minor > 0 ? Math.round((li.amount_minor / quote.total_minor) * 100) : 0;
                return (
                  <Tr key={i}>
                    <Td>
                      <span className="block font-medium">{QUOTE_LINE_CATEGORY_LABELS[li.category] ?? li.category}</span>
                      {li.description ? <span className="block text-xs text-muted">{li.description}</span> : null}
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-9 text-end text-xs text-muted tabular-nums">
                          {formatNumber(pct / 100, { style: 'percent', maximumFractionDigits: 0 })}
                        </span>
                      </span>
                    </Td>
                    <Td className="text-end tabular-nums">
                      <Money minor={li.amount_minor} currency={quote.currency} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
            <TFoot>
              <Tr>
                <Td className="font-semibold">{t('cases.quote.total')}</Td>
                <Td className="hidden sm:table-cell" />
                <Td className="text-end font-semibold tabular-nums">
                  <Money minor={quote.total_minor} currency={quote.currency} />
                </Td>
              </Tr>
            </TFoot>
          </Table>
        </div>
      ) : null}
      {quote.rejected_reason ? (
        <p className="mt-2 text-xs text-muted">{t('cases.quote.reason', { reason: quote.rejected_reason })}</p>
      ) : null}
      {actionable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onAccept} disabled={expired} icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
            {t('cases.detail.acceptQuote')}
          </Button>
          <Button variant="outline" onClick={onReject} icon={<XCircle className="h-4 w-4" aria-hidden />}>
            {t('cases.quote.decline')}
          </Button>
          {expired ? <p className="w-full text-xs text-warning-ink">{t('cases.quote.expired')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function quoteHistoryColumnsFor(t: TFn): DataTableColumn<QuoteOut>[] {
  return [
    {
      key: 'created_at',
      header: t('cases.quote.columns.sent'),
      sortable: true,
      mobile: 'primary',
      cell: (q) => (
        <DateCell
          value={q.created_at}
          display="date"
          secondary={q.prepared_by_name ? t('cases.quote.byName', { name: q.prepared_by_name }) : undefined}
        />
      ),
    },
    {
      key: 'total_minor',
      header: t('cases.quote.total'),
      align: 'end',
      sortable: true,
      cell: (q) => <MoneyCell minor={q.total_minor} currency={q.currency} />,
    },
    {
      key: 'valid_until',
      header: t('cases.quote.columns.validUntil'),
      sortable: true,
      cell: (q) => <DateCell value={q.valid_until} display="date" />,
    },
    {
      key: 'estimated_stay_days',
      header: t('cases.quote.columns.hospitalStay'),
      sortable: true,
      cell: (q) =>
        q.estimated_stay_days ? (
          t('cases.quote.stayDaysShort', { count: q.estimated_stay_days, n: formatNumber(q.estimated_stay_days) })
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('cases.quote.columns.status'),
      sortable: true,
      mobile: 'badge',
      cell: (q) => <PatientStatus status={q.status} kind="quote" />,
    },
  ];
}
