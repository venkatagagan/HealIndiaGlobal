# Heal India Global: patient content pack

This folder holds the patient-facing written content: the FAQ, guides, city guides, procedure explainers and plain-language
policy summaries. It is plain Markdown plus one JSON index. The patient web portal (`web/apps/patient-web`) and the
Flutter app (`mobile/`) can both render it without a CMS or a backend call.

> **Status:** every file here is a **draft** (`review_status: "draft"`). Nothing may be shown to patients in production
> until it has passed the review workflow below. In particular, medical pages need clinical review and payments, privacy,
> visa and FAQ pages need legal review.

## 1. Structure

```
content/
├── README.md                          this file (not indexed, not shown to patients)
├── index.json                         machine-readable index of every page (generated, see section 4)
├── tools/build-index.mjs              regenerates and validates index.json (Node 22, no dependencies)
├── site/marketing.json                marketing claims shown on the public website (not a page; see section 8)
├── en/                                all pages (the product is English only)
│   ├── faq.md
│   ├── pre-arrival-guide.md
│   ├── in-country-guide.md
│   ├── post-treatment-care.md
│   ├── payments-and-refunds.md
│   ├── privacy-in-plain-language.md
│   ├── visa-overview.md               high-level e-Medical / e-Medical Attendant visa overview
│   ├── cities/<city>.md               delhi-ncr, mumbai, chennai, bengaluru, hyderabad, kolkata, kochi,
│   │                                  ahmedabad, pune, jaipur, chandigarh
│   ├── procedures/<slug>.md           20 procedure explainers (cabg, angioplasty, ... bone-marrow-transplant)
│   ├── procedure-city/*.md            website only: procedure x city intros (section 10)
│   ├── cost-guides/*.md               website only: cost guide intros by home country (section 10)
│   └── stories/*.md                   website only: consented patient stories (section 10)
```

* One page = one Markdown file. The file name (without `.md`) is the page `slug`.
* **English only.** The product UI and all content are English; there are no translations. Every page lives under
  `en/` and has `locale: "en"` and `dir: "ltr"` (both kept so existing parsers and paths keep working).

## 2. Front matter

Every page starts with a front-matter block. To keep parsing trivial in TypeScript and Dart, we use a deliberately
**restricted YAML subset**:

* The block is the first line `---`, then one `key: value` per line, then a closing `---`.
* Every value is a **double-quoted JSON string literal**. This means `JSON.parse` / `jsonDecode` can parse the text after
  the first `: `. No lists, nesting, multi-line values or comments are allowed. The one exception is `sources`
  (section 9): a one-line JSON list of `{"title": "...", "url": "https://..."}` objects.
* Unknown keys must be ignored by consumers.

```
---
slug: "cabg"
title: "Coronary artery bypass grafting (CABG)"
category: "procedure"
locale: "en"
dir: "ltr"
summary: "What bypass surgery is, the usual tests, typical time in hospital and in India, recovery and flying home."
updated: "2026-10-21"
review_status: "draft"
review_required: "medical,legal"
specialty: "cardiology"
catalog_slug: "cabg"
---
```

| Key | Required | Meaning |
|---|---|---|
| `slug` | yes | Equals the file name. Unique within a category. |
| `title` | yes | Page title. The body's first line repeats it as an H1. |
| `category` | yes | One of `faq`, `guide`, `policy`, `city`, `procedure`. |
| `locale` | yes | Always `en` (must match the top-level folder `en/`). |
| `dir` | yes | Always `ltr`. |
| `summary` | yes | 1–2 plain-text sentences (no Markdown), about 200 characters at most. Used on cards and in search results. |
| `updated` | yes | `YYYY-MM-DD` of the last content change. |
| `review_status` | yes | `draft` → `in_review` → `approved`. Only `approved` pages may be shown in production. |
| `review_required` | yes | Comma-separated reviews needed before approval: `medical`, `legal`, `fact_check`, `editorial`. |
| `reviewed_on` | after review | `YYYY-MM-DD` of the approval. Reviewer names go in the pull request, not in the file. |
| `reviewedBy` | after medical review | Id of the medical reviewer in `site/reviewers.json` (section 9). The website credits them on the page. |
| `reviewedAt` | with `reviewedBy` | `YYYY-MM-DD` of the medical review ("Last reviewed" on the page; `reviewed_on` is used if missing). |
| `sources` | optional | References shown under the page: `[{"title": "...", "url": "https://..."}]` (https only, one line). |
| `specialty` | procedures | Catalog specialty slug (`cardiology`, `orthopedics`, `spine`, `fertility`, `transplant`, `bariatric`, `ophthalmology`, `dental`, `cosmetic`, `oncology`, `urology`). |
| `catalog_slug` | procedures | The matching `procedures.slug` in the catalog. This usually equals `slug`. The exceptions are `ivf` → `ivf-cycle` and `chemotherapy` → `chemotherapy-cycle`. Use it to link "Read the guide" from procedure and hospital screens. |
| `catalog_cities` | cities | Comma-separated `hospitals.city` values covered by the guide (for example `"New Delhi,Gurugram,Noida,Faridabad,Ghaziabad"`). Use it to link a hospital to its city guide. |

