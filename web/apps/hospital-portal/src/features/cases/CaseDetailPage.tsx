import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CalendarCheck, FileSignature, MessageSquare } from 'lucide-react';
import {
  CASE_STATUS_LABELS,
  GENDER_LABELS,
  QUOTE_LINE_CATEGORY_LABELS,
  casesApi,
  errorMessage,
  isApiError,
  messagingApi,
  type CaseDetail,
  type QuoteLineItem,
  type QuoteOut,
} from '@hig/shared/api';
import { DataTable, MoneyCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  PageLoader,
  StatusBadge,
} from '../../components/ui';
import { countryName, formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ConfirmedAnalysesList } from '@hig/shared/docai';
import { CaseDocuments } from './CaseDocuments';
import { QuoteFormModal } from './QuoteFormModal';
import { ScreeningSummary } from './ScreeningSummary';

type LineRow = QuoteLineItem & { index: number; currency: string };

const LINE_COLUMNS: DataTableColumn<LineRow>[] = [
  {
    key: 'category',
    header: 'Category',
    sortable: true,
    sortValue: (l) => QUOTE_LINE_CATEGORY_LABELS[l.category] ?? l.category,
    cell: (l) => <span className="text-muted">{QUOTE_LINE_CATEGORY_LABELS[l.category] ?? l.category}</span>,
  },
  { key: 'description', header: 'Description', className: 'max-w-80', cell: (l) => <TextCell primary={l.description || '—'} /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (l) => l.amount_minor,
    cell: (l) => <MoneyCell minor={l.amount_minor} currency={l.currency} />,
  },
];

function QuoteCard({ quote, latest }: { quote: QuoteOut; latest: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMoney(quote.total_minor, quote.currency)}</p>
          <p className="text-xs text-slate-500">
            Sent {formatDateTime(quote.created_at)}
            {quote.prepared_by_name ? ` by ${quote.prepared_by_name}` : ''} · valid until {formatDate(quote.valid_until)}
            {quote.estimated_stay_days != null ? ` · ${quote.estimated_stay_days} days stay` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {latest && <Badge tone="blue">Latest</Badge>}
          <StatusBadge status={quote.status} />
        </div>
      </div>
      <p className="mt-3 text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{quote.treatment_plan}</p>
      <DataTable
        className="mt-3 shadow-none"
        caption={`Line items of the quote sent ${formatDate(quote.created_at)}`}
        columns={LINE_COLUMNS}
        rows={quote.line_items.map((line, index) => ({ ...line, index, currency: quote.currency }))}
        rowKey={(line) => line.index}
        density="compact"
      />
      {quote.rejected_reason && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">Patient feedback: {quote.rejected_reason}</p>
      )}
    </div>
  );
}

