**DRAFT — for review by qualified Indian legal counsel; not legal advice.**

> Placeholders appear as `[[...]]`. Paragraphs marked **Drafting note** are for counsel and the commercial team
> only and must be removed before execution. Commercial defaults mirror the platform settings in PLAN §6.3 and the
> money flow in PLAN §6.4. Open legal questions are collected in [README.md](README.md).

# Hospital Partner Agreement

| | |
|---|---|
| Version | `2026-10-21-draft.1` |
| Execution | Signed (or e-signed under section 5 of the Information Technology Act, 2000) before the hospital's listing is approved; stamped under the applicable State stamp law |
| Platform setting references | `default_commission_bps = 1500`, `gst_rate_bps = 1800`, `tds_194o_rate_bps = 10`, `settlement_hold_days = 3`, `settlement_cycle_days = 7`, `deposit_pct = 20`, `refund_policy` |

**This Agreement is made on [[DATE]] between:**

1. **[[LEGAL ENTITY NAME]]**, a company incorporated under the Companies Act, 2013 (CIN [[CIN]]), with its
   registered office at [[REGISTERED OFFICE ADDRESS]], GSTIN [[GSTIN]] (the "**Platform Company**"); and
2. **[[HOSPITAL LEGAL NAME]]**, a [[company / trust / society / partnership / proprietorship]] registered under
   [[LAW AND REGISTRATION NUMBER]], operating the hospital known as [[HOSPITAL TRADE NAME]] at
   [[HOSPITAL ADDRESS]], PAN [[PAN]], GSTIN [[GSTIN or "not registered"]] (the "**Hospital**").

(each a "**Party**", together the "**Parties**").

**Background**

- A. The Platform Company operates "Heal India Global", a medical-travel facilitation platform through which
  international patients find, compare, book and pay for treatment at hospitals in India, and obtain help with
  visas, travel, accommodation and in-country support.
- B. The Hospital is a clinical establishment that provides healthcare services and wishes to offer them to
  patients through the Platform.
- C. The Parties wish to record the terms on which the Hospital is listed, receives and responds to patient
  enquiries, receives payments collected through the Platform and protects patient data.

---

## 1. Definitions and interpretation

1.1 In this Agreement:

- **"Accreditation"** means any accreditation or certification claimed by the Hospital, such as JCI, NABH, NABL or
  ISO.
- **"Agent"** means an agent or facilitator registered on the Platform who assists patients.
- **"Applicable Law"** means all laws, rules, regulations, guidelines, directions and orders binding on a Party,
  including those listed in clause 6.1.
- **"Authorised Users"** means the Hospital's personnel to whom the Hospital gives Portal access as hospital
  members (roles: owner, admin, coordinator, finance, doctor).
- **"Booking"** means a booking for Hospital Services created on the Platform from an accepted Quote or a
  Package.
- **"Booking Completion"** means the Booking being marked "completed" (patient discharged) on the Portal by the
  Hospital, or by the Platform Company on documented evidence.
- **"Cancellation Retention"** means any amount paid by a Patient for a Booking and not refunded when the Booking
  is cancelled under the Refund Policy.
- **"Case"** means a patient's enquiry for the Hospital created on the Platform.
- **"Commission"** and **"Commission Rate"** have the meanings in clause 8 and Schedule A.
- **"Data Protection Laws"** means the Digital Personal Data Protection Act, 2023 and the Digital Personal Data
  Protection Rules, 2025 (each as in force from time to time); the Information Technology Act, 2000 and the
  Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information)
  Rules, 2011 (until replaced); and, to the extent they apply to Patient Data, foreign data protection laws such
  as the EU and UK General Data Protection Regulation.
- **"Gross Hospital Amount"** or **"H"** means, for each Booking, the amounts paid by or for the Patient through
  the Platform for Hospital Services (deposit, balance, full payment and installments, including amounts received
  after Booking Completion), less amounts refunded and less any patient service fee retained by the Platform
  Company, each converted into INR at the exchange rate recorded on the relevant payment.
- **"Hold Period"** and **"Settlement Cycle"** have the meanings in Schedule A.
- **"Hospital Services"** means healthcare and related services provided by the Hospital and the doctors
  practising there, including consultations, teleconsultations, investigations, procedures, in-patient stay,
  medicines, implants and follow-up.
- **"Listing Content"** means all information and material about the Hospital, its doctors, specialties,
  procedures, prices, packages, availability and Accreditations provided by or for the Hospital.
- **"Package"** means a fixed-price treatment package listed by the Hospital.
- **"Patient"** means an individual who uses the Platform to seek Hospital Services and, where relevant, the
  individual's parent or guardian.
- **"Patient Data"** means personal data of Patients and their companions or attendants made available through the
  Platform.
- **"Permitted Purpose"** has the meaning in clause 10.3.
- **"Platform"** means the websites, mobile apps, portals and APIs operated by the Platform Company under the name
  "Heal India Global"; **"Portal"** means its hospital portal.
- **"Quote"** means an itemised quote sent by the Hospital through the Portal.
- **"Refund Policy"** means the patient-facing Refund & Cancellation Policy published on the Platform, as in force
  for the relevant Booking.
- **"Service Levels"** means the standards in Schedule B.
- **"Settlement Item"** means the record of an amount payable to (or recoverable from) the Hospital for a Booking,
  and **"Settlement Batch"** means a group of Settlement Items approved for payout together.

1.2 "Including" means "including without limitation". "Days" means calendar days and "business days" means days
on which scheduled banks are open in [[CITY]]. Amounts are in Indian rupees (INR) unless stated otherwise.

## 2. Appointment and relationship

2.1 The Platform Company grants the Hospital a non-exclusive right to be listed on the Platform and to receive
Cases, on the terms of this Agreement.

2.2 The Platform Company provides facilitation services: listing, matching, case coordination, collection and
settlement of payments, and coordination of travel and in-country services. It does not provide Hospital
Services or medical advice and has no control over clinical decisions.

