/**
 * English strings for the docai + voice components (the product is English only). `useDocaiText()` /
 * `useVoiceText()` return `{ t }` where `t(key, vars?)` interpolates `{name}` placeholders.
 */
export type Vars = Record<string, string | number>;
export type Dictionary<K extends string> = Record<K, string>;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Creates a `useText()` hook over an English dictionary; `t` is stable. */
export function createTextHook<K extends string>(dictionary: Dictionary<K>) {
  const t = (key: K, vars?: Vars): string => interpolate(dictionary[key] ?? key, vars);
  const value = { t };
  return function useText() {
    return value;
  };
}

const en = {
  // capture
  captureTitle: 'Add your medical report',
  captureHint: 'Upload a PDF or take photos of each page of ONE report. Our AI reads it and you check the result.',
  dropHere: 'Drag & drop files here',
  or: 'or',
  chooseFiles: 'Choose files',
  takePhoto: 'Take photo',
  addPage: 'Add another page',
  accepted: 'PDF, JPG, PNG, WEBP or HEIC · up to {max} MB each · up to {pages} pages',
  kindLabel: 'Type of document',
  kind_medical_report: 'Medical report',
  kind_lab_result: 'Lab result',
  kind_imaging: 'Imaging report',
  kind_prescription: 'Prescription',
  pageN: 'Page {n}',
  moveUp: 'Move page up',
  moveDown: 'Move page down',
  removePage: 'Remove page',
  pagesSelected: '{n} page(s) selected',
  consentAi:
    'I agree that Heal India Global may use AI to read this report and extract the key information. The result is only a draft: I will check it and can correct anything before it is used.',
  readWithAi: 'Read my report with AI',
  uploadOnly: 'Upload without AI',
  uploadingN: 'Uploading page {n} of {total}…',
  preparing: 'Preparing images…',
  starting: 'Starting the analysis…',
  uploadedOk: 'Report uploaded',
  tooLarge: '{name} is larger than {max} MB',
  badType: '{name}: this file type is not supported',
  tooManyPages: 'A report can have at most {max} pages',
  dicomHint: "DICOM scan files can't be read here - please upload the radiologist's written report instead.",
  needConsent: 'Please tick the box to allow the AI to read your report, or upload without AI.',
  noPages: 'Add at least one page first.',
  multiPdfHint: 'Tip: if the report is a single PDF, upload just that file.',
  // review
  queuedTitle: 'Your report is in the queue',
  processingTitle: 'Reading your report…',
  processingHint: "This usually takes under a minute. You can leave this page - we'll let you know when it's ready.",
  failedTitle: "We couldn't read this report",
  failedHint: 'You can try again, or ask your coordinator for help.',
  retry: 'Try again',
  unsupportedTitle: "This file can't be read automatically",
  unsupportedHint: "Upload a PDF or a clear photo of the written report. For scans (DICOM), upload the radiologist's report.",
  reviewTitle: 'Check what the AI found',
  reviewHint:
    'This is a draft. Correct anything that is wrong or missing, then tap Confirm. Only confirmed information is shared with doctors and used for your screening.',
  disclaimer: 'AI-generated - always confirm with your doctor.',
  docType: 'Document type',
  reportDate: 'Report date',
  facility: 'Hospital / laboratory',
  summaryPatient: 'Summary in plain language',
  summaryClinical: 'Clinical summary',
  findings: 'Key findings',
  finding: 'Finding',
  significance: 'Significance',
  sig_normal: 'Normal',
  sig_attention: 'Needs attention',
  sig_urgent: 'Urgent',
  labValues: 'Lab values',
  test: 'Test',
  value: 'Value',
  unit: 'Unit',
  range: 'Reference range',
  flag: 'Flag',
  flag_low: 'Low',
  flag_high: 'High',
  flag_normal: 'Normal',
  flag_critical: 'Critical',
  flag_unknown: 'Unknown',
  medications: 'Medications',
  medName: 'Medicine',
  dose: 'Dose',
  frequency: 'How often',
  diagnoses: 'Diagnoses mentioned',
  procedures: 'Procedures mentioned',
  recommendations: 'Recommendations',
  add: 'Add',
  remove: 'Remove',
  redFlagsTitle: 'Important warning signs in this report',
  criticalTitle: 'Some results are marked critical',
  criticalHint: 'Please contact a doctor promptly about these results.',
  emergencyHint: 'If you feel unwell now, seek local emergency care immediately.',
  qualityIssues: 'Some parts were hard to read:',
  confirm: 'Confirm',
  discard: 'Discard',
  saveDraft: 'Save draft',
  draftSaved: 'Draft saved',
  confirmedToast: 'Thank you - your report details are confirmed.',
  discardedToast: 'The AI reading was discarded. Your file is kept.',
  discardQuestion: 'Discard this AI reading? Your uploaded file is kept.',
  confirmed: 'Confirmed',
  rejected: 'Discarded',
  pendingReview: 'Waiting for review',
  editedByPatient: 'Edited by patient',
  confirmedOn: 'Confirmed on {date}',
  awaitingConfirmation: 'The patient has not reviewed and confirmed this report yet.',
  nothingFound: 'Nothing listed',
  confidence: 'AI confidence',
  pagesAnalyzed: '{n} page(s) read',
  aiDraft: 'AI draft',
  select: 'Select…',
  noAnalyses: 'No AI report readings yet.',
  analysisFor: 'AI reading',
  readWithAiShort: 'Read with AI',
  close: 'Close',
  cancel: 'Cancel',
  doc_lab_report: 'Lab report',
  doc_imaging_report: 'Imaging report',
  doc_discharge_summary: 'Discharge summary',
  doc_prescription: 'Prescription',
  doc_consultation_note: 'Consultation note',
  doc_pathology_report: 'Pathology report',
  doc_insurance_document: 'Insurance document',
  doc_other: 'Other',
  loadError: "Couldn't load this report reading.",
} as const;

export type DocaiTextKey = keyof typeof en;

export const useDocaiText = createTextHook<DocaiTextKey>(en);