## 3. Markdown subset

Write CommonMark plus GitHub-style pipe tables and task lists, and use **nothing else**. This keeps a small renderer
enough on both platforms.

* `#` H1 appears once, as the first body line, and equals `title`. Apps that show the title in an app bar may drop it.
  Sections use `##`, sub-sections `###`, and nothing deeper.
* Paragraphs, `**bold**`, `*italic*`, bullet lists (`-`), numbered lists (`1.`), one level of nesting at most.
* Task lists (`- [ ] item`) appear only in checklists such as the pre-arrival guide. Render them as non-interactive
  check boxes, or let the app turn them into a local checklist.
* Pipe tables have at most 4 columns so they still read on a 360 px screen. Mobile renderers may scroll them
  horizontally.
* Call-outs are block quotes that start with a bold label. Apps should style them as cards:
  * `> **Emergency:**` for urgent-care instructions (danger colour)
  * `> **Important:**` for key warnings (warning colour)
  * `> **Check before you travel:**` for facts that can change, such as rules, fees, terminals, transport lines,
    timings and phone numbers. These are the items fact-checkers re-verify (info colour).
  * `> **Tip:**` for practical advice (neutral)
  * `> **Medical disclaimer:**` for the standard disclaimer at the end of medical pages (neutral)
  * Style call-outs by the block quote itself, not by the label text.
* Links:
  * Internal links are **relative paths to `.md` files**, for example `[payments and refunds](payments-and-refunds.md)`
    or `[pre-arrival guide](../pre-arrival-guide.md)`. Apps resolve the path against the current file, look it up in
    `index.json` by `path` and navigate in-app. They read fine on GitHub too.
  * External links are `https://` links to official sources only (for example the Government of India e-Visa site).
    Open them in the system browser.
* Not allowed: raw HTML, images, emoji, footnotes, code blocks, horizontal rules, headings deeper than `###`.
* Phone numbers in body text are limited to public emergency numbers (112, 108). Platform helpline numbers are
  **not** hard-coded. They come from the live `helplines` setting (`GET /api/v1/content/helplines`) and appear in
  the app's Support screen.

## 4. index.json

`index.json` is an array with one object per page. These are the only keys:

```json
[{ "slug": "faq", "title": "Frequently asked questions", "category": "faq", "locale": "en",
   "path": "en/faq.md", "summary": "..." }]
```

* `path` is relative to `content/` and always uses forward slashes.
* Order: category (`faq`, `guide`, `policy`, `city`, `procedure`), then slug.
* **Do not edit it by hand.** Regenerate it from the front matter:

```
node content/tools/build-index.mjs           # validate all pages and rewrite content/index.json
node content/tools/build-index.mjs --check   # validate only; exit code 1 if index.json is stale or a page is invalid
```

The tool checks for required keys, allowed values, slug equal to file name, `locale: "en"` and the `en/` folder,
no forbidden Markdown (HTML tags, images, deep headings), and broken relative links. Run `--check` in CI.

## 5. How apps consume it

The content is static and versioned with the app. Pages are not fetched from the API.

### 5.1 Web (React + Vite): static import

`content/` sits outside `web/`, so add an alias and allow the Vite dev server to read it (app `vite.config.ts`,
owned by web-foundation):

```ts
// vite.config.ts (excerpt)
import path from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
const contentDir = path.resolve(__dirname, '../../../content');
export default defineConfig({
  resolve: { alias: { '@content': contentDir } },
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), contentDir] } },
});
```

```ts
// e.g. web/packages/shared/src/lib/content.ts
import index from '@content/index.json';            // needs "resolveJsonModule": true
export type ContentEntry = { slug: string; title: string; category: 'faq'|'guide'|'policy'|'city'|'procedure';
                             locale: 'en'; path: string; summary: string };
const pages = import.meta.glob('@content/**/*.md', { query: '?raw', import: 'default' }); // lazy, code-split

export async function loadPage(path: string) {
  const loader = pages[`@content/${path}`] ?? pages[`/${path}`];   // key format depends on alias resolution; log Object.keys(pages) once
  const raw = (await loader()) as string;
  return parseFrontMatter(raw);
}

export function parseFrontMatter(raw: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of m ? m[1].split(/\r?\n/) : []) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = JSON.parse(line.slice(i + 1).trim());
  }
  return { meta, body: m ? raw.slice(m[0].length) : raw };
}
```

