import { useEffect, useState } from 'react';
import { CheckCircle2, Info, Keyboard, Mic, RotateCcw, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { catalogApi } from '../api/endpoints/catalog';
import type { ScreeningOut, ScreeningUpdateIn, Uuid } from '../api/types';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { voiceApi, voiceKeys } from './api';
import { useVoiceText } from './i18n';
import { IntakeReviewForm, normalizeIntake } from './IntakeReviewForm';
import { VoiceRecorder, VOICE_MAX_SECONDS, type RecordedAudio } from './VoiceRecorder';
import type { ConfirmedIntake, IntakeSuggestion, VoiceConflict, VoiceConfirmOut, VoiceTranscriptionOut } from './types';

const POLL_MS = 2500;

export interface VoiceIntakeFlowProps {
  /** draft screening to apply the confirmed answers to (server fills empty fields and reports conflicts) */
  screeningId?: Uuid;
  caseId?: Uuid;
  /** agents/staff recording on behalf of a patient */
  patientId?: Uuid;
  maxSeconds?: number;
  /** start in typing mode */
  defaultMode?: 'voice' | 'text';
  /** current answers of the host form (used to detect conflicts when there is no linked screening on the server) */
  currentAnswers?: Partial<ScreeningOut> | ScreeningUpdateIn;
  onConfirmed: (result: ConfirmedIntake) => void;
  onCancel?: () => void;
  className?: string;
}

type Step =
  | { kind: 'capture' }
  | { kind: 'uploading' }
  | { kind: 'processing'; id: Uuid }
  | { kind: 'extracting' }
  | { kind: 'review'; transcription: VoiceTranscriptionOut | null }
  | { kind: 'conflicts'; conflicts: VoiceConflict[]; applied: string[]; screening: ScreeningOut | null; transcription: VoiceTranscriptionOut | null }
  | { kind: 'done'; applied: string[] }
  | { kind: 'failed'; message: string | null };

/** Fields of an IntakeSuggestion that map onto screening answers (PATCH /screenings/{id}). */
const ANSWER_FIELDS = [
  'specialty_slug',
  'body_areas',
  'pain_intensity',
  'symptoms',
  'duration_value',
  'duration_unit',
  'severity',
  'previous_treatments',
  'notes',
] as const;
type AnswerField = (typeof ANSWER_FIELDS)[number];

function isEmpty(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every((x) => x == null || x === '');
  return false;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Current value of an answer field from a ScreeningOut-like object (specialty is nested there). */
function currentValue(current: Record<string, unknown>, key: AnswerField): unknown {
  if (key === 'specialty_slug') {
    if ('specialty_slug' in current) return current.specialty_slug;
    const sp = current.specialty as { slug?: string } | null | undefined;
    return sp?.slug ?? null;
  }
  return current[key];
}

/**
 * Screening PATCH body for the given answer fields. Besides the ANSWER_FIELDS keys, `only` may hold the server's
 * conflict names `duration` (-> duration_value + duration_unit) and `severity.<work|sleep|mobility>` (merged into
 * `baseSeverity`, the screening's current severity, because PATCH replaces the whole object).
 */
export function toScreeningPatch(
  intake: IntakeSuggestion,
  only?: readonly string[],
  baseSeverity?: Record<string, unknown> | null,
): ScreeningUpdateIn {
  const patch: Record<string, unknown> = {};
  if (only?.includes('duration')) {
    patch.duration_value = intake.duration_value;
    patch.duration_unit = intake.duration_unit;
  }
  const severityKeys = (only ?? []).filter((f) => f.startsWith('severity.')).map((f) => f.slice('severity.'.length));
  if (severityKeys.length && !only?.includes('severity')) {
    const sev: Record<string, unknown> = Object.fromEntries(
      Object.entries(baseSeverity ?? {}).filter(([, x]) => x != null && x !== ''),
    );
    for (const k of severityKeys) {
      const v = intake.severity?.[k as keyof NonNullable<IntakeSuggestion['severity']>];
      if (v != null) sev[k] = v;
    }
    patch.severity = sev;
  }
  for (const key of ANSWER_FIELDS) {
    if (only && !only.includes(key)) continue;
    const v = intake[key];
    if (key === 'severity') {
      const sev = Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x != null && x !== ''));
      patch.severity = sev;
    } else patch[key] = v;
  }
  return patch as ScreeningUpdateIn;
}