function Timeline({ detail }: { detail: CaseDetail }) {
  const entries = [...detail.timeline].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Card>
      <CardHeader title="Timeline" />
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">Case created {formatDateTime(detail.created_at)}.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-slate-200 pl-5 dark:border-slate-700">
            {entries.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1 -left-[1.6rem] h-3 w-3 rounded-full border-2 border-white bg-brand-500 dark:border-card-dark" />
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {e.from_status ? `${CASE_STATUS_LABELS[e.from_status]} → ` : ''}
                  {CASE_STATUS_LABELS[e.to_status] ?? e.to_status}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(e.created_at)}
                  {e.changed_by_name ? ` · ${e.changed_by_name}` : ''}
                </p>
                {e.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

export function CaseDetailPage() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const detail = useQuery({ queryKey: qk.case(caseId), queryFn: () => casesApi.get(caseId), enabled: !!caseId });
  useDocumentTitle(detail.data?.case_number ?? 'Case');

  const decline = useMutation({
    mutationFn: (note: string) => casesApi.changeStatus(caseId, { to_status: 'declined', note }),
    onSuccess: () => {
      toast.success('Enquiry declined');
      setDeclineOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openConversation = useMutation({
    mutationFn: async () => {
      const conversations = await messagingApi.listConversations();
      const existing = conversations.find((c) => c.case_id === caseId);
      return existing ?? messagingApi.createConversation({ case_id: caseId, subject: detail.data?.case_number });
    },
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: qk.conversations });
      navigate(`/messages?c=${encodeURIComponent(conversation.id)}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (detail.isPending) return <PageLoader />;
  if (detail.isError) {
    return (
      <Card>
        <ErrorState
          title={isApiError(detail.error) && detail.error.isNotFound ? 'Case not found' : 'Could not load case'}
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      </Card>
    );
  }

  const c = detail.data;
  const canQuote = c.status === 'enquiry' || c.status === 'quoted';
  const canDecline = c.status === 'enquiry' || c.status === 'quoted';
  const quotes = [...c.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <PageHeader
        back={
          <Link to="/cases" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All cases
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.case_number} <StatusBadge status={c.status} />
          </span>
        }
        description={`${c.procedure?.name ?? c.specialty?.name ?? 'General enquiry'} · received ${formatDateTime(c.created_at)}`}
        actions={
          <>
            <Button
              variant="outline"
              icon={<MessageSquare className="h-4 w-4" aria-hidden />}
              loading={openConversation.isPending}
              onClick={() => openConversation.mutate()}
            >
              Conversation
            </Button>
            {c.booking && (
              <LinkButton to={`/bookings/${c.booking.id}`} variant="outline" icon={<CalendarCheck className="h-4 w-4" aria-hidden />}>
                Booking {c.booking.booking_number}
              </LinkButton>
            )}
            {canDecline && (
              <Button variant="outline" icon={<Ban className="h-4 w-4" aria-hidden />} onClick={() => setDeclineOpen(true)}>
                Decline
              </Button>
            )}
            {canQuote && (
              <Button icon={<FileSignature className="h-4 w-4" aria-hidden />} onClick={() => setQuoteOpen(true)}>
                {c.latest_quote ? 'Revise quote' : 'Send quote'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Patient" />
            <CardBody className="space-y-4">
              <DescriptionList
                items={[
                  { label: 'Name', value: c.patient.full_name },
                  { label: 'Age', value: c.patient.age != null ? `${c.patient.age} years` : '—' },
                  { label: 'Gender', value: c.patient.gender ? GENDER_LABELS[c.patient.gender] : '—' },
                  { label: 'Nationality', value: countryName(c.patient.nationality) },
                  { label: 'Requested doctor', value: c.doctor ? `${c.doctor.full_name}${c.doctor.specialty_name ? ` (${c.doctor.specialty_name})` : ''}` : '—' },
                  { label: 'Referred by', value: c.agent?.agency_name ?? 'Direct' },
                  { label: 'Care coordinator', value: c.coordinator?.full_name ?? 'Not assigned yet' },
                ]}
              />
              {c.patient_notes && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Patient message</h3>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{c.patient_notes}</p>
                </div>
              )}
              {c.medical_summary && (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Medical summary</h3>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{c.medical_summary}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <ScreeningSummary screening={c.screening} />
          <Card>
            <CardHeader
              title="Report readings (confirmed by the patient)"
              description="AI-extracted findings from the patient's medical reports, reviewed and confirmed by the patient. Values the patient changed are marked. Always verify against the original documents."
            />
            <CardBody>
              <ConfirmedAnalysesList
                caseId={c.id}
                audience="clinical"
                emptyText="No confirmed report readings for this case yet."
              />
            </CardBody>
          </Card>
          <CaseDocuments documents={c.documents} caseId={c.id} />

          <Card>
            <CardHeader
              title="Quotes"
              actions={
                canQuote ? (
                  <Button size="sm" onClick={() => setQuoteOpen(true)}>
                    {c.latest_quote ? 'Revise quote' : 'Send quote'}
                  </Button>
                ) : undefined
              }
            />
            <CardBody className="space-y-4">
              {quotes.length === 0 ? (
                <EmptyState
                  title="No quote sent yet"
                  description="Send an itemized quote so the patient can compare and book."
                  className="py-6"
                />
              ) : (
                quotes.map((q) => <QuoteCard key={q.id} quote={q} latest={q.id === c.latest_quote?.id} />)
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Timeline detail={c} />
        </div>
      </div>

      {quoteOpen && <QuoteFormModal open onClose={() => setQuoteOpen(false)} detail={c} />}
      <ConfirmDialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        onConfirm={(note) => decline.mutate(note)}
        loading={decline.isPending}
        tone="danger"
        title="Decline this enquiry?"
        description="The patient and their coordinator will be notified. This cannot be undone."
        noteLabel="Note to the patient"
        noteRequired
        notePlaceholder="e.g. The requested procedure is not offered at our centre. We recommend…"
        confirmLabel="Decline enquiry"
      />
    </>
  );
}