2.3 The Hospital appoints the Platform Company [[as its limited agent]] to collect payments from Patients for
Hospital Services booked through the Platform. A Patient's payment to the Platform Company of an amount due for a
Booking discharges the Patient's obligation to the Hospital for that amount.

> **Drafting note:** The collection model (platform collects into its own accounts, holds until discharge, then
> settles net of commission — PLAN §6.4) must be validated against the RBI Master Direction on Regulation of
> Payment Aggregators (15 September 2025), the PA-Cross Border rules and FEMA before go-live. Alternatives: use an
> authorised payment aggregator's split-settlement or nodal/escrow product so that the Platform Company never
> holds hospital funds, or a principal ("merchant of record") model. The choice changes clauses 2.3 and 9 and the
> GST/TDS analysis. See README Q2.

2.4 The Parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture,
employment or (except as stated in clause 2.3) agency relationship, and neither Party may bind the other.

2.5 This Agreement is non-exclusive. The Platform Company may list other hospitals, and the Hospital may use other
channels, subject to clause 8.8. The Platform Company does not guarantee any volume of Cases or Bookings.

## 3. Onboarding, KYC and verification

3.1 The Hospital will upload the documents listed in Schedule D through the Portal and confirm that they are true,
complete and current.

3.2 The Hospital's listing goes live only after the Platform Company approves it. The Platform Company may request
further information or decline an application, and will give reasons for a refusal.

3.3 The Hospital will notify the Platform Company in writing within 48 hours of:

- (a) any suspension, cancellation or non-renewal of its registration or of any licence required for a listed
  service;
- (b) any lapse, suspension, withdrawal or downgrade of an Accreditation;
- (c) any regulatory, criminal or disciplinary action against the Hospital or a listed doctor relating to patient
  safety, fraud, organ transplantation or data protection;
- (d) any change of control, legal name or legal entity; and
- (e) any change of its payout bank account (payouts are suspended until the new account is verified).

3.4 The Platform Company may re-verify the Hospital at least annually and may suspend the listing while
verification is pending.

3.5 **Authorised Users.** The Hospital decides who receives Portal access and in which role, ensures that each
Authorised User has individual credentials, removes access within 24 hours when a person leaves or no longer needs
it, and is responsible for the acts and omissions of its Authorised Users. [[Two-step verification is mandatory for
owner, admin and finance roles once available on the Portal.]]

## 4. Listing content and pricing transparency

4.1 **Accuracy.** The Hospital is responsible for the accuracy, completeness and currency of its Listing Content,
including its profile, specialties, doctors, procedures, price ranges, Packages (with inclusions and exclusions),
typical length of stay, success rates, languages, international patient desk, availability calendar and images,
and will correct any inaccuracy within the Service Levels.

4.2 **Accreditations.** The Hospital may claim only Accreditations it currently holds, will upload the certificate
(with scope and validity dates) for each, and will remove a claim within 24 hours of its lapse, suspension or
withdrawal. The Platform Company displays only Accreditations it has checked against a certificate and does not
itself accredit or certify hospitals.

4.3 **Doctors.** Each listed doctor must hold valid registration with the National Medical Commission or a State
Medical Council (or, for AYUSH practitioners, the relevant council), and must practise at the Hospital. The
Hospital will provide each doctor's registration number and council, obtain the doctor's written consent to the
publication of their profile and photograph, keep profiles factual (qualifications, registration, experience,
languages, areas of practice), and mark a doctor inactive within 7 days of the doctor leaving.

4.4 **Prices and Packages.**

- (a) Price ranges and Package prices must reflect prices the Hospital actually charges for the stated scope.
- (b) Inclusions, exclusions and assumptions must be stated clearly (for example implant grade, number of nights,
  ICU stay, blood products, complication management, follow-up).
- (c) Prices are stated in INR unless otherwise agreed in writing.
- (d) Listings and Quotes must state whether GST is included and identify taxable components (for example
  cosmetic procedures, or room charges above thresholds set by law).
- (e) The Hospital will not add hidden charges, and will not charge Patients any "facilitation", "platform" or
  similar fee, or show the Commission as a separate charge, unless agreed in writing with the Platform Company and
  disclosed in the Quote.

> **Drafting note:** A price-parity ("not more than the Hospital charges direct international patients") clause
> could be added to protect patients, but wide parity clauses have drawn scrutiny from the Competition Commission
> of India. If wanted, limit it to a narrow commitment not to surcharge Platform patients because of the
> Commission.

4.5 **Success rates.** Success rates must be supported by the Hospital's own outcome data, with the definition used
and the period covered. The Hospital will provide supporting information on request, and the Platform Company may
decline to display a rate that is not adequately supported.

4.6 **Images.** The Hospital warrants that it owns or is licensed to use all images it uploads. Images that identify
patients may be used only with the patient's written consent.

4.7 **Editorial control and featuring.** The Platform Company may format, edit for consistency, decline or remove
Listing Content that is inaccurate, misleading, unlawful or inconsistent with Schedule E. Featured placement, where
offered, is governed by Schedule A and is always labelled on the Platform; it does not affect screening match
scores.

4.8 **Restricted services.** Services listed in Schedule E may be listed only on the conditions stated there.

## 5. Cases, Quotes and Bookings

5.1 **Responding to Cases.** Within the Service Levels, the Hospital will either send an itemised Quote, ask for
the further information it needs, or decline the Case with a reason. The Hospital will not decline a Case on
grounds of nationality, religion, race, caste, sex, disability or other discriminatory grounds.

5.2 **Quotes.** Each Quote must:

- (a) be based on a review of the Case by a registered medical practitioner;
- (b) set out the proposed treatment plan and itemise costs by category (surgery, hospital stay, medicines, tests
  and scans, doctor fees, implants, other);
- (c) state the currency, the estimated length of stay, the assumptions made, the inclusions and exclusions, and
  the tax treatment; and
- (d) remain valid for at least [[30]] days, as shown in its "valid until" date.

