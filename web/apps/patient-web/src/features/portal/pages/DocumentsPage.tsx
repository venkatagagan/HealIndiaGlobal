import { useMemo, useState } from 'react';
import { FileText, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { ReportAiPanel } from '@hig/shared/docai';
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUSES, PATIENT_DOCUMENT_KINDS, type DocumentKind, type DocumentOut } from '@hig/shared/api';
import { filterParam, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { DataTable, DateRangeFilter, ExportButton, FilterBar, MultiSelectFilter, statusTone } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { useCases, useDocuments } from '../api/queries';
import { UploadButton } from '../components/common';
import {
  AI_READING,
  AI_READING_TONES,
  aiReadingLabel,
  documentColumns,
  documentTypeLabel,
  useAiReadings,
  useDocumentActions,
} from '../components/DocumentsTable';
import { TableTabs, countBy, inDateRange, patientStatusLabel } from '../components/listing';
import { Button, Card, Field, PageHeader, Select } from '../ui/primitives';

/** Tabs group the document types the way patients think about them (label: `documents.groups.<value>`). */
const GROUPS = [
  { value: 'medical', kinds: ['medical_report', 'lab_result', 'imaging', 'prescription'] },
  { value: 'travel', kinds: ['passport', 'visa', 'invitation_letter'] },
  { value: 'payments', kinds: ['receipt', 'invoice', 'payment_proof'] },
  { value: 'other', kinds: ['other'] },
] as const satisfies readonly { value: string; kinds: readonly DocumentKind[] }[];
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
  const { t } = useAppTranslation();
  useDocumentTitle(t('documents.title'));
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
    // headers are read from i18n at build time; `renderActions` is new on every render, so this follows the language
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
        title={t('documents.title')}
        description={t('documents.description')}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink" aria-hidden>
              <Upload className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('documents.upload.title')}</h2>
              <p className="text-sm text-muted">{t('documents.upload.hint')}</p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-end gap-3">
            <Field label={t('documents.upload.type')} htmlFor="upload-kind" className="min-w-[12rem] flex-1">
              <Select id="upload-kind" value={uploadKind} onChange={(e) => setUploadKind(e.target.value as DocumentKind)}>
                {PATIENT_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <UploadButton kind={uploadKind} label={t('documents.upload.button')} variant="primary" multiple />
          </div>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t('documents.ai.title')}</h2>
              <p className="text-sm text-muted">{t('documents.ai.description')}</p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3">
            <Button variant={showAi ? 'outline' : 'accent'} onClick={() => setShowAi((v) => !v)} aria-expanded={showAi}>
              {showAi ? t('documents.ai.hide') : t('documents.ai.start')}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-4 text-success" aria-hidden /> {t('documents.ai.notShared')}
            </span>
          </div>
        </Card>
      </div>

      {showAi ? (
        <Card className="mb-6 p-5">
          <ReportAiPanel defaultKind="medical_report" audience="patient" existing="pending" />
        </Card>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">{t('documents.files.title')}</h2>
      <DataTable
        id="patient.documents"
        caption={t('documents.files.title')}
        table={table}
        columns={columns}
        rows={docs.data ? rows : undefined}
        loading={docs.isLoading}
        fetching={docs.isFetching && !docs.isLoading}
        error={docs.error}
        onRetry={() => void docs.refetch()}
        emptyIcon={<FileText className="size-8" aria-hidden />}
        emptyTitle={t('documents.files.emptyTitle')}
        emptyDescription={t('documents.files.emptyDescription')}
        header={
          <TableTabs
            label={t('documents.groups.label')}
            items={[
              { value: '', label: t('documents.groups.all'), count: base.length },
              ...GROUPS.map((g) => ({ value: g.value, label: t(`documents.groups.${g.value}`), count: groupCount(g.value) })),
            ]}
            value={filters.group}
            onChange={(g) => setFilter('group', g)}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('documents.filters.search') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-documents" columns={columns} rows={rows} />}
            more={
              <MultiSelectFilter
                label={t('documents.filters.checked')}
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
              label={t('documents.filters.type')}
              value={filters.kind}
              onChange={(v) => setFilter('kind', v)}
              options={FILTER_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k], count: kindCounts[k] ?? 0 }))}
            />
            <MultiSelectFilter
              label={t('documents.filters.aiReading')}
              icon={<Sparkles className="size-3.5 opacity-70" aria-hidden />}
              value={filters.ai}
              onChange={(v) => setFilter('ai', v)}
              options={AI_READING.map((r) => ({ value: r, label: aiReadingLabel(r), tone: AI_READING_TONES[r], count: aiCounts[r] ?? 0 }))}
            />
            <DateRangeFilter label={t('documents.filters.uploaded')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      {actions.dialog}
    </div>
  );
}
