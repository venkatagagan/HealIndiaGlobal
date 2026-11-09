**DRAFT — for review by qualified Indian legal counsel; not legal advice.**

# Legal drafts — Heal India Global

This folder holds first drafts of the legal and consent documents for the Heal India Global platform. They are
written to match the data flows, settings and money flow in [docs/PLAN.md](../PLAN.md) (consents §9, refund
defaults §6.3, money flow §6.4, AI screening §7). **None of them may be published or signed until qualified Indian
counsel has reviewed them and the open questions below have been answered.**

## Index

| File | What it is | Audience | Where it is used | How acceptance is recorded |
|---|---|---|---|---|
| [TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md) | Patient/user terms: facilitator role, no medical advice, AI limits, emergencies, quotes, bookings, payments, liability, disputes | Patients, guardians, guests | Registration; Terms page (patient web and app) | `consents.kind = terms` (+ `accept_terms: true` on `POST /auth/register`) |
| [PRIVACY_POLICY.md](PRIVACY_POLICY.md) | DPDP Act notice plus GDPR-style information and rights | Everyone | Registration; Privacy page; profile | `consents.kind = privacy` |
| [AI_CONSENT.md](AI_CONSENT.md) | Short in-app consent for AI screening, with variants | Patients, guardians, agents | Screening step 4; agent screening form; profile | `consents.kind = ai_processing` + `screenings.consent_ai = true` |
| [DATA_SHARING_CONSENT.md](DATA_SHARING_CONSENT.md) | In-app consent to share a case with a selected hospital, with variants | Patients, guardians, agents | Before every `POST /cases` (request quote / consultation) | `consents.kind = share_with_hospitals`, one per hospital |
| [REFUND_CANCELLATION_POLICY.md](REFUND_CANCELLATION_POLICY.md) | Refund tiers (mirrors `refund_policy`), exceptions, gateway fees, timelines, currency/FX | Patients, agents | Checkout; cancel-booking dialog; linked from the Terms | Part of the Terms (`terms`) |
| [HOSPITAL_PARTNER_AGREEMENT.md](HOSPITAL_PARTNER_AGREEMENT.md) | Listing, KYC, pricing transparency, quotes, care standards, commission + GST + TDS, settlements/holds/clawbacks, data roles, SLAs, liability, termination | Hospitals | Signed before listing approval (hospital portal onboarding) | Signed/e-signed counterpart (no consent kind exists — see item 23) |
| [AGENT_FACILITATOR_AGREEMENT.md](AGENT_FACILITATOR_AGREEMENT.md) | KYC, conduct, no medical advice, commission and payout, data protection, anti-bribery, termination; patient authorisation template | Agents/facilitators | Agent registration / KYC submission | Click-through acceptance (no consent kind exists — see item 23) |

## Conventions

- **`[[...]]`** marks a placeholder or business decision to fill in. **`{...}`** marks a value the app fills in at
  run time (for example `{hospital_name}`).
- **Drafting note** blocks are for counsel and the product team. Remove them before publication.
- **Versions.** Each document carries a version string that the apps send as `consents.version` (the column is
  `String(32)`, so keep it to 32 characters or fewer). Drafts use `2026-10-21-draft.1`; published versions should use
  the effective date, e.g. `2026-12-01`. Bump the version whenever the substance changes, and ask users to accept
  again where the document says re-consent is needed.
- **Plain language.** Patient-facing texts aim for plain English. Translations must be equally simple, and the
  Privacy Policy must be available in English or any Eighth Schedule language on request (DPDP Act s.5(3)).
- **Honest claims.** The drafts never say that Heal India Global holds an accreditation or certification.
  Accreditation badges are attributed to individual hospitals. Do not add JCI/NABH/ISO/SOC 2/HIPAA claims for the
  platform unless they are actually held.

### Suggested sign-up microcopy

- Patient registration (records `terms` and `privacy`; not pre-ticked):
  "I agree to the Terms of Service and the Refund & Cancellation Policy, and I have read the Privacy Policy. I
  consent to Heal India Global processing my personal data, including the health and passport information I
  provide, for the purposes described in the Privacy Policy."
- Optional marketing (records `marketing`): "Email me news and offers from Heal India Global. I can unsubscribe at
  any time."