5.3 **Honouring Quotes and Bookings.** Once a Quote is accepted and the Booking is confirmed, the Hospital will
provide the Hospital Services described in it at the quoted price. If in-person evaluation shows a materially
different clinical need, the Hospital will, before proceeding (except where delay would endanger the Patient's
life or health): explain the change in writing in a language the Patient understands; provide a revised itemised
estimate; obtain the Patient's informed written consent; and record the revision on the Platform [[by issuing a
revised Quote or note in the Case]].

5.4 **Availability.** The Hospital will keep its availability calendar accurate and honour confirmed admission
dates.

5.5 **Hospital cancellation or rescheduling.** If the Hospital cannot provide the Hospital Services on a confirmed
date, it will notify the Patient's coordinator through the Portal within 24 hours of becoming aware and offer
alternatives. If the Patient does not accept an alternative, the Patient receives a full refund under the Refund
Policy. [[Where the cancellation is not due to clinical reasons or force majeure, the Hospital will reimburse the
Patient's documented, non-refundable travel and visa costs up to INR [[AMOUNT]].]]

> **Drafting note:** The Consumer Protection (E-Commerce) Rules, 2020 restrict cancellation charges on consumers
> unless the e-commerce entity bears similar charges when it cancels unilaterally. If the platform keeps the
> 50%/0% tiers for patient cancellations, counsel should consider whether a reciprocal payment by the hospital
> (or the platform) on unilateral cancellation is required. See README Q6.

5.6 **Status updates.** The Hospital will record admission and Booking Completion (with the discharge date) on the
Portal within the Service Levels. Booking Completion triggers settlement; recording it falsely or prematurely is a
material breach, and amounts paid as a result are recoverable under clause 9.6.

5.7 **Itineraries.** The Hospital will keep appointment, admission, procedure, discharge and follow-up items in the
Patient's itinerary accurate.

5.8 **Teleconsultations.** Teleconsultations must be conducted by registered medical practitioners in line with the
Telemedicine Practice Guidelines, 2020, including identifying the doctor and their registration number to the
Patient, documenting the consultation, and prescribing only as those Guidelines permit. No AI-generated output may
be given to a Patient as advice unless a registered medical practitioner has reviewed it and takes responsibility
for it.

5.9 **Final bill.** At discharge, the Hospital will give the Patient an itemised final bill and upload a copy to the
Platform within [[3]] business days. Where the final bill for the agreed scope is lower than the amounts paid
through the Platform, the difference is refunded to the Patient through the Platform. Where it is higher because
the Patient agreed to additional services, the Hospital may collect the difference [[directly or through a
Platform payment order]]; amounts collected directly are subject to clause 8.8.

## 6. Patient care standards

6.1 **Compliance.** The Hospital will comply with Applicable Law, including as relevant: the Clinical Establishments
(Registration and Regulation) Act, 2010 or the applicable State law; the Indian Medical Council (Professional
Conduct, Etiquette and Ethics) Regulations, 2002 as applied by the National Medical Commission (and any
successor regulations); the Telemedicine Practice Guidelines, 2020; the Bio-Medical Waste Management Rules, 2016;
the Pre-Conception and Pre-Natal Diagnostic Techniques Act, 1994; the Transplantation of Human Organs and Tissues
Act, 1994 and Rules, 2014; the Medical Termination of Pregnancy Act, 1971; the Assisted Reproductive Technology
(Regulation) Act, 2021 and the Surrogacy (Regulation) Act, 2021; the Drugs and Cosmetics Act, 1940 and the New
Drugs and Clinical Trials Rules, 2019; the Narcotic Drugs and Psychotropic Substances Act, 1985; the Consumer
Protection Act, 2019; the Rights of Persons with Disabilities Act, 2016; the Immigration and Foreigners Act, 2025
and the rules and orders under it; and Data Protection Laws.

6.2 **Standard of care.** The Hospital will provide Hospital Services with reasonable skill, care and diligence, in
line with accepted medical standards and the standards of any Accreditation it claims.

6.3 **Informed consent and language.** The Hospital will obtain valid informed consent from each Patient (or their
lawful representative) in a language the Patient understands, using a qualified interpreter where needed.
Clinical explanations must be given by the treating team, even where the Platform arranges a translator.

6.4 **International patient desk.** The Hospital will provide a named point of contact for Platform Patients and
language support as described in its Listing Content.

6.5 **Medical records.** The Hospital will give each Patient, at discharge, a discharge summary and copies of
operative notes, investigation reports and prescriptions in English [[or another language agreed with the
Patient]]; provide copies of medical records on request within 72 hours; and keep records for the periods
required by law.

6.6 **Complications and follow-up.** The Hospital will manage complications arising from its services, provide the
follow-up included in the Quote or Package, give the Patient a written aftercare and continuity-of-care plan for
their return home, and notify the Patient's Platform coordinator within 24 hours of any death, serious adverse
event, unplanned ICU admission or return to theatre involving a Platform Patient (as permitted by law and, where
required, with the Patient's or their representative's consent).

6.7 **Emergencies.** The Hospital will provide emergency stabilisation and treatment to any Platform Patient who
needs it, irrespective of payment status.

6.8 **Patient rights.** The Hospital will respect Patients' dignity, privacy and rights consistent with the Charter
of Patients' Rights (prepared by the National Human Rights Commission and circulated by the Ministry of Health and
Family Welfare), will not discriminate, and will not
detain a Patient, or withhold the mortal remains of a deceased Patient, because of unpaid dues.

6.9 **Complaints.** The Hospital will appoint a grievance officer for Platform Patients, give their details to the
Platform Company for display on the Platform, acknowledge complaints within 48 hours, respond substantively
within 5 business days, and cooperate with the Platform Company's grievance process. Clinical complaints are
investigated by the Hospital; the Platform Company may help communication but does not decide clinical
questions.

## 7. Visa invitation letters and immigration

7.1 The Hospital will issue visa invitation letters only for Patients with an accepted treatment plan and their
genuine attendants, generated through the Government of India's medical visa portal where required [[the
"Medical & Ayush Visa" portal — verify]], containing accurate information, and will upload a copy to the Platform
within the Service Levels. Registration on that portal is the Hospital's responsibility.

