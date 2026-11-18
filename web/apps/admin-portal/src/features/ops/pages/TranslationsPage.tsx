/**
 * Settings -> Translations (admin / super_admin): every string of one app in one language - English source,
 * shipped translation and admin override - with search, status views and per-key edit / clear. Overrides are
 * plain text (the API strips HTML) and are live within about a minute; every change is audited by the API.
 */
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Pencil, RotateCcw } from 'lucide-react';
import type { TFunction } from 'i18next';
import {
  adminI18nApi,
  TRANSLATION_APPS,
  type TranslationApp,
  type TranslationStatus,
  type TranslationStringOut,
} from '@hig/shared/api';
import { currentLanguage, filterParam, formatNumber, i18n, reloadOverrides, useTableState } from '@hig/shared/lib';
import {
  DataTable,
  FilterBar,
  QuickFilters,
  TextCell,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Badge, Button, Card, ConfirmDialog, Field, Modal, PageHeader, Select, Textarea } from '../ui';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { hasNumberedTags, i18nKeys, missingPlaceholders, translationAppLabel } from '../lib/i18nAdmin';
import { useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const MAX_TEXT = 5000;
const STATUSES = ['missing', 'overridden', 'translated'] as const satisfies readonly Exclude<TranslationStatus, 'all'>[];

const FILTERS = {
  app: filterParam.oneOf(TRANSLATION_APPS, 'patient_web'),
  locale: filterParam.text(),
  q: filterParam.text(),
  status: filterParam.oneOf(STATUSES),
};

/** After an edit of the admin portal's own text in the language on screen, re-apply the overrides at once. */
async function refreshLiveText(app: TranslationApp, locale: string, item?: TranslationStringOut): Promise<void> {
  if (app !== 'admin' || locale !== currentLanguage()) return;
  if (item) {
    // cleared: put the shipped text (or the English fallback) back; reloading cannot remove a merged key
    const sep = item.key.indexOf(':');
    if (sep > 0) i18n.addResource(locale, item.key.slice(0, sep), item.key.slice(sep + 1), item.shipped ?? item.source);
  }
  await reloadOverrides(locale);
}

function stringColumns(
  t: TFunction,
  canEdit: boolean,
  onEdit: (row: TranslationStringOut) => void,
  onClear: (row: TranslationStringOut) => void,
  rtl: boolean,
): DataTableColumn<TranslationStringOut>[] {
  const localeText = (text: string) => (
    <span dir={rtl ? 'rtl' : 'ltr'} className="block whitespace-pre-wrap break-words">
      {text}
    </span>
  );
  return [
    {
      key: 'key',
      header: t('translations.columns.key'),
      className: 'max-w-56',
      mobile: 'secondary',
      cell: (r) => (
        <span className="break-all font-mono text-xs" dir="ltr">
          {r.key}
        </span>
      ),
      exportValue: (r) => r.key,
    },
    {
      key: 'source',
      header: t('translations.columns.source'),
      className: 'max-w-72',
      mobile: 'primary',
      cell: (r) => (
        <span dir="ltr" className="block whitespace-pre-wrap break-words">
          {r.source}
        </span>
      ),
      exportValue: (r) => r.source,
    },
    {
      key: 'shipped',
      header: t('translations.columns.shipped'),
      className: 'max-w-72',
      cell: (r) => (r.shipped === null ? <Badge tone="amber">{t('translations.missing')}</Badge> : localeText(r.shipped)),
      exportValue: (r) => r.shipped ?? '',
    },
    {
      key: 'override',
      header: t('translations.columns.override'),
      className: 'max-w-72',
      cell: (r) =>
        r.override === null ? (
          <span className="text-muted">—</span>
        ) : (
          <TextCell
            primary={localeText(r.override)}
            secondary={
              r.updated_at
                ? r.updated_by
                  ? t('translations.updatedBy', { name: r.updated_by, date: formatDateTime(r.updated_at) })
                  : formatDateTime(r.updated_at)
                : undefined
            }
          />
        ),
      exportValue: (r) => r.override ?? '',
    },
    ...(canEdit
      ? [
          {
            key: '_actions',
            header: <span className="sr-only">{t('translations.columns.actions')}</span>,
            title: t('translations.columns.actions'),
            align: 'end',
            hideable: false,
            exportable: false,
            mobile: 'meta',
            cell: (r: TranslationStringOut) => (
              <span className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('translations.editRow', { key: r.key })}
                  title={t('translations.edit')}
                  icon={<Pencil className="size-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(r);
                  }}
                />
                {r.override !== null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 dark:text-red-400"
                    aria-label={t('translations.clearRow', { key: r.key })}
                    title={t('translations.clear')}
                    icon={<RotateCcw className="size-3.5" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClear(r);
                    }}
                  />
                )}
              </span>
            ),
          } satisfies DataTableColumn<TranslationStringOut>,
        ]
      : []),
  ];
}

