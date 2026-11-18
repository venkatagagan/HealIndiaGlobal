/**
 * Quick quote: up to 3 hospitals, the treatment, reports to share (existing or a new upload), notes and consent,
 * then POST /cases/quote-request. Opens the side-by-side comparison with the "Quotes due by" countdown.
 * Route: /app/quotes/new?h=<id,id>&procedure=<slug>&screening=<id>&specialty=<id>
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock3, MapPin, Plus, X } from 'lucide-react';
import {
  authApi,
  catalogDisplayApi,
  errorMessage,
  isGuardianConsentRequiredError,
  type DocumentKind,
  type HospitalDetail,
  type Uuid,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { pk, useHospitalList, useProcedure, useQuoteRequest } from '../../api/phase1';
import { useDocuments } from '../../api/queries';
import { GuestAccountRequired, useGuestGate } from '../../components/CareGates';
import { BackLink, UploadButton } from '../../components/common';
import { openGuardianConsent } from '../../components/GuardianConsent';
import { EarliestChips } from '../../components/phase1';
import { paths } from '../../lib/paths';
import { formatDate, useDebouncedValue, useDocumentTitle } from '../../lib/shared';
import { MAX_QUOTE_HOSPITALS } from '../catalog/ProcedurePage';
import { SHARE_CONSENT_VERSION } from '../screening/RequestQuoteDialog';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../ui/primitives';

const NON_MEDICAL: readonly DocumentKind[] = ['passport', 'visa', 'invitation_letter', 'invoice', 'receipt', 'bank_proof', 'payment_proof'];

function HospitalChip({ id, hospital, pending, onRemove }: { id: Uuid; hospital?: HospitalDetail; pending: boolean; onRemove: () => void }) {
  const { t } = useAppTranslation();
  const name = hospital?.name;
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0">
        {pending ? <Skeleton className="h-5 w-40" /> : <p className="font-medium text-fg">{name ?? id}</p>}
        {hospital ? (
          <>
            <p className="flex items-center gap-1 text-xs text-muted">
              <MapPin className="size-3.5" aria-hidden />
              {hospital.city}
            </p>
            <EarliestChips className="mt-1" admission={hospital.next_available_admission} showConsultation={false} />
          </>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove} aria-label={t('quickQuote.removeHospital', { hospital: name ?? '' })} icon={<X className="size-4" aria-hidden />} />
    </li>
  );
}

function HospitalPicker({ procedure, exclude, onPick }: { procedure?: string; exclude: Uuid[]; onPick: (id: Uuid) => void }) {
  const { t } = useAppTranslation();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 300);
  const list = useHospitalList({ q: debounced || undefined, procedure, sort: 'soonest', page_size: 8 });
  const items = (list.data?.items ?? []).filter((h) => !exclude.includes(h.id));
  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <label className="block">
        <span className="sr-only">{t('quickQuote.searchHospitals')}</span>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('quickQuote.searchHospitals')} autoFocus />
      </label>
      {list.isPending ? (
        <Skeleton className="h-16" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{t('quickQuote.noMoreHospitals')}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {items.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPick(h.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-start text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg">{h.name}</span>
                  <span className="block text-xs text-muted">{h.city}</span>
                </span>
                <EarliestChips admission={h.next_available_admission} showConsultation={false} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuickQuotePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('quickQuote.title'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const gate = useGuestGate();
  const procedureSlug = params.get('procedure') ?? undefined;
  const screeningId = params.get('screening') ?? undefined;
  const specialtyId = params.get('specialty') ?? undefined;
  const [hospitals, setHospitals] = useState<Uuid[]>(() =>
    (params.get('h') ?? '').split(',').filter(Boolean).slice(0, MAX_QUOTE_HOSPITALS),
  );
  const [picking, setPicking] = useState(false);
  const [procedureId, setProcedureId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [docIds, setDocIds] = useState<Uuid[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const procedure = useProcedure(procedureSlug);
  const details = useQueries({
    queries: hospitals.map((id) => ({
      queryKey: pk.hospitalDetail(id),
      queryFn: () => catalogDisplayApi.hospital(id),
      staleTime: 5 * 60_000,
    })),
  });
  const firstHospital = details[0];
  const documents = useDocuments();
  const request = useQuoteRequest();

  const medicalDocs = useMemo(
    () => (documents.data ?? []).filter((d) => !NON_MEDICAL.includes(d.kind) && !d.kind.startsWith('kyc')),
    [documents.data],
  );
  const procedureOptions = useMemo(
    () => (firstHospital?.data?.procedures ?? []).filter((p) => p.is_active !== false).map((p) => p.procedure),
    [firstHospital?.data],
  );
  const chosenProcedureId = procedure.data?.id ?? (procedureId || undefined);
  const hospitalNames = details.map((d) => d.data?.name).filter((n): n is string => !!n);

  async function submit() {
    if (!consent || hospitals.length === 0 || gate.requireAccount()) return;
    setError(null);
    try {
      await authApi.giveConsent({ kind: 'share_with_hospitals', version: SHARE_CONSENT_VERSION, granted: true });
      const group = await request.mutateAsync({
        hospital_ids: hospitals,
        procedure_id: chosenProcedureId ?? null,
        specialty_id: chosenProcedureId ? null : (specialtyId ?? null),
        screening_id: screeningId ?? null,
        notes: notes.trim() || null,
        document_ids: docIds,
        consent_share: true,
      });
      toast.success(t('quickQuote.sent'));
      navigate(paths.quoteGroup(group.quote_group_id), { replace: true });
    } catch (err) {
      if (gate.handleError(err)) return;
      if (isGuardianConsentRequiredError(err)) {
        openGuardianConsent();
        return;
      }
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={<BackLink to={procedureSlug ? paths.procedure(procedureSlug) : paths.dashboard}>{t('quickQuote.back')}</BackLink>}
        title={t('quickQuote.title')}
        description={procedure.data ? procedure.data.name : undefined}
      />
      {gate.dialog}
      {gate.isGuest ? <GuestAccountRequired action={t('quickQuote.guestAction')} /> : null}

      <Alert tone="blue" icon={<Clock3 className="size-5" aria-hidden />}>
        {t('quickQuote.slaNote')}
      </Alert>

      <Card>
        <CardHeader title={t('quickQuote.hospitals', { count: hospitals.length, max: MAX_QUOTE_HOSPITALS })} />
        <CardBody className="space-y-3">
          {hospitals.length ? (
            <ul className="space-y-2">
              {hospitals.map((id, i) => (
                <HospitalChip
                  key={id}
                  id={id}
                  hospital={details[i]?.data}
                  pending={details[i]?.isPending ?? true}
                  onRemove={() => setHospitals((prev) => prev.filter((x) => x !== id))}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('quickQuote.noHospital')}</p>
          )}
          {hospitals.length < MAX_QUOTE_HOSPITALS ? (
            picking ? (
              <HospitalPicker
                procedure={procedureSlug}
                exclude={hospitals}
                onPick={(id) => {
                  setHospitals((prev) => (prev.length >= MAX_QUOTE_HOSPITALS ? prev : [...prev, id]));
                  setPicking(false);
                }}
              />
            ) : (
              <Button variant="outline" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPicking(true)}>
                {t('quickQuote.addHospital')}
              </Button>
            )
          ) : (
            <p className="text-xs text-muted">{t('quickQuote.maxHospitals', { max: MAX_QUOTE_HOSPITALS })}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('quickQuote.treatment')} />
        <CardBody>
          {procedureSlug ? (
            <p className="font-medium text-fg">{procedure.data?.name ?? <Skeleton className="h-5 w-40" />}</p>
          ) : (
            <Select aria-label={t('quickQuote.treatment')} value={procedureId} onChange={(e) => setProcedureId(e.target.value)}>
              <option value="">{t('quickQuote.notSure')}</option>
              {procedureOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('quickQuote.reports')} description={t('quickQuote.reportsHint')} />
        <CardBody className="space-y-3">
          {documents.isPending ? (
            <Skeleton className="h-12" />
          ) : medicalDocs.length ? (
            <ul className="space-y-2">
              {medicalDocs.map((d) => (
                <li key={d.id}>
                  <Checkbox
                    checked={docIds.includes(d.id)}
                    onChange={(e) =>
                      setDocIds((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))
                    }
                    label={d.file_name}
                    description={formatDate(d.created_at)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('quickQuote.noReports')}</p>
          )}
          {!gate.isGuest ? (
            <UploadButton
              kind="medical_report"
              size="sm"
              label={t('quickQuote.upload')}
              onUploaded={(doc) => setDocIds((prev) => (prev.includes(doc.id) ? prev : [...prev, doc.id]))}
            />
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <Field label={t('quickQuote.notesLabel')} htmlFor="qq-notes" hint={t('quickQuote.notesHint')}>
            <Textarea id="qq-notes" rows={4} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Checkbox
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            label={
              hospitalNames.length <= 1
                ? t('quickQuote.consentOne', { hospital: hospitalNames[0] ?? t('quickQuote.theHospital') })
                : t('quickQuote.consentMany', { hospitals: hospitalNames.join(', ') })
            }
          />
          {error ? <Alert tone="red">{error}</Alert> : null}
          <div className="flex justify-end">
            <Button
              size="lg"
              loading={request.isPending}
              disabled={!consent || hospitals.length === 0 || gate.isGuest}
              onClick={() => void submit()}
            >
              {t('quickQuote.sendTo', { count: hospitals.length })}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
