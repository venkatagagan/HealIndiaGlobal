# voice — "Describe it by voice" (PLAN §7.2, English only)

- `/voice/intake?screeningId=` → `VoiceIntakeScreen`: record (record plugin, AAC-LC m4a mono 16 kHz; opus
  webm on web; 3-minute cap, level meter, re-record), consent, upload (`POST /voice/transcriptions`, no
  `language` field), poll, editable transcript + `IntakeReviewForm`, Confirm (`/confirm`) or Discard.
  "Type instead" uses `POST /voice/intake-extract`. Red flags → full-screen emergency guidance.
- Pops a `VoiceIntakeResult`; the screening (`VoiceIntakeButton`, steps 1–2) merges it with `mergeIntake`
  (fills empty fields, asks about conflicts) and saves it with the step's PATCH.
- Tests override `voiceRepositoryProvider`, `voiceRecorderProvider`.
