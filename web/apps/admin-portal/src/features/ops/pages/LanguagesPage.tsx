/**
 * Settings -> Languages (admin / super_admin): every language the product ships, whether it is switched on,
 * and how complete its translation is per app (shipped catalog + admin overrides). English is the default and
 * cannot be switched off. Every change is audited by the API.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Languages as LanguagesIcon, Lock } from 'lucide-react';
import { Trans } from 'react-i18next';
import { Link } from 'react-router';
import { adminI18nApi, TRANSLATION_APPS, type AdminLanguageOut } from '@hig/shared/api';
import { DataTable, ProgressBar, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Badge, Card, ConfirmDialog, ErrorState, LoadingState, PageHeader, Switch } from '../ui';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { completenessTone, formatCompleteness, i18nKeys, translationAppLabel } from '../lib/i18nAdmin';
import { useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';

const isDefault = (lang: AdminLanguageOut) => lang.code === 'en';

export default function LanguagesPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('languages.title'));
  const perms = useOpsPermissions();
  const canEdit = perms.manageUsers; // admin | super_admin (same gate as the API)
  const list = useQuery({ queryKey: i18nKeys.languages, queryFn: () => adminI18nApi.languages() });
  const [disabling, setDisabling] = useState<AdminLanguageOut | null>(null);

  const toggle = useOpsMutation({
    mutationFn: (v: { code: string; enabled: boolean }) => adminI18nApi.updateLanguage(v.code, { enabled: v.enabled }),
    success: (lang) =>
      lang.enabled ? t('languages.toast.enabled', { name: lang.name }) : t('languages.toast.disabled', { name: lang.name }),
    invalidate: [i18nKeys.languages],
    onSuccess: () => setDisabling(null),
  });

  const onToggle = (lang: AdminLanguageOut, enabled: boolean) => {
    if (isDefault(lang)) return;
    if (!enabled) setDisabling(lang);
    else toggle.mutate({ code: lang.code, enabled: true });
  };

  const columns: DataTableColumn<AdminLanguageOut>[] = [
    {
      key: 'language',
      header: t('languages.columns.language'),
      mobile: 'primary',
      cell: (l) => (
        <TextCell
          primary={l.name}
          secondary={
            <span lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'}>
              {l.native_name}
            </span>
          }
        />
      ),
      exportValue: (l) => l.name,
    },
    {
      key: 'code',
      header: t('languages.columns.code'),
      cell: (l) => <span className="font-mono text-xs">{l.code}</span>,
      exportValue: (l) => l.code,
    },
    {
      key: 'direction',
      header: t('languages.columns.direction'),
      hideOnMobile: true,
      cell: (l) =>
        l.rtl ? <Badge tone="violet">{t('languages.rtl')}</Badge> : <span className="text-xs text-muted">{t('languages.ltr')}</span>,
      exportValue: (l) => (l.rtl ? 'rtl' : 'ltr'),
    },
    {
      key: 'overall',
      header: t('languages.columns.overall'),
      minWidth: '10rem',
      mobile: 'secondary',
      cell: (l) => (
        <div className="flex min-w-32 items-center gap-2">
          <ProgressBar
            value={l.completeness_overall}
            tone={completenessTone(l.completeness_overall)}
            size="sm"
            label={t('languages.overallLabel', { name: l.name })}
            hideLabel
          />
          <span className="w-14 shrink-0 text-end text-xs tabular-nums text-muted">{formatCompleteness(l.completeness_overall)}</span>
        </div>
      ),
      exportValue: (l) => l.completeness_overall,
    },
    {
      key: 'updated',
      header: t('languages.columns.updated'),
      hideOnMobile: true,
      cell: (l) => <span className="text-xs text-muted">{l.updated_at ? formatDateTime(l.updated_at) : '—'}</span>,
      exportValue: (l) => l.updated_at ?? '',
    },
    {
      key: 'enabled',
      header: t('languages.columns.enabled'),
      align: 'end',
      mobile: 'meta',
      cell: (l) =>
        isDefault(l) ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted" title={t('languages.defaultHint')}>
            <Lock className="size-3.5" aria-hidden />
            {t('languages.alwaysOn')}
          </span>
        ) : (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch
              checked={l.enabled}
              disabled={!canEdit || toggle.isPending}
              onChange={(value) => onToggle(l, value)}
              label={l.enabled ? t('languages.on') : t('languages.off')}
            />
          </span>
        ),
      exportValue: (l) => (l.enabled ? 'on' : 'off'),
    },
  ];

  const others = (list.data ?? []).filter((l) => !isDefault(l));

  return (
    <div>
      <PageHeader title={t('languages.title')} description={t('languages.description')} />
      {list.isLoading ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="space-y-4">
          <DataTable
            id="admin.i18n.languages"
            caption={t('languages.title')}
            columns={columns}
            rows={list.data}
            rowKey={(l) => l.code}
            mode="client"
            emptyTitle={t('languages.empty')}
            emptyIcon={<LanguagesIcon className="size-6" />}
          />
          {!canEdit && <p className="text-xs text-muted">{t('languages.readOnly')}</p>}

          <Card title={t('languages.byApp.title')}>
            <p className="mb-3 text-sm text-muted">
              <Trans
                t={t}
                i18nKey="languages.byApp.description"
                components={{ 0: <Link to={opsPaths.translations} className="font-medium underline" /> }}
              />
            </p>
            {others.length === 0 ? (
              <p className="text-sm text-muted">{t('languages.byApp.empty')}</p>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-muted">
                        {t('languages.byApp.app')}
                      </th>
                      {others.map((l) => (
                        <th
                          key={l.code}
                          scope="col"
                          className="whitespace-nowrap px-3 py-2 text-end text-xs font-semibold uppercase tracking-wide text-muted"
                        >
                          {l.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {TRANSLATION_APPS.map((app) => (
                      <tr key={app}>
                        <th scope="row" className="whitespace-nowrap px-3 py-2 text-start font-medium text-fg">
                          {translationAppLabel(app, t)}
                        </th>
                        {others.map((l) => {
                          const value = l.completeness[app];
                          return (
                            <td key={l.code} className="px-3 py-2 text-end tabular-nums">
                              {value === undefined ? (
                                <span className="text-muted">—</span>
                              ) : (
                                <Link
                                  to={`${opsPaths.translations}?app=${app}&locale=${encodeURIComponent(l.code)}&status=missing`}
                                  className={
                                    completenessTone(value) === 'success'
                                      ? 'text-success-ink hover:underline'
                                      : completenessTone(value) === 'warning'
                                        ? 'text-warning-ink hover:underline'
                                        : 'text-danger-ink hover:underline'
                                  }
                                  title={t('languages.byApp.openMissing', { app: translationAppLabel(app, t), name: l.name })}
                                >
                                  {formatCompleteness(value)}
                                </Link>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" className="whitespace-nowrap px-3 py-2 text-start font-semibold text-fg">
                        {t('languages.byApp.overall')}
                      </th>
                      {others.map((l) => (
                        <td key={l.code} className="px-3 py-2 text-end font-semibold tabular-nums">
                          {formatCompleteness(l.completeness_overall)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={!!disabling}
        tone="danger"
        title={t('languages.disable.title', { name: disabling?.name ?? '' })}
        message={t('languages.disable.message', { name: disabling?.name ?? '' })}
        confirmLabel={t('languages.disable.confirm')}
        loading={toggle.isPending}
        onClose={() => setDisabling(null)}
        onConfirm={() => disabling && toggle.mutate({ code: disabling.code, enabled: false })}
      />
    </div>
  );
}
