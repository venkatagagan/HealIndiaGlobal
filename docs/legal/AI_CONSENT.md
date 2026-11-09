**DRAFT — for review by qualified Indian legal counsel; not legal advice.**

> In-app consent text. Show it before a screening is submitted with "Use AI" switched on. Placeholders appear as
> `{curly_braces}` (filled by the app) or `[[...]]` (to be decided). The implementation notes at the end are for
> the product team and are not shown to users.

# AI Screening Consent

| | |
|---|---|
| Consent record | `consents.kind = ai_processing`, `consents.version = 2026-10-21-draft.1`; the screening is submitted with `consent_ai = true` |
| Shown | Screening step 4 (web and mobile) when "Use AI" is on, before "Find My Doctors"; the agent portal's screening form; profile → privacy and consents |
| Reading level | Plain language; keep translations equally simple |

---

## Full text (default)

### Use AI to help screen your symptoms?

Heal India Global can use an AI system to read your screening answers and suggest which medical specialties,
treatments and tests may be relevant to you. We use this to match you with suitable hospitals and doctors in
India.

**What we send to the AI service**

- Your screening answers: the body areas affected, your pain level, your symptoms, how long you have had them and
  how severe they are, treatments you have already tried, and any notes you typed.
- Your preferences (languages, doctor gender, budget, travel dates) and your home country.
- Your age and gender, and the medical history and allergies saved in your profile.
- Up to 3 medical reports you choose to attach to this screening (PDF or images).

We do **not** send your name, email address, phone number or passport details. Your notes and reports may contain
personal details themselves — remove anything you do not want to share.

**Who processes it**

Our AI provider, Anthropic (the Claude model), processes this information for us, on servers that may be outside
India, including in the United States. It may use the information only to provide this service to us. Under its
current terms, it deletes the information within 30 days (unless it must be kept longer for legal or safety
reasons) and does not use it to train its AI models.

**This is not a diagnosis**

The AI's suggestions can be wrong or incomplete. They are not medical advice, and no doctor has checked them when
you see them. A doctor at each hospital you choose will review your case before recommending any treatment.

**If it may be an emergency, do not wait**

If you have chest pain, difficulty breathing, signs of a stroke (face drooping, arm weakness, slurred speech),
heavy bleeding, or thoughts of harming yourself, **call your local emergency number now — in India, call 112.**
If your answers suggest an emergency, we will tell you to get local care instead of travelling.

**It is your choice**

AI screening is optional. If you do not agree, we will match you using our rules-based method, which uses the body
areas and symptoms you select. You can still request quotes and book. You can withdraw this consent at any time
in your profile under privacy and consents. Withdrawing stops AI use for future screenings; it does not undo past
screenings, but you can ask us to delete them.

> ☐ I agree that Heal India Global may send my screening answers, and any reports I attach, to its AI provider to
> produce a screening summary. I understand that the summary is not a diagnosis.

**[Agree and continue]**   **[Use rules-based matching instead]**

