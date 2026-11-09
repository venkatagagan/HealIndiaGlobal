# Heal India Global — brand assets

*"Your Gateway to Indian Medical Excellence"*

Original, hand-authored SVG assets for the four React portals (`web/apps/*`) and the Flutter patient app
(`mobile/`). Every file is a plain, `viewBox`-based SVG with no raster images, no scripts, no external
references and no embedded fonts. Open **`design/preview.html`** in a browser to see everything on light and dark
backgrounds.

```
design/
├── logo/            lotus mark + lockups (colour, on-dark, mono)
├── icons/           app icon, Android adaptive layers, iOS icon, favicon, PWA maskable icon
├── illustrations/   onboarding, AI processing, empty states, success / error (320 × 240)
├── specialties/     16 specialty line icons + "more" (48 × 48, 2 px stroke, currentColor)
├── body-map/        body-front.svg, body-back.svg, body-regions.json (tappable regions)
├── tools/           validate_assets.py (checks), export_png.py (PNG export, no installs)
├── preview.html     visual catalogue
└── README.md
```

---

## 1. Asset catalogue

### Logo (`logo/`)

The mark is a five-petal **lotus** (India) whose centre petal carries a **medical plus**. The plus is a cut-out
(`fill-rule="evenodd"` hole), so it shows whatever is behind the logo. The two side petals meet in a heart-like
point. Colour versions use the mark gradient (§2).

| File | viewBox | Use on |
|---|---|---|
| `logo-mark.svg` | `0 0 128 128` | Any background: app headers, avatars, splash, loaders. Gradient fill. |
| `logo-mark-mono.svg` | `0 0 128 128` | `fill="currentColor"`: inline in React/Flutter and tint with CSS / `colorFilter`. |
| `logo-horizontal.svg` | `5 11 583 107` | Light backgrounds (`#FFFFFF`, `#F8FAFC`). Wordmark `#0B0F14`. |
| `logo-horizontal-on-dark.svg` | `5 11 583 107` | Dark backgrounds (`#0B0F14`, `#161B22`, `#1F2630`). Wordmark white. *(extra)* |
| `logo-stacked.svg` | `-99 11 326 186` | Light backgrounds. Mark, name and tagline: splash, auth, footer, documents. |
| `logo-stacked-on-dark.svg` | `-99 11 326 186` | Dark backgrounds. Tagline `#94A3B8`. *(extra)* |
| `logo-mono-white.svg` | `5 11 583 107` | Photos, the hero gradient (`#7B2FF7 → #2563EB → #06B6D4`), coloured buttons. |
| `logo-mono-dark.svg` | `5 11 583 107` | Single-colour print, fax/stamps, light tinted backgrounds. |

Wordmarks are live `<text>` with `font-family="Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"`,
weight 700. `textLength` locks the width, so the layout stays the same with any fallback font. For pixel-exact
renders (PNG export, print), install **Inter** (SIL OFL) on the exporting machine, or outline the text in a
vector editor.

### Icons (`icons/`)

| File | Size | Purpose |
|---|---|---|
| `app-icon.svg` | 1024² | Rounded-square tile (`rx 228`) with transparent corners: store listings, legacy Android launcher, PWA `any` icon, marketing. |
| `app-icon-ios.svg` | 1024² | Full-bleed, fully opaque square: iOS app icon / App Store. iOS applies its own mask and rejects alpha. *(extra)* |
| `app-icon-foreground.svg` | 1024² (= 108 dp) | Android adaptive **foreground**: white mark on transparent. The farthest point is r ≈ 275 of the r 313 (66 dp) safe circle. Also usable as the Android 13+ **monochrome** layer. |
| `app-icon-background.svg` | 1024² (= 108 dp) | Android adaptive **background**: full-bleed brand gradient. |
| `favicon.svg` | 64² | Browser tab. Simplified 3-petal mark with wider gaps and a bigger plus for 16–32 px. |
| `maskable-icon.svg` | 512² | PWA `"purpose": "maskable"`: full-bleed, mark within r ≈ 181 of the r 205 (80 %) safe circle. |

### Illustrations (`illustrations/`, all `viewBox="0 0 320 240"`, each < 11 KB)