- Guests must give the `privacy` consent before submitting a screening.

## Platform facts these drafts rely on

If any of these change (in code or in `platform_settings`), the documents must change too.

| Fact | Value | Source | Used in |
|---|---|---|---|
| Consent kinds | `terms`, `privacy`, `ai_processing`, `share_with_hospitals`, `marketing` | PLAN §5, §9 | All patient documents |
| Platform commission | 15% of the hospital amount H (`default_commission_bps = 1500`), most-specific rule wins | PLAN §4.13, §6.3 | Hospital agreement §8, Schedule A |
| Agent commission | 5% of H (`default_agent_commission_bps = 500`), paid out of platform commission, ≤ platform commission | PLAN §6.3–6.4 | Terms §2.5; agent agreement §5 |
| GST on commission | 18% (`gst_rate_bps = 1800`) | PLAN §6.3 | Hospital agreement §8.3 |
| TDS (s.194-O) | 0.1% of H (`tds_194o_rate_bps = 10`) | PLAN §6.3 | Hospital agreement §8.4 |
| Settlement | Hold 3 days after completion; cycle 7 days; maker-checker approval; Razorpay Route or manual transfer with UTR; negative (clawback) items net against positive items | PLAN §6.3–6.4 | Hospital agreement §9; agent agreement §5 |
| Deposit | 20% of booking total confirms the booking | PLAN §6.3, §5 | Terms §8 |
| Patient service fee | 0 (`patient_service_fee_bps = 0`) | PLAN §6.3 | Terms §2.5 |
| Refund tiers | ≥14 days: 100%; ≥7 days: 50%; ≥0 days: 0% | PLAN §6.3 | Refund policy §2 |
| Gateways | Razorpay, Stripe, bank transfer (SWIFT); card data never touches our servers | PLAN §8.11, §9 | Terms §9; Privacy §7 |
| FX | Patients pay in their currency with an FX snapshot; ledger in INR | PLAN §1, §4.11 | Terms §9.2; Refund policy §8.3 |
| AI | Claude via the Anthropic API, only with `consent_ai`; up to 3 reports; rules fallback; red flags → emergency advice; matching weights 30/20/10/10/10/5/5/5/5 | PLAN §7 | AI consent; Terms §3; Privacy §5 |
| Security | Argon2id; AES-256-GCM field encryption (passport, policy, bank, PAN, MFA secret); RBAC + per-record scoping; staff TOTP; audit log | PLAN §1, §9 | Privacy §10 |
| Cookie | `hig_refresh` httpOnly refresh cookie only | PLAN §3 | Privacy §16 |

## Open questions for counsel

Priority: **P1** must be resolved before launch; **P2** before scaling or entering the market concerned; **P3**
should be confirmed but has a reasonable default in the drafts.

### Q1. Medical value travel (MVT) facilitator rules — P1

- Is any registration, recognition or accreditation required (or commercially expected) for a medical value
  travel facilitator — for example listing on the Government's MVT / "Heal in India" portal, Ministry of Tourism
  recognition schemes, or the NABH MVT-facilitator standard? Searches in October 2026 found the Government portal
  lists facilitators but no notification making registration mandatory; please confirm the current position.
- Do any State laws regulate medical-tourism facilitators, health aggregators or referral businesses where the
  company or partner hospitals operate?
- **Name risk:** "Heal India Global" is close to the Government of India's "Heal in India" brand. Advise on
  trademark/passing-off risk and on any rules about implying government affiliation (the drafts include an
  express non-affiliation statement).
- Does arranging flights, transfers and accommodation require a travel-agency/tour-operator registration, or any
  other licence?

### Q2. RBI / FEMA: cross-border collection, payment aggregation and credit — P1

- **Collection model.** PLAN §6.4 has the platform collect patient money (gateways and SWIFT transfers into its own
  account), hold it as a liability until discharge, then pay hospitals net of commission. Under the RBI Master
  Direction on Regulation of Payment Aggregators (15 September 2025), does this make the platform a payment
  aggregator needing authorisation? Is it acceptable if an authorised PA's split-settlement/nodal product (for
  example Razorpay Route) holds the funds, or must the platform act as merchant of record? Commentary on the
  Directions suggests settlement on a merchant's instruction is limited to specified cases and merchant sizes —
  confirm.
