**DRAFT — for review by qualified legal counsel; not legal advice.**

# Personal data breach response runbook

| | |
|---|---|
| Applies to | Any confirmed or suspected personal data breach: unauthorised access, disclosure, alteration, loss or destruction of personal data, or loss of access to it (DPDP Act s.2(u); GDPR Art. 4(12)) |
| Owner | TODO-BUSINESS: [[INCIDENT LEAD]] (deputy: [[DEPUTY]]); DPO TODO-BUSINESS: [[DPO NAME]] |
| Register | `breach_incidents` table — `POST/GET/PATCH /api/v1/admin/privacy/breaches` (admins). Recording an incident starts the 72-hour clock (`notification_deadline_at`) and alerts every admin. |
| Related | [ROPA.md](ROPA.md) · [DPIA.md](DPIA.md) · `docs/SECURITY.md` · `docs/OPERATIONS.md` |

## Deadlines at a glance

| Who | When | What | Law |
|---|---|---|---|
| CERT-In | **Within 6 hours** of noticing a reportable cyber incident (data breaches and leaks are reportable) | Incident report form to incident@cert-in.org.in | CERT-In Directions, 28 April 2022 |
| Data Protection Board of India | **Without delay** — an initial intimation as soon as we know; a **detailed report within 72 hours** of becoming aware (or longer if the Board allows) | Description, nature, extent, timing, location, likely impact, then facts, causes, mitigation, findings about the person responsible, remediation, reports to affected people | DPDP Act s.8(6), DPDP Rules 2025 Rule 7 |
| Affected Data Principals (India) | **Without delay**, in plain language, through their account / email | Description, likely consequences, mitigation, safety measures they can take, contact | DPDP Rules 2025 Rule 7(1) |
| EU/UK supervisory authority | **Within 72 hours** of becoming aware, unless the breach is unlikely to result in a risk to people | Art. 33(3) contents; staged reporting allowed | GDPR / UK GDPR Art. 33 |
| EU/UK data subjects | **Without undue delay** if high risk | Art. 34 contents | GDPR Art. 34 |
| Hospitals / agents (independent controllers) | Promptly, as the partner agreements require | Facts relevant to their patients | Contracts |
| Anthropic / other processors | Processors must tell **us** without undue delay | — | DPAs |

"Aware" = the moment we have a reasonable degree of certainty that a breach involving personal data happened.
Record that time as `detected_at`. TODO-BUSINESS: confirm the Board's online reporting channel once it is live.

## Step by step

### 0. Anyone who suspects a breach (minute 0)

1. Do not investigate alone and do not delete anything. Tell the incident lead on [[CHANNEL / PHONE]] (TODO-BUSINESS).
2. Write down what you saw, when, and on which system.

### 1. Triage and record (first hour)

1. Incident lead opens the register entry: admin portal or `POST /api/v1/admin/privacy/breaches` with title,
   description, severity (`low|medium|high|critical`), `detected_at`, data categories (health, identity, contact,
   financial, credentials, location) and an estimate of people affected.
2. Decide if CERT-In reporting applies (most data breaches do) — the 6-hour clock is the tightest.
3. Start an incident channel and a timeline document; every action gets a time stamp.

### 2. Contain (hours 0–6)

- Revoke leaked credentials and tokens: rotate `JWT_SECRET` (signs everyone out), revoke refresh-token families of
  affected users, rotate API keys (Anthropic, payment gateways, S3).
- If field-encryption keys may be exposed: rotate `FIELD_ENCRYPTION_KEY` (move the old one to
  `FIELD_ENCRYPTION_OLD_KEYS`, new `FIELD_ENCRYPTION_KEY_ID`) and run `privacy.reencrypt_fields`.
- Restrict access (`STAFF_ALLOWED_IPS`, suspend accounts) and isolate affected hosts; preserve logs and snapshots
  for forensics. Place a legal hold on affected accounts/cases if evidence must be kept
  (`/admin/privacy/legal-holds`) — this pauses the retention purges.
- Use the audit log (`audit_logs`, including `phi.*` access rows) to scope who accessed what.
- Update the register: `status=contained`, `contained_at`, `measures_taken`.

### 3. Assess (by hour 24)

- Whose data, how many people, which categories, is the data encrypted or pseudonymised (field encryption lowers
  risk only if keys were not exposed), can it be misused (identity theft, discrimination, distress for health data).
- Risk level → who must be told (table above). Health data almost always means high risk.
- Record `likely_consequences` and `affected_subjects_estimate` in the register.

### 4. Notify (Board report due by hour 72)

- CERT-In: within 6 hours (initial), with updates.
- Data Protection Board: intimation without delay; detailed report within 72 hours.
- EU/UK authority: within 72 hours where the GDPR applies (lead authority: TODO-BUSINESS [[EU REPRESENTATIVE / LEAD SA]]).
- Affected people: in-app notification + email, plain English, through the normal notification service; include
  what happened, what data, what we are doing, what they should do, and the Grievance Officer contact.
- Record the times in the register: `dpb_notified_at`, `supervisory_authority_notified_at`,
  `subjects_notified_at`, then `status=notified`. The register flags `notification_overdue` after 72 hours.

### 5. Recover and learn (within 30 days)

- Fix the root cause; add tests and monitoring; update the DPIA and ROPA if processing changed.
- Post-incident review with the timeline; record lessons in `notes`; `status=closed` (sets `closed_at`).
- Keep the register entry (GDPR Art. 33(5) requires documenting every breach, notified or not). Retention:
  TODO-BUSINESS [[5 years]].

## Message templates

**To affected people (plain English).** "On {date} we found that {what happened}. This may have exposed your
{data categories}. We have {containment steps}. To protect yourself, {actions: change your password, watch for
suspicious emails or calls, contact your bank}. If you have questions, contact our Grievance Officer at {contact}.
You can also complain to the Data Protection Board of India."

**Initial intimation to the Board.** Description of the breach, its nature, extent, timing and location, and the
likely impact — expand in the 72-hour report with the broad facts, circumstances and reasons, mitigation, findings
on the person responsible, remediation, and the reports made to affected people.

## Contacts (TODO-BUSINESS)

| Role | Name | Phone | Email |
|---|---|---|---|
| Incident lead | [[ ]] | [[ ]] | [[ ]] |
| DPO | [[ ]] | [[ ]] | [[ ]] |
| Legal counsel | [[ ]] | [[ ]] | [[ ]] |
| Hosting provider security | [[ ]] | [[ ]] | [[ ]] |
| CERT-In | — | +91-1800-11-4949 | incident@cert-in.org.in |