| File | Screen |
|---|---|
| `onboarding-welcome.svg` | Onboarding 1 "Welcome Impact": a diverse team of four doctors in a clinic (flat style, not real people). |
| `onboarding-trust.svg` | Onboarding 2 "Trust & Excellence": modern hospital with an accreditation medal. |
| `onboarding-security.svg` | Onboarding 3 "Security & Process": shield + check, padlock, verified documents. |
| `ai-processing.svg` | `/screening/:id/processing`: neural-network brain, "matching" path. |
| `no-results.svg` | Empty search / no matches. |
| `no-messages.svg` | Empty inbox / conversation list. |
| `no-documents.svg` | Empty documents list (upload hint). |
| `success.svg` | Payment / booking / submission success. |
| `error.svg` | Error states (`ErrorState`, `ErrorView`). |

Each scene carries its own translucent backdrop, and light objects have a slate outline or shade. They stay
legible on `#0B0F14`, `#161B22`, `#F8FAFC`/white and on the hero gradient. They are decorative: use `alt=""` /
`excludeFromSemantics: true` and put the message in real text next to them.

### Specialty icons (`specialties/`)

`cardiology`, `orthopedics`, `cosmetic`, `dental`, `oncology`, `neurology`, `fertility`, `transplant`,
`bariatric`, `ophthalmology`, `spine`, `urology`, `gastroenterology`, `ent`, `nephrology`, `wellness`, plus
`more` ("More / other specialties" tile, and the fallback for unknown slugs).

All icons: `viewBox="0 0 48 48"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, round caps and
joins, 4-unit padding, no colour overrides, so they take the text colour. The file name equals the catalogue
`specialties.slug`; keep seed slugs identical (`/specialties/{slug}` → `specialties/{slug}.svg`, else `more.svg`).
Designed for 24–48 px. At 24 px the stroke renders 1 px; for heavier small icons scale `stroke-width` in CSS.

### Body map (`body-map/`)

`body-front.svg` and `body-back.svg` (`viewBox="0 0 200 480"`) contain one `<path id="<region>"
data-region="<region>">` per region, with a `<title>` label:

| View | Regions (document order) |
|---|---|
| front | `head`, `neck`, `chest`, `abdomen`, `pelvis`, `left_arm`, `right_arm`, `left_leg`, `right_leg` |
| back | `head`, `neck`, `back`, `pelvis`, `left_arm`, `right_arm`, `left_leg`, `right_leg` |

**Side convention: anatomical (patient's) sides.**
* **Front view:** the patient faces the viewer, so the **patient's left is on the viewer's right**. `left_arm`
  and `left_leg` have x > 100.
* **Back view:** the viewer sees the patient's back, so the **patient's left is on the viewer's left**.
  `left_arm` and `left_leg` have x < 100.

Regions **tile the silhouette exactly**: adjacent regions share boundary curves with identical numbers. The
validator measures 0.000 % overlap and 0.000 % gap. The arms hang in a slight A-pose, so arms and torso are
separate tap targets.

`body-regions.json` holds exactly the same path data as the SVGs:

```json
{
  "viewBox": "0 0 200 480",
  "convention": "Anatomical sides. FRONT view: ... BACK view: ...",
  "front": [{ "id": "head", "label": "Head", "d": "M 100 10 C ... Z" }, ...],
  "back":  [{ "id": "head", "label": "Head", "d": "..." }, ...],
  "outline": "M 100 10 C ... Z"
}
```

`outline` (extra) is the whole silhouette in one path, for a drop shadow or a single seamless outline stroke.
**Path syntax is deliberately minimal:** absolute `M`, `C` and `Z` only, every token separated by one space, at
most one decimal. A ten-line parser handles it (snippets in §5); `path_drawing`'s `parseSvgPathData` also works.

The default styling in the SVG files is a neutral silhouette (`#94A3B8` fill, `#F1F5F9` 1.5 px separators),
readable on dark and light. Apps restyle per region (selected = `#22C55E`, hover/pressed, …).

> **Suggested API values:** send the tapped region ids as `screenings.body_areas`
> (`["chest", "left_arm"]`). If a coarser vocabulary is needed, map `left_arm|right_arm → arms` and
> `left_leg|right_leg → legs`. Note that `web/apps/agent-portal/src/lib/constants.ts` has a different, finer
> `BODY_AREAS` list (eyes, knees, …). The backend rules engine should accept both or agree on one list.

---

## 2. Colour tokens

From `docs/PLAN.md` §10/§11, plus the mark gradient used by the logo and icons.