export default function TranslationsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('translations.title'));
  const perms = useOpsPermissions();
  const canEdit = perms.manageUsers; // admin | super_admin (same gate as the API)
  const table = useTableState({ filters: FILTERS, defaultPageSize: 50 });
  const { filters, setFilter } = table;

  const languages = useQuery({ queryKey: i18nKeys.languages, queryFn: () => adminI18nApi.languages() });
  const fallbackLocale = (languages.data ?? []).find((l) => l.code !== 'en')?.code ?? 'en';
  const knownLocale = languages.data?.some((l) => l.code === filters.locale);
  const locale = filters.locale && (knownLocale || !languages.data) ? filters.locale : fallbackLocale;
  const language = languages.data?.find((l) => l.code === locale);
  const app: TranslationApp = filters.app || 'patient_web';
  const status: TranslationStatus = filters.status || 'all';

  const query = {
    app,
    locale,
    q: filters.q.trim() || undefined,
    status,
    page: table.page,
    page_size: table.pageSize,
  };
  const list = useQuery({
    queryKey: [...i18nKeys.strings, query],
    queryFn: () => adminI18nApi.strings(query),
    enabled: !!languages.data,
    placeholderData: keepPreviousData,
  });

  const [editing, setEditing] = useState<TranslationStringOut | null>(null);
  const [clearing, setClearing] = useState<TranslationStringOut | null>(null);

  const clear = useOpsMutation({
    mutationFn: (row: TranslationStringOut) => adminI18nApi.deleteOverride({ app, locale, key: row.key }),
    success: () => t('translations.toast.cleared'),
    invalidate: [i18nKeys.strings, i18nKeys.languages],
    onSuccess: (_result, row) => {
      setClearing(null);
      void refreshLiveText(app, locale, row);
    },
  });

  const columns = useMemo(
    () => stringColumns(t, canEdit, setEditing, setClearing, !!language?.rtl),
    [t, canEdit, language?.rtl],
  );

  const counts = list.data?.counts;
  const quickItems: QuickFilterItem<(typeof STATUSES)[number]>[] = [
    { value: '', label: t('translations.status.all'), count: counts?.total ?? null },
    { value: 'missing', label: t('translations.status.missing'), count: counts?.missing ?? null, tone: 'warning' },
    { value: 'overridden', label: t('translations.status.overridden'), count: counts?.overridden ?? null },
    {
      value: 'translated',
      label: t('translations.status.translated'),
      count: counts ? counts.total - counts.missing : null,
    },
  ];

  const appOptions = TRANSLATION_APPS.map((a) => ({ value: a, label: translationAppLabel(a, t) }));
  const localeOptions = (languages.data ?? []).map((l) => ({
    value: l.code,
    label: l.enabled ? `${l.name} · ${l.native_name}` : t('translations.languageOff', { name: `${l.name} · ${l.native_name}` }),
  }));

  return (
    <div>
      <PageHeader title={t('translations.title')} description={t('translations.description')} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Field label={t('translations.app')}>
            {(id) => (
              <Select id={id} value={app} options={appOptions} onChange={(e) => setFilter('app', e.target.value as TranslationApp)} />
            )}
          </Field>
          <Field label={t('translations.language')}>
            {(id) => (
              <Select
                id={id}
                value={locale}
                options={localeOptions.length ? localeOptions : [{ value: locale, label: locale }]}
                disabled={languages.isLoading}
                onChange={(e) => setFilter('locale', e.target.value)}
              />
            )}
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted">{t('translations.placeholdersHint', { example1: '{{name}}', example2: '{count}' })}</p>
      </Card>

      <DataTable
        id="admin.i18n.strings"
        caption={t('translations.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        rowKey={(r) => r.key}
        loading={list.isLoading || languages.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={languages.error ?? list.error}
        onRetry={() => void (languages.error ? languages.refetch() : list.refetch())}
        onRowClick={canEdit ? setEditing : undefined}
        rowLabel={(r) => t('translations.editRow', { key: r.key })}
        density="compact"
        emptyTitle={t('translations.empty')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('translations.status.label')}
              items={quickItems}
              value={filters.status}
              onChange={(s) => setFilter('status', s)}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('translations.searchPlaceholder') }}
            onReset={table.resetFilters}
          />
        }
      />
      {!canEdit && <p className="mt-3 text-xs text-muted">{t('translations.readOnly')}</p>}

      <EditOverrideDialog
        item={editing}
        app={app}
        locale={locale}
        rtl={!!language?.rtl}
        languageName={language?.name ?? locale}
        onClose={() => setEditing(null)}
        onClear={(row) => {
          setEditing(null);
          setClearing(row);
        }}
      />
      <ConfirmDialog
        open={!!clearing}
        tone="danger"
        title={t('translations.clearDialog.title')}
        message={
          <div className="space-y-2">
            <p>{t('translations.clearDialog.message')}</p>
            <p className="break-all font-mono text-xs text-muted" dir="ltr">
              {clearing?.key}
            </p>
          </div>
        }
        confirmLabel={t('translations.clear')}
        loading={clear.isPending}
        onClose={() => setClearing(null)}
        onConfirm={() => clearing && clear.mutate(clearing)}
      />
    </div>
  );
}

