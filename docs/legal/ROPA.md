**DRAFT — for review by qualified legal counsel; not legal advice.**

# Record of processing activities (ROPA)

| | |
|---|---|
| Controller / Data Fiduciary | TODO-BUSINESS: [[LEGAL ENTITY NAME]], [[REGISTERED OFFICE ADDRESS]], India |
| Grievance Officer | TODO-BUSINESS: [[NAME]], [[EMAIL]], [[PHONE]] (app settings `GRIEVANCE_OFFICER_*`) |
| Data Protection Officer | TODO-BUSINESS: [[NAME]], [[EMAIL]] (app settings `DPO_*`) |
| EU / UK representative | TODO-BUSINESS: [[NAME AND ADDRESS]] (GDPR Art. 27, if EU/UK patients are targeted) |
| Basis | GDPR Art. 30(1); DPDP Act 2023 s.8 (accountability) and DPDP Rules 2025; UK GDPR Art. 30 |
| Owner | TODO-BUSINESS: [[PRIVACY OWNER]] · review every 6 months and on every new feature that touches personal data |
| Last updated | 2026-11-18 (engineering draft, matches migrations `0009b` and `0010b`: referral programme, agent CRM) |

How to read this: one row per processing activity. "Where in the system" points to the code so the record can be
checked against reality. Retention defaults are settings in `backend/.env.example`; legal holds
(`users.legal_hold`, `cases.legal_hold`, set by admins at `/admin/privacy/legal-holds`) suspend erasure and purges.

## 1. Processing activities

