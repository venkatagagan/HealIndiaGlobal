**DRAFT — for review by qualified Indian legal counsel; not legal advice.**

> In-app consent text. Show it each time a patient (or their agent, parent or guardian) asks a hospital for a quote
> or consultation — that is, before a case is created with `POST /cases`. Placeholders appear as `{curly_braces}`
> (filled by the app) or `[[...]]` (to be decided). The implementation notes at the end are not shown to users.

# Data Sharing Consent — sharing your case with a hospital

| | |
|---|---|
| Consent record | `consents.kind = share_with_hospitals`, `consents.version = 2026-10-21-draft.1`, recorded each time a case is created for a hospital |
| Shown | "Request quote" / "Book consultation" on matches, hospital and doctor pages, and compare screens (web and mobile); "Create case" in the agent portal |
| Scope | One hospital per consent. Sharing with several hospitals requires a consent for each (see the multi-hospital variant) |

---

## Full text (default)

### Share your case with {hospital_name}?

To review your case and send you a quote, **{hospital_name}** ({hospital_city}, India) needs some of your
information. We will share it with this hospital only.

**What we share now**

- Your name, nationality, gender and age.
- Your screening answers and screening summary (AI or rules-based), including any urgency level and warning signs.
- Your notes for the hospital, and the doctor, treatment or package you selected.
- The medical documents you attach to this request.

**What we share later, only if you go ahead**

- If you book: your passport details and travel dates, so that the hospital can issue your visa invitation
  letter, plan your admission and meet its legal duty to report foreign patients to Indian immigration
  authorities.
- Details of companions travelling with you as attendants.
- The messages you send in this case's chat.

**Who will see it**

The hospital's international patient team, coordinators, treating doctors and billing staff; our care
coordinators; and your agent, if you have one.

**How the hospital may use it**

Only to assess your case, prepare a quote and treatment plan, communicate with you and, if you book, treat you and
meet its legal obligations. The hospital is responsible for how it handles your information under Indian law and
under its agreement with us. Hospitals must keep medical records for the periods the law requires.

**It is your choice**

Sharing is needed to get a quote from this hospital. You can share your case with other hospitals separately. You
can stop sharing at any time by cancelling this request; the hospital will then stop receiving new information
from us, but it may keep the records it already holds where the law requires.

> ☐ I agree to share my case information with **{hospital_name}** as described above.

**[Share and request quote]**   **[Cancel]**

More detail: [Privacy Policy, section 7](PRIVACY_POLICY.md#7-who-we-share-your-data-with)

---

## Short version (small screens)

> **Share with {hospital_name}?** We will share your name, nationality, gender, age, screening answers and summary,
> your notes and the documents you attach with this hospital's team so that it can review your case and quote. If
> you book, we will also share your passport and travel details for your visa letter and admission. Your
> coordinator and your agent (if any) can also see your case. [Read full details]
>
> ☐ I agree to share my case with {hospital_name}.

## Variant: several hospitals at once (compare quotes)

> **Share your case with these {n} hospitals?** {hospital_list — name and city, one per line}
> Each hospital receives the information described in the full text and can see only its own request. You can
> cancel the request to any hospital separately.
>
> ☐ I agree to share my case information with each hospital listed above.

Record one consent row per hospital (see implementation note 2).

## Variant: request created by an agent or facilitator

> ☐ I confirm that **{patient_name}** (or their parent or guardian) has authorised me to share their case
> information with **{hospital_name}** as described in the Data Sharing Consent, and that I have given them a copy
> of it in a language they understand. I hold a signed patient authorisation and will provide it to Heal India
> Global on request.

The patient authorisation template is Schedule 2 of the
[Agent/Facilitator Agreement](AGENT_FACILITATOR_AGREEMENT.md).

## Variant: parent or guardian

> ☐ I am the parent or legal guardian of **{patient_name}**, and I agree to share their case information with
> **{hospital_name}** as described above.

## Before booking: passport and travel details (shown once, when the patient books)

> **To prepare your visa invitation letter and admission, {hospital_name} will now receive your passport details,
> travel dates and details of companions travelling with you.** Indian law requires the hospital to report foreign
> patients it admits to the immigration authorities. **[Continue to booking]**

## Stopping sharing (shown when a request is cancelled)

> **Cancel your request to {hospital_name}?** The hospital will stop receiving new information about you from us.
> It may keep the information it already has where the law requires (for example medical records). If you have a
> confirmed booking, cancelling it is covered by our Refund & Cancellation Policy. **[Cancel request]** **[Keep]**

---

## Implementation notes (not shown to users)

1. **No pre-ticked boxes**; the share button stays disabled until the box is ticked. The consent must be shown
   *before* `POST /cases` is called.
2. **Evidence per hospital.** The `consents` table has no case or hospital column, so record
   `POST /auth/consents {kind: "share_with_hospitals", version, granted: true}` immediately before each
   `POST /cases`, and keep the case's `created_at`/`created_by_user_id` as the link. Recommended cross-module change:
   store the consent id (or kind + version) on the case so that each hospital share is provable on its own.
3. **Share only what the text lists.** Hospitals should see documents attached to their case — not every document
   in the patient's account — and passport/companion data only once a booking or visa request exists for that
   hospital. Enforce this in the documents and patients access policies (be-auth) and in `CaseDetail`.
4. **Stopping sharing.** Cancelling a case must remove the hospital's access to further updates (new documents,
   messages, profile changes) while keeping the record of what was already shared.
5. **Agent-created requests** must store the agent attestation (`granted: true` recorded against the patient's
   user, plus an audit-log entry naming the agent). Finance or support can ask for the signed authorisation
   during disputes; settlement items can be held until it is produced.
6. **Minors.** If the patient is under 18, show the parent/guardian variant and record the guardian's user id in
   the audit log.
7. **Re-consent** when the categories shared, the recipients or the purposes change; bump the version.
