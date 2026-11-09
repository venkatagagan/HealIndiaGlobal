# Heal India Global - public website

SEO-first marketing site and public login door, built with Next.js 16 (App Router, React 19, TypeScript strict) and
Tailwind CSS v4. Runs on port 3000. Separate from the React portals in `../web`.

## Run

Use the shared toolchain (`source ../scripts/env.sh` in Git Bash or `. ..\scripts\env.ps1` in PowerShell).

```bash
npm install
npm run dev        # http://localhost:3000 (runs scripts/prebuild.mjs first)
npm run build      # production build; works with the API down (fallback data)
npm run start      # serve the build on port 3000
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

Copy `.env.example` to `.env.local` to change the API, portal URLs, contact settings and review gates.

## Routes

The site is **English only** and served at the root with no locale prefix. Old `/en/*`, `/ar/*` and `/fr/*` URLs
redirect permanently (308) to the same path at the root (`next.config.ts`).

| Route | Content |
|---|---|
| `/` | Home: hero, how it works, specialties, savings examples, featured hospitals, trust, illustrative journeys |
| `/treatments`, `/treatments/{specialty}`, `/treatments/{specialty}/{procedure}` | Treatments hub, specialty pages, procedure pages (key facts, interactive cost comparison, hospitals, guide, FAQ) |
| `/hospitals`, `/hospitals/{slug}` | Directory with client-side filters (progressive enhancement) and hospital pages |
| `/doctors`, `/doctors/{slug}` | Doctor directory and profiles |
| `/destinations`, `/destinations/{slug}` | City guides merged with catalogue cities |
| `/guides`, `/guides/{slug}` | pre-arrival, visa, in-country, payments-and-refunds, post-treatment-care, privacy-in-plain-language |
| `/faq` | FAQ from the content pack (FAQPage JSON-LD) |
| `/for-hospitals`, `/for-agents` | Partner pages; CTA goes to `/register?role=hospital|agent` |
| `/about`, `/contact` | About and contact. The form POSTs JSON to `NEXT_PUBLIC_CONTACT_ENDPOINT`, else to `{NEXT_PUBLIC_API_BASE}/site/enquiries` (staff read them in the admin console under Website enquiries); it opens a mailto: link only when neither is set |
| `/terms`, `/privacy`, `/refund-policy` | Legal drafts from `../docs/legal` with a "draft" banner |
| `/account/delete` | Public account-deletion page (store requirement): how to delete, what is erased/retained, "Sign in to delete" |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | Public auth door (noindex) |
| `/search?q=` | Catalogue search (noindex) |
| `/gahi/*` | Staff door: redirects to `NEXT_PUBLIC_STAFF_URL` (nginx serves the admin console here in production) |
| `/sitemap.xml`, `/robots.txt` | Generated |

Unknown URLs render the 404 page (`src/app/not-found.tsx`) inside the root layout.

## Data sources

* **Catalogue** (`src/lib/data/catalog.ts`): the public API (`API_BASE_URL`, default `http://127.0.0.1:8000/api/v1`)
  with ISR (revalidate 1 h). If the API is unreachable, `src/data/seed-data.json` (exported from
  `../backend/scripts/seed_data`) or a small built-in fictional dataset is used; such pages show a "sample data"
  notice, are `noindex` and are left out of the sitemap. `DATA_FALLBACK` controls this (`auto`, `build`, `off`).
* **Long-form content**: `../content` (Markdown + front matter, see `../content/README.md`) and `../docs/legal`,
  copied to `content-snapshot/` by `scripts/prebuild.mjs` and rendered with a safe Markdown renderer (no raw HTML,
  no images, links rewritten). Content drafts show a banner in `next dev` and are **hidden in production builds**
  (only `review_status: "approved"` pages are published; unapproved routes show a short noindex "being reviewed"
  notice). `CONTENT_INCLUDE_DRAFTS=true|false` overrides that default (e.g. `true` on a staging server that also sets
  `SITE_NOINDEX=true`). Legal drafts show a banner until `LEGAL_SHOW_DRAFTS=false`.
* **Website & contact settings** (`src/lib/site-config.ts`): contact numbers and email, floating WhatsApp / Call
  buttons, social links, analytics, search-engine verification, marketing claims, medical reviewers and the footer
  are edited by a **super admin** in the staff console (System -> Website & contact, `/gahi/settings/website`) and
  read from `GET ${API_BASE_URL}/site-config` with fetch tag `site`. Every save makes the backend call
  `POST /api/revalidate {"tags":["site"]}`, which expires the tag immediately, so the change is live within seconds
  (without `REVALIDATE_SECRET` it still arrives after `SITE_CONFIG_REVALIDATE_SECONDS`, default 300). When the API is
  unreachable or a value is unset (empty), the environment variables and seed files apply. A phone number that is
  unset everywhere (or a known placeholder) hides its button. See "Website & contact settings" below.
* **Medical reviewers**: the site settings above; `../content/site/reviewers.json` -> `src/data/reviewers.json` is
  only the seed / API-unreachable fallback (see "Medical review" below).
* **Marketing claims** (INTEGRATION_BACKLOG #14): the site settings above (savings %, stats, wait text, testimonials
  switch); `../content/site/marketing.json` -> `src/data/marketing.json` is the seed / fallback and still holds the
  testimonials (`src/config/marketing.ts`). Unsourced figures get an "indicative" footnote.
* **Brand assets** (INTEGRATION_BACKLOG #36): `../design` (logo mark, favicon, specialty icons, illustrations) ->
  `public/brand/` + `src/data/brand-manifest.json`. Missing assets fall back to an inline mark and lucide icons.

## SEO, accessibility and security

Per-page metadata with canonical URLs (`src/lib/seo.ts`), OpenGraph/Twitter cards, JSON-LD
(Organization, WebSite + SearchAction, BreadcrumbList, MedicalProcedure, Hospital, Physician, FAQPage,
MedicalWebPage), semantic HTML, skip link, server components by default. Security headers live in `next.config.ts`
(HSTS in production, `frame-ancestors 'none'`, nosniff, strict referrer policy); the Content-Security-Policy is built
per request in `src/proxy.ts` (`src/lib/csp.ts`) because the analytics provider is a runtime site setting.

Full technical-SEO checklist, the audit (`npm run audit:seo`) and Lighthouse scores per page type: [SEO.md](SEO.md).

### SEO environment

| Variable | When | Effect |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | build | Canonical origin (`metadataBase`): canonical URLs, sitemap, OpenGraph/Twitter image URLs. No trailing slash. |
| `SITE_NOINDEX` | build + runtime | Staging: `true` = robots.txt disallows everything, every page is `noindex`, sitemap is empty. |
| `SITE_REQUIRE_LIVE_DATA` | build + runtime | **Production: `true`.** Never publish fallback catalogue data: `next build` fails if the API is unreachable, and an ISR render that cannot reach the API logs `[catalog] SITE_REQUIRE_LIVE_DATA=true ...` and keeps serving the last good page instead of a noindex sample-data page. Ignored by `next dev`. |
| `CONTENT_INCLUDE_DRAFTS` | build + runtime | Unset: drafts visible in dev, hidden in production. `true`/`false` overrides. |
| `REVALIDATE_SECRET` | runtime | Enables `POST /api/revalidate` (>= 32 chars; empty = 503). |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | build + runtime | **Fallback** for the site setting (System -> Website & contact -> Search engines): `<meta name="google-site-verification">` / `<meta name="msvalidate.01">`. |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` (+ `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`) | build | **Fallback** used while the site setting Analytics is "None". Analytics, **off by default**. `plausible`: cookieless script, no banner. `ga4`: an accessible consent banner; Google's script loads only after "Accept" (consent mode v2 defaults all `denied`; only `analytics_storage` is granted; Google signals and ad personalisation off). The CSP allows only the configured provider. A link to `#cookie-settings` (or an element with `data-cookie-settings`) reopens the banner - add one to the footer when GA4 is enabled. |

* **Canonical URLs**: every page's canonical is its clean path (no query string) on `NEXT_PUBLIC_SITE_URL`;
  `trailingSlash: false` makes `/hospitals/` redirect (308) to `/hospitals`, so there are no slash duplicates.
* **Share images**: `opengraph-image.tsx` (1200x630, brand colours + logo mark) for the site default and for
  hospital, doctor, specialty, procedure and guide pages; `twitter:card` is `summary_large_image`. Pages without
  their own image use `/opengraph-image` (`src/lib/seo.ts` lists the routes that have their own).
* **Indexing gate**: catalogue pages rendered from fallback data are `noindex` and left out of the sitemap.

### SEO health

`GET /api/health/seo` (no secrets, `noindex`, `no-store`) returns `200` when every catalogue list came from the API,
`503` otherwise:

```json
{"status":"ok","catalog":{"live":true,"sources":{"specialties":"api","procedures":"api","hospitals":"api","doctors":"api"}},
 "indexable":{"hospitals":14,"doctors":77,"procedures":62,"specialties":16},
 "site":{"noindex":false,"requireLiveData":true,"includeDrafts":false},"checkedAt":"..."}
```

Sources are `api`, `fallback` or `unavailable` (API down with `SITE_REQUIRE_LIVE_DATA=true`). In production nginx
sends `/api/` to the backend, so query the website service directly (`http://website:3000/api/health/seo`).

### On-demand revalidation

Catalogue pages are ISR (`REVALIDATE_SECONDS`, default 3600). When catalogue data changes, the backend calls:

```http
POST http://website:3000/api/revalidate
Authorization: Bearer <REVALIDATE_SECRET>
Content-Type: application/json

{"tags": ["hospital:<slug>", "doctor:<slug>", "procedure:<slug>", "specialty:<slug>", "destination:<slug>", "catalog", "site"],
 "paths": ["/optional/site/path"]}
```

* `site` = the website & contact settings. Unlike the catalogue tags it expires immediately
  (`revalidateTag('site', { expire: 0 })`) and also drops the proxy's cached CSP analytics origins, so the next visit
  shows the change. The backend sends it alone (without `catalog`) after every save of a website setting.

* Tags: `catalog` (every catalogue fetch), collections `specialties`, `procedures`, `hospitals`, `doctors`,
  `destinations`, `fx`, `content`, and entity tags `<kind>:<slug>` (slugs: lowercase letters, digits, hyphens).
  An entity tag also revalidates its collection and the entity's page (`hospital:x` -> `hospitals` + `/hospitals/x`).
  Send `catalog` when a change affects many pages (e.g. a hospital rename shown on doctor cards). `paths` is optional
  (max 50 site paths; `/api` and `/_next` are refused). At most 100 tags.
* Responses: `200 {"revalidated":true,"tags":[...expanded],"paths":[...]}`, `400` invalid body, `401` wrong or
  missing secret, `413` body > 16 KB, `429` rate limited (`Retry-After`; 30 requests/min per client, lock-out after 10
  wrong secrets per client or 30 overall in 15 min), `503` `REVALIDATE_SECRET` not set.
* Semantics: stale-while-revalidate (`revalidateTag(tag, 'max')`) - the next visit gets the old page while the new
  one renders, so an API outage never replaces a good page. The secret is compared in constant time and never logged;
  it is accepted only in the `Authorization` (or `X-Revalidate-Secret`) header, never in the query string.
* The endpoint is not reachable through the public edge (nginx routes `/api/` to the backend); call the website
  service on the internal network. The limiter is in-memory per process.

### Website & contact settings

Edited by a super admin in the staff console (System -> Website & contact); other staff can view them. Stored as
`platform_settings` keys (backend `app/core/site_settings.py`), served publicly by `GET /api/v1/site-config`
(ETag, `max-age=60`; never the IndexNow key or inactive reviewers) and read by `src/lib/site-config.ts`.

| Setting (key) | Used for | Fallback when unset / API unreachable |
|---|---|---|
| WhatsApp, phone / helpline, emergency, email, support hours, WhatsApp message (`helplines`) | floating buttons, footer, contact page, account deletion page, Organization `contactPoint`; phone numbers also in the patient app | `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_PHONE_NUMBER`, `NEXT_PUBLIC_CONTACT_EMAIL`; emergency `112`; message from the dictionary. Unset numbers hide their button. |
| Show WhatsApp / Call button (`website_floating_buttons`) | floating buttons | shown |
| Facebook, Instagram, LinkedIn, X, YouTube (`website_social_links`) | footer icons, Organization `sameAs` | `NEXT_PUBLIC_SOCIAL_PROFILES` |
| Analytics provider + Plausible domain / script URL or GA4 ID (`website_analytics`) | analytics script, consent banner, CSP (`src/proxy.ts`) | `NEXT_PUBLIC_ANALYTICS_*` while the provider is "None" |
| Google / Bing verification, IndexNow key (`website_search_verification`) | verification meta tags; `/indexnow-key.txt` + IndexNow pings | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `INDEXNOW_KEY`. The IndexNow key is read server-side from `GET /api/v1/site-config/server` with `Authorization: Bearer <REVALIDATE_SECRET>`. |
| Marketing claims (`website_marketing`) | hero savings %, home stats, wait text, testimonials switch | `src/data/marketing.json` |
| Medical reviewers (`website_reviewers`) | review bylines + `MedicalWebPage` JSON-LD, indexability of growth pages | `src/data/reviewers.json` |
| Developed by + URL, disclaimer (`website_footer`) | footer | `DV Soft` / `https://dvsoft.in`; dictionary disclaimer |

Runtime knobs: `SITE_CONFIG_REVALIDATE_SECONDS` (default 300: time-based refresh of the `site` fetch when on-demand
revalidation is not configured), `CSP_CONFIG_TTL_SECONDS` (default 30: how long the proxy caches the analytics
origins for the CSP).

### Medical review

Health pages (`review_required` contains `medical`) can credit a reviewer with front matter `reviewedBy` (the id of a
reviewer in System -> Website & contact -> Medical reviewers: name, credentials, registration number + council, short
bio, optional photo URL, active; `../content/site/reviewers.json` is the seed and API-unreachable fallback),
`reviewedAt` (`YYYY-MM-DD`) and `sources` (`[{"title": "...", "url": "https://..."}]`). Guide and procedure pages
then show "Medically reviewed by ... · Last reviewed ..." and a Sources list, and emit `MedicalWebPage` JSON-LD with
`reviewedBy` (Person + registration credential) and `lastReviewed`. Inactive reviewers, entries marked
`"placeholder": true` in the seed file, or entries missing name/credentials/registration render nothing. `node ../content/tools/build-index.mjs` warns
about approved health pages without a real reviewer.

## Adding pages

* New page: create `src/app/<route>/page.tsx` using `getDictionary()` and `pageMetadata(...)`, add the path to
  `src/lib/routes.ts`, the strings to `src/i18n/dictionaries/en.ts` (the only dictionary; UI copy is English only)
  and the route to `src/app/sitemap.ts`.

## Deployment

* Node container: `NEXT_OUTPUT=standalone npm run build`, then run `node .next/standalone/server.js` behind nginx
  (copy `.next/static` and `public`). nginx should route `/api/` to the backend and `/gahi/`, `/app/`, `/agent/`,
  `/hospital/` to the portals before proxying everything else to port 3000.
* Vercel also works (set the same environment variables; the `/api/*` rewrite then proxies to `API_BASE_URL`;
  the website's own `/api/revalidate` and `/api/health/seo` routes take precedence over the rewrite).
* Production checklist: `SITE_REQUIRE_LIVE_DATA=true`, `REVALIDATE_SECRET` (shared with the backend),
  `NEXT_PUBLIC_SITE_URL` = the real https origin, `SITE_NOINDEX=false` (only on production), drafts left at the
  production default, verification tokens and analytics as decided.
