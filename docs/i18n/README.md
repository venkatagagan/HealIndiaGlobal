# Languages and translations

Heal India Global ships in **English** (default, always on), **Arabic** (right-to-left), **French**,
**Bengali** and **Russian**. Every language except English starts switched **off**; an admin switches each one
on in the admin portal (**Settings → Languages**) once its translations have been reviewed
(see [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md)). Admins can also change any text in any language without a
developer (**Settings → Translations**).

## Where the text lives

| Surface | Catalogs | Key format (for overrides) | Override `app` |
| --- | --- | --- | --- |
| Patient web | `web/apps/patient-web/src/locales/<lng>/patient.json` | `patient:<dotted.key>` | `patient_web` |
| Agent portal | `web/apps/agent-portal/src/locales/<lng>/agent.json` | `agent:<dotted.key>` | `agent` |
| Hospital portal | `web/apps/hospital-portal/src/locales/<lng>/hospital.json` | `hospital:<dotted.key>` | `hospital` |
| Admin portal | `web/apps/admin-portal/src/locales/<lng>/admin.json` | `admin:<dotted.key>` | `admin` |
| Shared web UI (all four apps) | `web/packages/shared/src/locales/<lng>/{common,docai,voice}.json` | `common:<key>`, `docai:<key>`, `voice:<key>` | the app that shows it |
| Public website | `website/src/i18n/dictionaries/<lng>.ts` | `<dotted.key>` | `website` |
| Server (emails, notifications, API errors) | `backend/app/i18n/<lng>.json` | `<dotted.key>` | `server` |
| Mobile app | `mobile/` ARB files | the ARB key | `mobile` |

English is the source of truth. A key missing in another language falls back to English.

Long-form website content (`content/en`, guides and articles) is English only for now; only the website's UI
strings are translated.

## How a string is chosen at runtime

1. **Admin override** for the language (stored in the `translation_overrides` table), else
2. the **shipped translation** in the catalog, else
3. the **English** text.

Overrides are plain text. HTML is stripped when saved and everything is rendered as text, never as HTML.

The language itself is chosen in this order, only among enabled languages:

- **Web portals**: the language picked in the top-bar switcher on this device → the signed-in user's profile
  language (`preferred_language`) → the browser's languages → English. Picking a language while signed in also
  saves it to the profile, so emails, notifications and the mobile app follow it.
- **Website**: the URL (`/ar/...`, `/fr/...`; English has no prefix). On a first visit without a language cookie
  a person (never a search bot) is redirected once to the best match for their browser.
- **API**: `?lang=` → the signed-in user's `preferred_language` → `Accept-Language` → English. The response has a
  `Content-Language` header.
- **Emails and notifications** always use the **recipient's** `preferred_language`.

## For admins: change a text

1. Admin portal → **Settings → Translations**.
2. Pick the app (patient web, agent portal, website, emails/notifications, ...) and the language.
3. Search by English text, translation or key. Filters: *Missing* (no translation yet), *Overridden*.
4. Edit the text and save. It is live within about a minute (web apps fetch overrides at start-up; the website
   refreshes them every few minutes). **Clear** removes your override and goes back to the shipped text.

Keep placeholders such as `{{name}}`, `{name}` or `{count}` exactly as they are - they are replaced with real
values. Every change is recorded in the audit log.

## For admins: switch a language on or off

Admin portal → **Settings → Languages**. Each language shows how complete its translation is per app. English
cannot be switched off. Switching a language off hides it from every switcher and from the website's language
routes; people who had chosen it see English.

## For developers: add or change a string

- React portals: `const { t } = useAppTranslation()` (from the app's `src/i18n.ts`) and add the key to
  `src/locales/en/<ns>.json` **and** to `ar`, `fr`, `bn`, `ru`. Shared components use `useCommonTranslation()`.
  Outside React (column definitions, schemas built at module level): build them inside a function that receives
  `t`, or call `i18n.t('<ns>:<key>')` lazily - never at import time.
- Use `{{name}}` interpolation; never concatenate translated fragments. For counts use i18next plurals
  (`key_one`, `key_other`; Arabic also needs `_zero`, `_two`, `_few`, `_many`; Russian `_one`, `_few`, `_many`,
  `_other`). For text with links or bold parts use `<Trans>` with numbered tags (`<0>Terms</0>`).
- Numbers, dates and money: `formatNumber`, `formatDate`, `formatMoney` from `@hig/shared/lib` follow the UI
  language. Do not hard-code `'en-US'` in `toLocaleString`.
- Layout must work right-to-left: use logical Tailwind utilities (`ms-* me-* ps-* pe-* start-* end-*
  text-start text-end border-s border-e rounded-s rounded-e`) instead of `ml/mr/pl/pr/left/right`, and flip
  directional icons (arrows, chevrons) with `rtl:-scale-x-100`.
- Data that comes from the API (hospital names, doctor bios, procedure names, chat messages) is not translated.
- Check the catalogs: `node scripts/i18n/check-catalogs.mjs` (same keys in every language, placeholders kept,
  no HTML).
- After changing any catalog, refresh the export the admin Translations page reads:
  `node scripts/i18n/export-catalogs.mjs` (writes `backend/app/i18n/catalogs/<app>.json`; commit it).
  `--check` fails when the export is stale.
- Server text: `from app.i18n import t` then `t("email.verify.subject", locale, name=...)`; add the key to
  `backend/app/i18n/en.json` and the other languages.

## For developers: add a new language

1. **Catalogs**: copy every `en` catalog to the new code (web `src/locales/<code>/`, shared
   `web/packages/shared/src/locales/<code>/`, `website/src/i18n/dictionaries/<code>.ts`,
   `backend/app/i18n/<code>.json`, mobile ARB) and translate.
2. **Code lists**: add the code to `SUPPORTED_LANGUAGES` and `INTL_LOCALES` in
   `web/packages/shared/src/lib/i18n.ts`, the date-fns locale map in `web/packages/shared/src/lib/dates.ts`,
   the website locale list (`website/src/i18n/config.ts`) and `SUPPORTED_LANGUAGES` in
   `backend/app/i18n/__init__.py`. Right-to-left languages also go in the RTL sets.
3. **Database**: add a row to `languages` (Alembic data migration; `enabled = false`).
4. Run `node scripts/i18n/check-catalogs.mjs` and `node scripts/i18n/export-catalogs.mjs`.
5. Have the medical/legal strings reviewed ([TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md)), then an admin
   switches the language on.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/i18n/languages` | enabled languages `[{code, name, native_name, rtl, enabled}]`, public, cached |
| GET | `/api/v1/i18n/overrides?locale=ar&app=patient_web` | `{locale, app, version, strings: {key: text}}`, public, `ETag`; `since=<version>` or `If-None-Match` → 304 |
| GET | `/api/v1/admin/i18n/languages` | all languages with completeness per app |
| PATCH | `/api/v1/admin/i18n/languages/{code}` | `{enabled}`; English cannot be disabled; audited |
| GET | `/api/v1/admin/i18n/strings?app=&locale=&q=&status=&page=&page_size=` | keys with English, shipped and override text |
| PUT | `/api/v1/admin/i18n/overrides` | `{app, locale, key, text}`; audited |
| DELETE | `/api/v1/admin/i18n/overrides?app=&locale=&key=` | audited |
