# documents_ai — report capture + AI reading (PLAN §7.1)

Review → edit → confirm is mandatory; only a `confirmed` analysis is used downstream.

- `/reports/capture?caseId=&screeningId=&kind=` → `ReportCaptureScreen` (camera / gallery via image_picker,
  PDF via file_picker, up to 10 pages, reorder/remove, kind, AI consent). Uploads pages (`POST /documents`),
  creates the analysis (`POST /documents/analyses`) and shows the review inline. Pops a `ReportCaptureResult`.
- `/reports/analysis/:id` → `ReportAnalysisScreen` (polling, failed/unsupported states, editable review,
  Confirm / Discard, confirmed view).
- `ReportAnalysisCard` — read-only card (confirmed data, "Edited" markers, critical/red-flag banners).
- `ReportAiEntryButton` — app-bar entry point (Trips → Documents): scan + list of readings.

Mounted in: screening step 3 (`TimelineStep._scan`) and Trips → Documents (`DocumentsScreen` app bar).
Tests override `documentAnalysisRepositoryProvider`, `documentRepositoryProvider`, `reportPageSourceProvider`.