7.2 The Hospital will not issue letters for persons who are not genuine Patients or attendants, or in return for
any payment or benefit, and will notify the Platform Company of any suspected misuse of a letter.

7.3 The Hospital will comply with its obligations to report foreign nationals admitted for treatment, and attendants
provided with lodging, to the registration authorities under section 10 of the Immigration and Foreigners Act,
2025 and the rules and orders under it [[verify current procedure and timelines]].

7.4 The Platform Company only tracks and coordinates visa steps. It does not apply for visas or influence visa
decisions.

## 8. Commission, taxes and non-circumvention

8.1 **Commission.** For each Booking, the Hospital pays the Platform Company a commission equal to the Commission
Rate multiplied by the Gross Hospital Amount (H). The Commission Rate is set out in Schedule A; where Schedule A
sets different rates, the most specific applicable rate applies in this order: procedure at this Hospital, then
this Hospital, then procedure, then specialty, then the default rate.

8.2 **When earned.** Commission is earned at Booking Completion on amounts received up to then, and on receipt for
amounts received afterwards (for example late installments). Cancellation Retention is treated as set out in
Schedule A.

8.3 **GST on Commission.** Commission is exclusive of GST. The Platform Company will charge GST at the applicable
rate (currently 18%), issue a tax invoice to the Hospital's GSTIN (or, if the Hospital is unregistered, its
address on record), and recover the GST by deduction from settlements. The Hospital acknowledges that input tax
credit on this GST may not be available to it because healthcare services are largely exempt, and that its own
tax position is its responsibility.

8.4 **TDS.** As an e-commerce operator, the Platform Company will deduct tax at source on the gross amount of
Hospital Services facilitated, at the rate in force (currently 0.1%), under section 194-O of the Income-tax Act,
1961 or the corresponding provision of the Income-tax Act, 2025 [[reported to be section 393 — verify]], deposit
it with the Government and issue TDS certificates in the prescribed form. The Hospital will provide its valid PAN;
without it, a higher rate may apply.

8.5 **GST TCS.** If tax collection at source under section 52 of the Central Goods and Services Tax Act, 2017
applies to taxable Hospital Services supplied through the Platform, the Platform Company will collect and deposit
it and report it in its returns, and the Hospital will identify the taxable components of each Quote or Package
and provide any information the Platform Company reasonably requires.

> **Drafting note:** GST TCS under s.52 applies only to taxable supplies; most healthcare services are exempt, but
> cosmetic procedures and some room charges are not. The settlement engine does not model TCS today. Counsel/CA
> to confirm (a) whether TCS applies, (b) whether the hospital must itself deduct TDS on the Commission recovered
> by set-off, and (c) how TDS under 8.4 is adjusted for post-completion refunds. See README Q3–Q4.

8.6 **Agents.** Commission payable to Agents for Platform Patients is paid by the Platform Company out of its own
Commission. The Hospital will not pay, offer or promise any referral fee, commission or other benefit to any
Agent, doctor or other person in connection with a Platform Patient.

8.7 **Changes to rates.** The Platform Company may change the Commission Rate on [[30]] days' written notice. A change
does not apply to Bookings confirmed before it takes effect. If the Hospital does not accept a change, it may
terminate this Agreement under clause 16.2 before the change takes effect.

8.8 **Non-circumvention.** For [[24]] months after a Patient's first Case with the Hospital through the Platform:

- (a) the Hospital will not encourage the Patient to pay for services quoted or booked through the Platform outside
  the Platform; and
- (b) if the Hospital receives payment directly for Hospital Services relating to that Case or Booking, it will
  report the amount within [[7]] days, and Commission (with GST) is payable on it.

This clause does not apply to emergency treatment, or to a Patient who was demonstrably under the Hospital's care
for the same condition within [[12]] months before the Case. Nothing in this Agreement restricts any Patient's
choice of hospital or doctor.

> **Drafting note:** Check 8.8 against section 27 of the Indian Contract Act, 1872 (restraint of trade) and
> competition law; keep it tied to Platform-originated Cases and to the reporting of fees rather than any
> restriction on treating patients.

8.9 **Other fees.** No listing or onboarding fee is payable unless set out in Schedule A.

## 9. Collections, settlements, holds and clawbacks

9.1 **Collection and holding.** Patient payments for Hospital Services are collected through the Platform's payment
providers and held by the Platform Company [[through the structure confirmed under clause 2.3]] until settlement
under this clause. No interest is payable on amounts held. The Platform Company bears payment-gateway fees and any
difference between the exchange rate recorded at payment and the rate at which the payment provider actually
settles.

9.2 **Settlement amount.** For each Booking (and each later receipt), the amount payable to the Hospital is:

> **N = H − C − G − T**, where **C** = Commission (Commission Rate × H), **G** = GST on C, and **T** = TDS on H,

adjusted for any refunds, clawbacks and set-offs under this clause. Schedule F gives worked examples.

9.3 **Eligibility and cycle.** A Settlement Item is created at Booking Completion (and on each later receipt) and
becomes eligible for payout after the Hold Period. Eligible items are included in the next Settlement Batch for
the Hospital under its Settlement Cycle. Each Settlement Batch is created by one authorised finance user of the
Platform Company and approved by a different one (maker-checker). Payouts are made within [[2]] business days of
approval to the Hospital's
verified payout account [[through a Razorpay Route linked account or by bank transfer]], and the transaction
reference (UTR) and a statement are made available on the Portal.

9.4 **Holds.** The Platform Company may place a Settlement Item on hold, giving the Hospital the reason through the
Portal, where there is:

- (a) a Patient complaint or dispute relating to the Booking;
- (b) a chargeback or payment dispute;
- (c) a reasonable suspicion of fraud, misrepresentation or breach of this Agreement;
- (d) an incomplete or expired KYC or payout-account verification;
- (e) a legal or regulatory order; or
- (f) a missing mandatory document (for example the final bill or discharge summary required by clause 5.9).

The Platform Company will review each hold within [[10]] business days and release or resolve it promptly once the
reason no longer applies.