| Token | Value | Notes |
|---|---|---|
| `primary` | `#22C55E` | Green; primary actions |
| `primary-hover` | `#16A34A` | |
| `accent` | `#7C3AED` | Violet |
| `danger` | `#EF4444` | |
| `warning` | `#F59E0B` | |
| `surface-light` / `surface-white` | `#F8FAFC` / `#FFFFFF` | |
| `bg-dark` / `card-dark` / `raised-dark` | `#0B0F14` / `#161B22` / `#1F2630` | App is dark by default |
| `hero-gradient` | `#7B2FF7 → #2563EB → #06B6D4` | Onboarding / hero backgrounds |
| `mark-gradient` | `#22C55E 0 %` → `#10B981 30 %` → `#3B82F6 62 %` → `#7C3AED 100 %` | Logo only, bottom-left → top-right. The emerald/blue stops keep green → violet from going grey in the middle. |
| Illustration support | `#4ADE80` `#15803D` `#A78BFA` `#6D28D9` `#5B21B6` `#06B6D4` `#0EA5E9` `#2563EB` `#CBD5E1` `#E2E8F0` | Tailwind-compatible tints |

```css
:root {
  --hig-primary: #22C55E; --hig-primary-hover: #16A34A; --hig-accent: #7C3AED;
  --hig-danger: #EF4444;  --hig-warning: #F59E0B;
  --hig-bg-dark: #0B0F14; --hig-card-dark: #161B22; --hig-raised-dark: #1F2630; --hig-bg-light: #F8FAFC;
  --hig-hero-gradient: linear-gradient(135deg, #7B2FF7 0%, #2563EB 50%, #06B6D4 100%);
  --hig-mark-gradient: linear-gradient(45deg, #22C55E 0%, #10B981 30%, #3B82F6 62%, #7C3AED 100%);
}
```

```dart
// mobile/lib/core/theme/app_colors.dart (reference values)
static const primary = Color(0xFF22C55E), primaryHover = Color(0xFF16A34A), accent = Color(0xFF7C3AED);
static const danger = Color(0xFFEF4444), warning = Color(0xFFF59E0B);
static const bgDark = Color(0xFF0B0F14), cardDark = Color(0xFF161B22), raisedDark = Color(0xFF1F2630);
static const markGradient = LinearGradient(begin: Alignment.bottomLeft, end: Alignment.topRight,
    colors: [Color(0xFF22C55E), Color(0xFF10B981), Color(0xFF3B82F6), Color(0xFF7C3AED)], stops: [0, .3, .62, 1]);
```

Typography: **Inter** (700 wordmark/headings, 500 tagline, 400 body). Fallbacks: Segoe UI, Roboto, Helvetica
Neue, Arial, sans-serif.

---

## 3. Logo rules

* **Clear space:** keep at least **X** free on every side, where **X = ¼ of the lotus mark's height**
  (about the width of the plus). For a horizontal lockup 40 px tall, X ≈ 10 px.
* **Minimum sizes (digital):** horizontal lockup **140 px wide** (≈ 26 px tall); stacked lockup **200 px wide**
  (below that the tagline drops under 9 px, so use the horizontal lockup); mark **24 px**. For 16–23 px use
  `icons/favicon.svg` geometry.
* **Minimum sizes (print):** horizontal 35 mm, stacked 45 mm, mark 8 mm.
* **Backgrounds:** colour lockups on white/`#F8FAFC`; `*-on-dark` variants on `#0B0F14`/`#161B22`/`#1F2630`;
  `logo-mono-white` on photos, the hero gradient and coloured surfaces; `logo-mono-dark` for one-colour print.
* **Don't:** stretch or skew; rotate; recolour the gradient or swap its direction; add shadows, glows or
  outlines; put the colour mark on mid-tone or busy backgrounds; rearrange or resize the mark relative to the
  wordmark; set the wordmark in another typeface; fill the plus cut-out.

---

## 4. Where to copy the files (integrators)

Nothing outside `design/` references these files yet. Copy them; don't symlink, since Vite and Flutter need the
files inside their own trees. PNGs come from `tools/export_png.py` (§6).