- **PA-Cross Border.** Inward card payments and SWIFT transfers from foreign patients: applicable PA-CB rules,
  documentation, purpose codes and FIRA/e-BRC; the reported per-transaction limit for PA-CB inward transactions
  (reported as INR 25 lakh — verify) against high-value treatments such as transplants.
- **Third-party receipts.** Can the platform receive foreign remittances for services supplied by hospitals and pay
  the hospitals in INR, and what documentation is needed?
- **Refunds and payouts abroad.** Refunds to foreign cards and accounts, and commission payouts to non-resident
  agents (outward remittance, Form 15CA/15CB or successor forms).
- **"Escrow" wording.** Confirm that patient-facing text must not use "escrow" unless a legal escrow exists (the
  drafts avoid it; the ledger account is named `PLATFORM:PATIENT_ESCROW` internally).
- **Installments.** Payment plans of 3–12 months, including balances paid after discharge: could these be treated
  as credit under the RBI digital lending directions or NBFC rules? Is a no-interest, hospital-deferred payment
  schedule safe, and who bears default risk (the drafts put it on the hospital)?
- **Gateway availability.** Stripe accounts for Indian businesses have been invite-only since 2024; confirm
  availability, and the implications if Stripe is contracted through a foreign entity.

### Q3. GST classification of facilitation services — P1

- Classification (SAC) of the platform's services to hospitals (commission) and to patients (if a service fee is
  ever charged): intermediary, business support or other.
- **Place of supply after the Finance Act, 2026.** Commentary reports that section 13(8)(b) of the IGST Act
  (intermediary services: place of supply = supplier's location) was omitted with effect from 30 March 2026, so the
  default recipient-location rule applies. Confirm, and advise whether (a) any facilitation fee charged to foreign
  patients can be zero-rated as an export, and (b) commission paid to foreign agents becomes an import of services
  taxable under reverse charge.
- GST on commission to hospitals at 18%, recovered by set-off from settlements; tax invoice timing (per batch or
  monthly); credit notes for post-completion refunds (s.34 time limits).
- **TCS under s.52 CGST Act** for taxable hospital supplies sold through the platform (cosmetic procedures, room
  charges above the exempt threshold): does it apply, and how should taxable components be identified? Not modelled
  in the current ledger.
- Is the patient receipt (`patient_receipt`) correctly a receipt rather than a tax invoice? Are e-invoicing
  thresholds relevant?

### Q4. Income tax: TDS and withholding — P1

- **s.194-O under the new Act.** Confirm the provision of the Income-tax Act, 2025 (in force from 1 April 2026) that
  replaces s.194-O of the 1961 Act (reported as s.393, table entry for e-commerce operators — verify), the rate (0.1%
  since 1 October 2024 under the 1961 Act), the "gross amount" base and the treatment of post-completion refunds. The
  code setting is still named `tds_194o_rate_bps`.
- **Agent commission.** Resident agents: TDS on commission (s.194H of the 1961 Act — 2% since 1 October 2024 — or
  its successor) and thresholds. Non-resident agents: withholding, treaty relief documentation, and whether
  commission for services rendered abroad is taxable in India. The current settlement design pays agents gross =
  net (implementation item 11).
- Must hospitals deduct TDS on the commission the platform recovers by set-off?

### Q5. NMC rules on doctor advertising, referrals and telemedicine — P1

- The NMC Registered Medical Practitioner (Professional Conduct) Regulations, 2023 were placed in abeyance in
  August 2023 and the Indian Medical Council (Professional Conduct, Etiquette and Ethics) Regulations, 2002 apply in
  the interim — confirm the position in October 2026.
- Do doctor profiles with photographs, ratings, "success rates", fees and booking buttons amount to prohibited
  advertising or solicitation by doctors (Chapter 6 of the 2002 Regulations)? What consents and content limits
  should hospitals obtain from doctors (the hospital agreement §4.3 and Schedule E propose some)?
- Commission model vs. the prohibition on doctors giving or receiving commission for referrals: the drafts have
  hospitals (institutions) pay the platform for facilitation and prohibit any payment to doctors or by doctors.
  Is this sufficient?
- **Telemedicine Practice Guidelines, 2020:** the Guidelines state that AI/ML-based platforms may not counsel
  patients or prescribe; only a registered medical practitioner may. Is showing patients AI-generated "possible
  conditions", "recommended procedures" and "recommended tests" compatible? (Product mitigation: show patients only
  specialty routing and safety advice; show clinical suggestions to hospital doctors — implementation item 5.)
