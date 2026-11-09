**DRAFT — for review by qualified legal counsel and the DPO; not legal advice.**

# Data protection impact assessment (DPIA)

| | |
|---|---|
| Controller / Data Fiduciary | TODO-BUSINESS: [[LEGAL ENTITY NAME]] |
| DPO consulted | TODO-BUSINESS: [[DPO NAME]], [[DATE]] |
| Basis | GDPR Art. 35 (large-scale special-category data; innovative technology — AI); DPDP Act s.10 / Rule 13 (periodic DPIA if notified as a Significant Data Fiduciary — health data at scale makes that likely); good practice under HIPAA-style safeguards |
| Scope | The patient journey end to end (screening, AI features, documents, cases, bookings, payments, travel, messaging) on web and mobile, plus staff, hospital and agent portals |
| Status | Engineering draft 2026-11-09. Sign-off: TODO-BUSINESS |
| Related | [ROPA.md](ROPA.md) · [BREACH_RESPONSE.md](BREACH_RESPONSE.md) · [PRIVACY_POLICY.md](PRIVACY_POLICY.md) · [AI_CONSENT.md](AI_CONSENT.md) |

## 1. Description of the processing

International patients use the Platform to describe symptoms, upload medical reports, get matched with Indian
hospitals, request quotes, book and pay, and arrange travel. Health data is processed at scale and shared with
hospitals the patient chooses, with the patient's agent (if any), and — for optional AI features — with
Anthropic, PBC in the United States. The data inventory, purposes, bases, recipients and retention are in the
[ROPA](ROPA.md); this document assesses the risks.

## 2. Necessity and proportionality

| Question | Assessment |
|---|---|
| Is health data necessary? | Yes for matching and quoting; hospitals cannot assess a case without it. Free text and reports are optional. |
| Is AI necessary? | No — every AI feature is optional and has a non-AI path (rules-based triage; manual reading; typing instead of voice). AI is used only with `ai_processing` consent recorded per use. |
| Data minimisation | AI payloads exclude name, email, phone, passport, address and the date of birth itself (age only). Screening sends age, gender, medical history and allergies from the profile — **review whether medical history/allergies are needed for triage (recommendation R3).** Voice audio never leaves our servers (local Whisper); only the transcript text is sent. Photos are stripped of EXIF before sending. |
| Retention | Defaults in `backend/.env.example`; daily purge jobs; complete erasure on account deletion. |
| Rights | Export (ZIP/JSON), correction (profile, requests), erasure, consent withdrawal (enforced for hospitals and agents), nomination, grievance queue with SLA, access log. |
| Children | Under-18 processing (screening, AI, booking) is blocked until a guardian consent is recorded and verified by staff. |

## 3. Anthropic (Claude API) processing

| Item | Detail |
|---|---|
| Role | Processor acting on our instructions (Anthropic commercial terms + DPA). TODO-BUSINESS: sign the DPA and keep a copy. |
| Data sent | (a) Screening: answers, notes, preferences, home country, age, gender, profile medical history and allergies, up to 3 attached reports. (b) Document AI: the selected report pages (images/PDF pages). (c) Voice intake: transcript text. Never: name, email, phone, passport, address. |
| Location | United States (or a region arranged with Anthropic — TODO-BUSINESS). |
| Retention at Anthropic | Per Anthropic's commercial terms at last check (October 2026): API inputs/outputs deleted within 30 days by default, up to 2 years if flagged by trust & safety, no training on API data without permission. Re-verify before launch; consider zero-data-retention (R1). |
| Our logs | `ai_request_logs` holds metadata only (model, tokens, latency, status) — never prompts or outputs. |
| Output handling | AI output is a draft: document AI and voice suggestions need patient review and confirmation; hospitals see confirmed document readings only. Screening results carry "not a diagnosis" and emergency messaging; red flags fall back to rules. |
| Model risk | Hallucination or omission in summaries; mitigated by human review, confidence fields, red-flag rules engine (100 % recall gate in CI), and clear disclaimers. Medical-device (SaMD) exposure noted in CG-13. |

## 4. Cross-border transfers