| Asset | React portals (`web/`) | Flutter app (`mobile/`) |
|---|---|---|
| `icons/favicon.svg` (+ `favicon-32.png`) | `web/apps/<app>/public/favicon.svg` for all four apps (replaces the placeholder in `agent-portal/public/`) | Flutter web: `mobile/web/favicon.png` (PNG export) |
| `apple-touch-icon.png`, `icon-192/512.png`, `maskable-192/512.png` | `web/apps/<app>/public/` + manifest (below) | Flutter web: `mobile/web/icons/Icon-192.png`, `Icon-512.png`, `Icon-maskable-192.png`, `Icon-maskable-512.png` |
| `logo/*.svg` | `web/packages/shared/src/assets/brand/` (shared, owner web-foundation) or `web/apps/<app>/public/brand/` | `mobile/assets/brand/` |
| `illustrations/*.svg` | `web/packages/shared/src/assets/illustrations/` or `web/apps/patient-web/public/illustrations/` | `mobile/assets/illustrations/` |
| `specialties/*.svg` | `web/packages/shared/src/assets/specialties/` | `mobile/assets/specialties/` |
| `body-map/body-regions.json` | `web/packages/shared/src/assets/body-regions.json` | `mobile/assets/body_map/body-regions.json` |
| launcher PNGs (`launcher/*.png`) | — | `mobile/assets/brand/` → `flutter_launcher_icons` generates `android/…/mipmap-*` and `ios/…/AppIcon.appiconset` (don't hand-edit those). |

`index.html` (each portal):

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0B0F14">
```

`manifest.webmanifest` icons:

```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
],
"background_color": "#0B0F14", "theme_color": "#0B0F14"
```

`mobile/pubspec.yaml`:

```yaml
flutter:
  uses-material-design: true
  assets:
    - assets/brand/
    - assets/illustrations/
    - assets/specialties/
    - assets/body_map/
```

> **Flutter dependencies:** `pubspec.yaml` currently has **no** `flutter_svg`. Either add `flutter_svg`
> (to render logos, illustrations and specialty icons as vectors) or ship PNG exports at 2×/3×. The **body map
> needs no package**: it is drawn from `body-regions.json` with `dart:ui` `Path` (§5). Launcher icons need the
> dev dependency `flutter_launcher_icons` (§6).

---

## 5. Usage snippets

**React: specialty icon that inherits text colour** (Vite `?raw` import; our own static SVG, safe to inline):

```tsx
import cardiology from '@hig/shared/assets/specialties/cardiology.svg?raw';
<span aria-hidden className="inline-block size-7 text-green-500 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: cardiology }} />
// No-innerHTML alternative: CSS mask with background: currentColor
// .spec-icon { mask: url(/specialties/cardiology.svg) center / contain no-repeat; background: currentColor; }
```

**React: body map from JSON** (accessible toggle buttons, works with any theme):

```tsx
import regions from '@hig/shared/assets/body-regions.json';

export function BodyMap({ view, selected, onToggle }: {
  view: 'front' | 'back'; selected: string[]; onToggle: (id: string) => void;
}) {
  return (
    <svg viewBox={regions.viewBox} className="h-80 w-auto" role="group" aria-label={`Body map, ${view} view`}>
      {regions[view].map((r) => {
        const on = selected.includes(r.id);
        return (
          <path key={r.id} d={r.d} data-region={r.id} role="checkbox" aria-checked={on} aria-label={r.label}
            tabIndex={0} onClick={() => onToggle(r.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(r.id); } }}
            className={`cursor-pointer outline-none transition-colors focus-visible:stroke-violet-400 ${on ? 'fill-green-500' : 'fill-slate-400 hover:fill-slate-300'}`}
            stroke="#0B0F14" strokeWidth={1.5} strokeLinejoin="round" />
        );
      })}
    </svg>
  );
}
```

**Flutter: body map without extra packages:**

```dart
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/services.dart' show rootBundle;

/// Parses the body-map path syntax: absolute "M x y", "C x1 y1 x2 y2 x y", "L x y", "Z", space separated.
Path parseBodyPath(String d) {
  final t = d.split(' ');
  final p = Path();
  var i = 0;
  double n() => double.parse(t[i++]);
  while (i < t.length) {
    switch (t[i++]) {
      case 'M': p.moveTo(n(), n());
      case 'L': p.lineTo(n(), n());
      case 'C': p.cubicTo(n(), n(), n(), n(), n(), n());
      case 'Z': p.close();
    }
  }
  return p;
}