- Cross-border teleconsultations by Indian doctors with patients abroad: Indian rules, and licensing risk in the
  patient's country.

### Q6. Consumer protection (E-Commerce) Rules applicability — P1

- Is the platform a "marketplace e-commerce entity" under the Consumer Protection (E-Commerce) Rules, 2020 for
  healthcare-related services? If so, confirm the required disclosures (legal name, address, contact and Grievance
  Officer on the platform; seller (hospital) details including address and grievance officer; main ranking
  parameters — the Terms disclose the matching weights; refund and cancellation terms) and the 48-hour
  acknowledgement / one-month redressal timelines.
- **Cancellation charges.** The Rules restrict cancellation charges on consumers unless the entity bears similar
  charges when it cancels unilaterally. Does the 50%/0% tier policy require a reciprocal payment when a hospital or
  the platform cancels?
- **Fairness of the 0% tier.** A patient who prepaid in full and cancels within 7 days forfeits everything. Assess
  under the Consumer Protection Act, 2019 (unfair contract terms, s.2(46)) and the EU Unfair Contract Terms
  Directive; consider capping retention at the deposit or at documented costs.
- **Liability caps** in the Terms (§20) — enforceability against consumers in India and abroad.
- **Dark patterns and advertising:** the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 and the
  2022 misleading-advertisement guidelines. The design references contain claims that need substantiation or
  removal: "500,000+ Patients Treated", "World-Class Healthcare at 70% Less Cost", "zero wait time", "Save $500", and
  JCI/NABH badges on onboarding screens that could imply platform accreditation (implementation item 17).
- **Foreign consumers:** confirm the carve-out for mandatory consumer law of the patient's residence (Rome I art.
  6, Brussels I recast) and whether the EU 14-day withdrawal right applies to the facilitation service (healthcare
  itself is excluded from the Consumer Rights Directive).
- Reviews: moderation standards (IS 19000:2022 is voluntary) and the "first name + country" display.

### Q7. IT Act intermediary status — P2

- Is the platform an "intermediary" for hosted third-party content (hospital listings, reviews, chat)? If so,
  confirm the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 obligations reflected in the
  Terms (content restrictions, Grievance Officer, 24-hour acknowledgement / 15-day resolution, appeals to the
  Grievance Appellate Committee).
- CERT-In Directions (28 April 2022): 6-hour incident reporting, 180-day log retention within India, clock
  synchronisation — confirm applicability and hosting implications.

### Q8. e-Medical visa process facts to verify — P1

The Terms, the hospital agreement and the product copy depend on these. Verify each against official sources
(indianvisaonline.gov.in, the Bureau of Immigration, Indian missions):

- Visa types and names after the Immigration and Foreigners Act, 2025 and the Immigration and Foreigners Order /
  Rules, 2025 (e-Medical, e-Medical Attendant, regular medical visa sub-categories, Ayush visa).
- Validity, number of entries and permitted stay (secondary sources commonly cite triple entry and up to 60 days per
  stay, with conflicting statements about validity windows); extension through FRRO.
- Number of attendants per patient (commonly cited as two) and who qualifies as an attendant.
- Invitation letters: whether hospitals must register on the Government's **Medical & Ayush Visa** portal and
  generate system-generated, uniquely referenced letters (reported as mandatory pre-validation, one letter per
  applicant; one third-party source cites 1 April 2025 as the start date); required contents.
- Application lead time, nationality eligibility for e-Visas, registration requirements for long stays.
- **Reporting duties:** section 10 of the Immigration and Foreigners Act, 2025 (in force 1 September 2025) requires
  medical institutions providing indoor treatment or lodging to foreigners to report them; confirm the procedure and
  deadlines, and hotels' equivalent duties.

### Q9. Data protection — P1

