# `@hig/shared/docai` - document intelligence (PLAN 7.1)

Upload or photograph a medical report -> AI reading -> **mandatory review -> edit -> confirm**. Only confirmed data is
used for screening or shown to hospitals.

## Components
| Component | Props | Use |
|---|---|---|
| `DocumentCapture` | `patientId?` (agents/staff), `caseId?`, `defaultKind?`, `maxPages=10`, `maxUploadMb=10`, `allowUploadOnly=true`, `onUploaded(docs)`, `onAnalysisCreated(analysis, docs)` | Drag & drop / "Choose files" / "Take photo" (`capture="environment"`), multi-page with reorder/remove, downscale to <= 2400 px JPEG 0.85, consent, "Read my report with AI" (uploads pages then `POST /documents/analyses`). |
| `DocumentAnalysisReview` | `analysisId`, `audience='patient'|'clinical'`, `onConfirmed?`, `onRejected?` | Polls while queued/processing; failed -> retry; unsupported -> guidance; completed -> editable form with Save draft (PATCH) / Confirm / Discard; confirmed -> read-only card. |
| `DocumentAnalysisCard` | `analysis`, `audience='clinical'`, `bare?` | Read-only; shows `confirmed_data` only, with "Edited by patient" markers vs `ai_output`. |
| `ReportAiPanel` | `DocumentCapture` props + `audience`, `showExisting=true`, `existing='pending'|'all'`, `onConfirmed?` | Capture + the review of new / pending readings in one block. |
| `ConfirmedAnalysesList` | `patientId?`, `caseId?`, `audience='clinical'`, `emptyText?` | Hospital/agent/admin read-only list (confirmed only). |
| `DocumentAiStatus` | `document`, `audience`, `allowAnalyze=true` | Status pill per document row; opens review/card in a dialog; "Read with AI" for a single page. |

Hooks: `useDocumentAnalysis(id)` (2.5 s polling), `useDocumentAnalyses(params)`, `useAnalysisForDocument(docId)`,
`useUpdateAnalysis`, `useConfirmAnalysis`, `useRejectAnalysis`, `useRetryAnalysis`. API: `docaiApi`.
The review blocks render no `<form>` (safe inside host forms); dialogs are portals.

## Mounted in
- patient-web: screening step 3 (`StepDuration` - `ReportAiPanel` + `DocumentAiStatus`), Documents page, Case detail.
- agent-portal: patient detail -> Documents tab (`ReportAiPanel audience="clinical"`), screening form reports.
- hospital-portal: case detail -> `ConfirmedAnalysesList caseId audience="clinical"`.
