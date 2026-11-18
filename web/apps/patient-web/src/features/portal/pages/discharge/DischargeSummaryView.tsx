/**
 * Read-only discharge summary sections, used by the patient's detail page and the public home-doctor page
 * (/share/:token). Warning signs (red flags) and the medicines table are shown prominently. Medical text comes
 * from the hospital and is shown as written (never translated).
 */
import type { ReactNode } from 'react';
import { AlertTriangle, Download, FileText, Pill } from 'lucide-react';
import type { DischargeAttachment, DischargeSummaryOut } from '@hig/shared/api';
import { TBody, THead, Table, Td, Th, Tr } from '@hig/shared/ui';
import { useAppTranslation } from '../../../../i18n';
import { formatBytes } from '../../components/common';
import { cn, formatDate } from '../../lib/shared';
import { Button, Card, CardBody, CardHeader } from '../../ui/primitives';

function TextBlock({ text }: { text: string | null | undefined }) {
  const { t } = useAppTranslation();
  return text?.trim() ? (
    <p className="text-sm whitespace-pre-line break-words text-fg">{text}</p>
  ) : (
    <p className="text-sm text-muted">{t('discharge.sections.notRecorded')}</p>
  );
}

function Section({ title, icon, children, className }: { title: ReactNode; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('break-inside-avoid print:shadow-none', className)}>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {icon}
            {title}
          </span>
        }
      />
      <CardBody className="pt-3">{children}</CardBody>
    </Card>
  );
}

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

/** Warning signs: shown first and in red so they cannot be missed. */
export function RedFlagsBox({ text }: { text: string | null | undefined }) {
  const { t } = useAppTranslation();
  if (!text?.trim()) return null;
  return (
    <section
      role="note"
      aria-labelledby="discharge-red-flags"
      className="break-inside-avoid rounded-2xl border-2 border-danger/50 bg-danger-soft p-5 text-danger-ink"
    >
      <h2 id="discharge-red-flags" className="flex items-center gap-2 text-base font-bold">
        <AlertTriangle className="size-5 shrink-0" aria-hidden />
        {t('discharge.sections.redFlags')}
      </h2>
      <p className="mt-1 text-sm font-medium">{t('discharge.sections.redFlagsHint')}</p>
      <p className="mt-3 text-sm whitespace-pre-line break-words text-fg">{text}</p>
    </section>
  );
}