- **DPDP commencement.** The DPDP Rules, 2025 were notified on 13 November 2025: Board provisions immediately;
  consent managers (Rule 4) from 13 November 2026; most obligations (notice, security, breach, retention, children,
  rights) from 13 May 2027, with the SPDI Rules continuing meanwhile. Confirm, and check for any changes (including
  the effect of pending constitutional challenges).
- Could the platform be designated a **Significant Data Fiduciary** (health data at scale)? Implications (DPO in
  India, DPIA, audits).
- **Children:** verifiable parental consent method for foreign parents; whether any exemption extends to a
  facilitator.
- Retention periods proposed in the Privacy Policy §9 (bracketed), including the DPDP Rules' one-year log-retention
  requirement — confirm.
- **GDPR / UK GDPR:** does Art. 3(2) apply (EUR/GBP pricing, targeting)? If so: Art. 27 EU and UK representatives;
  DPO (Art. 37 — large-scale health data); DPIA (Art. 35) for AI screening and health data; explicit consent under
  Art. 9; onward transfers from India to US processors (Chapter V applies to Art. 3(2) controllers), SCCs/IDTA.
- **United States:** HIPAA non-applicability statement; state consumer health data laws (Washington My Health My
  Data Act, Nevada, Connecticut) — whether a separate consumer health data privacy policy and separate sharing
  consents are needed.
- **Other target markets** (from `supported_currencies`): UK, EU, UAE, Saudi Arabia, Qatar, Oman, Kuwait, Nigeria
  (NDPA 2023 — registration of data controllers of major importance), Kenya (Data Protection Act 2019 —
  registration for health data), Bangladesh, Australia, Canada — local representative, registration and
  cross-border transfer requirements.
- Vendor terms: Anthropic (processor; 30-day default deletion; up to 2 years if flagged; no training without
  permission — re-verify), Razorpay, Stripe, hosting, email, FCM, Sentry — DPAs and transfer mechanisms.

### Q10. AI regulation and medical-device status — P1

- Is the AI screening (which outputs "possible conditions", urgency, recommended procedures and tests) software as
  a medical device under India's Medical Devices Rules, 2017 (CDSCO software guidance), or under the EU MDR (Rule 11)
  when offered to EU users?
- **EU AI Act:** transparency duties under Art. 50 apply from 2 August 2026 (the AI consent tells users they are
  dealing with AI). If the screening is a medical device, high-risk obligations follow; the Digital Omnibus reportedly
  moves Annex I (product-embedded) deadlines to 2 August 2028 — confirm publication in the Official Journal.
- India's AI governance guidelines (non-binding) — any expectations for health AI disclosures.
- Product mitigation to discuss: restrict patient-facing AI output to specialty routing and red-flag safety advice
  (implementation item 5).

### Q11. Health-sector prohibitions and restricted services — P2

- Transplants for foreign nationals: THOTA 1994 and Rules 2014 (Authorisation Committee approval, embassy
  certification of donor relationship) — confirm the wording in the Terms §14.4 and hospital agreement Schedule E.
- Surrogacy (Regulation) Act, 2021 and ART (Regulation) Act, 2021: eligibility of foreign nationals and OCI
  cardholders.
- PCPNDT Act, ICMR stem-cell guidelines, New Drugs and Clinical Trials Rules, Drugs and Magic Remedies Act —
  confirm the listing conditions in Schedule E.
- Patients bringing medicines into India or taking them home (NDPS Act; destination-country rules) — whether
  guidance should be given.

### Q12. Corporate, contract structure and liability — P2

- Legal entity details (the code has a placeholder beneficiary "Heal India Global Pvt Ltd"); confirm before any
  bank details are shown to patients.
- Agency vs. principal structure with hospitals (liability, consumer exposure, GST/TDS consequences) — linked to Q2.
- Exposure of a facilitator to medical-negligence or deficiency-of-service claims under the Consumer Protection Act,
  2019; adequacy of the Terms' allocation; platform insurance (PI, cyber) — the drafts claim none.
- Stamp duty and e-stamping for the hospital agreement; validity of click-through acceptance for agents.
- Arbitration institution and seat; enforceability against foreign agents.
- Competition law: non-circumvention (hospital agreement §8.8), any price-parity clause, featured placement.
- Section 27 Indian Contract Act limits on restrictive covenants (agent agreement §9).

