/** PLAN 7.2 endpoints - thin wrappers over the shared API client. */
import { api } from '../api/client';
import { seg } from '../api/endpoints/_util';
import type { ScreeningOut, ScreeningUpdateIn, Uuid } from '../api/types';
import type {
  IntakeExtractIn,
  IntakeSuggestion,
  VoiceConfirmIn,
  VoiceConfirmOut,
  VoiceTranscriptionOut,
  VoiceUploadIn,
} from './types';

export const voiceApi = {
  /** multipart `audio` (<= 10 MB, <= 180 s; English speech) + `screening_id?`, `case_id?`, `consent_ai=true` -> 202 */
  upload: (input: VoiceUploadIn, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('audio', input.audio, input.file_name ?? 'recording.webm');
    if (input.screening_id) form.append('screening_id', input.screening_id);
    if (input.case_id) form.append('case_id', input.case_id);
    if (input.patient_id) form.append('patient_id', input.patient_id);
    form.append('consent_ai', 'true');
    return api.upload<VoiceTranscriptionOut>('/voice/transcriptions', form, { signal });
  },
  get: (id: Uuid) => api.get<VoiceTranscriptionOut>(`/voice/transcriptions/${seg(id)}`),
  confirm: (id: Uuid, body: VoiceConfirmIn) => api.post<VoiceConfirmOut>(`/voice/transcriptions/${seg(id)}/confirm`, body),
  discard: (id: Uuid) => api.post<VoiceTranscriptionOut>(`/voice/transcriptions/${seg(id)}/discard`, {}),
  /** typed free text / on-device transcript -> suggestion (read-only, never writes) */
  intakeExtract: (body: IntakeExtractIn) => api.post<IntakeSuggestion>('/voice/intake-extract', body),
  getScreening: (id: Uuid) => api.get<ScreeningOut>(`/screenings/${seg(id)}`),
  /** save confirmed answers onto a draft screening (PLAN 8.6) */
  patchScreening: (id: Uuid, body: ScreeningUpdateIn) => api.patch<ScreeningOut>(`/screenings/${seg(id)}`, body),
};

export const voiceKeys = {
  detail: (id: Uuid) => ['voice', 'transcription', id] as const,
};