export function MedicationsTable({ summary }: { summary: DischargeSummaryOut }) {
  const { t } = useAppTranslation();
  if (!summary.medications.length) return <p className="text-sm text-muted">{t('discharge.sections.medicationsEmpty')}</p>;
  return (
    <Table caption={t('discharge.sections.medications')} containerClassName="-mx-5 sm:mx-0">
      <THead>
        <Tr>
          <Th>{t('discharge.medication.name')}</Th>
          <Th>{t('discharge.medication.dose')}</Th>
          <Th>{t('discharge.medication.frequency')}</Th>
          <Th>{t('discharge.medication.duration')}</Th>
          <Th>{t('discharge.medication.route')}</Th>
          <Th>{t('discharge.medication.instructions')}</Th>
        </Tr>
      </THead>
      <TBody>
        {summary.medications.map((m, i) => (
          <Tr key={`${m.name}-${i}`}>
            <Td className="font-semibold">{m.name}</Td>
            <Td>{m.dose || '—'}</Td>
            <Td>{m.frequency || '—'}</Td>
            <Td className="whitespace-nowrap">
              {m.duration_days ? t('discharge.medication.days', { count: m.duration_days }) : t('discharge.medication.ongoing')}
            </Td>
            <Td>{m.route || '—'}</Td>
            <Td className="min-w-48 whitespace-pre-line">{m.instructions || '—'}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export function AttachmentList({
  attachments,
  onDownload,
  busyId,
}: {
  attachments: DischargeAttachment[];
  onDownload: (doc: DischargeAttachment) => void;
  busyId?: string | null;
}) {
  const { t } = useAppTranslation();
  if (!attachments.length) return <p className="text-sm text-muted">{t('discharge.sections.attachmentsEmpty')}</p>;
  return (
    <ul className="divide-y divide-border">
      {attachments.map((doc) => (
        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 truncate font-medium text-fg" dir="auto">
              {doc.file_name}
            </span>
            <span className="shrink-0 text-xs text-muted">{formatBytes(doc.size_bytes)}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="print:hidden"
            icon={<Download className="size-4" aria-hidden />}
            loading={busyId === doc.id}
            onClick={() => onDownload(doc)}
            aria-label={t('discharge.sections.downloadDocument', { name: doc.file_name })}
          >
            {t('discharge.sections.download')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Every section of a summary (facts, warning signs, diagnosis, procedure, medicines, follow-up, ...). */
export function DischargeSummaryView({
  summary,
  attachments,
  onDownloadAttachment,
  busyAttachmentId,
  extraFacts,
}: {
  summary: DischargeSummaryOut;
  /** documents to list (defaults to the summary's attachments) */
  attachments?: DischargeAttachment[];
  onDownloadAttachment?: (doc: DischargeAttachment) => void;
  busyAttachmentId?: string | null;
  /** extra facts at the start of the overview (e.g. patient details on the public page) */
  extraFacts?: ReactNode;
}) {
  const { t } = useAppTranslation();
  const docs = attachments ?? summary.attachments;
  return (
    <div className="space-y-6">
      <Card className="break-inside-avoid print:shadow-none">
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {extraFacts}
            <Fact label={t('discharge.facts.hospital')}>{summary.hospital_name ?? '—'}</Fact>
            <Fact label={t('discharge.facts.doctor')}>
              {summary.doctor_name ?? '—'}
              {summary.doctor_registration ? (
                <span className="block text-xs text-muted">
                  {t('discharge.facts.registration', { number: summary.doctor_registration })}
                </span>
              ) : null}
            </Fact>
            <Fact label={t('discharge.facts.case')}>
              <span dir="ltr">{summary.case_number ?? '—'}</span>
            </Fact>
            <Fact label={t('discharge.facts.admitted')}>{formatDate(summary.admission_date)}</Fact>
            <Fact label={t('discharge.facts.discharged')}>{formatDate(summary.discharge_date)}</Fact>
            <Fact label={t('discharge.facts.version')}>
              {t('discharge.versionLabel', { version: summary.version })}
              {summary.finalized_at ? (
                <span className="block text-xs text-muted">{t('discharge.finalizedOn', { date: formatDate(summary.finalized_at) })}</span>
              ) : null}
            </Fact>
          </dl>
        </CardBody>
      </Card>

      <RedFlagsBox text={summary.red_flag_symptoms} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('discharge.sections.diagnosis')}>
          <TextBlock text={summary.diagnosis} />
          {summary.diagnosis_code ? (
            <p className="mt-2 text-xs text-muted">
              {t('discharge.sections.code', { code: summary.diagnosis_code })}
            </p>
          ) : null}
        </Section>
        <Section title={t('discharge.sections.procedure')}>
          <TextBlock text={summary.procedure_name} />
          <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
            {summary.procedure_code ? <span>{t('discharge.sections.code', { code: summary.procedure_code })}</span> : null}
            {summary.procedure_date ? <span>{t('discharge.sections.procedureDate', { date: formatDate(summary.procedure_date) })}</span> : null}
          </p>
        </Section>
      </div>

      <Section title={t('discharge.sections.medications')} icon={<Pill className="size-5 text-primary-ink" aria-hidden />}>
        <MedicationsTable summary={summary} />
      </Section>

      <Section title={t('discharge.sections.followUp')}>
        <TextBlock text={summary.follow_up_instructions} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('discharge.sections.allergies')}>
          <TextBlock text={summary.allergies} />
        </Section>
        <Section title={t('discharge.sections.investigations')}>
          <TextBlock text={summary.investigations_summary} />
        </Section>
      </div>

      <Section title={t('discharge.sections.hospitalCourse')}>
        <TextBlock text={summary.hospital_course} />
      </Section>

      {onDownloadAttachment ? (
        <Section title={t('discharge.sections.attachments')}>
          <AttachmentList attachments={docs} onDownload={onDownloadAttachment} busyId={busyAttachmentId} />
        </Section>
      ) : null}
    </div>
  );
}
