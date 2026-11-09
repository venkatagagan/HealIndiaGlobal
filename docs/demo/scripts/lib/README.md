# Demo recording library

Narrated walkthrough videos of the **real running product** (dev stack on `localhost`). Used by
`docs/demo/scripts/record-<role>.mjs`.

| File | What it does |
|---|---|
| `recorder.mjs` | `Demo` class: TTS, Playwright browser with `recordVideo` 1920x1080, title/outro cards, caption bar, fake cursor + click ripple, smooth scroll, typing, sidebar navigation, screenshots, off-camera cuts |
| `finalize.mjs` | WebM -> MP4 (H.264 yuv420p CRF 20, 30 fps, faststart) + narration track (AAC 128k, `loudnorm I=-16`), subtitles, narration log, coverage checklist, frame check. Re-run alone: `node docs/demo/scripts/lib/finalize.mjs docs/demo/.cache/raw/<base>/session.json` |
| `tools.mjs` | Paths, ffmpeg discovery (`.devtools/ffmpeg/*/bin`), `probeDuration`, `fmt`, `vtt` |

## Toolchain (no Laragon, everything under the repo)

- Node: `source scripts/env.sh` (Git Bash) or `. scripts/env.ps1` (PowerShell).
- Playwright is resolved from `web/node_modules`; browsers from `.devtools/ms-playwright` (set automatically).
- ffmpeg: static build unzipped in `.devtools/ffmpeg/<build>/bin/` (gyan.dev "release essentials").
- Voice: `edge-tts` in `.devtools/tts-venv` (create: `C:/NewProjects/python313/python.exe -m venv .devtools/tts-venv`
  then `.devtools/tts-venv/Scripts/python -m pip install edge-tts`). Voice **en-US-JennyNeural** (fallbacks
  en-US-AriaNeural, en-US-AvaNeural - US-English female only), rate +4 %. Only the narration text is sent to the
  service. If it is unreachable the offline Windows SAPI voice **Microsoft Zira** (US female) is used.
  Clips are cached in `docs/demo/.cache/tts/<sha1>.mp3`.

## API

```js
import { Demo, URLS } from './lib/recorder.mjs';

const N = { home: 'This is the public website ...', dash: 'The dashboard ...', bye: 'That is the tour.' }; // narration
const d = new Demo({ role: 'patient', label: 'Patient', lines: Object.values(N) }); // optional: part: 'part1'
await d.start();                                   // synthesises all lines in parallel, opens the browser (recording)
await d.intro('One-line subtitle', ['chip', 'chip']); // title card (logo + "Heal India Global — Patient walkthrough")
await d.say(N.intro);                              // narrate over the card

await d.scene({
  title: 'Website home',                           // row in coverage.md (screen checklist)
  go: URLS.website,                                // or nav: ['Care', 'My cases', `${URLS.patient}/cases`]
  narration: N.home,                               // caption + voice; the screen is held for its length + 0.7 s
  action: async () => { await d.scroll(600); },    // runs WHILE the line is spoken (failures are logged, not fatal)
  shot: 'website-home',                            // clean screenshot -> screenshots/NN-website-home.png
});

await d.outro(N.bye);                              // outro card, narrated
await d.finish();                                  // closes the browser and runs finalize()
```

`Demo` members you will use inside `action`s:

| Member | Notes |
|---|---|
| `d.page` | the Playwright `Page` (use role/label locators) |
| `d.say(text, action?)` | narrate a line (must be in `lines`, otherwise it is synthesised on the fly = a pause) |
| `d.scene({ title, narration, action, shot, go, nav, shotWhen })` | chapter + optional navigation + `say` + screenshot (`shotWhen: 'before'` takes it before the action) |
| `d.chapter(title)` | add a checklist row without narration |
| `d.goto(url)` | navigate + wait for network idle / skeletons, re-applies caption, flags "Something went wrong"/"Page not found" as warnings |
| `d.nav(group, item, url)` | sidebar: expands the accordion group (button `aria-expanded`), clicks the link; falls back to `url` |
| `d.click(locator)` / `d.tryClick(locator)` | moves the visible cursor there (smooth), click ripple; `tryClick` never throws |
| `d.hover(locator)`, `d.tryHover(locator)`, `d.moveTo(x, y)` | cursor only (`tryHover` never throws) |
| `d.type(locator, text, delayMs = 65)` | natural typing |
| `d.scroll(dy, { x, y })`, `d.scrollTop()` | smooth wheel scroll under the cursor (works for inner scroll containers) |
| `d.shot(name)` | screenshot with caption/cursor hidden (numbered automatically) |
| `d.signIn(email)` | types email + `HealIndia@2026` into the visible login form (public door :3000/login or staff door /gahi/login); a 429 is waited out **off camera** |
| `d.signOutStaff()` | clears cookies + localStorage (switch staff user) |
| `d.offCamera(fn)` | run `fn`; its duration is cut from the final video (data prep, slow loads) |
| `d.setCaption(text)`, `d.wait(ms)`, `d.settle()` | low level |
| `d.warn(msg)` | collected into `<base>.json` -> check after a run |

Realtime toasts are hidden by default (parallel test traffic shows noisy "E2E ..." toasts); pass `showToasts: true`
to keep them.

## Output layout (per role)

```
docs/demo/<role>/
  <role>-walkthrough.mp4        (or <role>-walkthrough-part1.mp4 / -part2.mp4)
  <role>-walkthrough.srt/.vtt   subtitles = narration
  <role>-walkthrough.json       duration, size, chapters, frame check, warnings
  narration.json                every spoken line with start/end (narration-part1.json for parts)
  coverage.md                   screen checklist: # | time | screen | screenshot (coverage-part1.md for parts)
  screenshots/NN-<name>.png     clean screenshots of every key screen
docs/demo/.cache/               raw WebM, narration wav, TTS cache, extracted frames (git-ignored)
```

Frame check: `finalize` extracts frames at 2/10/20 s and end-20/-10/-2 s to `docs/demo/.cache/frames/<base>/` and
flags suspiciously small (blank) ones in the warnings. Look at them before publishing.

## Rules for scripts

- Navigate by URL or role/label locators; the sidebar is an accordion - use `d.nav(group, item, url)`.
- Don't destroy demo data: open dialogs and **cancel**, stop before "Pay"/"Send"/"Approve" unless the step is
  harmless and idempotent.
- Avoid showing "E2E ..." test records in close-up (search/filter for clean seeded records).

## CHANGELOG

- 2026-10-22 v1 (READY): initial API (`Demo`, `scene`, `say`, `nav`, `offCamera`, `finalize`).
- 2026-10-22 v1.1: `nav()` matches link names that carry a badge ("Notifications 99+"); `shot()` taken inside an
  action is linked in coverage.md when the screen has no screenshot yet; new `tryHover(locator)` (never throws).
- 2026-10-22 v1.2: dead air is trimmed automatically - when a `say()` action runs more than 2 s past its narration
  (slow load / stalled locator under CPU load), the excess is cut from the video (opt out: `new Demo({ trimOverrun:
  false })`). `scrollIntoViewIfNeeded` inside `click/hover` now gives up after 2.5 s instead of 15 s.
- 2026-10-22 v1.2.1 (hospital agent): `__demoSetCaption` saves the caption state before checking that the bar is
  mounted - after `outro()`'s `setContent` the bar mounted late and restored the *previous* caption from
  sessionStorage, so the outro card showed the last screen's line instead of the outro narration.
