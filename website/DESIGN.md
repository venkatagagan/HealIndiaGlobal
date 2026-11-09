# Heal India Global website: design spec (DRAFT)

> Status: **draft for the concept round.** The user will pick one of three visual concepts (built in
> `design/concepts/`). This file records the reference analysis and the tokens currently live, and becomes the
> source of truth once a concept is chosen. Until then, the live site is frozen as it is now.

Reference screenshots (1440×900, captured 2026-10-22) are in `.devtools/design-refs/`.

- `cleveland-*`: home, menu (Services open), list, detail, footer
- `bumrungrad-*`, `apollo-*`, `medanta-*` (`medanta-menu.png` shows a dropdown): home, list, detail, footer
- `mayo-*`: Mayo Clinic blocks automated browsers (Akamai "Access Denied"), so those files are only error pages.
- Apollo and Medanta show a privacy/cookie overlay on first load.

## 1. What makes the references feel premium

| Aspect | What they do | Implication for us |
|---|---|---|
| **Header** | White, solid, no blur and no gradient. Cleveland has a 40px utility bar (locations, phone, MyChart) above a tall main bar (~150px) with 5 plain-text items and one strong CTA ("Appointments", solid blue, square-ish). Medanta and Bumrungrad put the logo row on top and centre the nav row below. | Solid white header with one filled CTA and 4–6 nav words. A utility bar is optional (phone, WhatsApp, "International patients"). |
| **Mega menu** (Cleveland Services) | A full-width white sheet with **3 text columns** (small UPPERCASE grey label, 9–10 underlined links each) and **one large photo** filling the right third. There are no icons, counts, badges or prices: just words and one image. Medanta's dropdown is a plain list with a thin line icon per row. | Fewer elements per panel: label + plain links, at most one visual (photo, or one featured card). No per-item badges or counts and no pastel tiles. |
| **Type** | Cleveland uses a large, light-to-medium sans (H1 about 56–64px, weight 300–700 depending on the template), body 18–20px with generous 1.7 leading, and lines of about 70ch. Labels are 13px uppercase with tracking. | H1 48–56px, body 17–18px / 1.7, labels 13px uppercase +0.06em, measure ≤ 72ch. |
| **Colour ratio** | About 85% white or very light tint, 10% text colour, under 5% brand accent (links and one CTA). Cleveland detail pages use one pale-blue hero band (#EEF6FB-ish) and then white. Bumrungrad's champagne/bronze appears only in the logo and one tile. | White/cloud canvas, navy text, teal only for links and the one CTA per view, champagne only as a hairline or accent. |
| **Links** | Underlined, brand-coloured, no arrows (Cleveland). They read as calm and trustworthy rather than "salesy". | Text links in teal with underline-on-hover (or always-underlined in body copy). No arrows inside lists. |
| **Imagery** | Real people (clinicians, patients) in large crops: a video hero (Cleveland), a doctor portrait (Medanta), a doctor photo in the menu. | The biggest gap on our site. Concepts should include a photo strategy (licensed or commissioned) or a refined illustration system. |
| **Cards** | Few. Lists are mostly link grids (Cleveland Institutes: 3 columns of links). Where cards exist (Medanta services) they are a flat light grey with an icon, no shadow and a soft radius. | Use cards only where a card carries real data (hospital, doctor, procedure). Hub pages lean on link grids. |
| **Borders/shadows** | Hairline separators (1px light grey). Shadows are almost absent except on floating elements (chat button, dropdown). | Prefer 1px #E2E8F0 borders and keep shadows for floating layers (menus, dialogs, FABs). |
| **Density** | Large vertical whitespace: Cleveland sections are 80–120px apart and the hero is about 600px. Each section has one idea. | 64–96px section spacing on desktop, one message per band. |
| **Trust signals** | "Medically Reviewed" with a green tick and a date (Cleveland detail), the Newsweek badge (Medanta), the emergency number in the header (Medanta 1068, Apollo 1066). | Keep the medical-review byline and accreditation proof, and put the helpline in the header or utility bar. |
| **Weak spots to avoid** | Bumrungrad: pastel promo carousel, four loud coloured tiles, cramped two-row nav. Apollo: dark video and an overlay before any content. Medanta: a horizontal scroll strip that cuts cards off. | No carousels, no multi-colour tile rows, nothing blocking content on first view. |

## 2. Tokens currently live (`src/app/globals.css`)

| Token | Value | Use | Contrast |
|---|---|---|---|
| navy (`slate-900`, `--color-navy`) | `#102A43` | titles, nav text, stats band, footer | 14.6:1 on white |
| teal (`primary-600`, `--color-brand`) | `#0F766E` | primary buttons, links, icons | 5.5:1 white-on-teal |
| teal hover (`primary-700`) | `#0B5F59` | hover / pressed | 7.4:1 |
| cloud (`--color-cloud`, `surface`) | `#F5F8FA` | page canvas, alternate bands | n/a |
| white | `#FFFFFF` | cards, header, menus, forms | n/a |
| champagne (`--color-champagne`) | `#B08D57` | hairlines, small decorative accents **only** | 3.0:1 on white (decorative only); 4.9:1 on navy |
| body text (`slate-700`) | `#334155` | paragraphs | 10.4:1 on white |
| muted (`slate-600` = `slate-500`) | `#475569` | secondary text (lightest allowed) | 7.6:1 on white, 7.1:1 on cloud |
| border (`slate-200`) | `#E2E8F0` | hairlines, card borders | n/a |
| success (`health-700`) | `#15803D` | savings, success, accreditation ticks | 5.0:1 on white |
| warning | amber-50 / amber-950 | draft and notice banners (icon + words) | over 12:1 |
| emergency | `#7F1D1D` on `#FEF2F2`, red rule | emergency call-outs: "⚠ Emergency:" label + icon, never colour alone | 9.6:1 |

Fonts are self-hosted with `next/font/local`, `display: swap` and Latin subsets: **Manrope** (variable 200–800) for h1–h3 and
`.font-display`, **Inter** (variable) for everything else. The body has antialiased smoothing.

## 3. Proposed scales (to confirm with the chosen concept)

- **Type:**

  | Level | Size / leading | Weight / tracking |
  |---|---|---|
  | H1 | 52 / 1.1 desktop, 36 mobile | 700, −0.02em |
  | H2 | 32 / 1.2 | 600 |
  | H3 | 20 / 1.35 | 600 |
  | Body | 17 / 1.7 | — |
  | Small | 15 / 1.6 | — |
  | Label | 13 / 1.4 | 600, uppercase, +0.06em |
  | Buttons | 15–16 | 600, no negative tracking |

- **Spacing:** 8px base (4, 8, 12, 16, 24, 32, 48, 64, 96). Sections are 64px apart on desktop and 48px on mobile; the container is 1280px with 32px gutters.
- **Radii:** 6px (inputs, menu items), 8px (buttons), 12px (cards, menus), 16px (feature blocks). No larger radii.
- **Shadows:** `sm` 0 1px 2px rgb(16 42 67 / .06) for cards at rest; `md` 0 10px 28px −14px rgb(16 42 67 / .20) for cards on hover; `lg` 0 24px 48px −12px rgb(16 42 67 / .18) for menus, dialogs and FABs.
- **Icons:** lucide line icons, 1.75 stroke, 18px in lists and 20–24px in features, **one colour (teal)** per view. Specialty art from `design/specialties` is used as a mask with `currentColor`.

## 4. Component inventory (rules)

| Component | Rules |
|---|---|
| Header | Solid white, 64px, 1px border plus champagne hairline, navy 15px/600 items, one teal "Get started" button. Optional utility bar (helpline and WhatsApp). |
| Mega menu (per item) | White sheet with 1px border and shadow `lg`, no page scrim, ≤ 420px tall at 1440×900. One heading row (label, title, one summary line, one text action). 2–4 columns of single-line links (≤ 8 each) with an 18px teal icon. At most one feature (2 compact cards or one photo). No counts, badges or prices per item. |
| Buttons | Primary (teal fill, white text), secondary/outline (navy 1px ring), tertiary (teal text link). One primary per view. |
| Links | Teal; underline on hover in UI and always underlined in long-form copy. |
| Chips/badges | Outline only (1px border); semantic green only for accreditation or savings. |
| Cards | White, 1px border, radius 12, shadow `sm` and `md` on hover with a ≤ 2px lift (disabled under reduced motion). Specialty, hospital, doctor, procedure, guide and destination cards share one anatomy: eyebrow, title, 1–2 facts, action. |
| Page hero | Cloud band with a whisper teal glow and a champagne bottom hairline. Breadcrumb pill top-right (back-link on mobile). Title, intro and ≤ 3 fact chips. Compact (no empty band). |
| Section header | 13px label with a champagne rule, then H2, then an optional one-line lead. |
| Filter bar | One row at ≥ 1280px; selects capped at 15rem; 2-column grid on phones. |
| Tables | Hairline rows, 15px, numbers right-aligned, INR in Indian grouping (₹3,50,000 or "₹3.5 lakh"). |
| Forms | 44px inputs, 1px slate-300 border, teal focus ring, labels above. |
| FAQ accordion | Hairline-separated rows with a chevron; no boxed cards. |
| Breadcrumbs | Pill in heroes; slash or chevron separators in 13px slate-600. |
| Stats band | The **only** navy band on a page: white numbers (Manrope 600) with champagne asterisks. |
| CTA band | A white card with a champagne left rule, or the navy band. No gradients. |
| Footer | Navy `#102A43`, with a darker bottom bar that holds © year, legal links, "Developed by DV Soft" and the condensed disclaimer in the first column. |
| Floating contact | WhatsApp green and teal call buttons, bottom-right; collapsed to one button on phones; hidden on print and when no number is set. |
| Emergency banner | Red rule, ⚠ icon and the explicit words "Emergency — seek local care now". |
| Empty/error states | One line illustration, one sentence and one action. |

## 5. Current state of the live site (frozen pending the concept choice)

- The site uses the navy/teal/cloud/champagne tokens above, Manrope + Inter, a white header and per-item mega menus.
  The mega menus have no scrim, single-line labels, no counts, grouped treatments and two compact featured cards.
- The home hero is light (cloud with a fine grid and teal glow), the stats band is navy, and CTA blocks are flat white cards.
- Not yet aligned with this spec: section spacing (pages still use 48px rhythm), specialty tiles (tinted icon tiles
  on /treatments), the hospital-card header band, list pages' card density, and photography (none).
- The last Lighthouse run (desktop, before the final palette switch) scored 100/100/100 for Perf/A11y/BP on all page
  types and SEO 100 on indexable pages. **Re-run `npm run audit:seo` after the concept is applied.**