Future<Map<String, Path>> loadBodyRegions(String view) async { // view: 'front' | 'back'
  final json = jsonDecode(await rootBundle.loadString('assets/body_map/body-regions.json'));
  return {for (final r in json[view] as List) r['id'] as String: parseBodyPath(r['d'] as String)};
}

// In a CustomPainter: scale = math.min(size.width / 200, size.height / 480); canvas.scale(scale); drawPath(...)
// Hit test a tap: final local = tap / scale;  regions.entries.firstWhere((e) => e.value.contains(local))
```

**Flutter: SVGs** (after adding `flutter_svg`):

```dart
SvgPicture.asset('assets/specialties/cardiology.svg', width: 28, height: 28,
    colorFilter: const ColorFilter.mode(Color(0xFF22C55E), BlendMode.srcIn));
SvgPicture.asset('assets/illustrations/no-results.svg', height: 180, excludeFromSemantics: true);
```

---

## 6. Exporting PNGs (app icons, web icons, e-mail logos)

**Zero-install (Windows, macOS, Linux with Chrome or Edge):**

```powershell
C:\NewProjects\python313\python.exe design\tools\export_png.py                 # -> design\dist\png\
C:\NewProjects\python313\python.exe design\tools\export_png.py --out C:\tmp\hig-png
```

This writes `launcher/` (1024 px sources for `flutter_launcher_icons`), `web/` (favicon-32/48,
apple-touch-icon 180, icon-192/512, maskable-192/512), `flutter-web/` (names matching `mobile/web/`) and
`logo/` (600 px e-mail logos, 256 px mark). It uses headless Chrome/Edge with a throw-away profile and checks
every output size. `design/dist/` is generated output: don't hand-edit it.

**Inkscape 1.x / librsvg** (same sources, same sizes):

```bash
inkscape design/icons/app-icon-foreground.svg --export-type=png --export-filename=app-icon-foreground-1024.png -w 1024 -h 1024
rsvg-convert -w 1024 -h 1024 design/icons/app-icon-background.svg -o app-icon-background-1024.png
rsvg-convert -w 180 -h 180 design/icons/app-icon-ios.svg -o apple-touch-icon.png
```

**Launcher icons with `flutter_launcher_icons`** (dev dependency, not installed yet). Copy the four
`launcher/*.png` files to `mobile/assets/brand/`, add `mobile/flutter_launcher_icons.yaml`:

```yaml
flutter_launcher_icons:
  android: "ic_launcher"
  ios: true
  image_path: "assets/brand/app-icon-1024.png"              # legacy (pre-API 26) Android
  image_path_ios: "assets/brand/app-icon-ios-1024.png"      # opaque, full-bleed
  remove_alpha_ios: true
  adaptive_icon_background: "assets/brand/app-icon-background-1024.png"
  adaptive_icon_foreground: "assets/brand/app-icon-foreground-1024.png"
  adaptive_icon_monochrome: "assets/brand/app-icon-foreground-1024.png"   # Android 13 themed icons
  min_sdk_android: 21
```

Then run `cd mobile && dart run flutter_launcher_icons`. The foreground PNG already contains the 108 dp
padding: don't add more inset. For Flutter web, copy `flutter-web/*` over `mobile/web/`.

---

## 7. Validation

```powershell
C:\NewProjects\python313\python.exe design\tools\validate_assets.py
C:\NewProjects\python313\python.exe design\tools\validate_assets.py --sync-body-regions   # after editing a body-map SVG
```

The validator checks that:
* every SVG parses with `xml.etree` and has a `viewBox`;
* there are no `<image>`/`<script>`/`<foreignObject>`, external `href`s, `data:` URIs or `@font-face`;
* size budgets hold (illustrations < 30 KB);
* specialty icons honour the stroke contract;
* body-map ids and `data-region` attributes are correct, and the JSON equals the SVG paths;
* body-map paths use the minimal syntax and follow the side convention;
* a scanline rasteriser measures region overlap and gaps against the silhouette (fails above 0.1 %);
* the launcher marks sit inside the adaptive and maskable safe zones.

If you edit body-map paths in a vector editor, export with **absolute coordinates**. Keep shared edges
identical between neighbouring regions, then re-run with `--sync-body-regions`.

---

## 8. Provenance

All artwork was created from scratch for Heal India Global: the lotus-plus mark, icons, illustrations and body
silhouette. No third-party icon sets, stock art or traced images were used. The illustrations depict fictional
people. No external font files are bundled.
