# Product walkthrough videos

Narrated (US-English female voice, subtitles burned in as captions and as `.srt`/`.vtt`) recordings of the **real
running product** with demo data, one per role, plus a numbered screenshot set of every key screen.

Open **[index.html](index.html)** for the gallery (video player, chapter list, screenshot grid per role).

Four videos, one per role:

| Role | Video | Length | Screen checklist | Screenshots |
|---|---|---|---|---|
| Patient (`patient.us@healindia.example`) | `patient/patient-walkthrough.mp4` | 7:03 | [coverage.md](patient/coverage.md) | `patient/screenshots/` |
| Agent (`agent.lagos@healindia.example`) | `agent/agent-walkthrough.mp4` | 10:25 | [coverage.md](agent/coverage.md) (part 2 starts at 5:44) | `agent/screenshots/` |
| Hospital (`owner.sanjeevani-gurugram@healindia.example`) | `hospital/hospital-walkthrough.mp4` | 5:43 | [coverage.md](hospital/coverage.md) | `hospital/screenshots/` |
| Admin staff - operations + finance (`superadmin@`, `finance1@`, `finance2@healindia.example`) | `staff/staff-walkthrough.mp4` | 15:33 | [coverage.md](staff/coverage.md) | `staff/screenshots/` (`1-` operations, `2-` finance) |

All demo passwords: `HealIndia@2026`. Each coverage file lists every screen shown with its timestamp (screen ->
time -> screenshot). The patient and agent videos were recorded in two takes and joined (stream copy, audio in sync);
the separate takes were deleted after joining.

Per role folder: `<role>-walkthrough.mp4`, `.srt`/`.vtt` subtitles, `narration.json` (every spoken line with start/end),
`coverage.md`, `<role>-walkthrough.json` (duration, size, chapters, frame check, warnings), `screenshots/NN-*.png`.

Videos are git-ignored (`docs/demo/**/*.mp4`, `*.webm`, `docs/demo/.cache/`) because they are large - re-record them.

## Re-recording

Prerequisites: the dev stack running on `localhost` (website :3000, patient :5173/app/, agent :5174/agent/,
hospital :5175/hospital/, admin :5176/gahi/, API :8000) with the seeded demo data, and the tools under `.devtools/`
(see [scripts/lib/README.md](scripts/lib/README.md): Playwright browsers, static ffmpeg, `edge-tts` venv).

```bash
source scripts/env.sh                         # repo Node toolchain (Git Bash); PowerShell: . scripts/env.ps1
node docs/demo/scripts/record-patient.mjs     # one continuous take (script rewritten for a single video)
node docs/demo/scripts/record-agent.mjs
node docs/demo/scripts/record-hospital.mjs
node docs/demo/scripts/record-staff-operations.mjs   # staff part 1 (operations, superadmin)
node docs/demo/scripts/record-staff-finance.mjs      # staff part 2 (finance1 / finance2)
node docs/demo/scripts/merge-staff.mjs               # joins them into staff/staff-walkthrough.mp4
node docs/demo/scripts/build-gallery.mjs      # refresh index.html
```

Each script synthesises its narration (cached in `docs/demo/.cache/tts`), drives Chromium at 1920x1080 with Playwright
`recordVideo`, then `scripts/lib/finalize.mjs` trims the blank start/end (and any off-camera waits such as login rate
limits), lays the narration clips at their recorded offsets, normalises loudness (`loudnorm I=-16`) and encodes
H.264 (yuv420p, CRF 20, faststart) + AAC 128k. Re-encode only (no re-recording):
`node docs/demo/scripts/lib/finalize.mjs docs/demo/.cache/raw/<role>-walkthrough/session.json`.

The patient script only reads data apart from sending one support message. Other role scripts (and their
`setup-*.mjs` helpers) may add a few realistic demo records - see the header comment of each script. Dialogs that
would change money or status (pay, accept, approve, refund) are opened to show them and then cancelled unless a
script says otherwise.

Note: the shared dev database also contains records created by the Playwright e2e suite ("E2E ..." names/notes);
some of them are visible in lists (e.g. the patient's case notes). Re-seed / clean the database before a
customer-facing render.