## Implementation alignment checklist

The drafts are only accurate if the product behaves as they describe. Items marked ⚠ are gaps found while drafting.
Owners follow PLAN §2.2. These are requests to the owning agents, not changes made by legal-drafts.

| # | The drafts assume… | Owner(s) | Status |
|---|---|---|---|
| 1 | Consents captured unticked, with version strings ≤ 32 chars: `terms` + `privacy` at sign-up; `privacy` before a guest submits a screening; `ai_processing` per AI screening; `share_with_hospitals` before each `POST /cases`; `marketing` optional; withdrawal UI in profile | be-auth, web-public, web-patient, fl-onboarding, fl-screening | To implement |
| 2 | Each hospital share is provable — ⚠ `consents` has no case/hospital column; store the consent id (or kind + version) on the case | backend-models, be-cases, be-auth | Cross-module request |
| 3 | AI payload limited to the fields listed in AI_CONSENT (no name, contact, DOB, passport, insurance, address); ≤ 3 reports only with `consent_ai`; no patient data in the JSON schema; `ai_request_logs` metadata only | be-screening | To implement |
| 4 | `urgency = emergency` shows the urgent-symptom message before matches and requires acknowledgement before any booking flow | web-patient, fl-screening | To implement |
| 5 | Pending Q5/Q10 advice, consider hiding "possible conditions" and "recommended procedures/tests" from patients (show to hospital doctors only) | be-screening, web-patient, fl-screening | Decision needed |
| 6 | Hospitals see only documents attached to their case; passport/companion data only after a booking or visa request for that hospital | be-auth (documents/patients policies), be-cases (`CaseDetail`) | To verify |
| 7 | Patients can see which agent is linked and ask for unlinking; agent consents are recorded with an audit entry naming the agent | be-messaging (agents), web-patient, be-admin | To implement |
| 8 | ⚠ Hospital- or platform-initiated cancellations refund 100%; `POST /bookings/{id}/cancel` currently applies the tier calculation whoever cancels — add a cancellation reason/actor flag or route through a finance refund | be-cases, be-payments | Cross-module request |
| 9 | ⚠ The refund tiers in force at confirmation apply; the cancel endpoint reads the current setting — snapshot `refund_policy` on the booking. "Days before admission" are counted in IST from the date the cancellation is received | be-cases | Cross-module request |
| 10 | ⚠ Amounts retained on cancellation (50%/0% tiers) have no ledger posting and would stay in `PLATFORM:PATIENT_ESCROW`; choose a treatment (hospital agreement Schedule A) and add the posting | be-finance, finance owner | Decision + implementation |
| 11 | ⚠ Agent settlement items deduct TDS/withholding and handle GST invoices; PLAN currently sets agent gross = net | be-finance | Cross-module request |
| 12 | Refunds computed in booking currency and converted back at the original order's `fx_rate`; gateway fees absorbed (not deducted) | be-payments | To verify |
| 13 | Data-principal requests (access summary incl. recipients, correction, erasure, nomination) can be fulfilled — no endpoints exist; handle manually via the Grievance Officer at first, add admin tooling later | be-admin, be-auth | Gap (manual process) |
| 14 | Retention periods in Privacy Policy §9 are enforced: guest cleanup, passport purge, hard deletion of soft-deleted documents, anonymisation | be-auth (documents), worker jobs | Gap |
| 15 | No PII in logs; system logs retained ≥ 180 days in India (CERT-In) and ≥ 1 year (DPDP Rules) | infra, backend-core | To verify |
| 16 | Staff MFA enforced in production (`ADMIN_MFA_REQUIRED=true`) | infra, backend-core | To verify |
| 17 | Marketing claims in the design references ("500,000+ Patients Treated", "70% Less Cost", "zero wait time", "Save $500", platform-level JCI/NABH badges) are substantiated, reworded or removed; testimonials labelled illustrative | fl-onboarding, web-public | Decision needed |
| 18 | Reviews: what is public (proposed: first name + country), moderation rules, eligibility to review | be-catalog, web-public, fl-onboarding | Decision needed |
| 19 | "Featured" hospitals are labelled (and "Sponsored" if paid); `is_featured` never affects match scores | be-catalog, be-screening, clients | To verify |
| 20 | Legal entity, address, contact and Grievance Officer details displayed in the footer / about screen (E-Commerce Rules) | web-public, fl-onboarding | To implement |
| 21 | Patient-facing UI never says "escrow" | all clients | To verify |
| 22 | ⚠ Doctors' registration number and council are captured and shown (Telemedicine Practice Guidelines; hospital agreement §4.3) — the `doctors` model has no such fields | backend-models, be-catalog, web-hospital | Cross-module request |
| 23 | ⚠ Acceptance of the Hospital Partner Agreement and Agent/Facilitator Agreement (version, time, IP) is recorded — `ConsentKind` has no partner-agreement value; use an audit-log entry or add a kind via a PLAN change | be-auth, be-catalog, be-messaging | Cross-module request |
| 24 | Push notification text contains no health details | be-messaging | To verify |
| 25 | GST TCS (s.52) handling, if counsel says it applies | be-finance | Pending Q3 |
| 26 | Teleconsultation refund rule (Refund policy §6) | be-cases, be-payments | Decision needed |
| 27 | Optional: per-hospital terms document shown with quotes (Terms §1.4) | be-catalog, web-patient | Decision needed |