9.5 **Refunds before Booking Completion.** Refunds to Patients before Booking Completion are paid from the collected
funds under the Refund Policy, and no Settlement Item arises for refunded amounts. Cancellation Retention is dealt
with under Schedule A.

9.6 **Refunds after Booking Completion and clawbacks.** If the Platform Company refunds a Patient after Booking
Completion — because of a billing error, a final bill lower than the amount paid, services not delivered, the
settlement of a complaint, a chargeback, or an order of a court, consumer commission or regulator — it will reverse
the Commission, GST (by credit note) and TDS (to the extent the law permits) in proportion to the refund, and create
a negative Settlement Item for the Hospital's share. Negative items are set off against the Hospital's next positive
items. Any negative balance outstanding for more than [[30]] days is payable by the Hospital within [[15]] days of an
invoice. Except where the refund is required by law, an order or a chargeback outcome, the Platform Company will
consult the Hospital before agreeing a post-completion refund attributable to Hospital Services, and the Hospital
may object with reasons within [[7]] days.

9.7 **Chargebacks.** The Hospital will provide evidence (for example consent forms, discharge summary and bills)
within [[5]] business days of a request to help contest a chargeback. Chargeback losses relating to Hospital
Services are recovered under clause 9.6 unless caused by the Platform Company's own fault.

9.8 **Installments and unpaid amounts.** The Hospital is paid only on amounts actually received by the Platform
Company. The Platform Company does not guarantee payment of balances or installments, but will send reminders to
Patients. The Hospital may set payment milestones (for example full payment before admission) in its Quote.

9.9 **Statements.** The Hospital may dispute a settlement statement within [[30]] days of it being made available;
after that it is treated as accepted, except for manifest errors.

9.10 **Payout account.** Payouts are made only to a verified bank account in the Hospital's legal name. The Platform
Company is not responsible for delays or losses caused by incorrect details provided by the Hospital.

9.11 **Set-off.** The Platform Company may set off any amount the Hospital owes it under this Agreement against
amounts payable to the Hospital.

9.12 **Documents.** The Platform Company issues receipts to Patients for amounts it collects, tax invoices to the
Hospital for Commission, and settlement statements to the Hospital. The Hospital issues its own bills and invoices
to Patients for Hospital Services.

## 10. Data protection

10.1 **Roles.** Each Party is an independent Data Fiduciary (and, where the GDPR applies, an independent controller)
for its own processing of Patient Data, and is responsible for its own compliance with Data Protection Laws. The
Parties do not intend to be joint controllers.

10.2 **Sharing.** The Platform Company shares Patient Data with the Hospital only after the Patient's Data Sharing
Consent for the Hospital (or another lawful basis), limited to what the Case needs. Passport and companion details
are shared only after a Booking or visa request for the Hospital exists. The categories are described in
Schedule C.

10.3 **Permitted Purpose.** The Hospital may use Patient Data only to assess the Case, prepare Quotes, communicate
with the Patient, provide and bill Hospital Services, issue visa invitation letters, and meet its legal
obligations (including medical records, immigration reporting and tax) (the "**Permitted Purpose**").

10.4 **Prohibited uses.** The Hospital will not: use Patient Data for marketing without the Patient's separate
consent; sell or rent Patient Data; use it to train or improve AI models, or for analytics outside the Permitted
Purpose, without the Patient's consent; disclose it to third parties other than its own personnel, doctors and
service providers who need it for the Permitted Purpose and are bound by confidentiality, or as required by law;
or export it in bulk from the Portal.

10.5 **Security.** The Hospital will maintain reasonable security safeguards appropriate to health data, including:
access limited to personnel who need it; individual credentials for the Portal; encryption or equivalent
protection of devices and storage holding Patient Data; logging of access to Patient Data, with logs kept for at
least one year; staff confidentiality undertakings and training; and secure disposal. Patient records must not be
moved to personal devices or consumer messaging apps except as necessary for the Patient's care and with
appropriate safeguards.

10.6 **Breaches.** Each Party will notify the other within 24 hours of becoming aware of a personal data breach
affecting Patient Data exchanged under this Agreement or Portal accounts, with the information then available, and
will cooperate in investigating and mitigating it. Each Party is responsible for notifications to regulators
(including the Data Protection Board of India and CERT-In) and to Patients for breaches in its own systems, and the
Parties will coordinate their communications with affected Patients.

10.7 **Patient requests.** Each Party will forward to the other, within 3 business days, any request from a Patient
that concerns the other Party's processing, and give reasonable help to respond within legal time limits.

10.8 **Retention.** The Hospital keeps medical records for the periods required by law. Other Patient Data received
through the Platform for Cases that did not lead to treatment will be deleted within [[12]] months of the Case
being closed, unless the law requires otherwise.