/** Client-side merge: fill empty answers, report differing non-empty ones as conflicts. */
function diffAgainst(current: Record<string, unknown> | undefined, intake: IntakeSuggestion) {
  const fill: string[] = [];
  const conflicts: VoiceConflict[] = [];
  for (const key of ANSWER_FIELDS) {
    const suggested = intake[key];
    if (isEmpty(suggested)) continue;
    const cur = current ? currentValue(current, key) : undefined;
    if (isEmpty(cur)) fill.push(key);
    else if (!same(cur, suggested)) conflicts.push({ field: key, current: cur, suggested });
  }
  return { fill, conflicts };
}

/** Shape the edited intake for the API (symptom names required, strings not null, urgency defaulted). */
function cleanIntake(intake: IntakeSuggestion): IntakeSuggestion {
  return {
    ...intake,
    transcript_en: intake.transcript_en ?? '',
    notes: intake.notes?.trim() ?? '',
    symptoms: intake.symptoms.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name),
    urgency_hint: intake.urgency_hint ?? 'routine',
  };
}

function formatValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === 'object' && 'name' in x ? `${(x as { name: string }).name}${'answer' in x ? ` (${String((x as { answer: unknown }).answer)})` : ''}` : String(x)))
      .join(', ');
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x != null && x !== '')
      .map(([k, x]) => `${k}: ${String(x)}`)
      .join(', ');
  }
  return String(v);
}

/**
 * Voice (or typed) intake with mandatory review -> edit -> confirm (PLAN 7.2):
 * record -> upload (consent) -> poll -> editable transcript -> editable answers ->
 * Confirm (POST /voice/transcriptions/{id}/confirm) -> resolve conflicts -> onConfirmed. "Type instead" uses
 * POST /voice/intake-extract (read-only) and PATCHes the linked draft screening after confirmation.
 */
