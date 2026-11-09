/** Pure helpers: normalise analysis payloads into editable data and detect patient edits vs. `ai_output`. */
import {
  ANALYSIS_DOC_TYPES,
  FINDING_SIGNIFICANCES,
  LAB_FLAGS,
  type AnalysisDocType,
  type AnalysisEditableData,
  type DocumentAnalysisOut,
  type FindingSignificance,
  type KeyFinding,
  type LabFlag,
  type LabValue,
  type Medication,
} from './types';

const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x && x.trim() !== '') : [];
const objList = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

function oneOf<T extends string>(values: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function normalizeEditable(source: Partial<Record<keyof AnalysisEditableData, unknown>> | null | undefined): AnalysisEditableData {
  const s = source ?? {};
  const docType = typeof s.doc_type === 'string' && (ANALYSIS_DOC_TYPES as readonly string[]).includes(s.doc_type)
    ? (s.doc_type as AnalysisDocType)
    : null;
  return {
    doc_type: docType,
    report_date: str(s.report_date)?.slice(0, 10) || null,
    facility_name: str(s.facility_name),
    summary_patient: str(s.summary_patient),
    key_findings: objList(s.key_findings).map(
      (f): KeyFinding => ({
        finding: str(f.finding) ?? '',
        significance: oneOf<FindingSignificance>(FINDING_SIGNIFICANCES, f.significance, 'normal'),
      }),
    ),
    lab_values: objList(s.lab_values).map(
      (l): LabValue => ({
        test: str(l.test) ?? '',
        value: str(l.value) ?? '',
        unit: str(l.unit),
        reference_range: str(l.reference_range),
        flag: oneOf<LabFlag>(LAB_FLAGS, l.flag, 'unknown'),
      }),
    ),
    diagnoses_mentioned: strList(s.diagnoses_mentioned),
    medications: objList(s.medications).map(
      (m): Medication => ({ name: str(m.name) ?? '', dose: str(m.dose), frequency: str(m.frequency) }),
    ),
    procedures_mentioned: strList(s.procedures_mentioned),
    recommendations: strList(s.recommendations),
  };
}

/** The current draft of an analysis (confirmed data once confirmed). */
export function draftFromAnalysis(analysis: DocumentAnalysisOut): AnalysisEditableData {
  if (analysis.review_status === 'confirmed' && analysis.confirmed_data) return normalizeEditable(analysis.confirmed_data);
  return normalizeEditable(analysis as unknown as Partial<Record<keyof AnalysisEditableData, unknown>>);
}

/** Strip empty rows / blank strings before sending to the API. */
export function cleanEditable(data: AnalysisEditableData): AnalysisEditableData {
  const blank = (v: string | null | undefined) => !v || v.trim() === '';
  const trimOrNull = (v: string | null | undefined) => (blank(v) ? null : (v as string).trim());
  return {
    doc_type: data.doc_type,
    report_date: trimOrNull(data.report_date),
    facility_name: trimOrNull(data.facility_name),
    summary_patient: trimOrNull(data.summary_patient),
    key_findings: data.key_findings
      .filter((f) => !blank(f.finding))
      .map((f) => ({ ...f, finding: f.finding.trim() })),
    lab_values: data.lab_values
      .filter((l) => !blank(l.test)) // the API requires a test name
      .map((l) => ({
        test: l.test.trim(),
        value: l.value.trim(),
        unit: trimOrNull(l.unit),
        reference_range: trimOrNull(l.reference_range),
        flag: l.flag,
      })),
    diagnoses_mentioned: data.diagnoses_mentioned.map((x) => x.trim()).filter(Boolean),
    medications: data.medications
      .filter((m) => !blank(m.name))
      .map((m) => ({ name: m.name.trim(), dose: trimOrNull(m.dose), frequency: trimOrNull(m.frequency) })),
    procedures_mentioned: data.procedures_mentioned.map((x) => x.trim()).filter(Boolean),
    recommendations: data.recommendations.map((x) => x.trim()).filter(Boolean),
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  if (typeof value === 'string') return JSON.stringify(value.trim().toLowerCase());
  return JSON.stringify(value ?? null);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

export interface EditMarkers {
  /** top-level fields whose confirmed value differs from what the AI returned */
  fields: Set<keyof AnalysisEditableData>;
  /** per list field: indexes of confirmed rows that are not in the AI output (added or edited) */
  rows: Partial<Record<keyof AnalysisEditableData, Set<number>>>;
}

/** Compare the confirmed data with the immutable AI output ("edited by patient" markers). */
export function editMarkers(analysis: DocumentAnalysisOut): EditMarkers {
  const markers: EditMarkers = { fields: new Set(), rows: {} };
  // server-computed list (also sent to clinical viewers, who never receive ai_output)
  for (const f of analysis.edited_fields ?? []) markers.fields.add(f as keyof AnalysisEditableData);
  if (!analysis.confirmed_data || !analysis.ai_output) return markers;
  const confirmed = normalizeEditable(analysis.confirmed_data);
  const ai = normalizeEditable(analysis.ai_output as Partial<Record<keyof AnalysisEditableData, unknown>>);
  for (const key of Object.keys(confirmed) as (keyof AnalysisEditableData)[]) {
    if (!sameValue(confirmed[key], ai[key])) markers.fields.add(key);
    const c = confirmed[key];
    const a = ai[key];
    if (Array.isArray(c) && Array.isArray(a)) {
      const aiRows = new Set((a as unknown[]).map(stable));
      const changed = new Set<number>();
      (c as unknown[]).forEach((row, i) => {
        if (!aiRows.has(stable(row))) changed.add(i);
      });
      if (changed.size) markers.rows[key] = changed;
    }
  }
  return markers;
}

export function hasCriticalValues(data: Pick<AnalysisEditableData, 'lab_values' | 'key_findings'>): boolean {
  return data.lab_values.some((l) => l.flag === 'critical') || data.key_findings.some((f) => f.significance === 'urgent');
}
