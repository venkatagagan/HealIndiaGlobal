# Technical SEO - Heal India Global public website

What is implemented, how to audit it, and the measured scores. English only (`<html lang="en">`, `og:locale=en_US`,
no hreflang). Health (YMYL) rules apply: no thin or generated pages without real data, no ratings without real
reviews, every health page reviewed before it is indexed.

## Run the audit

```bash
npm run audit:seo                  # production build in .next-audit, `next start -p 3101`, crawl + Lighthouse (desktop), stop
npm run audit:seo -- --mobile      # Lighthouse mobile preset
npm run audit:seo -- --no-build    # reuse the last .next-audit build
npm run audit:seo -- --only home,procedure,404
npm run audit:seo -- --base http://localhost:3000   # audit an already running server (nothing is built/started)
npm run audit:seo -- --strict      # exit 1 on any failure (CI)
```

`scripts/audit-seo.mjs` builds with `NEXT_DIST_DIR=.next-audit` (so it never touches a running `next dev`),
`SITE_REQUIRE_LIVE_DATA=false`, `NEXT_PUBLIC_SITE_URL=http://localhost:3101` and drafts included (so every page type
exists). It needs the API on :8000 for live catalogue data. Lighthouse runs on the Playwright Chromium in
`../.devtools/ms-playwright` (override with `CHROME_PATH`). Output: `.lighthouse/summary.md`, `summary.json` and one
Lighthouse JSON per page type (open in https://googlechrome.github.io/lighthouse/viewer/).

The crawler (all internal links from `/`, ~215 pages) checks on every page: title 50-60 characters and unique,
meta description 120-160 and unique, exactly one `<h1>`, no skipped heading levels, absolute self-canonical,
`og:title/description/url/image/locale` and `twitter:card`, `lang="en"`, valid JSON-LD with the required
properties per schema.org type, `<img>` alt + width/height, link text (no empty or "click here" links), internal
links that redirect or 404. Plus: robots.txt, sitemap index + section sitemaps, manifest, icons, llms.txt, feed,
404 status + noindex, security headers, CSP without `unsafe-eval`, `/x/` and `/X` redirects.

## Scores (Lighthouse 13, production build)

Measured 2026-10-22 against the live local API (14 hospitals, 77 doctors, 62 procedures), `npm run audit:seo`
(desktop) and `-- --mobile`. "Before" = the same audit before this work (example pages per type may differ).

Mobile Performance is simulated (slow 4G, 4x CPU slowdown) and depends heavily on the load of the machine running the
audit: this run happened while other builds were running (Lighthouse CPU benchmark ~2100, TBT 500-700 ms). In a
quieter earlier run the same build scored home 95, treatments 97, procedure 92-96, hospital 93, doctor 96-97,
destination 96, guide 96, FAQ 94, account/delete 96. CLS is 0 everywhere; LCP is the hero text (no LCP image).

| Page type | Example | Before (desktop) P / A11y / BP / SEO | After (desktop) P / A11y / BP / SEO | After (mobile) P / A11y / BP / SEO |
|---|---|---|---|---|
| home | `/` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 95 / 100 / 100 / 100 |
| treatments-hub | `/treatments` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 94 / 100 / 100 / 100 |
| specialty | `/treatments/cosmetic` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 91 / 100 / 100 / 100 |
| procedure | `/treatments/cardiology/cabg` | 100 / 93 / 96 / 100 | 100 / 100 / 100 / 100 | 79 / 100 / 100 / 100 |
| procedure-city | `/treatments/spine/disc-replacement/delhi-ncr` | 100 / 92 / 96 / 69* | 100 / 100 / 100 / 69* | 82 / 100 / 100 / 69* |
| costs-hub | `/costs` | 100 / 100 / 96 / 69* | 100 / 100 / 100 / 69* | 92 / 100 / 100 / 69* |
| cost-guide | `/costs/total-knee-replacement/united-states` | 100 / 93 / 96 / 69* | 100 / 100 / 100 / 69* | 96 / 100 / 100 / 69* |
| hospitals-list | `/hospitals` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 80 / 100 / 100 / 100 |
| hospital | `/hospitals/pournami-chennai` | 100 / 92 / 96 / 100 | 100 / 100 / 100 / 100 | 90 / 100 / 100 / 100 |
| doctors-list | `/doctors` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 83 / 100 / 100 / 100 |
| doctor | `/doctors/nandini-varadarajan` | 100 / 92 / 96 / 100 | 100 / 100 / 100 / 100 | 89 / 100 / 100 / 100 |
| destinations | `/destinations` | 100 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 83 / 100 / 100 / 100 |
| destination | `/destinations/chennai` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 95 / 100 / 100 / 100 |
| guides | `/guides` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 95 / 100 / 100 / 100 |
| guide | `/guides/in-country` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 87 / 100 / 100 / 100 |
| stories | `/stories` | 100 / 100 / 96 / 69* | 100 / 100 / 100 / 69* | 90 / 100 / 100 / 69* |
| faq | `/faq` | 100 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 95 / 100 / 100 / 100 |
| about | `/about` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 83 / 100 / 100 / 100 |
| contact | `/contact` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 97 / 100 / 100 / 100 |
| for-hospitals | `/for-hospitals` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 91 / 100 / 100 / 100 |
| for-agents | `/for-agents` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 88 / 100 / 100 / 100 |
| terms | `/terms` | 100 / 100 / 96 / 69* | 100 / 100 / 100 / 69* | 89 / 100 / 100 / 69* |
| privacy | `/privacy` | 100 / 100 / 96 / 69* | 98 / 100 / 100 / 69* | 84 / 100 / 100 / 69* |
| refund-policy | `/refund-policy` | 100 / 100 / 96 / 69* | 100 / 100 / 100 / 69* | 80 / 100 / 100 / 69* |
| account-delete | `/account/delete` | 100 / 100 / 96 / 100 | 100 / 100 / 100 / 100 | 78 / 100 / 100 / 100 |
| 404 | `/this-page-does-not-exist-404-check` | HTTP 404, not scored | HTTP 404 + noindex, one h1 | - |

`*` Draft content: the page is `noindex` on purpose until its content is reviewed and approved (content review
gate), which is the only failing SEO audit (`is-crawlable`); its SEO score with that audit excluded is 100. It
becomes 100 automatically once the content is approved (`review_status: approved` + reviewer) or the legal text
is published (`LEGAL_SHOW_DRAFTS=false` with final texts). `/stories/<slug>`: no story is publishable yet
(needs written consent), so there is no page to audit. The 404 page answers HTTP 404 with `noindex` and one `<h1>`;
Lighthouse does not score non-200 documents.

## Checklist

### Metadata (`src/lib/seo.ts` `pageMetadata`)
- [x] Unique `<title>` per page, 50-60 characters: `fitTitle()` picks the most descriptive variant that fits, with
      the ` | Heal India Global` suffix when it fits (pages pass variants from long to short).
- [x] Unique meta description per page, 120-160 characters: `fitDescription()` cuts on a word boundary and extends
      short texts with page-specific sentences.
- [x] Self-referencing absolute canonical (clean path, no query, no trailing slash) on `NEXT_PUBLIC_SITE_URL`.
- [x] OpenGraph (type, url, title, description, site_name, locale `en_US`, 1200x630 image) and Twitter
      `summary_large_image`; dynamic share images for hospital, doctor, specialty, procedure and guide pages.
- [x] `robots: noindex, follow` for auth pages, search, fallback (sample) data, drafts, thin growth pages;
      `SITE_NOINDEX=true` for staging (robots.txt disallows all, sitemap empty).
- [x] Search Console / Bing verification meta tags from the site settings (System -> Website & contact -> Search
      engines), env `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` as fallback.
- [x] `theme-color`, `color-scheme`, `manifest.webmanifest` (`src/app/manifest.ts`), SVG favicon, PNG 192/512,
      maskable 512 and apple-touch-icon 180 rendered from the design SVGs (`src/app/icons/[name]/route.tsx`).
- [x] `<link rel="alternate" type="application/atom+xml">` to the guides feed on every page.

### Content structure and accessibility
- [x] One `<h1>` per page, logical heading order (Markdown headings are shifted to start at `<h2>`).
- [x] Descriptive link text; skip link; landmarks; `<dl>` groups contain only `<dt>`/`<dd>` (`Fact` in `ui.tsx`).
- [x] Images: decorative SVG illustrations use `alt=""` with explicit width/height; Markdown images are removed;
      remote images (hospital logos, doctor photos) are only allowed from `IMAGE_REMOTE_ORIGINS`;
      `next/image` serves AVIF/WebP (`images.formats`).
- [x] No console errors: the header only probes `POST /auth/refresh` when this browser signed in through the door
      (`hig.signedIn` flag in localStorage, no token), so anonymous visitors never get a 401.

### Structured data (JSON-LD, `src/lib/jsonld.ts`, `src/lib/growth/jsonld.ts`, `src/lib/medical-review.ts`)
- [x] Organization (raster 512x512 logo, contactPoint, sameAs from the site settings' social links, fallback
      `NEXT_PUBLIC_SOCIAL_PROFILES`) on every page;
      WebSite on the home page.
- [x] BreadcrumbList on every page with breadcrumbs (eligible for breadcrumb rich results).
- [x] FAQPage on /faq and procedure pages (questions visible on the page). Note: Google shows FAQ rich results only
      for well-known government and health sites; the markup is still valid.
- [x] MedicalProcedure (procedure pages), Hospital (address, geo, specialties, services, credentials, foundingDate),
      Physician (specialty, credentials, hospital affiliation, address), MedicalWebPage with `reviewedBy` /
      `lastReviewed` only for content approved by a real, active reviewer (site settings; seed `content/site/reviewers.json`), ItemList of
      hospitals on procedure x city pages. Stable `@id`s.
- [x] No fake ratings: `AggregateRating` only with live data AND the patient reviews visible on the page; no
      Review/Rating markup anywhere else.

### Crawling and indexing
- [x] `robots.txt` (`src/app/robots.ts`): allows the site, disallows `/api/`, `/web-vitals`, `/search` and the auth
      door; points to the sitemap index.
- [x] Sitemap index `/sitemap.xml` -> `/sitemap/{pages,treatments,hospitals,doctors,destinations,guides}.xml`
      (`src/lib/sitemap.ts`). Only indexable URLs. `lastmod`: content `updated` front matter; catalogue pages the
      API's `updated_at` when present, else the server start (deployment) time - never "now" per request.
- [x] HTTP 404 for unknown pages and unknown slugs (`not-found.tsx`, `noindex`).
- [x] One URL per page: `/path/` -> 308 `/path` (`trailingSlash: false`), `/Path` -> 308 `/path` (`src/proxy.ts`),
      old `/en|ar|fr/...` -> 308 root, `/procedures` and `/specialties` -> `/treatments`. Internal links point to
      final URLs (the audit fails on any internal redirect or 404).
- [x] `llms.txt` (`src/app/llms.txt/route.ts`): Markdown map of indexable pages for AI assistants.
- [x] Atom feed `/guides/feed.xml` (published guides and stories).
- [x] IndexNow (`src/lib/indexnow.ts`): with an IndexNow key (site setting, else `INDEXNOW_KEY`), `/indexnow-key.txt` serves the key and every
      successful `POST /api/revalidate` pings `api.indexnow.org` with the changed page URLs (Bing, Yandex, Seznam,
      Naver...), after the response, only for a public https `NEXT_PUBLIC_SITE_URL`.
- [x] Machine files (`sitemap*.xml`, `llms.txt`, `manifest.webmanifest`, feed) send `X-Robots-Tag: noindex`.

### Performance
- [x] Static/ISR pages (`revalidate = 3600`), server components by default, small client islands.
- [x] Self-hosted Inter variable font (Latin subset), `display: swap`, preloaded, metric-matched fallback (CLS 0).
- [x] No third-party scripts unless analytics is configured (Plausible, or GA4 only after consent).
- [x] CLS 0 on every page type; LCP is text (no hero image), so there is no LCP image to prioritise.
- [x] Tested and rejected: `experimental.inlineCss` (mobile Performance dropped from 92 to 84 on the procedure page
      because the CSS is duplicated in the RSC payload).
- [x] Real-user Web Vitals (`src/components/web-vitals.tsx`): off unless `NEXT_PUBLIC_WEB_VITALS_URL` is set;
      sends metric, rating and path only (no cookies, no identifiers). Built-in receiver `POST /web-vitals` logs one
      JSON line per beacon when `WEB_VITALS_LOG=true`.

### Security and best-practice headers (`next.config.ts`; CSP per request in `src/proxy.ts`)
- [x] Content-Security-Policy (no `unsafe-eval` in production; only the configured analytics provider's origins),
      `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` + `frame-ancestors 'none'`,
      `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on token pages),
      `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS (`max-age=31536000; includeSubDomains`) in production,
      `upgrade-insecure-requests`, no `X-Powered-By`.

## Environment variables (see `.env.example`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin (build time). Must be the production https origin. |
| `SITE_NOINDEX` | `true` on staging. |
| `SITE_REQUIRE_LIVE_DATA` | `true` in production (never publish sample data). |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | Fallback for the site setting (System -> Website & contact -> Search engines): search console ownership tags. |
| `INDEXNOW_KEY` (+ optional `INDEXNOW_ENDPOINT`) | Fallback for the site setting "IndexNow key": IndexNow pings on revalidation. |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER`, `NEXT_PUBLIC_PLAUSIBLE_*`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Fallback while the site setting Analytics is "None". |
| `REVALIDATE_SECRET` | On-demand revalidation (also authenticates the server-only `GET /api/v1/site-config/server`). |
| `SITE_CONFIG_REVALIDATE_SECONDS`, `CSP_CONFIG_TTL_SECONDS` | Refresh interval of the site settings fetch (300 s) and of the CSP analytics origins (30 s). |
| `NEXT_PUBLIC_WEB_VITALS_URL`, `NEXT_PUBLIC_WEB_VITALS_SAMPLE`, `WEB_VITALS_LOG` | Real-user Web Vitals. |
| `NEXT_PUBLIC_SOCIAL_PROFILES` | Fallback for the site settings' social links: footer icons + Organization `sameAs`. |
| `NEXT_DIST_DIR` | Build folder (the audit uses `.next-audit`). |

## Left for a human

1. Set `NEXT_PUBLIC_SITE_URL` to the production https origin, `SITE_REQUIRE_LIVE_DATA=true`,
   `LEGAL_SHOW_DRAFTS=false` (with final legal texts) and leave `CONTENT_INCLUDE_DRAFTS` unset in production.
2. Google Search Console and Bing Webmaster Tools: verify the domain (or set the two verification env vars),
   submit `https://<domain>/sitemap.xml`, watch Coverage / Page indexing and Core Web Vitals.
3. Generate the IndexNow key in System -> Website & contact -> Search engines (or set `INDEXNOW_KEY`), and set
   `REVALIDATE_SECRET` on both sides so the backend triggers revalidation + IndexNow.
4. Approve content: medical reviewer sign-off (System -> Website & contact -> Medical reviewers + `review_status: approved`) turns the
   draft guides, procedure x city and cost-guide pages indexable; publish stories only with written consent.
5. Backend (optional, better `lastmod`): expose `updated_at` on the public catalogue endpoints
   (hospitals, doctors, procedures, specialties); the sitemap uses it automatically.
6. Add real social profile URLs (System -> Website & contact -> Social profiles) and decide on HSTS `preload` once every subdomain
   is https-only.
7. Optional: `NEXT_PUBLIC_WEB_VITALS_URL=/web-vitals` + `WEB_VITALS_LOG=true` to collect field data.