More detail: [Privacy Policy, section 5](PRIVACY_POLICY.md#5-ai-screening)

---

## Short version (small screens)

> **AI screening (optional).** We can send your screening answers, preferences, age, gender, medical history and
> allergies, and up to 3 reports you attach — not your name, contact or passport details — to our AI provider,
> Anthropic, which may process them outside
> India. The result is **not a diagnosis**; a hospital doctor reviews your case. **In an emergency, call your local
> emergency number (112 in India).** Prefer not to? Use rules-based matching instead.
> [Read full details]
>
> ☐ I agree to AI screening as described.

The "Read full details" link must open the full text above before the person can agree.

---

## Variant: screening submitted by an agent or facilitator

Shown in the agent portal instead of the checkbox above.

> ☐ I confirm that **{patient_name}** (or their parent or guardian) has read the AI Screening Consent, or I have
> explained it to them in a language they understand, and that they have agreed to Heal India Global sending their
> screening answers and the reports attached here to its AI provider. I understand that the summary is not a
> diagnosis and that I must not present it to the patient as one.

If the agent cannot confirm, the screening is submitted with AI switched off (rules-based matching).

## Variant: parent or guardian

Shown instead of the default checkbox when the patient profile belongs to a person under 18.

> ☐ I am the parent or legal guardian of **{patient_name}**, and I agree that Heal India Global may send their
> screening answers, and any reports I attach, to its AI provider to produce a screening summary. I understand
> that the summary is not a diagnosis.

## Variant: reading a medical report with AI (document AI)

Shown before "Read with AI" on a document (web and app). Same consent record (`ai_processing`), same
version rules; the request is `POST /documents/analyses {consent_ai: true}`.

> **Read this report with AI?** We send the pages you choose (up to [[10]] pages of one report) to our AI
> provider, Anthropic, which may process them outside India, including in the United States. The AI drafts a
> summary in plain English, the main findings, lab values and medicines. **The draft can be wrong. Check it and
> correct it before you confirm it;** hospitals only see the version you confirm. It is not a diagnosis.
> Photos are cleaned of location and camera details before they are sent.
>
> ☐ I agree to send these pages to the AI service to read them.

## Variant: describing symptoms by voice

Shown before the first recording (web and app), after the microphone permission explanation. Same consent
record (`ai_processing`); the upload is `POST /voice/transcriptions` with `consent_ai=true`.

> **Describe your symptoms by voice?** Your recording is turned into text on our own servers and then deleted;
> the recording itself is not sent to the AI service. The text is sent to our AI provider, Anthropic (which may
> process it outside India), to suggest answers for your screening form. **Nothing is added until you review
> and confirm it.** Please speak English. In an emergency, call your local emergency number (112 in India).
>
> ☐ I agree to have my recording transcribed and the text sent to the AI service.

## Variant: patient under 18

Before any of the AI features above can be used for a patient under 18, a parent or legal guardian must give
consent through the guardian consent form (`POST /privacy/guardian-consent`) and our staff must verify it. Until
then the API answers `403 guardian_consent_required`; show: "A parent or guardian needs to give consent, and we
need to verify it, before we can use AI for this patient."

## Withdrawal confirmation (profile → privacy and consents)

> **Stop using AI for screenings?** Future screenings will use our rules-based matching. Past AI screening results
> stay in your account unless you ask us to delete them at [[PRIVACY EMAIL]].
> **[Stop using AI]**   **[Keep AI on]**

## Urgent-symptom message (shown when the result has `urgency = emergency`)

> **Your answers suggest you may need urgent medical care.** Please do not wait to travel for treatment. Call your
> local emergency number or go to the nearest emergency department now. In India, call **112**. When you are safe,
> our coordinators can help you plan next steps. **[Call emergency services]** **[I understand]**

---

## Implementation notes (not shown to users)

1. **No pre-ticked boxes.** The checkbox starts unticked, and "Agree and continue" stays disabled until it is
   ticked. "Use rules-based matching instead" must be equally prominent (no dark patterns).
2. **Record the consent twice:** `POST /auth/consents {kind: "ai_processing", version: "2026-10-21-draft.1",
   granted: true}` and `POST /screenings/{id}/submit {consent_ai: true}`. If not agreed, submit with
   `consent_ai: false` and `preferences.use_ai = false`, so the rules engine runs (PLAN §7).
3. **The payload must match "What we send".** The AI request may contain only the screening fields, preferences,
   home country, the patient's age and gender, the profile's medical history and allergies (as sent by
   `screening/ai/prompts.py` since 2026-11) and up to 3 attached reports (PDF/image, ≤ 10 MB each) listed above —
   never name, email, phone, the date of birth itself, passport or insurance numbers, address or emergency
   contact. If be-screening adds a field, update this text and bump the version **before** shipping. Document AI
   sends the selected page images/PDF pages only; voice intake sends the transcript text only (speech-to-text
   runs on our servers, `STT_PROVIDER=local_whisper`, and the audio is deleted after transcription,
   `VOICE_RETAIN_AUDIO=false`). If preferences are removed from
   the payload (data minimisation — recommended, as triage does not need budget or travel dates), delete that
   bullet.
4. **No patient data in the JSON schema** used for structured outputs; Anthropic caches schemas separately from
   message content.
5. **Logs.** `ai_request_logs` stores metadata only (purpose, model, tokens, latency, status, error) — never
   prompts or outputs.
6. **Withdrawal** records `granted: false` with the current version; later screenings default to `use_ai = false`
   until consent is given again.
7. **Re-consent** whenever the provider, the data sent or the processing location changes; bump the version.
   Re-check the provider's retention and training terms quoted in "Who processes it" on every publication (last
   checked October 2026: deletion within 30 days by default, up to 2 years if flagged, no training without the
   customer's express permission).
8. **Emergency handling.** When `urgency = "emergency"` (from AI or the rules engine), show the urgent-symptom
   message before any matches and do not start a booking flow without an explicit acknowledgement.
