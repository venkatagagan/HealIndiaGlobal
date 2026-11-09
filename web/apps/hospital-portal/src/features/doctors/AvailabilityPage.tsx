import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { ArrowLeft, ChevronLeft, ChevronRight, Save, Wand2 } from 'lucide-react';
import {
  SLOT_KIND_LABELS,
  errorMessage,
  hospitalPortalApi,
  type AvailabilityDay,
  type AvailabilitySlotIn,
  type SlotKind,
} from '@hig/shared/api';
import { useHospital } from '../../auth/HospitalProvider';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorState,
  FormField,
  Input,
  PageHeader,
  Skeleton,
} from '../../components/ui';
import { cn } from '../../lib/format';
import { qk, useHospitalDoctors } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const KINDS: SlotKind[] = ['consultation', 'admission'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const keyOf = (date: string, kind: SlotKind) => `${date}|${kind}`;

/** Per-day consultation / admission capacity for one doctor (GET/PUT /hospital-portal/doctors/{id}/availability). */
export function AvailabilityPage() {
  const { doctorId = '' } = useParams();
  const { canManage } = useHospital();
  const queryClient = useQueryClient();
  const doctors = useHospitalDoctors();
  const doctor = doctors.data?.find((d) => d.id === doctorId);
  useDocumentTitle(doctor ? `Availability · ${doctor.full_name}` : 'Availability');

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const from = format(startOfMonth(month), 'yyyy-MM-dd');
  const to = format(endOfMonth(month), 'yyyy-MM-dd');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState({ consultation: '8', admission: '2', weekdaysOnly: true });

  const availability = useQuery({
    queryKey: qk.availability(doctorId, from, to),
    queryFn: () => hospitalPortalApi.getDoctorAvailability(doctorId, { from, to }),
    enabled: !!doctorId,
  });

  const server = useMemo(() => {
    const map = new Map<string, AvailabilityDay>();
    for (const slot of availability.data ?? []) map.set(keyOf(slot.date.slice(0, 10), slot.slot_kind), slot);
    return map;
  }, [availability.data]);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const today = startOfDay(new Date());
  const leadingBlanks = getDay(startOfMonth(month));

  const valueOf = (date: string, kind: SlotKind): string =>
    edits[keyOf(date, kind)] ?? String(server.get(keyOf(date, kind))?.capacity ?? '');

  const invalid = Object.entries(edits).filter(([key, v]) => {
    if (v.trim() === '') return false;
    if (!/^\d{1,3}$/.test(v.trim())) return true;
    const booked = server.get(key)?.booked ?? 0;
    return Number(v) < booked;
  });
  const dirty = Object.keys(edits).length > 0;

  const save = useMutation({
    mutationFn: () => {
      const slots: AvailabilitySlotIn[] = Object.entries(edits).map(([key, v]) => {
        const [date, kind] = key.split('|') as [string, SlotKind];
        return { date, slot_kind: kind, capacity: v.trim() === '' ? 0 : Number(v) };
      });
      return hospitalPortalApi.setDoctorAvailability(doctorId, slots);
    },
    onSuccess: () => {
      toast.success('Availability saved');
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ['doctor-availability', doctorId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changeMonth = (delta: number) => {
    if (dirty && !window.confirm('Discard unsaved availability changes for this month?')) return;
    setEdits({});
    setMonth((m) => addMonths(m, delta));
  };

  const applyBulk = () => {
    const next = { ...edits };
    for (const day of days) {
      if (isBefore(day, today)) continue;
      const dow = getDay(day);
      if (bulk.weekdaysOnly && (dow === 0 || dow === 6)) continue;
      const date = format(day, 'yyyy-MM-dd');
      for (const kind of KINDS) {
        const v = bulk[kind].trim();
        if (/^\d{1,3}$/.test(v)) next[keyOf(date, kind)] = v;
      }
    }
    setEdits(next);
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/doctors" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Doctors
          </Link>
        }
        title={doctor ? `Availability · ${doctor.full_name}` : 'Doctor availability'}
        description="Daily capacity for teleconsultations and admissions. Patients only see days with free capacity."
        actions={
          canManage ? (
            <Button
              icon={<Save className="h-4 w-4" aria-hidden />}
              disabled={!dirty || invalid.length > 0}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Save changes
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <Card>
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{format(month, 'MMMM yyyy')}</h2>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => changeMonth(-1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="outline" size="icon" aria-label="Next month" onClick={() => changeMonth(1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          <CardBody>
            {availability.isError ? (
              <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
            ) : (
              <div className="overflow-x-auto">
                <div className="grid min-w-[46rem] grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="pb-1 text-center text-xs font-semibold text-slate-500">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: leadingBlanks }, (_, i) => (
                    <div key={`blank-${i}`} aria-hidden />
                  ))}
                  {days.map((day) => {
                    const date = format(day, 'yyyy-MM-dd');
                    const past = isBefore(day, today);
                    return (
                      <div
                        key={date}
                        className={cn(
                          'rounded-lg border p-1.5',
                          past
                            ? 'border-slate-100 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-surface-dark'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      >
                        <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{format(day, 'd')}</p>
                        {availability.isPending ? (
                          <Skeleton className="h-14" />
                        ) : (
                          KINDS.map((kind) => {
                            const key = keyOf(date, kind);
                            const slot = server.get(key);
                            const value = valueOf(date, kind);
                            const bad = invalid.some(([k]) => k === key);
                            return (
                              <div key={kind} className="mb-1 flex items-center gap-1">
                                <label htmlFor={`av-${key}`} className="w-5 text-[10px] font-semibold text-slate-500" title={SLOT_KIND_LABELS[kind]}>
                                  {kind === 'consultation' ? 'C' : 'A'}
                                  <span className="sr-only">
                                    {SLOT_KIND_LABELS[kind]} capacity on {format(day, 'd MMMM')}
                                  </span>
                                </label>
                                <Input
                                  id={`av-${key}`}
                                  inputMode="numeric"
                                  className={cn('h-7 px-1.5 text-xs', edits[key] !== undefined && 'border-accent-500', bad && 'border-danger-500')}
                                  value={value}
                                  disabled={past || !canManage}
                                  aria-invalid={bad}
                                  placeholder="0"
                                  onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                                />
                                {slot && slot.booked > 0 && (
                                  <span className="text-[10px] whitespace-nowrap text-slate-500" title="Already booked">
                                    {slot.booked}b
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">
              C = teleconsultation slots, A = admissions per day. "b" shows slots already booked; capacity cannot go below it.
              {invalid.length > 0 && <span className="ml-1 text-danger-500">Fix the highlighted days before saving.</span>}
            </p>
          </CardBody>
        </Card>

        {canManage && (
          <Card className="self-start">
            <CardHeader title="Quick fill" description="Apply the same capacity to the rest of this month." />
            <CardBody className="space-y-4">
              <FormField label="Consultations per day" htmlFor="bulk-c">
                <Input
                  id="bulk-c"
                  inputMode="numeric"
                  value={bulk.consultation}
                  onChange={(e) => setBulk((b) => ({ ...b, consultation: e.target.value }))}
                />
              </FormField>
              <FormField label="Admissions per day" htmlFor="bulk-a">
                <Input
                  id="bulk-a"
                  inputMode="numeric"
                  value={bulk.admission}
                  onChange={(e) => setBulk((b) => ({ ...b, admission: e.target.value }))}
                />
              </FormField>
              <Checkbox
                label="Weekdays only"
                checked={bulk.weekdaysOnly}
                onChange={(e) => setBulk((b) => ({ ...b, weekdaysOnly: e.target.checked }))}
              />
              <Button variant="outline" className="w-full" icon={<Wand2 className="h-4 w-4" aria-hidden />} onClick={applyBulk}>
                Apply to {format(month, 'MMMM')}
              </Button>
              {dirty && (
                <Button variant="ghost" className="w-full" onClick={() => setEdits({})}>
                  Discard changes
                </Button>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