10.9 **Transfers outside India.** The Hospital will not transfer Patient Data outside India except as needed for the
Patient's care at the Patient's request (for example sending records to the Patient's home doctor) or as permitted
by Data Protection Laws.

10.10 **Processing on behalf of the other Party.** Where one Party processes personal data on behalf of the other
[[not expected in the current Platform design]], the processor terms in Schedule C, Part 2 apply.

10.11 **Staff and doctors' data.** The Platform Company is the Data Fiduciary for the account data of Authorised
Users and for doctor profiles published on the Platform. The Hospital will inform its personnel and doctors of this
and obtain any consent required (including the consent in clause 4.3).

10.12 **Foreign patients.** Where foreign data protection law applies to Patient Data, the Hospital will cooperate
with reasonable measures the Platform Company needs to comply with it [[including standard contractual clauses for
EU/UK patients, if counsel advises that they are needed]].

10.13 **Assurance.** The Hospital will answer a reasonable security questionnaire once a year and, after a breach or
on reasonable grounds, allow an assessment of its handling of Platform Patient Data on reasonable notice.

## 11. Service Levels

The Hospital will meet the Service Levels in Schedule B. If it repeatedly fails to do so, the Platform Company may,
after written notice and a reasonable opportunity to improve, pause new Cases to the Hospital or suspend its
listing.

## 12. Brand, marketing and intellectual property

12.1 The Hospital grants the Platform Company a non-exclusive, royalty-free licence during the term to use its name,
logo and Listing Content to list the Hospital and to market the Platform [[; paid advertising naming the Hospital
requires the Hospital's prior approval]].

12.2 The Hospital may refer to its listing on the Platform but may use the Platform Company's marks only as approved
in writing, and will not imply any endorsement beyond the listing.

12.3 Neither Party will state or imply that the Platform Company accredits, certifies or guarantees the Hospital,
that the Platform Company holds the Hospital's Accreditations, or that either Party is affiliated with or endorsed
by any government.

12.4 The Platform Company retains all rights in the Platform and grants the Hospital a limited, non-transferable
licence to use the Portal for the purposes of this Agreement.

12.5 The Hospital will not post, procure or incentivise fake or misleading reviews. Patient testimonials may be used
only with the Patient's written consent. The Platform Company moderates reviews and will provide a way for the
Hospital to respond to them.

## 13. Ethics, anti-bribery and anti-kickback

13.1 Each Party will comply with the Prevention of Corruption Act, 1988 and other anti-corruption laws that apply to
it, and will not offer, give, request or accept any bribe or improper advantage in connection with this Agreement.

13.2 The Hospital will not pay or provide any referral fee, kickback or other benefit to any Agent, doctor (in India
or abroad), public official (including embassy or consular staff and officials of foreign government health or
patient-sponsorship bodies), insurer's employee, employer or Platform Company personnel in connection with a
Platform Patient. The Hospital will ensure that its doctors comply with the prohibition on giving or receiving
commissions for patient referrals in the professional conduct regulations.

13.3 Gifts and hospitality must be modest, infrequent and recorded, and must never be offered to influence clinical
decisions or reviews.

13.4 The Hospital will not facilitate any commercial dealing in human organs, sex selection or commercial surrogacy,
and will report suspicious transplant requests to the Platform Company and the appropriate authority.

13.5 Each Party will comply with sanctions laws that apply to it. The Platform Company may decline Cases or payments
involving sanctioned persons or territories.

13.6 The Hospital will keep accurate records of its dealings with Platform Patients and Agents and make them
available on reasonable request to verify compliance with this clause.

## 14. Insurance

14.1 The Hospital will maintain, with reputable insurers: professional indemnity / medical malpractice insurance
covering the Hospital and its listed doctors (or ensure that each doctor maintains their own) of at least
INR [[AMOUNT]] per claim; public liability insurance; and [[cyber insurance]]. It will provide certificates on
request and notify the Platform Company of any cancellation or material reduction in cover.

14.2 [[The Platform Company maintains professional indemnity and cyber insurance — include only if actually held.]]

## 15. Liability and indemnities

15.1 The Hospital is solely responsible for Hospital Services and clinical outcomes. The Platform Company has no
responsibility for medical acts or omissions.

15.2 The Hospital will indemnify the Platform Company against losses, liabilities, penalties and reasonable legal
costs arising from third-party claims (including by Patients or authorities) relating to:

- (a) Hospital Services, including medical negligence;
- (b) inaccurate or misleading Listing Content, including Accreditation claims;
- (c) the Hospital's breach of Applicable Law, including immigration reporting, transplantation, PCPNDT and
  advertising laws;
- (d) the Hospital's breach of clause 10;
- (e) taxes for which the Hospital is responsible; and
- (f) the acts and omissions of its personnel and doctors.

15.3 The Platform Company will indemnify the Hospital against losses, liabilities, penalties and reasonable legal
costs arising from third-party claims relating to: (a) the Platform Company's breach of clause 10 in its own
systems; and (b) infringement of third-party intellectual property rights by the Platform software.

15.4 Neither Party is liable to the other for indirect or consequential loss, or loss of profit, revenue or goodwill.

15.5 Each Party's total liability to the other under this Agreement in any 12-month period is limited to the
Commission paid or payable by the Hospital in the preceding 12 months [[or INR AMOUNT, if higher]].

15.6 Clauses 15.4 and 15.5 do not limit: the indemnities in clauses 15.2 and 15.3; liability for fraud or wilful
misconduct; liability for breach of clause 13; the Hospital's obligations under clauses 9.6 and 9.7; or a Party's
obligation to pay amounts due under this Agreement. [[Counsel to decide whether breach of clause 10 is capped
separately.]]

15.7 A Party seeking an indemnity will notify the other promptly, allow it to control the defence (with
reasonable consultation), and not settle a claim admitting fault on the other's behalf without its consent.

## 16. Term, suspension and termination

16.1 **Term.** This Agreement starts on the date above and continues for [[one year]], then renews automatically for
successive one-year periods unless either Party gives at least [[60]] days' notice of non-renewal.

16.2 **Termination for convenience.** Either Party may terminate on [[90]] days' written notice.

16.3 **Termination for cause.** The Platform Company may suspend the Hospital's listing immediately, and may
terminate this Agreement with immediate effect by notice, if:

- (a) the Hospital's registration or a licence required for a listed service is suspended or cancelled;
- (b) there is a credible concern for patient safety;
- (c) the Hospital misrepresents an Accreditation or other material Listing Content;
- (d) the Hospital engages in fraud, bribery or kickbacks, or breaches clause 13;
- (e) a serious personal data breach is caused by the Hospital's failure to comply with clause 10;
- (f) a regulator or court directs it; or
- (g) the Hospital becomes insolvent.

Either Party may terminate by notice if the other commits a material breach that is not remedied within [[15]]
days of notice requiring it to be remedied.

16.4 **Suspension.** While investigating a matter in clause 16.3, the Platform Company may suspend the listing or pause
new Cases.

16.5 **Effect of termination.**

- (a) The listing is removed and Portal access ends, except as needed for (b) to (d).
- (b) The Hospital will continue to provide Hospital Services for Bookings confirmed before termination unless
  patient safety or the law requires otherwise; in that case it will help transfer the Patient to another suitable
  hospital, and the Patient is refunded under the Refund Policy.
- (c) Settlements for completed Bookings continue under clause 9, but the Platform Company may retain a reserve of
  up to [[the amount stated in Schedule A]] for [[90]] days after the last Booking Completion to cover refunds and
  chargebacks.
- (d) Clauses 8.8, 9, 10, 13, 15, 17, 18 and 19, and any other provisions intended to survive, survive termination.

## 17. Confidentiality

17.1 Each Party will keep confidential the other's non-public business information (including Commission terms) and
use it only for this Agreement, except where disclosure is required by law, to professional advisers under duties
of confidentiality, or with consent. Patient Data is governed by clause 10.

17.2 This obligation lasts for the term and [[3]] years afterwards, and indefinitely for Patient Data and trade
secrets.

## 18. Governing law and dispute resolution

18.1 This Agreement is governed by the laws of India.

18.2 The Parties will first try to resolve any dispute through their senior representatives within 30 days of a
written notice of dispute.

18.3 Disputes not resolved under clause 18.2 will be finally resolved by arbitration under the Arbitration and
Conciliation Act, 1996 by a sole arbitrator appointed [[under the rules of MCIA / IIAC / DIAC]]. The seat of
arbitration is [[CITY]] and the language is English. The courts at [[CITY]] have exclusive jurisdiction for interim
relief and matters relating to the arbitration.

18.4 Nothing in this clause affects any Patient's rights against either Party.

## 19. General

19.1 **Notices** must be in writing and sent by email to the addresses in Schedule A (with a copy by courier for
notices of breach or termination).

19.2 **Changes.** This Agreement may be amended only in writing signed by both Parties, except that the Platform
Company may update Schedules B, D and E on [[30]] days' written notice where the change is needed to reflect Platform
functionality or Applicable Law. Commission changes follow clause 8.7.

19.3 **Assignment.** The Platform Company may assign this Agreement to an affiliate or a successor to its business
on notice. The Hospital may not assign it without the Platform Company's prior written consent.

19.4 **Force majeure.** Neither Party is liable for delay or failure caused by events beyond its reasonable control,
but this does not excuse payment obligations or the Hospital's obligations under clauses 6.6 and 6.7.

19.5 **Entire agreement and precedence.** This Agreement (with its Schedules) is the entire agreement on its subject.
If there is a conflict, Schedule A prevails on commercial terms and clause 10 prevails on data protection.

19.6 **Execution.** This Agreement may be signed electronically and in counterparts. Each Party bears its own stamp
duty [[or: stamp duty is borne by the Platform Company]].

19.7 **Severability and waiver.** An unenforceable provision is severed without affecting the rest. Failure or delay
in exercising a right is not a waiver.

---

## Schedule A — Commercial terms

| Item | Terms |
|---|---|
| Commission Rate (default) | **15%** of H (`default_commission_bps = 1500`) |
| Specific rates | [[Table of overrides: procedure at this Hospital / specialty / procedure, with rate and effective dates]] |
| GST on Commission | At the applicable rate, currently **18%** (`gst_rate_bps = 1800`) |
| TDS (s.194-O or corresponding provision) | At the rate in force, currently **0.1%** of H (`tds_194o_rate_bps = 10`) |
| Hold Period | **3 days** after Booking Completion (`settlement_hold_days = 3`) |
| Settlement Cycle | **Every 7 days** (`settlement_cycle_days = 7`) [[or Hospital-specific cycle]] |
| Payout method | [[Razorpay Route linked account / bank transfer (UTR provided)]] |
| Settlement currency | INR |
| Minimum Quote validity | [[30]] days |
| Deposit shown to Patients | **20%** of the Booking total (`deposit_pct = 20`) |
| Patient service fee | **None** (`patient_service_fee_bps = 0`) |
| Patient refund tiers (Refund Policy) | 14+ days before admission: 100%; 7–13 days: 50%; under 7 days: 0% |
| Cancellation Retention | [[Option A: treated as H for the Booking and settled after the original admission date plus the Hold Period, with Commission, GST and TDS applied. Option B: shared [[x]]/[[y]] between Hospital and Platform Company. Option C: retained by the Platform Company.]] |
| Featured placement | [[Not offered / fee and labelling terms]] |
| Commission invoices | Issued [[per Settlement Batch / monthly]] |
| Reserve after termination | Up to [[INR AMOUNT or % of the last 90 days' settlements]] |
| Notice addresses | Platform Company: [[EMAIL]] · Hospital: [[EMAIL]] |

> **Drafting note:** The ledger (PLAN §6.4) recognises revenue only at `booking.completed`, so Cancellation
> Retention currently has no posting and would stay in `PLATFORM:PATIENT_ESCROW`. Choose an option above and ask
> be-finance to add the posting (README, implementation item 10).

## Schedule B — Service Levels

| Obligation | Target |
|---|---|
| First response to a new Case (Quote, information request or decline) | Within 24 hours |
| Itemised Quote | Within 72 hours of receiving complete medical information |
| Replies to Patient and coordinator messages | Within 24 hours; messages marked urgent within 4 hours |
| Teleconsultation scheduling | Confirm or propose a slot within 48 hours of the request |
| Visa invitation letter | Within 3 business days of Booking confirmation and receipt of complete passport details |
| Admission and Booking Completion updates | Within 24 hours of admission / discharge |
| Final bill and discharge summary upload | Within 3 business days of discharge |
| Notification of death, serious adverse event, unplanned ICU admission or return to theatre | Within 24 hours |
| Notification of registration or Accreditation changes | Within 48 hours |
| Removal of a lapsed Accreditation claim | Within 24 hours |
| Listing updates (prices, Packages, doctors leaving) | Within 7 days of the change |
| Removal of Portal access for leavers | Within 24 hours |
| Patient complaints | Acknowledge within 48 hours; substantive response within 5 business days |
| Personal data breach notification | Within 24 hours |

## Schedule C — Data protection details

**Part 1 — Data shared**

| When | Patient Data shared by the Platform Company with the Hospital |
|---|---|
| Case created (after Data Sharing Consent) | Name, nationality, gender, age; screening answers and summary (AI or rules-based), urgency and red flags; Patient notes; selected doctor, procedure or Package; documents attached to the Case; Case messages |
| Booking confirmed or visa request made | Passport number and expiry, passport copy, date of birth, contact details; companions' (attendants') names, relationships, nationalities, dates of birth and passport details; travel and arrival details |
| During treatment | Itinerary, checklist status and Case messages |

| Data provided by the Hospital to the Platform Company | Purpose |
|---|---|
| Quotes, treatment plans, Package details | Show to the Patient; bookings and payments |
| Admission, completion and discharge dates | Case status, checklist, settlement |
| Visa invitation letters | Patient's visa application; checklist |
| Final bills and discharge summaries [[with Patient consent]] | Reconciliation, refunds, insurance support, complaints |
| Doctor profiles and Authorised User details | Listing; Portal access |

Retention: as set out in the Platform Company's Privacy Policy and clause 10.8.

**Part 2 — Processor terms (apply only where clause 10.10 applies)**

The processing Party will: process the personal data only on the other Party's documented instructions; ensure its
personnel are bound by confidentiality; apply the safeguards in clause 10.5; engage sub-processors only with the
other Party's prior written authorisation and on equivalent terms; help the other Party respond to data principal
requests and breaches; not transfer the data outside India except as instructed; delete or return the data at the
end of the processing; and provide the information reasonably needed to demonstrate compliance.

## Schedule D — KYC and onboarding documents

| Document | Platform document type |
|---|---|
| Registration certificate under the Clinical Establishments Act or State law | `kyc_registration` |
| Certificate of incorporation / trust deed / society registration | `kyc_registration` |
| PAN of the Hospital entity | `kyc_pan` |
| GST registration certificate (if registered) | `kyc_gst` |
| Identity proof of the authorised signatory, and board resolution or authority letter | `kyc_id_proof` |
| Accreditation certificates with scope and validity | `kyc_accreditation` |
| Cancelled cheque or bank letter in the Hospital's legal name | `bank_proof` |
| Bio-medical waste authorisation | `other` |
| Registrations for restricted services (THOTA, PCPNDT, ART Act), where listed | `other` |
| List of listed doctors with registration numbers, councils and written publication consents | `other` |
| Confirmation of registration on the Government medical visa portal [[verify requirement]] | `other` |
| Professional indemnity / malpractice insurance certificate | `other` |
| Hospital grievance officer details | Portal profile |

## Schedule E — Listing standards and restricted services

**General standards.** Listings must be factual and verifiable. They must not contain: superlatives that cannot be
substantiated ("best", "No. 1"); guarantees of cure or outcome; claims prohibited by the Drugs and Magic Remedies
(Objectionable Advertisements) Act, 1954; testimonials or before-and-after images without written consent;
endorsements by doctors that breach professional conduct rules; or unsupported success rates.

| Service | Conditions for listing |
|---|---|
| Organ and tissue transplants | State that each transplant requires approval of the Hospital's Authorisation Committee under the Transplantation of Human Organs and Tissues Act, 1994 and its rules; no donor sourcing, introduction or "donor available" claims |
| Fertility / ART | Only services permitted under the Assisted Reproductive Technology (Regulation) Act, 2021, with eligibility conditions stated; no commercial surrogacy; no surrogacy for persons ineligible under the Surrogacy (Regulation) Act, 2021 |
| Prenatal diagnostics | Must state that sex determination is prohibited (PCPNDT Act, 1994) |
| Stem-cell therapies | Only approved indications, or clinical trials registered with CTRI and approved by an ethics committee (and CDSCO where required) |
| Experimental or investigational treatments | Only within approved, registered clinical trials, described as such |
| Cosmetic procedures | Taxes stated; realistic outcome descriptions; fitness-to-fly guidance |
| AYUSH treatments | [[Conditions, including the Ayush visa route — verify]] |

## Schedule F — Worked settlement examples

Rates used: Commission 15%, GST 18% on Commission, TDS 0.1% of H, Agent commission 5% of H (paid by the Platform
Company). All amounts in INR.

**Example 1 — standard Booking.** The Patient pays the equivalent of INR 10,00,000 through the Platform; no patient
service fee.

| Line | Amount |
|---|---|
| Gross Hospital Amount (H) | 10,00,000 |
| Commission C (15% of H) | 1,50,000 |
| GST on Commission G (18% of C) | 27,000 |
| TDS T (0.1% of H) | 1,000 |
| **Net to Hospital N = H − C − G − T** | **8,22,000** |

If an Agent is linked to the Case, the Platform Company pays the Agent 5% of H (INR 50,000) out of its own
Commission of INR 1,50,000. The Hospital's net amount does not change.

**Example 2 — installment received after Booking Completion.** A further INR 1,00,000 is received: H = 1,00,000,
C = 15,000, G = 2,700, T = 100, and a new Settlement Item of **INR 82,200** is created.

**Example 3 — refund after Booking Completion.** On the Booking in Example 1, INR 2,00,000 (20% of the amount paid) is
refunded after discharge. Everything is reversed proportionally (20%):

| Line | Reversal |
|---|---|
| Hospital's share (negative Settlement Item) | −1,64,400 |
| Commission (with GST credit note) | −30,000 |
| GST on Commission | −5,400 |
| TDS [[subject to the TDS adjustment rules]] | −200 |
| **Total refunded** | **2,00,000** |

The negative item of INR 1,64,400 is set off against the Hospital's next positive Settlement Items (clause 9.6).

**Example 4 — Cancellation Retention ([[if Option A in Schedule A is chosen]]).** The Patient paid a deposit of
INR 2,00,000 and cancels 10 days before admission, receiving a 50% refund of INR 1,00,000. The retained
INR 1,00,000 is treated as H: C = 15,000, G = 2,700, T = 100, and **INR 82,200** is settled to the Hospital after the
original admission date plus the Hold Period.

---

**Signed** for and on behalf of [[LEGAL ENTITY NAME]] — Name: [[ ]] · Title: [[ ]] · Date: [[ ]]

**Signed** for and on behalf of [[HOSPITAL LEGAL NAME]] — Name: [[ ]] · Title: [[ ]] · Date: [[ ]]
