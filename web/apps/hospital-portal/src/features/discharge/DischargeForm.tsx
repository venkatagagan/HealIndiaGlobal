/**
 * Discharge summary form (hospital): doctor, stay dates, diagnosis, procedure, hospital course, medicines
 * (add / remove rows), follow-up, warning signs, allergies, investigations and attachments. Read-only for final
 * versions (the whole form is a disabled fieldset).
 */
import { useId, type ReactNode } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import {
  DISCHARGE_REQUIRED_FIELDS,
  type DischargeAttachment,
  type DischargeMedication,
  type DischargePrefillOut,
  type DischargeSummaryFields,
  type DischargeSummaryOut,
} from '@hig/shared/api';
import { Button, Card, CardBody, CardHeader, Checkbox, FormField, Input, Select, Textarea } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { cn, formatBytes } from '../../lib/format';
import { useHospitalDoctors } from '../../lib/queries';

type TFn = ReturnType<typeof useAppTranslation>['t'];

export interface MedRow {
  key: string;
  name: string;
  dose: string;
  frequency: string;
  duration_days: string;
  route: string;
  instructions: string;
}

export interface DischargeFormState {
  doctor_id: string;
  doctor_name: string;
  doctor_registration: string;
  admission_date: string;
  discharge_date: string;
  diagnosis: string;
  diagnosis_code: string;
  procedure_name: string;
  procedure_code: string;
  procedure_date: string;
  hospital_course: string;
  follow_up_instructions: string;
  red_flag_symptoms: string;
  allergies: string;
  investigations_summary: string;
  medications: MedRow[];
  attachments: string[];
}

export type FormErrors = Partial<Record<keyof DischargeFormState | `med.${number}.${'name' | 'duration_days'}`, string>>;

let rowSeq = 0;
const newKey = () => `m${++rowSeq}`;
const s = (v: string | null | undefined) => v ?? '';

export function emptyMedRow(): MedRow {
  return { key: newKey(), name: '', dose: '', frequency: '', duration_days: '', route: '', instructions: '' };
}

function medRow(m: DischargeMedication): MedRow {
  return {
    key: newKey(),
    name: m.name,
    dose: s(m.dose),
    frequency: s(m.frequency),
    duration_days: m.duration_days ? String(m.duration_days) : '',
    route: s(m.route),
    instructions: s(m.instructions),
  };
}

export function formFromSummary(d: DischargeSummaryOut): DischargeFormState {
  return {
    doctor_id: s(d.doctor_id),
    doctor_name: s(d.doctor_name),
    doctor_registration: s(d.doctor_registration),
    admission_date: s(d.admission_date),
    discharge_date: s(d.discharge_date),
    diagnosis: s(d.diagnosis),
    diagnosis_code: s(d.diagnosis_code),
    procedure_name: s(d.procedure_name),
    procedure_code: s(d.procedure_code),
    procedure_date: s(d.procedure_date),
    hospital_course: s(d.hospital_course),
    follow_up_instructions: s(d.follow_up_instructions),
    red_flag_symptoms: s(d.red_flag_symptoms),
    allergies: s(d.allergies),
    investigations_summary: s(d.investigations_summary),
    medications: d.medications.map(medRow),
    attachments: d.attachments.map((a) => a.id),
  };
}

export function formFromPrefill(p: DischargePrefillOut): DischargeFormState {
  return {
    doctor_id: s(p.doctor_id),
    doctor_name: s(p.doctor_name),
    doctor_registration: s(p.doctor_registration),
    admission_date: s(p.admission_date),
    discharge_date: s(p.discharge_date),
    diagnosis: s(p.diagnosis),
    diagnosis_code: '',
    procedure_name: s(p.procedure_name),
    procedure_code: '',
    procedure_date: s(p.procedure_date),
    hospital_course: s(p.hospital_course),
    follow_up_instructions: '',
    red_flag_symptoms: '',
    allergies: s(p.allergies),
    investigations_summary: '',
    medications: [],
    attachments: [],
  };
}

const CODE_RE = /^[A-Za-z0-9.-]{1,20}$/;
const n = (v: string) => v.trim() || null;

