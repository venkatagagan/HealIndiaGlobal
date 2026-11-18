# Agent CRM (leads)

Agencies track people who enquire *before* they become managed patients: a lead pipeline, a timeline of
calls/messages/meetings/notes, follow-up reminders, CSV import/export, and conversion into a managed patient.

Code: `backend/app/modules/crm` (`service.py`, `router.py`, `schemas.py`, `tasks.py`, `privacy.py`), models
`backend/app/models/crm.py`, migration `0010b`. UI: agent portal **Leads** (`/leads`, board + table, lead detail,
import/export, dashboard tiles) and the mobile agent section (Leads list/detail/quick add/log activity, due-today
badge on the dashboard).

## Model

* `agent_leads`: agency (`agent_id`), owner (`owner_user_id`), name, country, email/phone/WhatsApp
  (**encrypted**, plus keyed fingerprints for duplicate detection and exact search), preferred language, source
  (`walk_in`, `whatsapp`, `facebook`, `referral`, `event`, `other`) + detail, interested specialty/procedure,
  short interest text, budget + currency, status, lost reason, next follow-up, tags, conversion link.
* Pipeline: `new → contacted → qualified → screening → quote_requested → won` (converted) / `lost` (reason
  required). `won` is only reachable through *Convert*. The first call/message/meeting on a `new` lead moves it
  to `contacted`.
* `agent_lead_activities`: `call`, `message`, `meeting`, `note`, `status_change` with an encrypted body.

## Scoping

Leads belong to the agency; every member sees the agency's leads; other agencies get 404. Today an agency has a
single login (`agents.user_id`), so the only valid owner is that user; `owner_user_id` is ready for agency
teams (validation lives in `crm.service._team_user_ids`).

## Conversion

`POST /agent-portal/leads/{id}/convert` takes the same body as `POST /agent-portal/patients` and calls the same
service: the agency must be approved, the agent's consent attestation is mandatory, and the patient is invited
to confirm consent on first sign-in. The lead becomes `won` and points to the patient. Lead notes are **not**
copied into the patient record. Leads have no login and should hold no health data beyond the short interest
text (the forms say so).

## Import / export

* Import: `POST /agent-portal/leads/import?dry_run=` (multipart `file`, UTF-8 CSV, ≤ 1000 rows / 1 MB,
  10 imports/hour). Columns: `full_name` (required), `country`, `email`, `phone`, `whatsapp`,
  `preferred_language`, `source`, `source_detail`, `interest`, `budget` (major units), `budget_currency`,
  `next_follow_up` (YYYY-MM-DD, 10:00 IST), `tags` (`;`-separated), `note`. Every row is validated first and
  nothing is created if any row fails; rows whose email/phone matches an existing lead (or an earlier row) are
  skipped as duplicates.
* Export: `GET /agent-portal/leads/export` (same filters, 20/hour) — CSV with formula-injection guard; audited
  (`crm.leads_export`).

## Jobs

* `crm.follow_up_reminders` (hourly): one in-app/push notification per owner per day for open leads with a
  follow-up due by the end of today (IST), each lead once per due date (`notifications kind crm.follow_up_due`).
* `crm.purge_lost_leads` (daily): deletes leads lost more than `CRM_LOST_LEAD_RETENTION_DAYS` (default 365) ago.

## Privacy

Leads are personal data (ROPA row 19). A converted lead (and its timeline) is included in the patient's data
export and deleted when the patient's account is erased. Agents can delete a lead at any time. All writes are
audited (`crm.lead_*`, `crm.leads_import`, `crm.leads_export`).

## API

| Method | Path |
|---|---|
| GET | `/api/v1/agent-portal/leads` (filters `status`, `source`, `q`, `tag`, `owner_user_id`, `follow_up=due\|overdue\|none`, `country`, `sort`) |
| GET | `/api/v1/agent-portal/leads/pipeline` (per stage, per source, conversion rates, follow-ups due/overdue) |
| POST | `/api/v1/agent-portal/leads` |
| GET / PATCH / DELETE | `/api/v1/agent-portal/leads/{id}` |
| POST | `/api/v1/agent-portal/leads/{id}/activities` |
| POST | `/api/v1/agent-portal/leads/{id}/convert` |
| POST | `/api/v1/agent-portal/leads/import` |
| GET | `/api/v1/agent-portal/leads/export` |