function EditOverrideDialog({
  item,
  app,
  locale,
  rtl,
  languageName,
  onClose,
  onClear,
}: {
  item: TranslationStringOut | null;
  app: TranslationApp;
  locale: string;
  rtl: boolean;
  languageName: string;
  onClose: () => void;
  onClear: (row: TranslationStringOut) => void;
}) {
  const { t } = useAppTranslation();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (item) {
      setText(item.override ?? item.shipped ?? '');
      setTouched(false);
    }
  }, [item]);

  const save = useOpsMutation({
    mutationFn: (value: string) => adminI18nApi.upsertOverride({ app, locale, key: item!.key, text: value }),
    success: () => t('translations.toast.saved'),
    invalidate: [i18nKeys.strings, i18nKeys.languages],
    onSuccess: () => {
      onClose();
      void refreshLiveText(app, locale);
    },
  });

  const trimmed = text.trim();
  const empty = trimmed.length === 0;
  const missing = item ? missingPlaceholders(item.source, text) : [];
  const tags = item ? hasNumberedTags(item.source) : false;
  const unchanged = !!item && trimmed === (item.override ?? '').trim();

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      size="lg"
      title={t('translations.editDialog.title', { language: languageName })}
      footer={
        <>
          {item?.override !== null && item?.override !== undefined && (
            <Button variant="ghost" className="me-auto text-red-600 dark:text-red-400" onClick={() => item && onClear(item)}>
              {t('translations.clear')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={unchanged}
            onClick={() => {
              setTouched(true);
              if (!empty) save.mutate(trimmed);
            }}
          >
            {t('translations.editDialog.save')}
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted">{t('translations.columns.key')}</p>
            <p className="mt-0.5 break-all font-mono text-xs" dir="ltr">
              {item.key}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">{t('translations.columns.source')}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-3 py-2" dir="ltr" lang="en">
              {item.source}
            </p>
          </div>
          {locale !== 'en' && (
            <div>
              <p className="text-xs font-medium text-muted">{t('translations.columns.shipped')}</p>
              {item.shipped === null ? (
                <p className="mt-0.5">
                  <Badge tone="amber">{t('translations.missing')}</Badge>
                </p>
              ) : (
                <p
                  className="mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-3 py-2"
                  dir={rtl ? 'rtl' : 'ltr'}
                  lang={locale}
                >
                  {item.shipped}
                </p>
              )}
            </div>
          )}
          <Field
            label={t('translations.editDialog.override')}
            required
            error={touched && empty ? t('translations.editDialog.emptyError') : null}
            hint={t('translations.editDialog.counter', {
              count: text.length,
              value: formatNumber(text.length),
              max: formatNumber(MAX_TEXT),
            })}
          >
            {(id) => (
              <Textarea
                id={id}
                rows={5}
                value={text}
                maxLength={MAX_TEXT}
                dir={rtl ? 'rtl' : 'ltr'}
                lang={locale}
                invalid={touched && empty}
                onChange={(e) => setText(e.target.value)}
                data-autofocus
              />
            )}
          </Field>
          {missing.length > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-warning-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {t('translations.editDialog.missingPlaceholders', { count: missing.length, list: missing.join(', ') })}
              </p>
            </div>
          )}
          {tags && <p className="text-xs text-muted">{t('translations.editDialog.tagsNote')}</p>}
          <p className="text-xs text-muted">{t('translations.editDialog.plainText')}</p>
        </div>
      )}
    </Modal>
  );
}