/** Client checks (the server validates again). */
export function validateForm(f: DischargeFormState, t: TFn): FormErrors {
  const errors: FormErrors = {};
  if (f.diagnosis_code.trim() && !CODE_RE.test(f.diagnosis_code.trim())) errors.diagnosis_code = t('discharge.editor.errors.code');
  if (f.procedure_code.trim() && !CODE_RE.test(f.procedure_code.trim())) errors.procedure_code = t('discharge.editor.errors.code');
  if (f.admission_date && f.discharge_date && f.discharge_date < f.admission_date) {
    errors.discharge_date = t('discharge.editor.errors.dates');
  }
  f.medications.forEach((m, i) => {
    const filled = [m.name, m.dose, m.frequency, m.duration_days, m.route, m.instructions].some((v) => v.trim());
    if (filled && !m.name.trim()) errors[`med.${i}.name`] = t('discharge.editor.errors.medName');
    if (m.duration_days.trim()) {
      const d = Number(m.duration_days);
      if (!Number.isInteger(d) || d < 1 || d > 3650) errors[`med.${i}.duration_days`] = t('discharge.editor.errors.duration');
    }
  });
  return errors;
}

/** PATCH / POST body ("" -> null; empty medicine rows are dropped). */
export function toPayload(f: DischargeFormState): DischargeSummaryFields {
  return {
    doctor_id: f.doctor_id || null,
    doctor_name: n(f.doctor_name),
    doctor_registration: n(f.doctor_registration),
    admission_date: f.admission_date || null,
    discharge_date: f.discharge_date || null,
    diagnosis: n(f.diagnosis),
    diagnosis_code: n(f.diagnosis_code),
    procedure_name: n(f.procedure_name),
    procedure_code: n(f.procedure_code),
    procedure_date: f.procedure_date || null,
    hospital_course: n(f.hospital_course),
    follow_up_instructions: n(f.follow_up_instructions),
    red_flag_symptoms: n(f.red_flag_symptoms),
    allergies: n(f.allergies),
    investigations_summary: n(f.investigations_summary),
    medications: f.medications
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        dose: n(m.dose),
        frequency: n(m.frequency),
        duration_days: m.duration_days.trim() ? Number(m.duration_days) : null,
        route: n(m.route),
        instructions: n(m.instructions),
      })),
    attachment_document_ids: f.attachments,
  };
}

const REQUIRED = new Set<string>(DISCHARGE_REQUIRED_FIELDS);