* If the alias form of the glob gives you trouble, use a plain relative glob from the loader file instead
  (`'../../../../../content/**/*.md'` from `web/packages/shared/src/lib/`).
* **Rendering:** no Markdown renderer is in the current dependency set. Either request one through
  `needed_dependencies` (for example `react-markdown` + `remark-gfm`, with raw HTML disabled), or write a small renderer
  for the subset in section 3. Never render content with `dangerouslySetInnerHTML` from a generic HTML converter.

### 5.2 Flutter: asset bundle

Flutter assets must live inside the package, so copy the folder into the app before building. Do not reference
`../content` from `pubspec.yaml`.

```
# PowerShell, from the repo root (e.g. in a pre-build script owned by flutter-foundation)
robocopy content mobile\assets\content /MIR /XD tools /XF README.md
```

```yaml
# mobile/pubspec.yaml: asset folders are NOT recursive, so list each one
flutter:
  assets:
    - assets/content/
    - assets/content/en/
    - assets/content/en/cities/
    - assets/content/en/procedures/
```

```dart
import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

Future<List<Map<String, dynamic>>> loadContentIndex() async =>
    (jsonDecode(await rootBundle.loadString('assets/content/index.json')) as List).cast<Map<String, dynamic>>();

Future<({Map<String, String> meta, String body})> loadContentPage(String path) async {
  final raw = await rootBundle.loadString('assets/content/$path');
  final m = RegExp(r'^---\r?\n([\s\S]*?)\r?\n---\r?\n?').firstMatch(raw);
  final meta = <String, String>{};
  for (final line in (m?.group(1) ?? '').split(RegExp(r'\r?\n'))) {
    final i = line.indexOf(':');
    if (i > 0) meta[line.substring(0, i).trim()] = jsonDecode(line.substring(i + 1).trim()) as String;
  }
  return (meta: meta, body: m == null ? raw : raw.substring(m.end));
}
```

* **Rendering:** no Markdown package is in `pubspec.yaml` today. Request one via `needed_dependencies` (check pub.dev
  for a maintained Markdown widget that supports tables and task lists), or render the subset in section 3 with
  plain widgets.
* Suggested entry points: Trips → "Pre-arrival guide" (`pre-arrival-guide`), Support → "In-country guide"
  (`in-country-guide`), city guide from the booked hospital's city (`catalog_cities`), procedure guide from a
  procedure or match card (`catalog_slug`), FAQ / payments / privacy from Profile → Help.

### 5.3 Values that must stay in sync with platform settings

Some pages describe defaults that are stored as platform settings (PLAN section 6.3). If an admin changes these
settings, update the pages, or better, have the app show the live value next to the text:

| Page | Setting | Default described |
|---|---|---|
| `payments-and-refunds`, `faq` | `refund_policy` | 14 days or more before admission: 100%; 7–13 days: 50%; less than 7 days: 0% |
| `payments-and-refunds`, `faq` | `deposit_pct` | deposit of 20% of the booking total |
| `payments-and-refunds`, `faq` | `patient_service_fee_bps` | any patient service fee is shown separately before payment (default 0) |
| `in-country-guide`, `faq` | `helplines` | numbers are **not** written in the text; show the live values |

## 6. Review workflow (before anything is published)

1. **Draft.** The author writes or edits the English page and sets `review_status: "draft"` and `updated`.
2. **Medical review** (`review_required` contains `medical`). A licensed clinician in the relevant specialty checks
   every clinical statement, test list, range, warning sign and fitness-to-fly comment. Ranges must stay ranges and
   say they vary by patient. There must be no success rates, no outcome promises and no prices.
3. **Legal and compliance review** (`legal`). This checks consistency with the Terms of Service, the Privacy Policy,
   the refund policy settings and the disclaimers. It must confirm there are no claims of certifications,
   accreditations, guarantees or regulatory status the company does not hold. Visa and immigration wording must
   stay high-level and point to official sources.
4. **Fact-check** (`fact_check`). Re-verify every `Check before you travel` item against an official or primary
   source: the e-Visa portal, airport operators, metro operators, state emergency services and similar. Record the
   source and date in the pull request.
5. **Approve.** Set `review_status: "approved"` and `reviewed_on`, run `node content/tools/build-index.mjs`, and merge.
   Production builds should show only approved pages, or hide the content entry points behind a feature flag until
   they are approved.
