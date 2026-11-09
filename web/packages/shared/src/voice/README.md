# `@hig/shared/voice` - voice intake (PLAN 7.2)

Speak in English (or type) -> transcript -> AI-suggested answers -> **mandatory review ->
edit -> confirm**.

## Components
| Component | Props | Use |
|---|---|---|
| `VoiceIntakeButton` | `VoiceIntakeFlow` props + `label?`, `variant?`, `size?` | "Describe it by voice" button opening the flow in a dialog. |
| `VoiceIntakeFlow` | `screeningId?`, `caseId?`, `patientId?` (agents), `maxSeconds=180`, `defaultMode`, `currentAnswers?`, `onConfirmed(ConfirmedIntake)`, `onCancel?` | Record -> upload with consent -> poll -> editable transcript -> `IntakeReviewForm` -> Confirm (`POST /voice/transcriptions/{id}/confirm`) -> resolve conflicts -> done. "Type instead" uses `POST /voice/intake-extract` and PATCHes the linked draft screening (fills empty answers only). Emergency guidance when `urgency_hint` is urgent/emergency or red flags exist. |
| `VoiceRecorder` | `maxSeconds`, `onRecorded({blob, mimeType, fileName, durationSeconds})`, `onReset?` | MediaRecorder (webm/opus, mp4 on Safari), mic permission errors, level meter, 3-min cap, playback, re-record. |
| `IntakeReviewForm` | `value`, `onChange`, `specialties?` | Editable IntakeSuggestion. |

`ConfirmedIntake = {intake, transcript, transcriptionId, appliedFields, resolvedWithVoice, screening, source}`. Hosts
merge it into their local form state: fill empty answers, and overwrite only `appliedFields`/`resolvedWithVoice`.

## Mounted in
- patient-web screening wizard steps 1-2 (`WizardPage`, `mergeVoiceIntake`).
- agent-portal screening form (`ScreeningFormPage`, `mergeVoiceIntake`).
