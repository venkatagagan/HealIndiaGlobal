import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, BadgeCheck, Building2, Plus, Search, Send, Star, X } from 'lucide-react';
import { agentPortalApi, catalogApi, screeningsApi, type AgentPatientOut, type HospitalCard } from '@hig/shared/api';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui';
import { MAX_ENQUIRY_HOSPITALS } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { qk, useSpecialties } from '../../lib/queries';
import { formatDate, formatMoney, useDebouncedValue, useDocumentTitle } from '../../lib/shared';
import { PatientPicker } from '../patients/PatientPicker';
import { EnquiryDialog, type EnquiryTarget } from './EnquiryDialog';

export function NewEnquiryPage() {
  useDocumentTitle('New enquiry');
  const [params] = useSearchParams();
  const initialPatientId = params.get('patient');
  const initialPatient = useQuery({
    queryKey: qk.patient(initialPatientId ?? ''),
    queryFn: () => agentPortalApi.getPatient(initialPatientId ?? ''),
    enabled: Boolean(initialPatientId),
  });

  const [patient, setPatient] = useState<AgentPatientOut | null>(null);
  const [initialCleared, setInitialCleared] = useState(false);
  const fromUrl = !patient && !initialCleared && initialPatient.data ? initialPatient.data : null;
  const currentPatient = patient ?? fromUrl;
  const [screeningId, setScreeningId] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [procedureSlug, setProcedureSlug] = useState('');
  const [chosen, setChosen] = useState<HospitalCard[]>([]);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [dialogOpen, setDialogOpen] = useState(false);

  const specialties = useSpecialties();
  const procedures = useQuery({
    queryKey: ['procedures', specialty],
    queryFn: () => catalogApi.listProcedures({ specialty }),
    enabled: Boolean(specialty),
  });
  const screenings = useQuery({
    queryKey: qk.screenings({ patient_id: currentPatient?.id, status: 'completed' }),
    queryFn: () => screeningsApi.list({ patient_id: currentPatient?.id, status: 'completed', page_size: 20 }),
    enabled: Boolean(currentPatient),
  });
  const hospitals = useQuery({
    queryKey: qk.hospitals({ q, specialty, procedure: procedureSlug, page_size: 12 }),
    queryFn: () =>
      catalogApi.listHospitals({
        q: q || undefined,
        specialty: specialty || undefined,
        procedure: procedureSlug || undefined,
        page_size: 12,
      }),
  });

  const specialtyObj = specialties.data?.find((s) => s.slug === specialty);
  const procedureObj = procedures.data?.find((p) => p.slug === procedureSlug);

  const add = (h: HospitalCard) => {
    if (chosen.some((c) => c.id === h.id)) return;
    if (chosen.length >= MAX_ENQUIRY_HOSPITALS) {
      toast.info(`You can send one enquiry to up to ${MAX_ENQUIRY_HOSPITALS} hospitals`);
      return;
    }
    setChosen([...chosen, h]);
  };

  const targets: EnquiryTarget[] = chosen.map((h) => ({
    hospital_id: h.id,
    hospital_name: h.name,
    procedure_id: procedureObj?.id ?? null,
    procedure_name: procedureObj?.name ?? null,
    specialty_id: specialtyObj?.id ?? null,
  }));

  if (initialPatientId && initialPatient.isPending) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        back={
          <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Cases
          </Link>
        }
        title="New enquiry"
        description={`Send the same enquiry to up to ${MAX_ENQUIRY_HOSPITALS} hospitals. Each hospital gets its own case and replies with an itemised quote.`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="1. Patient" />
            <div className="space-y-4 p-5">
              {fromUrl ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{patientName(fromUrl)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setInitialCleared(true)}>
                    Change
                  </Button>
                </div>
              ) : (
                <PatientPicker value={currentPatient} onChange={(p) => { setPatient(p); setScreeningId(''); }} />
              )}
              {currentPatient && (
                <FormField label="Link a screening (optional)" htmlFor="enq-screening" hint="Hospitals see the screening summary and attached reports.">
                  <Select id="enq-screening" value={screeningId} onChange={(e) => setScreeningId(e.target.value)} disabled={screenings.isPending}>
                    <option value="">No screening</option>
                    {(screenings.data?.items ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {(s.specialty?.name ?? s.ai_result?.suggested_specialties[0]?.name ?? 'Screening') + ' · ' + formatDate(s.completed_at ?? s.created_at)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              {screeningId && (
                <p className="text-xs text-muted">
                  Tip: the{' '}
                  <Link to={`/screenings/${screeningId}`} className="font-medium text-primary-ink hover:underline">
                    screening results
                  </Link>{' '}
                  list AI-matched hospitals you can select directly.
                </p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="2. Treatment" description="Optional — helps hospitals quote accurately" />
            <div className="space-y-4 p-5">
              <FormField label="Specialty" htmlFor="enq-specialty">
                <Select
                  id="enq-specialty"
                  value={specialty}
                  onChange={(e) => {
                    setSpecialty(e.target.value);
                    setProcedureSlug('');
                  }}
                >
                  <option value="">Any specialty</option>
                  {(specialties.data ?? []).map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Procedure" htmlFor="enq-procedure">
                <Select id="enq-procedure" value={procedureSlug} onChange={(e) => setProcedureSlug(e.target.value)} disabled={!specialty}>
                  <option value="">{specialty ? 'Not sure yet' : 'Choose a specialty first'}</option>
                  {(procedures.data ?? []).map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </Card>
          <Card>
            <CardHeader title={`3. Selected hospitals (${chosen.length}/${MAX_ENQUIRY_HOSPITALS})`} />
            <div className="space-y-2 p-5">
              {chosen.length === 0 && <p className="text-sm text-muted">Add hospitals from the list.</p>}
              {chosen.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-fg"
                    aria-label={`Remove ${h.name}`}
                    onClick={() => setChosen(chosen.filter((c) => c.id !== h.id))}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
              <Button
                className="mt-3 w-full"
                icon={<Send className="h-4 w-4" aria-hidden />}
                disabled={!currentPatient || chosen.length === 0}
                onClick={() => setDialogOpen(true)}
              >
                Review & send
              </Button>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="Find hospitals" description="Only verified, active hospitals are listed" />
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input type="search" aria-label="Search hospitals" placeholder="Hospital name or city" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {hospitals.isPending ? (
            <div className="flex justify-center p-10">
              <Spinner />
            </div>
          ) : hospitals.isError ? (
            <EmptyState title="Could not load hospitals" description="Check your connection and try again." />
          ) : hospitals.data.items.length === 0 ? (
            <EmptyState title="No hospitals match" description="Try another name, or clear the specialty and procedure filters." />
          ) : (
            <ul className="divide-y divide-border">
              {hospitals.data.items.map((h) => {
                const isChosen = chosen.some((c) => c.id === h.id);
                return (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/hospitals/${h.slug}`} className="font-medium hover:underline">
                        {h.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {h.city}
                        {h.state ? `, ${h.state}` : ''}
                        {h.starting_price_minor != null ? ` · from ${formatMoney(h.starting_price_minor, h.currency, undefined, { trimZeros: true })}` : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {h.accreditations.map((a) => (
                          <Badge key={a} tone="info">
                            <BadgeCheck className="h-3 w-3" aria-hidden /> {a.toUpperCase()}
                          </Badge>
                        ))}
                        {h.rating_avg != null && (
                          <Badge>
                            <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden /> {Number(h.rating_avg).toFixed(1)} ({h.rating_count})
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isChosen ? 'secondary' : 'outline'}
                      icon={isChosen ? undefined : <Plus className="h-4 w-4" aria-hidden />}
                      onClick={() => (isChosen ? setChosen(chosen.filter((c) => c.id !== h.id)) : add(h))}
                    >
                      {isChosen ? 'Added' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border px-5 py-3 text-right">
            <ButtonLink to="/hospitals" variant="ghost" size="sm">
              Open full directory
            </ButtonLink>
          </div>
        </Card>
      </div>

      {currentPatient && (
        <EnquiryDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          targets={targets}
          patientId={currentPatient.id}
          patientLabel={patientName(currentPatient)}
          screeningId={screeningId || null}
        />
      )}
    </div>
  );
}