6. **Re-review cadence.** City guides and visa/travel facts: every 6 months, and whenever an official source changes.
   Procedure pages: every 12 months, or sooner if clinical guidance changes. Payments and privacy pages: whenever the
   Terms, Privacy Policy or related platform settings change.

## 7. Writing rules (for everyone who edits this folder)

* **Never invent** statistics, prices, fees, savings percentages, success rates, waiting times, processing times or
  legal requirements. If a fact can change, say so and point the reader to the official source.
* Use plain language: second person ("you"), short sentences, and medical terms explained the first time. Do not
  diagnose. Use "usually", "often" and "may" honestly, and end clinical advice with "your doctor will advise".
* Keep it non-promotional. Do not use "best", "world-class", "cheapest", "guaranteed", comparisons with other
  countries, or testimonials.
* Be honest about the platform's role. Heal India Global facilitates; the hospitals and doctors provide medical care
  and make medical decisions; the Government of India decides visas.
* Emergencies always come first. Severe or sudden symptoms mean local emergency care now, not travel.
* Use these terms consistently: *coordinator* (your Heal India Global contact), *international patient desk* (the
  hospital's team), *treating doctor*, *companion* (anyone travelling with you) and *attendant* (a companion on an
  e-Medical Attendant visa), *e-Medical visa*, *e-Medical Attendant visa*, *quote*, *booking*, *deposit*,
  *instalment*.

## 8. Marketing claims (site/marketing.json)

