/**
 * PHI access log per patient: every view, download or listing of a patient's health records by someone other
 * than the patient, including support break-glass reads (with their reason). Search a patient account, then
 * the log loads from GET /admin/privacy/access-log?patient_id=<patient profile id>.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { FileSearch, Search } from 'lucide-react';
import { adminApi, USER_ROLE_LABELS, type AccessLogEntry, type UserRole } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { formatDateTime, useDebouncedValue } from '../../lib/format';
import { privacyToolsApi, privacyToolsKeys } from '../../lib/privacyToolsApi';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, type Column, type Tone } from '../../ui';

type LogRow = AccessLogEntry & { _row: number };

interface PatientPick {
  profileId: string;
  name: string;
  email: string | null;
}

const ACTIONS = ['phi.view', 'phi.download', 'phi.list', 'phi.break_glass'] as const;
const ACTION_TONES: Record<string, Tone> = {
  'phi.view': 'blue',
  'phi.download': 'violet',
  'phi.list': 'neutral',
  'phi.break_glass': 'red',
};

function actionLabel(t: TFunction, action: string): string {
  return (ACTIONS as readonly string[]).includes(action)
    ? t(`privacyTools.access.actions.${action.replace('phi.', '')}`)
    : action;
}

export function AccessLogPanel() {
  const { t } = useAppTranslation();
  const [q, setQ] = useState('');
  const [patient, setPatient] = useState<PatientPick | null>(null);
  const query = useDebouncedValue(q.trim(), 300);

  const search = useQuery({
    queryKey: ['admin', 'privacy', 'access-log-patients', query],
    enabled: query.length >= 2 && !patient,
    queryFn: () => adminApi.listUsers({ q: query, role: 'patient', page: 1, page_size: 10 }),
    select: (page) =>
      page.items
        .filter((u) => !!u.patient_profile_id)
        .map((u) => ({ profileId: u.patient_profile_id!, name: u.full_name || u.email || u.id, email: u.email ?? null })),
    staleTime: 30_000,
  });

  const log = useQuery({
    queryKey: privacyToolsKeys.accessLog(patient?.profileId ?? ''),
    queryFn: () => privacyToolsApi.accessLog(patient!.profileId),
    enabled: !!patient,
  });

  const columns: Column<LogRow>[] = [
    { key: 'at', header: t('privacyTools.access.columns.at'), cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.at)}</span> },
    { key: 'action', header: t('privacyTools.access.columns.action'), cell: (r) => <Badge tone={ACTION_TONES[r.action] ?? 'neutral'}>{actionLabel(t, r.action)}</Badge> },
    {
      key: 'viewer',
      header: t('privacyTools.access.columns.viewer'),
      cell: (r) => (
        <div>
          <p className="font-medium">{r.viewer_name ?? t('privacyTools.access.unknownViewer')}</p>
          {r.viewer_role && <p className="text-xs text-muted">{USER_ROLE_LABELS[r.viewer_role as UserRole] ?? r.viewer_role}</p>}
        </div>
      ),
    },
    {
      key: 'resource',
      header: t('privacyTools.access.columns.resource'),
      hideOnMobile: true,
      cell: (r) =>
        r.resource_type ? (
          <span className="text-xs">
            {t(`privacyTools.access.resources.${r.resource_type}`, { defaultValue: r.resource_type })}
            {r.resource_id ? <span className="ms-1 font-mono text-muted">{r.resource_id.slice(0, 8)}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'reason', header: t('privacyTools.access.columns.reason'), cell: (r) => <span className="whitespace-pre-line text-sm">{r.reason ?? '—'}</span> },
  ];

  return (
    <Card title={t('privacyTools.access.title')}>
      <p className="mb-3 text-sm text-muted">{t('privacyTools.access.description')}</p>
      {patient ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{patient.name}</span>
            {patient.email && <span className="ms-2 text-muted">{patient.email}</span>}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPatient(null);
              setQ('');
            }}
          >
            {t('privacyTools.access.changePatient')}
          </Button>
        </div>
      ) : (
        <div className="mb-4 grid gap-2">
          <Field label={t('privacyTools.access.searchLabel')} hint={t('privacyTools.access.searchHint')}>
            {(id) => <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
          </Field>
          {query.length >= 2 && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {search.isLoading ? (
                <li className="px-3 py-2 text-muted">{t('ui.loading')}</li>
              ) : search.data && search.data.length > 0 ? (
                search.data.map((p) => (
                  <li key={p.profileId}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-start hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      onClick={() => setPatient(p)}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.email && <span className="ms-2 text-muted">{p.email}</span>}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-muted">{t('privacyTools.access.noPatients')}</li>
              )}
            </ul>
          )}
        </div>
      )}
      {patient ? (
        <DataTable
          columns={columns}
          rows={log.data?.map((r, i) => ({ ...r, _row: i }))}
          rowKey={(r) => String(r._row)}
          loading={log.isLoading}
          error={log.error}
          onRetry={() => void log.refetch()}
          rowClassName={(r) => (r.action === 'phi.break_glass' ? 'bg-red-50 dark:bg-red-500/10' : undefined)}
          empty={<EmptyState icon={<FileSearch className="size-6" />} title={t('privacyTools.access.empty')} />}
        />
      ) : (
        <EmptyState icon={<Search className="size-6" />} title={t('privacyTools.access.pickPatient')} />
      )}
    </Card>
  );
}