## Publication checklist

1. Resolve every `[[...]]` placeholder and business decision; remove all Drafting notes.
2. Obtain counsel sign-off on each document and on the answers to the P1 questions.
3. Set the effective date and version string in each document, and the same version constants in the web and
   mobile clients.
4. Display the legal entity and Grievance Officer details in the apps (item 20).
5. Prepare translations for the target markets, and the Eighth Schedule language option for the Privacy Policy.
6. Re-verify the vendor terms quoted in the Privacy Policy and AI consent (Anthropic retention) on the publication
   date.

## Sources checked while drafting (October 2026)

Secondary sources are marked; counsel should rely on the official texts.

- DPDP Rules, 2025 notification and phased commencement:
  [PIB document](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf);
  [EY summary](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025)
  (secondary).
- Income-tax Act, 2025 mapping of s.194-O to s.393:
  [TDSMAN blog](https://blog.tdsman.com/2026/07/tds-on-e-commerce-transactions-section-3931-194o/) (secondary).
- Immigration and Foreigners Act, 2025, s.10 reporting by medical institutions:
  [PRS India bill summary](https://prsindia.org/billtrack/the-immigration-and-foreigners-bill-2025);
  [Morung Express — Dimapur Police directive](https://morungexpress.com/dimapur-police-issues-directive-on-foreigners-registration-compliance)
  (regional).
- RBI Master Direction on Regulation of Payment Aggregators (15 September 2025):
  [RBI](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896);
  [AZB & Partners summary](https://www.azbpartners.com/bank/rbi-issues-consolidated-reserve-bank-of-india-regulation-of-payment-aggregators-directions-2025/)
  (secondary).
- Medical & Ayush Visa portal and invitation letters:
  [Embassy of India, Argentina — medical visa](https://indembarg.gov.in/docs/172288760516699969376%20MEDICAL%20VISA.pdf);
  [CGI Auckland checklist](https://www.cgiauckland.gov.in/content/Medical-Visa-Medical-Attendant-Visa-Checklist.pdf).
- NMC 2023 professional conduct regulations in abeyance:
  [The Wire](https://thewire.in/government/nmc-puts-new-guidelines-on-doctors-ethics-in-abeyance-after-imas-meeting-with-health-minister)
  (secondary).
- Consumer Protection (E-Commerce) Rules, 2020 grievance timelines and cancellation charges:
  [IndiaLaw summary](https://www.indialaw.in/blog/civil/consumer-protection-e-commerce-rules/) (secondary).
- Omission of IGST s.13(8)(b) by the Finance Act, 2026:
  [Grant Thornton Bharat](https://www.grantthornton.in/insights/articles/gst-on-intermediary-services/) (secondary).
- Anthropic API data retention:
  [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention);
  [Commercial data retention policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).
- EU AI Act Digital Omnibus timing:
  [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)
  (secondary).
- Stripe in India: [Stripe support — invite-only accounts](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india).
