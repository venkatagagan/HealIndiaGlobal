import { useMemo, useState } from 'react';
import { FileText, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { ReportAiPanel } from '@hig/shared/docai';
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUSES, PATIENT_DOCUMENT_KINDS, type DocumentKind, type DocumentOut } from '@hig/shared/api';
import { filterParam, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { DataTable, DateRangeFilter, ExportButton, FilterBar, MultiSelectFilter, statusTone } from '@hig/shared/ui';
import { useCases, useDocuments } from '../api/queries';
import { UploadButton } from '../components/common';
import {
  AI_READING,
  AI_READING_LABELS,
  AI_READING_TONES,
  documentColumns,
  documentTypeLabel,
  useAiReadings,
  useDocumentActions,
} from '../components/DocumentsTable';
import { TableTabs, countBy, inDateRange, patientStatusLabel } from '../components/listing';
import { Button, Card, Field, PageHeader, Select } from '../ui/primitives';

/** Tabs group the document types the way patients think about them. */
const GROUPS = [
  { value: 'medical', label: 'Medical', kinds: ['medical_report', 'lab_result', 'imaging', 'prescription'] },
  { value: 'travel', label: 'Passport & visa', kinds: ['passport', 'visa', 'invitation_letter'] },
  { value: 'payments', label: 'Payments', kinds: ['receipt', 'invoice', 'payment_proof'] },
  { value: 'other', label: 'Other', kinds: ['other'] },
] as const satisfies readonly { value: string; label: string; kinds: readonly DocumentKind[] }[];
const GROUP_VALUES = GROUPS.map((g) => g.value);
const FILTER_KINDS: DocumentKind[] = [...PATIENT_DOCUMENT_KINDS, 'invitation_letter', 'receipt', 'invoice'];

const FILTERS = {
  q: filterParam.text(),
  group: filterParam.oneOf(GROUP_VALUES),
  kind: filterParam.list(FILTER_KINDS),
  status: filterParam.list(DOCUMENT_STATUSES),
  ai: filterParam.list(AI_READING),
  from: filterParam.date(),
  to: filterParam.date(),
};

const groupKinds = (g: string): readonly string[] => GROUPS.find((x) => x.value === g)?.kinds ?? [];

export function DocumentsPage() {
  useDocumentTitle('Documents');
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', defaultPageSize: 10 });
  const { filters, setFilter, setFilters } = table;
  const [uploadKind, setUploadKind] = useState<DocumentKind>('medical_report');
  const [showAi, setShowAi] = useState(false);

  const docs = useDocuments();
  const cases = useCases({ page: 1, page_size: 100 });
  const caseNumbers = useMemo(() => new Map((cases.data?.items ?? []).map((c) => [c.id, c.case_number])), [cases.data]);
  const readings = useAiReadings(docs.data);
  const actions = useDocumentActions();
  const columns = useMemo(
    () => documentColumns({ renderActions: actions.renderActions, readings, caseNumbers }),
    [actions.renderActions, readings, caseNumbers],
  );

  const all = useMemo(() => docs.data ?? [], [docs.data]);
  // all filters except the type group (drives the tab counts)
  const base = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (d: DocumentOut) => [d.file_name, documentTypeLabel(d.kind), d.case_id ? caseNumbers.get(d.case_id) : null]))
        .filter((d) => !filters.kind.length || filters.kind.includes(d.kind))
        .filter((d) => !filters.status.length || filters.status.includes(d.status))
        .filter((d) => {
          if (!filters.ai.length) return true;
          const r = readings.get(d.id);
          return !!r && filters.ai.includes(r);
        })
        .filter((d) => inDateRange(d.created_at, filters.from, filters.to)),
    [all, filters.q, filters.kind, filters.status, filters.ai, filters.from, filters.to, caseNumbers, readings],
  );
  const rows = useMemo(() => (filters.group ? base.filter((d) => groupKinds(filters.group).includes(d.kind)) : base), [base, filters.group]);
  const kindCounts = useMemo(() => countBy(all, (d) => d.kind), [all]);
  const statusCounts = useMemo(() => countBy(all, (d) => d.status), [all]);
  const aiCounts = useMemo(() => countBy([...readings.values()].map((r) => ({ r })), (x) => x.r), [readings]);
  const groupCount = (g: string) => base.filter((d) => groupKinds(g).includes(d.kind)).length;

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Passport, visa, medical reports and receipts in one secure place. Only you, your care team and the hospitals handling your cases can open them."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink" aria-hidden>
              <Upload className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Upload documents</h2>
              <p className="text-sm text-muted">PDF, JPG, PNG, WEBP, HEIC or DICOM · up to 20 MB per file.</p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-end gap-3">
            <Field label="Document type" htmlFor="upload-kind" className="min-w-[12rem] flex-1">
              <Select id="upload-kind" value={uploadKind} onChange={(e) => setUploadKind(e.target.value as DocumentKind)}>
                {PATIENT_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <UploadButton kind={uploadKind} label="Upload files" variant="primary" multiple />
          </div>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Read a medical report with AI</h2>
              <p className="text-sm text-muted">
                Our AI extracts the key results; you check and confirm them. Only confirmed information is shared with hospitals.
              </p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3">
            <Button variant={showAi ? 'outline' : 'accent'} onClick={() => setShowAi((v) => !v)} aria-expanded={showAi}>
              {showAi ? 'Hide' : 'Start'}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-4 text-success" aria-hidden /> Nothing is shared until you confirm
            </span>
          </div>
        </Card>
      </div>

      {showAi ? (
        <Card className="mb-6 p-5">
          <ReportAiPanel defaultKind="medical_report" audience="patient" existing="pending" />
        </Card>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">Your files</h2>
      <DataTable
        id="patient.documents"
        caption="Your files"
        table={table}
        columns={columns}
        rows={docs.data ? rows : undefined}
        loading={docs.isLoading}
        fetching={docs.isFetching && !docs.isLoading}
        error={docs.error}
        onRetry={() => void docs.refetch()}
        emptyIcon={<FileText className="size-8" aria-hidden />}
        emptyTitle="No documents yet"
        emptyDescription="Upload your passport and recent medical reports - hospitals need them to prepare an accurate quote."
        header={
          <TableTabs
            label="Document group"
            items={[{ value: '', label: 'All', count: base.length }, ...GROUPS.map((g) => ({ value: g.value, label: g.label, count: groupCount(g.value) }))]}
            value={filters.group}
            onChange={(g) => setFilter('group', g)}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'File name, type or case…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-documents" columns={columns} rows={rows} />}
            more={
              <MultiSelectFilter
                label="Checked by team"
                value={filters.status}
                onChange={(v) => setFilter('status', v)}
                options={DOCUMENT_STATUSES.map((s) => ({
                  value: s,
                  label: patientStatusLabel(s, 'document') ?? s,
                  tone: statusTone(s, 'document'),
                  count: statusCounts[s] ?? 0,
                }))}
              />
            }
          >
            <MultiSelectFilter
              label="Type"
              value={filters.kind}
              onChange={(v) => setFilter('kind', v)}
              options={FILTER_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k], count: kindCounts[k] ?? 0 }))}
            />
            <MultiSelectFilter
              label="AI reading"
              icon={<Sparkles className="size-3.5 opacity-70" aria-hidden />}
              value={filters.ai}
              onChange={(v) => setFilter('ai', v)}
              options={AI_READING.map((r) => ({ value: r, label: AI_READING_LABELS[r], tone: AI_READING_TONES[r], count: aiCounts[r] ?? 0 }))}
            />
            <DateRangeFilter label="Uploaded" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      {actions.dialog}
    </div>
  );
}