| # | Activity | Data subjects | Personal data (special categories in **bold**) | Purpose | Lawful basis (GDPR / DPDP) | Recipients | Transfers outside India | Retention | Where in the system |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Accounts and sign-in | Patients, guardians, agents, hospital users, staff | Name, email, phone, country, password hash, MFA secret (encrypted), Google/Apple ids, IP and user agent of sessions | Provide accounts, security | Contract; legitimate interests (security) / consent (`terms`, `privacy`) | Hosting; Google/Apple (sign-in only) | Hosting region TODO-BUSINESS; Google/Apple (US) | Life of account; erasure on deletion; inactive accounts 3 years (30-day notice) | `users`, `refresh_tokens`, `app/modules/auth` |
| 2 | Patient profile | Patients, companions | Name, date of birth, gender, nationality, passport number (encrypted), address, emergency contact, insurance (encrypted), **blood group, allergies, medical history (encrypted)** | Match, quote, book, arrange travel | Contract; **explicit consent** for health data (Art. 9(2)(a)) / consent | Hospitals the patient shares with; agent (if any) | Hospitals are in India; agent's country | Life of account; pseudonymised shell on erasure | `patient_profiles`, `patient_companions` |
| 3 | Screening (questionnaire + triage) | Patients | **Symptoms, body areas, pain, duration, previous treatments, notes (encrypted), AI result (encrypted)**, urgency | Suggest specialties and hospitals, flag emergencies | Explicit consent (`privacy`; `ai_processing` for AI) / consent | Anthropic (only with AI consent); staff | US (Anthropic) | Life of account; erased on deletion | `screenings`, `screening_matches`, `app/modules/screening` |
| 4 | AI reading of medical reports (document AI) | Patients | **Report pages, diagnoses, lab values, medicines; AI summaries (encrypted)** | Help patients and hospitals read reports | Explicit consent (`ai_processing`) / consent | Anthropic; hospital sees confirmed version only | US (Anthropic) | Life of account; erased on deletion | `document_analyses`, `app/modules/docai` |
| 5 | Voice intake | Patients (and agents recording for them) | **Recording (deleted after transcription), transcript (encrypted), suggested answers (encrypted)** | Fill the screening form by voice | Explicit consent (`ai_processing`) / consent | Anthropic receives the transcript text only; speech-to-text is on our servers | US (Anthropic, text only) | Life of account; erased on deletion | `voice_transcriptions`, `app/modules/voice` |
| 6 | Documents | Patients, agents, hospitals | **Medical reports, imaging, prescriptions**, passports, visas, invoices, KYC documents, bank proofs | Case handling, visa letters, KYC, payments | Explicit consent / contract / legal obligation (KYC, tax) | Hospital of the case (until sharing is withdrawn); agent (with `share_with_agent`); finance (payment documents only); support (cases they coordinate, or audited break-glass) | — | Passport/visa scans 90 days after the trip; files users delete 30 days; erased on deletion except invoices/receipts/payment proofs/KYC | `documents`, `app/modules/documents`, object storage |
| 7 | Cases, quotes, bookings, consultations | Patients, hospital staff | Case notes and medical summary (encrypted), treatment plan, dates, amounts | Quote, book, coordinate care | Contract; explicit consent (`share_with_hospitals`) | Selected hospital; agent; staff | — | Kept as anonymous contract records after erasure (notes cleared) | `cases`, `quotes`, `bookings`, `consultations` |
| 8 | Travel and in-country support | Patients, companions | Flights, PNR, visa status, accommodation, SOS location | Arrange travel and safety | Contract; vital interests (SOS) | Travel/service providers booked | Provider's country | PNR/notes/SOS location cleared on erasure | `visa_requests`, `travel_bookings`, `accommodation_bookings`, `service_bookings`, `sos_alerts` |
| 9 | Payments, refunds, invoices, settlements | Patients, payers, hospitals, agents | Amounts, references, gateway payloads, GSTIN, bank details (encrypted) | Take payments, refunds, payouts, tax | Contract; legal obligation (tax, accounting) | Razorpay, Stripe, banks; tax authorities | Stripe (US/EU) if enabled | 8 years from the financial year end; pseudonymised on erasure (PII stripped from gateway payloads) | `payment_orders`, `payments`, `refunds`, `invoices`, `ledger_*`, `settlement_*` |
| 10 | Messaging and notifications | All users | Message text, attachments, notification text | Case communication | Contract | Conversation participants; email/push providers | Email/push providers | Messages: sender's text replaced on erasure; notifications 180 days | `conversations`, `messages`, `notifications` |
| 11 | Consents | Patients, guardians, partners | Consent kind, version, time, IP, user agent, who recorded it | Evidence of consent and withdrawal | Legal obligation / accountability | Regulators on request | — | Life of account + limitation period (kept after erasure) | `consents` |
| 12 | Guardian consent for minors | Children (patients under 18), parents/guardians | Guardian name, relationship, contact (encrypted), date of birth, verification method/reference | Verifiable consent (DPDP s.9, Rule 10) | Legal obligation / consent | Staff (verification) | — | Life of the child's account; erased on deletion | `guardian_consents`, `app/modules/privacy` |
| 13 | Data-rights requests and grievances | Any data principal, nominees, representatives | Name, contact, request details, resolution | Handle rights requests (DPDP s.11–14, GDPR Art. 12–22) | Legal obligation | Privacy staff | — | TODO-BUSINESS: [[3 years]] after closure; contact details cleared if the account is erased | `data_rights_requests` |
| 14 | Nomination | Patients, nominees | Nominee name, relationship, contact (encrypted) | DPDP s.14 nomination | Legal obligation / consent | Privacy staff when the nominee acts | — | Until changed or the account is erased | `data_nominees` |
| 15 | Security audit and PHI access log | All users | Actor, action, entity, IP, user agent; who viewed which patient's health records | Security, accountability, "who viewed my records" | Legal obligation (DPDP Rules: ≥ 1 year logs; CERT-In) ; legitimate interests | Patient (own access log); admins | — | ≥ 1 year (append-only) | `audit_logs` (`phi.*` actions) |
| 16 | Breach register | Affected people (aggregate) | Incident description, categories, counts, notification dates | GDPR Art. 33(5), DPDP Rule 7 | Legal obligation | Regulators | — | TODO-BUSINESS: [[5 years]] | `breach_incidents` |
| 17 | Marketing | Patients who opt in | Email, consent | Newsletters and offers | Consent (`marketing`) | Email provider | Email provider | Until withdrawal | `consents` |
| 18 | Referral programme and platform credit | Patients (referrers and referred patients) | Referral code, who referred whom, sign-up channel, keyed hashes of device ids (no raw ids), anti-abuse results (same email/phone/device/payment-method match), referral status, credit grants/redemptions/expiry | Run "refer a friend", prevent self-referral, account for credit | Contract (programme terms, Terms §13A); legitimate interests (fraud prevention) / consent (terms) | Referrer sees the friend's first name + initial and reward status only; staff; finance | — | Credit and referral rows are financial records (8 years, like payments); on erasure the code is disabled, device hashes removed and unused credit voided; rows point at the anonymised patient shell. TODO-BUSINESS: confirm | `referral_codes`, `referrals`, `patient_credits`, `patient_credit_movements`, `app/modules/referrals` |
| 19 | Agent CRM leads | Prospective patients of an agency (no account, no login) | Name, country, contact details (encrypted; keyed fingerprints for de-duplication), source, short interest text, budget, pipeline status, follow-up dates, tags, activity notes (encrypted). Must not contain health data beyond the short interest the agent enters | Let agencies manage enquiries before a person becomes a managed patient | Legitimate interests of the agency / contract (the agency collects the data; counsel to decide controller vs processor, as for row 9 agents) | The agency only; staff on audited support access | Agency's country | Lost leads deleted `CRM_LOST_LEAD_RETENTION_DAYS` (default 365) after they were lost (`crm.purge_lost_leads`); converted leads are included in the patient's data export and deleted on the patient's erasure; agents can delete a lead at any time. TODO-BUSINESS: retention for open leads with no activity | `agent_leads`, `agent_lead_activities`, `app/modules/crm` |

