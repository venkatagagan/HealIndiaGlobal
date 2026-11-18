# Discharge summaries for the home doctor (PDF + HL7 FHIR R4)

The hospital writes a discharge summary when it discharges the patient. Once it is finalized, the patient can
view and download it and share it with their doctor at home. Code: `backend/app/modules/discharge/`, tables
`discharge_summaries`, `discharge_shares`, `medication_reminders` (migration `0010a`).

## Lifecycle

| Step | API | Who |
| --- | --- | --- |
| Pre-fill a draft from the case, booking, doctor, procedure and the patient's recorded allergies | `GET /api/v1/discharge-summaries/prefill?case_id=&booking_id=` | hospital write members (owner/admin/coordinator/doctor), ops staff |
| Create / edit / discard the draft (one open draft per case) | `POST /discharge-summaries`, `PATCH|DELETE /discharge-summaries/{id}` | same |
| Finalize: locks the version, stores the PDF as a Document of kind `discharge_summary`, creates medication reminders (off), publishes `discharge_summary.finalized` | `POST /discharge-summaries/{id}/finalize` (needs diagnosis, discharge date, treating doctor, follow-up instructions) | same |
| Change a final summary: a new draft version (`version + 1`, `supersedes_id`); when it is finalized the old one gets `superseded_at` | `POST /discharge-summaries/{id}/new-version` | same |
| View, PDF, FHIR | `GET /discharge-summaries[/{id}]`, `/{id}/pdf`, `/{id}/fhir` | patient (final versions), their agent (final versions, only with the patient's `share_with_agent` consent), the hospital, admins, support coordinating the case |

Health text (diagnosis, procedure, course, medications, follow-up, red flags, allergies, investigations) is
encrypted at rest. Every read by someone other than the patient is written to the PHI access log
(`phi.view`/`phi.download`/`phi.list`).

The `discharge_summary.finalized` event notifies the patient, and the agent when consented, in their language
(`discharge.notifications.*`) by in-app, e-mail, push and WhatsApp (generic template `hig_document_ready`). It
never includes the diagnosis.

## PDF

Rendered with fpdf2 on the hospital letterhead, using the same layout approach as the visa invitation letter.
Fonts are embedded from `backend/app/assets/fonts`: Roboto (Latin, Cyrillic, Greek; Apache 2.0) plus Noto Sans
Arabic and Noto Sans Bengali (SIL OFL) as fallbacks, so names in any of our languages render. Arabic is joined
and laid out right-to-left only if the optional `uharfbuzz` package is installed (fpdf2 text shaping); without
it the letters show unjoined. Labels come from `discharge.pdf.*` in the server catalog; the stored PDF is in
English, as a clinical handover.

## FHIR R4 export

`GET /discharge-summaries/{id}/fhir` → `application/fhir+json`, a `Bundle` of `type: document`:

| Entry | Content |
| --- | --- |
| `Composition` (first) | LOINC **18842-5** *Discharge summary*; `status` final/preliminary; author = Practitioner; custodian = Organization; legal `attester` when final. Sections with LOINC codes: 11535-2 diagnosis, 47519-4 procedures, 8648-8 hospital course, 30954-2 investigations, 48765-2 allergies, 10183-2 discharge medications, 18776-5 plan of care / follow-up (with the red-flag symptoms). |
| `Patient` | name, gender, birthDate, country |
| `Practitioner` | treating doctor + registration number |
| `Organization` | the hospital |
| `Encounter` | inpatient (`IMP`), admission → discharge period, case number |
| `Condition` | diagnosis text + ICD-10 code when given |
| `Procedure` | procedure text + SNOMED CT code when given, performed date |
| `MedicationStatement` × n | medicine, dosage text (dose, frequency, duration, instructions), route, effective period |
| `AllergyIntolerance` | recorded allergies, or SNOMED 716186003 *No known allergy* |

All references are `urn:uuid:` full URLs inside the bundle. The ids are stable for a given summary version.
`app.modules.discharge.fhir.validate_bundle` (used in the tests) checks the structure, the required elements
and that references resolve. For formal conformance, run the bundle through the official HL7 validator
(`validator_cli.jar -version 4.0.1`) before connecting a national health record.

## Share with the home doctor

`POST /discharge-summaries/{id}/shares` (patient only): `{doctor_email, doctor_name?, document_ids[],
expires_in_days? (default 14, max DISCHARGE_SHARE_MAX_DAYS=30), language?, consent: true}`.

- A random 256-bit token; only its SHA-256 is stored. The link `<PATIENT_WEB_URL>/app/share/<token>` is
  returned once and e-mailed to the doctor in the chosen language (`discharge.share_email.*`).
- Records consent `share_with_home_doctor` (scoped to the case).
- The link shows only that summary and the documents the patient selected. Those can be the summary's PDF
  (always included), its attachments, or the patient's own documents.
- The patient-web page `/app/share/:token` needs no login and is marked `noindex`. It calls
  `GET /api/v1/public/discharge-shares/{token}` (+ `/pdf`, `/fhir`, `/documents/{id}`). These are rate-limited
  per IP, and failed token lookups are limited to 30 per hour per IP.
- Responses carry `X-Robots-Tag: noindex`, `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- Every view or download is audited as PHI access (actor role `home_doctor`, with the share id and masked
  doctor e-mail) and shows in the patient's access log.
- Revoke: `DELETE /discharge-summaries/{id}/shares/{share_id}`. Revoked and expired links answer 404.

## Medication reminders

On finalize, one `medication_reminders` row is created per medicine (off). The end date is discharge date +
duration; medicines without a duration are ongoing. The patient switches them on with
`PUT /discharge-summaries/{id}/medication-reminders {enabled, remind_hour, timezone}`, which records consent
`medication_reminders`.

The periodic job `discharge.medication_reminders` (every 15 min) sends **one** in-app/push reminder per patient
per local day at or after the chosen hour. Push text stays generic and no WhatsApp is sent. Reminders are
**server-side** because the mobile app has no local-notification plugin; adding `flutter_local_notifications`
would need Android build changes. A new version of the summary keeps the patient's choice and stops the old
reminders.