function Section({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

export function DischargeForm({
  value,
  onChange,
  errors,
  missing,
  documents,
  readOnly,
}: {
  value: DischargeFormState;
  onChange: (next: DischargeFormState) => void;
  errors: FormErrors;
  /** fields the server reported missing on finalize */
  missing: string[];
  /** documents that can be attached */
  documents: DischargeAttachment[];
  readOnly?: boolean;
}) {
  const { t } = useAppTranslation();
  const ids = useId();
  const doctors = useHospitalDoctors(!readOnly);
  const set = <K extends keyof DischargeFormState>(key: K, v: DischargeFormState[K]) => onChange({ ...value, [key]: v });
  const setMed = (index: number, patch: Partial<MedRow>) =>
    onChange({ ...value, medications: value.medications.map((m, i) => (i === index ? { ...m, ...patch } : m)) });
  const err = (key: keyof DischargeFormState) =>
    errors[key] ?? (missing.includes(key) ? t('discharge.editor.requiredToFinalize') : undefined);
  const req = (key: string) => REQUIRED.has(key);
  const requiredHint = t('discharge.editor.requiredHint');

  const text = (key: keyof DischargeFormState, label: string, opts: { rows?: number; hint?: string; max?: number } = {}) => (
    <FormField
      label={label}
      htmlFor={`${ids}-${key}`}
      required={req(key)}
      error={err(key)}
      hint={opts.hint ?? (req(key) ? requiredHint : undefined)}
    >
      <Textarea
        id={`${ids}-${key}`}
        rows={opts.rows ?? 4}
        maxLength={opts.max ?? 10000}
        value={value[key] as string}
        aria-invalid={!!err(key)}
        onChange={(e) => set(key, e.target.value)}
      />
    </FormField>
  );

  const doctorOptions = (doctors.data ?? [])
    .filter((d) => d.is_active || d.id === value.doctor_id)
    .map((d) => ({ value: d.id, label: d.full_name }));

  // documents already attached that are no longer in the available list stay visible (and can be removed)
  const docs = [...documents];
  for (const id of value.attachments) if (!docs.some((d) => d.id === id)) docs.push({ id, file_name: id, content_type: '', size_bytes: 0, kind: '' });

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-6">
      <Section title={t('discharge.editor.sections.doctor')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('discharge.editor.fields.doctor')} htmlFor={`${ids}-doctor`} hint={t('discharge.editor.fields.doctorHint')}>
            <Select
              id={`${ids}-doctor`}
              value={value.doctor_id}
              placeholder={t('discharge.editor.fields.doctorPick')}
              options={doctorOptions}
              onChange={(e) => {
                const doc = doctors.data?.find((d) => d.id === e.target.value);
                onChange({
                  ...value,
                  doctor_id: e.target.value,
                  doctor_name: doc ? doc.full_name : value.doctor_name,
                  doctor_registration: doc?.registration_number ?? (doc ? '' : value.doctor_registration),
                });
              }}
            />
          </FormField>
          <FormField
            label={t('discharge.editor.fields.doctorName')}
            htmlFor={`${ids}-doctor_name`}
            required
            error={err('doctor_name')}
            hint={requiredHint}
          >
            <Input
              id={`${ids}-doctor_name`}
              maxLength={200}
              value={value.doctor_name}
              aria-invalid={!!err('doctor_name')}
              onChange={(e) => set('doctor_name', e.target.value)}
            />
          </FormField>
          <FormField label={t('discharge.editor.fields.doctorRegistration')} htmlFor={`${ids}-doctor_registration`}>
            <Input
              id={`${ids}-doctor_registration`}
              dir="ltr"
              maxLength={80}
              value={value.doctor_registration}
              onChange={(e) => set('doctor_registration', e.target.value)}
            />
          </FormField>
        </div>
      </Section>

      <Section title={t('discharge.editor.sections.stay')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('discharge.editor.fields.admissionDate')} htmlFor={`${ids}-admission_date`}>
            <Input
              id={`${ids}-admission_date`}
              type="date"
              value={value.admission_date}
              onChange={(e) => set('admission_date', e.target.value)}
            />
          </FormField>
          <FormField
            label={t('discharge.editor.fields.dischargeDate')}
            htmlFor={`${ids}-discharge_date`}
            required
            error={err('discharge_date')}
            hint={requiredHint}
          >
            <Input
              id={`${ids}-discharge_date`}
              type="date"
              value={value.discharge_date}
              min={value.admission_date || undefined}
              aria-invalid={!!err('discharge_date')}
              onChange={(e) => set('discharge_date', e.target.value)}
            />
          </FormField>
        </div>
      </Section>

      <Section title={t('discharge.editor.sections.diagnosis')}>
        {text('diagnosis', t('discharge.editor.fields.diagnosis'), { rows: 3 })}
        <FormField
          label={t('discharge.editor.fields.diagnosisCode')}
          htmlFor={`${ids}-diagnosis_code`}
          error={err('diagnosis_code')}
          hint={t('discharge.editor.fields.diagnosisCodeHint')}
          className="max-w-xs"
        >
          <Input
            id={`${ids}-diagnosis_code`}
            dir="ltr"
            maxLength={20}
            value={value.diagnosis_code}
            aria-invalid={!!err('diagnosis_code')}
            onChange={(e) => set('diagnosis_code', e.target.value)}
          />
        </FormField>
      </Section>

      <Section title={t('discharge.editor.sections.procedure')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('discharge.editor.fields.procedureName')} htmlFor={`${ids}-procedure_name`} className="sm:col-span-3">
            <Input
              id={`${ids}-procedure_name`}
              maxLength={500}
              value={value.procedure_name}
              onChange={(e) => set('procedure_name', e.target.value)}
            />
          </FormField>
          <FormField
            label={t('discharge.editor.fields.procedureCode')}
            htmlFor={`${ids}-procedure_code`}
            error={err('procedure_code')}
            hint={t('discharge.editor.fields.procedureCodeHint')}
          >
            <Input
              id={`${ids}-procedure_code`}
              dir="ltr"
              maxLength={20}
              value={value.procedure_code}
              aria-invalid={!!err('procedure_code')}
              onChange={(e) => set('procedure_code', e.target.value)}
            />
          </FormField>
          <FormField label={t('discharge.editor.fields.procedureDate')} htmlFor={`${ids}-procedure_date`}>
            <Input
              id={`${ids}-procedure_date`}
              type="date"
              value={value.procedure_date}
              onChange={(e) => set('procedure_date', e.target.value)}
            />
          </FormField>
        </div>
        {text('hospital_course', t('discharge.editor.fields.hospitalCourse'), { rows: 5, hint: t('discharge.editor.fields.hospitalCourseHint') })}
        {text('investigations_summary', t('discharge.editor.fields.investigations'), { rows: 3 })}
      </Section>

      <Section title={t('discharge.editor.sections.medications')} description={t('discharge.editor.medications.description')}>
        {value.medications.length === 0 ? (
          <p className="text-sm text-muted">{t('discharge.editor.medications.empty')}</p>
        ) : (
          <ol className="space-y-4">
            {value.medications.map((m, i) => {
              const nameErr = errors[`med.${i}.name`];
              const durErr = errors[`med.${i}.duration_days`];
              return (
                <li key={m.key} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-fg">{t('discharge.editor.medications.row', { number: i + 1 })}</p>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="size-4" aria-hidden />}
                        aria-label={t('discharge.editor.medications.removeRow', { number: i + 1 })}
                        onClick={() => onChange({ ...value, medications: value.medications.filter((_, j) => j !== i) })}
                      >
                        {t('common.remove')}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <FormField label={t('discharge.editor.medications.name')} htmlFor={`${ids}-m${i}-name`} error={nameErr} required className="lg:col-span-2">
                      <Input id={`${ids}-m${i}-name`} maxLength={200} value={m.name} aria-invalid={!!nameErr} onChange={(e) => setMed(i, { name: e.target.value })} />
                    </FormField>
                    <FormField label={t('discharge.editor.medications.dose')} htmlFor={`${ids}-m${i}-dose`}>
                      <Input id={`${ids}-m${i}-dose`} maxLength={100} value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} />
                    </FormField>
                    <FormField label={t('discharge.editor.medications.frequency')} htmlFor={`${ids}-m${i}-freq`}>
                      <Input id={`${ids}-m${i}-freq`} maxLength={100} value={m.frequency} onChange={(e) => setMed(i, { frequency: e.target.value })} />
                    </FormField>
                    <FormField
                      label={t('discharge.editor.medications.durationDays')}
                      htmlFor={`${ids}-m${i}-dur`}
                      error={durErr}
                      hint={t('discharge.editor.medications.durationHint')}
                    >
                      <Input
                        id={`${ids}-m${i}-dur`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={3650}
                        value={m.duration_days}
                        aria-invalid={!!durErr}
                        onChange={(e) => setMed(i, { duration_days: e.target.value })}
                      />
                    </FormField>
                    <FormField label={t('discharge.editor.medications.route')} htmlFor={`${ids}-m${i}-route`} hint={t('discharge.editor.medications.routeHint')}>
                      <Input id={`${ids}-m${i}-route`} maxLength={60} value={m.route} onChange={(e) => setMed(i, { route: e.target.value })} />
                    </FormField>
                    <FormField label={t('discharge.editor.medications.instructions')} htmlFor={`${ids}-m${i}-ins`} className="sm:col-span-2 lg:col-span-4">
                      <Input id={`${ids}-m${i}-ins`} maxLength={500} value={m.instructions} onChange={(e) => setMed(i, { instructions: e.target.value })} />
                    </FormField>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {!readOnly && value.medications.length < 50 && (
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => onChange({ ...value, medications: [...value.medications, emptyMedRow()] })}
          >
            {t('discharge.editor.medications.add')}
          </Button>
        )}
      </Section>

      <Section title={t('discharge.editor.sections.followUp')}>
        {text('follow_up_instructions', t('discharge.editor.fields.followUp'), { rows: 4, hint: t('discharge.editor.fields.followUpHint') })}
        <div className={cn('rounded-xl border-2 border-danger/40 bg-danger-soft/40 p-4')}>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger-ink">
            <AlertTriangle className="size-4" aria-hidden />
            {t('discharge.editor.fields.redFlagsTitle')}
          </p>
          {text('red_flag_symptoms', t('discharge.editor.fields.redFlags'), { rows: 4, hint: t('discharge.editor.fields.redFlagsHint') })}
        </div>
        {text('allergies', t('discharge.editor.fields.allergies'), { rows: 2, hint: t('discharge.editor.fields.allergiesHint') })}
      </Section>

      <Section title={t('discharge.editor.sections.attachments')} description={t('discharge.editor.attachments.description')}>
        {docs.length === 0 ? (
          <p className="text-sm text-muted">{t('discharge.editor.attachments.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id}>
                <Checkbox
                  checked={value.attachments.includes(d.id)}
                  onChange={(e) =>
                    set(
                      'attachments',
                      e.target.checked ? [...value.attachments, d.id] : value.attachments.filter((id) => id !== d.id),
                    )
                  }
                  label={<span dir="auto">{d.file_name}</span>}
                  description={d.size_bytes ? formatBytes(d.size_bytes) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </fieldset>
  );
}