export function VoiceIntakeFlow({
  screeningId,
  caseId,
  patientId,
  maxSeconds = VOICE_MAX_SECONDS,
  defaultMode = 'voice',
  currentAnswers,
  onConfirmed,
  onCancel,
  className,
}: VoiceIntakeFlowProps) {
  const { t } = useVoiceText();
  const [mode, setMode] = useState<'voice' | 'text'>(defaultMode);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState<RecordedAudio | null>(null);
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'capture' });
  const [intake, setIntake] = useState<IntakeSuggestion>(() => normalizeIntake(null));
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Record<string, 'mine' | 'voice'>>({});

  const specialties = useQuery({
    queryKey: ['catalog', 'specialties'],
    queryFn: () => catalogApi.listSpecialties(),
    staleTime: 10 * 60_000,
  });

  // poll the transcription while queued / processing
  const processingId = step.kind === 'processing' ? step.id : null;
  const poll = useQuery({
    queryKey: voiceKeys.detail(processingId ?? ''),
    queryFn: () => voiceApi.get(processingId as Uuid),
    enabled: !!processingId,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'completed' || q.state.data.status === 'failed') ? false : POLL_MS),
  });
  useEffect(() => {
    const data = poll.data;
    if (!processingId || !data || data.id !== processingId) return;
    if (data.status === 'completed') {
      setTranscript(data.transcript ?? '');
      setIntake(normalizeIntake({ ...(data.intake_suggestion ?? {}), transcript_en: data.intake_suggestion?.transcript_en ?? data.transcript_en, language_detected: data.intake_suggestion?.language_detected ?? data.language_detected }));
      setStep({ kind: 'review', transcription: data });
    } else if (data.status === 'failed') {
      setStep({ kind: 'failed', message: data.error });
    }
  }, [poll.data, processingId]);
  useEffect(() => {
    if (processingId && poll.isError) setStep({ kind: 'failed', message: errorMessage(poll.error) });
  }, [poll.isError, poll.error, processingId]);

  async function sendRecording() {
    if (!recording || !consent) return;
    setStep({ kind: 'uploading' });
    try {
      const created = await voiceApi.upload({
        audio: recording.blob,
        file_name: recording.fileName,
        screening_id: screeningId,
        case_id: caseId,
        patient_id: patientId,
        consent_ai: true,
      });
      setStep({ kind: 'processing', id: created.id });
    } catch (e) {
      setStep({ kind: 'failed', message: errorMessage(e) });
    }
  }

  async function extractText() {
    if (!text.trim() || !consent) return;
    setStep({ kind: 'extracting' });
    try {
      const suggestion = await voiceApi.intakeExtract({
        text: text.trim(),
        screening_id: screeningId,
      });
      setIntake(normalizeIntake(suggestion));
      setTranscript(text.trim());
      setStep({ kind: 'review', transcription: null });
    } catch (e) {
      setStep({ kind: 'failed', message: errorMessage(e) });
    }
  }

  function finish(applied: string[], resolvedWithVoice: string[], screening: ScreeningOut | null, transcription: VoiceTranscriptionOut | null) {
    setStep({ kind: 'done', applied });
    toast.success(t('confirmed'));
    onConfirmed({
      intake,
      transcript: transcript || null,
      transcriptionId: transcription?.id ?? null,
      appliedFields: applied,
      resolvedWithVoice,
      screening,
      source: transcription ? 'voice' : 'text',
    });
  }

  async function confirm() {
    if (step.kind !== 'review') return;
    setBusy(true);
    try {
      if (step.transcription) {
        const res: VoiceConfirmOut = await voiceApi.confirm(step.transcription.id, {
          transcript: transcript.trim() || undefined,
          intake: cleanIntake(intake),
        });
        const applied = res.applied_fields ?? [];
        let conflicts = res.conflicts ?? [];
        // ConfirmOut carries no screening: re-read the linked draft so the host sees the server-applied answers
        const screening = screeningId && !res.screening_note ? await voiceApi.getScreening(screeningId).catch(() => null) : null;
        if (!screeningId && currentAnswers) conflicts = diffAgainst(currentAnswers as Record<string, unknown>, intake).conflicts;
        if (conflicts.length) {
          setChoices(Object.fromEntries(conflicts.map((c) => [c.field, 'mine'])));
          setStep({ kind: 'conflicts', conflicts, applied, screening, transcription: res.transcription ?? step.transcription });
        } else finish(applied, [], screening, res.transcription ?? step.transcription);
      } else {
        // typed text: intake-extract never writes -> apply to the draft screening ourselves (fill empty fields only)
        let current: Record<string, unknown> | undefined = currentAnswers as Record<string, unknown> | undefined;
        let screening: ScreeningOut | null = null;
        if (screeningId) {
          screening = await voiceApi.getScreening(screeningId);
          current = screening as unknown as Record<string, unknown>;
        }
        const { fill, conflicts } = diffAgainst(current, intake);
        if (screeningId && fill.length) screening = await voiceApi.patchScreening(screeningId, toScreeningPatch(cleanIntake(intake), fill));
        if (conflicts.length) {
          setChoices(Object.fromEntries(conflicts.map((c) => [c.field, 'mine'])));
          setStep({ kind: 'conflicts', conflicts, applied: fill, screening, transcription: null });
        } else finish(fill, [], screening, null);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyChoices() {
    if (step.kind !== 'conflicts') return;
    const useVoice = Object.entries(choices)
      .filter(([, c]) => c === 'voice')
      .map(([f]) => f);
    setBusy(true);
    try {
      let screening = step.screening;
      if (screeningId && useVoice.length) {
        const baseSeverity = (screening?.severity ?? null) as Record<string, unknown> | null;
        screening = await voiceApi.patchScreening(screeningId, toScreeningPatch(cleanIntake(intake), useVoice, baseSeverity));
      }
      finish([...step.applied, ...useVoice], useVoice, screening, step.transcription);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (step.kind === 'review' && step.transcription) {
      try {
        await voiceApi.discard(step.transcription.id);
      } catch (e) {
        toast.error(errorMessage(e));
        return;
      }
    }
    toast(t('discarded'));
    restart();
  }

  function restart() {
    setRecording(null);
    setText('');
    setTranscript('');
    setIntake(normalizeIntake(null));
    setStep({ kind: 'capture' });
  }

  const urgency = intake.urgency_hint;
  const emergency = urgency === 'emergency' || urgency === 'urgent' || intake.red_flags.length > 0;
  const specialtyOptions = (specialties.data ?? []).map((s) => ({ slug: s.slug, name: s.name }));

  return (
    <div className={cn('space-y-4', className)}>
      {/* ---------------- capture ---------------- */}
      {step.kind === 'capture' && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-fg">{mode === 'voice' ? t('micTitle') : t('typeLabel')}</p>
            {mode === 'voice' && <p className="mt-0.5 text-sm text-muted">{t('micHint')}</p>}
          </div>
          {mode === 'voice' ? (
            <VoiceRecorder maxSeconds={maxSeconds} onRecorded={setRecording} onReset={() => setRecording(null)} />
          ) : (
            <textarea
              aria-label={t('typeLabel')}
              className="min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={5}
              maxLength={5000}
              placeholder={t('typePlaceholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          <label className="flex items-start gap-3 text-sm text-fg">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{mode === 'voice' ? t('consentVoice') : t('consentText')}</span>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              leftIcon={mode === 'voice' ? <Keyboard className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              onClick={() => setMode(mode === 'voice' ? 'text' : 'voice')}
            >
              {mode === 'voice' ? t('typeInstead') : t('speakInstead')}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>
                  {t('cancel')}
                </Button>
              )}
              {mode === 'voice' ? (
                <Button leftIcon={<Sparkles className="size-4" aria-hidden />} disabled={!recording || !consent} onClick={() => void sendRecording()}>
                  {t('useRecording')}
                </Button>
              ) : (
                <Button leftIcon={<Sparkles className="size-4" aria-hidden />} disabled={text.trim().length < 3 || !consent} onClick={() => void extractText()}>
                  {t('suggestAnswers')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- working ---------------- */}
      {(step.kind === 'uploading' || step.kind === 'processing' || step.kind === 'extracting') && (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-2/40 p-4" aria-live="polite" aria-busy>
          <div className="relative flex size-12 shrink-0 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <span className="relative flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
              <Sparkles className="size-5 animate-pulse" aria-hidden />
            </span>
          </div>
          <div>
            <p className="font-medium text-fg">
              {step.kind === 'uploading' ? t('sending') : step.kind === 'extracting' ? t('analyzing') : t('transcribing')}
            </p>
            {step.kind === 'processing' && <p className="text-sm text-muted">{t('transcribingHint')}</p>}
          </div>
        </div>
      )}

      {/* ---------------- failed ---------------- */}
      {step.kind === 'failed' && (
        <div role="alert" className="space-y-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-ink">
          <p className="font-semibold">{t('failed')}</p>
          {step.message && <p>{step.message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon={<RotateCcw className="size-4" aria-hidden />} onClick={restart}>
              {t('tryAgain')}
            </Button>
            {mode === 'voice' && (
              <Button
                variant="ghost"
                leftIcon={<Keyboard className="size-4" aria-hidden />}
                onClick={() => {
                  setMode('text');
                  restart();
                }}
              >
                {t('typeInstead')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- review ---------------- */}
      {step.kind === 'review' && (
        <div className="space-y-5" role="form" aria-label={t('reviewTitle')}>
          {emergency && (
            <div role="alert" className="flex gap-3 rounded-xl border border-danger/50 bg-danger-soft p-4 text-danger-ink">
              <ShieldAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
              <div className="space-y-1 text-sm">
                <p className="text-base font-bold">{urgency === 'urgent' && !intake.red_flags.length ? t('urgentHint') : t('emergencyTitle')}</p>
                {(urgency === 'emergency' || intake.red_flags.length > 0) && <p className="font-medium">{t('emergencyBody')}</p>}
                {intake.red_flags.length > 0 && (
                  <>
                    <p>{t('redFlags')}</p>
                    <ul className="list-disc ps-5">
                      {intake.red_flags.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {step.transcription && (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 flex flex-wrap items-center gap-2 font-medium text-fg">
                  {t('transcriptLabel')}
                </span>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={4}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
          )}

          <div className="space-y-1">
            <p className="font-semibold text-fg">{t('reviewTitle')}</p>
            <p className="text-sm text-muted">{t('reviewHint')}</p>
            {step.transcription && !step.transcription.intake_suggestion && (
              <p className="flex items-center gap-1.5 text-sm text-warning-ink">
                <Info className="size-4 shrink-0" aria-hidden />
                {t('noSuggestion')}
              </p>
            )}
          </div>

          <IntakeReviewForm value={intake} onChange={setIntake} specialties={specialtyOptions} disabled={busy} />

          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {t('disclaimer')}
          </p>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" leftIcon={<Trash2 className="size-4" aria-hidden />} onClick={() => void discard()} disabled={busy}>
              {t('discard')}
            </Button>
            <Button leftIcon={<CheckCircle2 className="size-4" aria-hidden />} loading={busy} onClick={() => void confirm()}>
              {t('confirm')}
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- conflicts ---------------- */}
      {step.kind === 'conflicts' && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-fg">{t('conflictsTitle')}</p>
            <p className="text-sm text-muted">{t('conflictsHint')}</p>
          </div>
          <ul className="space-y-3">
            {step.conflicts.map((c) => (
              <li key={c.field} className="rounded-xl border border-border p-3">
                <p className="mb-2 text-sm font-medium text-fg">{fieldLabel(c.field, t)}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['mine', 'voice'] as const).map((choice) => (
                    <label
                      key={choice}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm',
                        choices[c.field] === choice ? 'border-primary bg-primary-soft/50' : 'border-border',
                      )}
                    >
                      <input
                        type="radio"
                        name={`conflict-${c.field}`}
                        className="mt-0.5"
                        checked={choices[c.field] === choice}
                        onChange={() => setChoices((prev) => ({ ...prev, [c.field]: choice }))}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-fg">{choice === 'mine' ? t('keepMine') : t('useVoice')}</span>
                        <span className="block break-words text-muted">{formatValue(choice === 'mine' ? c.current : c.suggested)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button onClick={() => void applyChoices()} loading={busy}>
              {t('applyChoices')}
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- done ---------------- */}
      {step.kind === 'done' && (
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-sm text-success-ink" role="status">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t('confirmed')}</p>
            {step.applied.length > 0 && <p>{t('appliedFields', { fields: step.applied.map((f) => fieldLabel(f, t)).join(', ') })}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function fieldLabel(field: string, t: ReturnType<typeof useVoiceText>['t']): string {
  switch (field) {
    case 'specialty_slug':
    case 'specialty':
      return t('specialty');
    case 'body_areas':
      return t('bodyAreas');
    case 'pain_intensity':
      return t('pain');
    case 'symptoms':
      return t('symptoms');
    case 'duration':
    case 'duration_value':
    case 'duration_unit':
      return t('duration');
    case 'severity':
      return t('severity');
    case 'severity.work':
    case 'severity.sleep':
    case 'severity.mobility':
      return `${t('severity')} (${field.slice('severity.'.length)})`;
    case 'previous_treatments':
      return t('previous');
    case 'notes':
      return t('notes');
    default:
      return field;
  }
}