## 2. Processors and independent controllers

| Party | Role | Data | Safeguards | Status |
|---|---|---|---|---|
| Anthropic, PBC (Claude API) | Processor | Screening answers + profile health fields, report pages, voice transcripts (only with AI consent) | Commercial terms + DPA; no training on API data; retention per Anthropic terms (30 days default at last check) | TODO-BUSINESS: sign DPA, record transfer mechanism (SCCs if GDPR applies), decide on zero-data-retention |
| Hosting / object storage | Processor | All data | Encryption at rest (S3 SSE), TLS, `DATABASE_SSLMODE=require` | TODO-BUSINESS: provider and region |
| Razorpay / Stripe | Independent controller for payment data (regulated) | Payer details, amounts | PCI DSS; card data never reaches us | TODO-BUSINESS: confirm roles in contracts |
| Email / push providers | Processor | Address/device token and message text (no health details in push) | DPA | TODO-BUSINESS |
| Hospitals | Independent controllers | Shared case data | Hospital Partner Agreement data clauses | Signed per hospital |
| Agents / facilitators | Independent controllers (or processors — counsel to decide) | Patient data they manage | Agent agreement; `share_with_agent` consent for documents | Signed per agent |

## 3. Technical and organisational measures (summary)

- TLS everywhere; database TLS (`DATABASE_SSLMODE`); object storage server-side encryption.
- Field encryption (AES-256-GCM, key ids + rotation, `privacy.reencrypt_fields`) for passport, insurance, bank,
  PAN, MFA secrets, nominee/guardian contacts and health free text (medical history, allergies, screening notes and
  AI results, case notes and summaries, document-AI output, voice transcripts and suggestions).
- Role-based access with record-level scoping; least privilege for finance (payment documents only) and support
  (coordinated cases, KYC; break-glass with reason, admins notified); hospitals lose access when sharing is
  withdrawn; agents need `share_with_agent`.
- PHI read audit for documents, screenings, AI analyses, voice transcripts and agent views of medical history;
  patients see their own access log; admins can inspect any patient's.
- Staff: separate login door, TOTP, optional IP allow-list, 12-hour sessions with a 30-minute idle timeout.
- Retention jobs, complete erasure on account deletion, legal holds, breach register and runbook.

## 4. Identity verification for rights requests (staff procedure)

1. Signed-in requests are already authenticated; act on them after re-checking the account is not under legal hold.
2. Requests without an account (nominee, guardian, representative): verify identity and authority with the least data
   needed (for example a death certificate and nomination record for a nominee; a court order or power of attorney
   for a representative). Record what was checked in the request's internal notes — never store copies of ID
   documents in notes.
3. Answer within `DATA_RIGHTS_SLA_DAYS` (30). If a request is refused, say why and how to complain to the Data
   Protection Board (or the EU/UK authority).