Headline numbers and claims used on the public website (for example "up to 70% less cost" or "500,000+ patients
treated") are **editable content**, not code. They live in `site/marketing.json` and are copied into the website at
build time (`website/scripts/prebuild.mjs`). Rules:

* Every claim has a `source`. While `source` is empty the website labels the figure "indicative" and
  `claims_verified` must stay `false`.
* Before launch, marketing and legal replace each value with a sourced figure (and fill in `source`), or set
  `show: false`. Never add certification or accreditation claims about the platform itself; accreditations
  (JCI, NABH) belong to individual hospitals and are shown from the catalogue.
* Testimonials are illustrative until real, consented patient stories exist; the website always labels them
  "Illustrative". Real testimonials need written patient consent and must not include health details beyond what the
  patient agreed to publish.
* Format: `india_wait` is a plain string and `testimonials` is a list of `{ quote, name, detail }` (English only).

## 9. Medical reviewers (site/reviewers.json)

Health pages (`review_required` contains `medical`) credit the clinician who reviewed them. Reviewers are data, not
code: `site/reviewers.json` is copied into the website at build time (`website/scripts/prebuild.mjs`).

```json
{"reviewers": [{"id": "short-stable-id", "name": "Full name as registered", "credentials": "Degrees, specialty",
  "registration": {"number": "Registration number", "council": "Issuing medical council"},
  "bio": "One or two sentences.", "photo": "/brand/reviewers/short-stable-id.jpg"}]}
```

* A page names its reviewer with `reviewedBy: "<id>"` and `reviewedAt: "YYYY-MM-DD"` (section 2). The website then
  shows "Medically reviewed by <name>, <credentials> · Last reviewed <date>", the registration, the bio and the
  page's `sources`, and adds `reviewedBy` / `lastReviewed` to the page's MedicalWebPage structured data.
* Entries with `"placeholder": true` (the shipped one) or without name, credentials, registration number and council
  are **never shown**. Never put an invented or example person here: add a real clinician only with their written
  consent and a registration number anyone can verify with the council. `photo` is optional (a same-origin path or
  an https URL).
* `tools/build-index.mjs` fails on an unknown `reviewedBy` id or a malformed `sources` list, and **warns** (does not
  fail) about approved health pages that have no real reviewer.

## 10. Website-only pages: procedure-city intros, cost guides, patient stories

Three folders feed extra pages on the public website only. `tools/build-index.mjs` validates them, but they are **not**
listed in `index.json` (the patient app and the Flutter app do not render them). Front matter, Markdown subset,
writing rules (section 7) and the review workflow (section 6) apply as for every other page.

| Folder | Category | Website page | Exists when (data gate) |
|---|---|---|---|
| `en/procedure-city/<procedure>-<city>.md` | `procedure_city` | `/treatments/<specialty>/<procedure>/<city>` | at least **2** listed hospitals in the destination publish a price (range or package) for the procedure, **and** the procedure has at least one home-country cost benchmark |
| `en/cost-guides/<procedure>-<country>.md` | `cost_guide` | `/costs/<procedure>/<country>` | the procedure has an India price range **and** a cost benchmark for that country (and an FX rate for its currency) |
| `en/stories/<slug>.md` | `story` | `/stories/<slug>` | the consent gate below passes |

`<city>` is a destination slug (the city-guide slug, for example `delhi-ncr`, which groups New Delhi, Gurugram and
Noida). `<country>` in the file name and URL is the English country name as a slug (`united-states`,
`united-kingdom`, `saudi-arabia`); in front matter it is the ISO code (`US`). The validator tells you the exact file
name if they do not match.

### 10.1 What makes a page indexable

A page is listed in `sitemap.xml` and indexed by search engines **only** when every gate passes. Otherwise it still
works for visitors but carries `noindex` and stays out of the sitemap (thin-page protection for health content):

1. The data gate in the table above (otherwise the URL is a 404 and nothing links to it).
2. The data came from the live API, not the offline fallback catalogue.
3. A hand-written intro exists with `review_status: "approved"`, `reviewed_on`, and a real reviewer credited with
   `reviewedBy` (an id from `site/reviewers.json`, never a placeholder entry) plus `reviewedAt` (section 9).
4. The intro is at least 80 words of unique text. Do not copy one intro to another city or country with the names
   swapped; write each one for its place.
5. Cost guides only: the benchmark has a `source` recorded in the catalogue.

Drafts are shown with a "Draft" banner (unless `CONTENT_INCLUDE_DRAFTS=false`) and are never indexed. Pages built
without an intro show live data only (hospitals, prices, specialists, stay, travel notes) and are never indexed.

### 10.2 Adding a procedure-city intro

```
---
slug: "total-knee-replacement-delhi-ncr"
title: "Total knee replacement in Delhi NCR"
category: "procedure_city"
locale: "en"
dir: "ltr"
summary: "One or two plain sentences, used as the meta description."
updated: "2026-10-22"
review_status: "draft"
review_required: "medical,fact_check,editorial"
procedure: "total-knee-replacement"
city: "delhi-ncr"
---
```

* `procedure` is the catalogue procedure slug and `city` the destination slug; `slug` must be `<procedure>-<city>`.
* Write about what is specific to having this procedure in this place: where the partner hospitals are, how far
  apart, what recovery logistics look like there. Prices, hospital names, accreditations, stay lengths and airport
  notes are added by the page from live data and the city guide, so do not repeat or invent them.
* End with the `> **Medical disclaimer:**` call-out.

### 10.3 Adding a cost-guide intro

Same front matter with `category: "cost_guide"` and `country: "US"` instead of `city`; the file is
`<procedure>-<country-name-slug>.md` (for example `total-knee-replacement-united-states.md`). The page itself shows
the indicative India range, the home-country benchmark and its source, the FX source and date, and an estimated
itemised split. The intro explains how to read those figures (what a package usually includes, what is not in the
table) and must not add numbers, savings claims or statements about insurance rules in the home country.
`review_required` should include `fact_check` and `legal`.

### 10.4 Adding a patient story

```
---
slug: "amina-knee-replacement"
title: "Walking again after a knee replacement"
category: "story"
locale: "en"
dir: "ltr"
summary: "One or two plain sentences."
updated: "2026-10-22"
draft: false
name: "Amina"
home_country: "KE"
procedure: "total-knee-replacement"
hospital: "sanjeevani-gurugram"
consent: {"obtained": true, "date": "2026-10-01", "scope": "website"}
reviewedBy: "Name of the staff member who checked the consent form and the text"
---
```

* **Consent gate (hard):** `consent` must be exactly `{"obtained": true, "date": "YYYY-MM-DD", "scope": "website"}`
  and backed by a signed consent form kept outside this repository. A story without it fails validation and is
  never built, not even as a draft. Do not commit a story before consent is signed.
* `name` is a **first name or initials only** ("Amina", "A. K."); full names are rejected. Include no health details
  beyond what the patient agreed to publish, and no photos.
* `consent` and `draft` are the only keys that are written as JSON values without quotes; everything else is a quoted
  string. `hospital` and `home_country` (ISO code) are optional; `procedure` is required and must be a catalogue slug.
* `draft: true` stories are shown **only** on a local development server (`next dev`) and are never built in
  production, whatever `CONTENT_INCLUDE_DRAFTS` says. `en/stories/example-placeholder-story.md` is such a draft: it
  is placeholder text about no real person; keep it as `draft: true` or delete it.
* Stories never carry star ratings or review markup, and they must not promise outcomes (section 7).

After any change run `node content/tools/build-index.mjs --check`, then `npm run sync` (or restart `npm run dev`) in
`website/` so the website picks up the new files.