| Flow | From → to | Mechanism | Notes |
|---|---|---|---|
| Patients (EU/UK/other) → Platform | Patient's country → India (hosting region TODO-BUSINESS) | GDPR Art. 49(1)(b)/(a) for the patient's own requested service; SCCs/IDTA where we use processors | India has no EU adequacy decision. Counsel to confirm the mechanism for onward transfers (R2). |
| Platform → Anthropic | India → US | DPDP s.16: allowed unless the destination is restricted by notification (none at last check); GDPR: SCCs with Anthropic (EU/UK data) | Re-check DPDP restricted-country notifications at launch and yearly. |
| Platform → payment providers | India → US/EU (Stripe, if enabled) | Provider terms / SCCs | Razorpay stays in India. |
| Platform → hospitals | Within India | Data Sharing Consent per hospital | Hospitals are independent controllers. |
| Platform → agents | India → agent's country | Patient consent (`share_with_agent` for documents); agent agreement | Agents in many countries — keep the agent agreement's transfer clauses. |

## 5. Risk assessment

Likelihood and severity: L = low, M = medium, H = high. Residual risk is after the listed measures.

| # | Risk to people | Likelihood | Severity | Measures in place | Residual |
|---|---|---|---|---|---|
| 1 | Unauthorised access to health records by staff | M | H | Least-privilege document scopes (finance: payment docs; support: coordinated cases + audited break-glass, admins notified); PHI read audit; staff MFA, IP allow-list, 12 h sessions, 30 min idle timeout | L |
| 2 | Hospital keeps accessing data after the patient withdraws | M | M | Withdrawal of `share_with_hospitals` removes document and AI-reading access immediately; data already downloaded is the hospital's own record (contract clauses) | L–M |
| 3 | Agent sees documents without the patient's agreement (CG-14) | M | M | `share_with_agent` required for patient documents; agent-recorded consent does not count | L (screenings/cases still open — R4) |
| 4 | Database or backup leak | L | H | TLS to DB, field encryption of identifiers and health free text, key rotation, encrypted storage, backups encrypted (infra) | L–M (structured health fields such as symptoms lists are not field-encrypted — R5) |
| 5 | AI provider retains or misuses data | L | H | DPA, no-training terms, minimised payloads, optional AI, consent per use | L–M (until DPA/ZDR signed — R1) |
| 6 | Incorrect AI output harms a patient | M | H | Human review, disclaimers, emergency rules, confirmed-only sharing | M (clinical governance — R6) |
| 7 | Processing a child's data without a guardian | L | H | DOB-based gate on screening, AI and booking until a staff-verified guardian consent exists | L (unknown DOB not gated — R7) |
| 8 | Data kept longer than needed | M | M | Purge jobs, erasure, legal holds | L |
| 9 | Breach not reported in time | L | H | Breach register with 72 h deadline and overdue flag; runbook; admin alerts | L |
| 10 | Data subjects cannot exercise rights | L | M | Self-service export, deletion, nominee, request form (also without account), SLA reminders | L |

## 6. Recommendations (open)

- **R1** Sign Anthropic's DPA; evaluate zero-data-retention and a regional endpoint. TODO-BUSINESS.
- **R2** Counsel to confirm the transfer mechanism for EU/UK patients and appoint EU/UK representatives if required.
- **R3** Review whether profile medical history and allergies must be sent to the screening AI; if not, drop them.
- **R4** Gate agent-run AI screening and case creation on the patient's own consent (rest of CG-14).
- **R5** Consider encrypting structured health JSON (symptoms, key findings, lab values) and chat message bodies.
- **R6** Clinical governance for AI output (named clinical safety officer, incident review, periodic eval runs).
- **R7** Require a date of birth before screening so the under-18 gate always applies.
- **R8** Infrastructure: S3 object-lock/lifecycle for versions, encrypted backups with a 35-day window and a
  deletion log re-applied after restores; `DATABASE_SSLMODE=require` in production.

## 7. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| DPO | TODO-BUSINESS | | |
| Product owner | TODO-BUSINESS | | |
| Engineering lead | TODO-BUSINESS | | |
