import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, FileUp } from 'lucide-react';
import { crmApi, errorMessage, isApiError, type LeadImportResultOut } from '@hig/shared/api';
import { Button, FormField, Input, Modal } from '../../components/ui';
import { formatNumber } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { invalidateLeads } from './leadMeta';

const MAX_BYTES = 1024 * 1024;
const COLUMNS =
  'full_name, country, email, phone, whatsapp, preferred_language, source, source_detail, interest, budget, budget_currency, next_follow_up, tags, note';

/** CSV import: a dry run first (errors per row), then the real import. Nothing is created while any row has errors. */
export function ImportLeadsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<LeadImportResultOut | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);

  function close() {
    setFile(null);
    setCheck(null);
    setBusy(null);
    onClose();
  }

  function failure(error: unknown) {
    if (isApiError(error) && error.status === 429) toast.error(t('crm.import.rateLimited'));
    else toast.error(errorMessage(error, t('crm.import.failed')));
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t('crm.import.tooLarge'));
      return;
    }
    setBusy(dryRun ? 'check' : 'import');
    try {
      const result = await crmApi.importCsv(file, dryRun);
      if (dryRun) {
        setCheck(result);
      } else if (result.errors.length) {
        setCheck(result);
        toast.error(t('crm.import.hasErrors'));
      } else {
        invalidateLeads(qc);
        toast.success(t('crm.import.done', { count: result.created }));
        close();
        return;
      }
    } catch (error) {
      failure(error);
    }
    setBusy(null);
  }

  const ready = check && check.dry_run && check.errors.length === 0;
  const toCreate = check ? check.created : 0;

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={t('crm.import.title')}
      description={t('crm.import.description')}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy !== null}>
            {t('crm.form.cancel')}
          </Button>
          {ready ? (
            <Button onClick={() => void run(false)} loading={busy === 'import'} disabled={toCreate <= 0}>
              {t('crm.import.importButton', { count: toCreate })}
            </Button>
          ) : (
            <Button onClick={() => void run(true)} loading={busy === 'check'} disabled={!file}>
              {t('crm.import.checkButton')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-surface-2 p-3 text-muted">
          <p>{t('crm.import.formatHint')}</p>
          <p className="mt-1 font-mono text-xs break-words text-fg" dir="ltr">
            {COLUMNS}
          </p>
          <p className="mt-1">{t('crm.import.rulesHint')}</p>
        </div>
        <FormField label={t('crm.import.file')} htmlFor="lead-import-file" hint={file ? file.name : t('crm.import.fileHint')}>
          <Input
            id="lead-import-file"
            type="file"
            accept=".csv,text/csv"
            className="py-1.5"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setCheck(null);
            }}
          />
        </FormField>
        {check ? (
          <div className="space-y-3" aria-live="polite">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border p-2">
                <dt className="text-xs text-muted">{t('crm.import.rows')}</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatNumber(check.total_rows)}</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-xs text-muted">{t('crm.import.duplicates')}</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatNumber(check.skipped_duplicates)}</dd>
              </div>
              <div className="rounded-lg border border-border p-2">
                <dt className="text-xs text-muted">{t('crm.import.errors')}</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatNumber(check.errors.length)}</dd>
              </div>
            </dl>
            {check.errors.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-primary-soft p-3 text-primary-ink">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                {t('crm.import.ready', { count: toCreate })}
              </p>
            ) : (
              <>
                <p className="rounded-lg bg-danger-soft p-3 text-danger-ink">{t('crm.import.fixErrors')}</p>
                <div className="max-h-64 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-start text-xs">
                    <thead className="sticky top-0 bg-surface-2 text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-start font-medium">
                          {t('crm.import.row')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-start font-medium">
                          {t('crm.import.field')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-start font-medium">
                          {t('crm.import.message')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {check.errors.map((e, i) => (
                        <tr key={`${e.row}-${e.field ?? ''}-${i}`}>
                          <td className="px-3 py-1.5 tabular-nums">{formatNumber(e.row)}</td>
                          <td className="px-3 py-1.5 font-mono" dir="ltr">
                            {e.field ?? '—'}
                          </td>
                          <td className="px-3 py-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            <FileUp className="h-4 w-4" aria-hidden />
            {t('crm.import.dryRunNote')}
          </p>
        )}
      </div>
    </Modal>
  );
}
