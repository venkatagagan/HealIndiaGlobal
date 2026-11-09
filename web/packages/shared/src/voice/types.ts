/** Voice intake (PLAN 7.2) types. The extraction is only a suggestion: the patient reviews, edits and confirms it. */
import type {
  DurationUnit,
  IsoDateTime,
  PreviousTreatment,
  ScreeningOut,
  SeverityLevel,
  SymptomAnswer,
  Urgency,
  Uuid,
} from '../api/types';

export const VOICE_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type VoiceStatus = (typeof VOICE_STATUSES)[number];

export const VOICE_REVIEW_STATUSES = ['pending_review', 'confirmed', 'discarded'] as const;
export type VoiceReviewStatus = (typeof VOICE_REVIEW_STATUSES)[number];

/** ONE body-area vocabulary (catalog ids, INTEGRATION_BACKLOG #37). */
export const BODY_AREAS = [
  'head',
  'neck',
  'chest',
  'abdomen',
  'pelvis',
  'back',
  'left_arm',
  'right_arm',
  'left_leg',
  'right_leg',
  'skin',
  'general',
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export interface IntakeSymptom {
  name: string;
  answer: SymptomAnswer;
}

export interface IntakeSeverity {
  work?: SeverityLevel | null;
  sleep?: SeverityLevel | null;
  mobility?: SeverityLevel | null;
}

export interface IntakeSuggestion {
  transcript_en: string | null;
  language_detected: string | null;
  specialty_slug: string | null;
  body_areas: string[];
  pain_intensity: number | null;
  symptoms: IntakeSymptom[];
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  severity: IntakeSeverity | null;
  previous_treatments: (PreviousTreatment | string)[];
  notes: string | null;
  red_flags: string[];
  urgency_hint: Urgency | null;
  /** server-set: `claude`, or `rules` for the keyword fallback without AI (ignored on confirm) */
  engine?: 'claude' | 'rules';
}

export interface VoiceSegment {
  start: number;
  end: number;
  text: string;
}

export interface VoiceTranscriptionOut {
  id: Uuid;
  user_id?: Uuid;
  patient_id: Uuid | null;
  screening_id: Uuid | null;
  case_id: Uuid | null;
  duration_seconds: number | null;
  language_hint: string | null;
  language_detected: string | null;
  status: VoiceStatus;
  provider?: string | null;
  model?: string | null;
  transcript: string | null;
  transcript_en: string | null;
  segments?: VoiceSegment[];
  intake_suggestion: IntakeSuggestion | null;
  error: string | null;
  completed_at: IsoDateTime | null;
  review_status: VoiceReviewStatus;
  confirmed_intake?: (IntakeSuggestion & { transcript?: string | null }) | null;
  confirmed_at?: IsoDateTime | null;
  audio_retained?: boolean;
  created_at: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface VoiceUploadIn {
  audio: Blob;
  file_name?: string;
  screening_id?: Uuid;
  case_id?: Uuid;
  /** agents/staff recording on behalf of a patient */
  patient_id?: Uuid;
  consent_ai: true;
}

export interface IntakeExtractIn {
  text: string;
  screening_id?: Uuid;
}

export interface VoiceConfirmIn {
  transcript?: string;
  intake: IntakeSuggestion;
}

/** A screening answer that already had a value different from the confirmed voice answer. */
export interface VoiceConflict {
  field: string;
  current: unknown;
  suggested: unknown;
}

/**
 * Response of POST /voice/transcriptions/{id}/confirm (backend `ConfirmOut`). When the transcription is linked to a
 * draft screening the server fills its empty answers (`applied_fields`) and reports differing existing answers as
 * `conflicts` (never overwritten). Field names are screening answer keys plus `duration` (value `{value, unit}`)
 * and `severity.work|sleep|mobility`. `screening_note` says why nothing was applied (no screening / not a draft).
 */
export interface VoiceConfirmOut {
  transcription: VoiceTranscriptionOut;
  applied_fields: string[];
  conflicts: VoiceConflict[];
  screening_note?: string | null;
}

/** What `VoiceIntakeFlow` hands to the host page after confirmation. */
export interface ConfirmedIntake {
  intake: IntakeSuggestion;
  transcript: string | null;
  transcriptionId: Uuid | null;
  appliedFields: string[];
  /** conflicts the patient chose to resolve with the voice answer (already PATCHed when a screening is linked) */
  resolvedWithVoice: string[];
  screening: ScreeningOut | null;
  source: 'voice' | 'text';
}
