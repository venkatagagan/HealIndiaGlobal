/**
 * Per-entity translations of server-supplied content (catalog names/descriptions, hospital descriptions, doctor
 * bios, visa notes and checklist items, cultural tips, benchmark wait texts).
 *
 * GET/PUT /admin/content-translations/{entity_type}/{entity_id}. For every translatable field the dialog shows
 * the English source and, per language, the admin translation (editable), the shipped translation (used while
 * no admin text is saved) and what patients see. Clearing a box removes the admin translation.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { request } from '@hig/shared/api';
import { formatDateTime } from '@hig/shared/lib';
import { Badge } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Button, Field, Modal, Textarea } from '../ui';
import { useOpsMutation } from '../lib/mutations';

export type ContentEntityType =
  | 'specialty'
  | 'procedure'
  | 'hospital'
  | 'doctor'
  | 'cultural_tip'
  | 'cost_benchmark'
  | 'visa_rule'
  | 'visa_checklist';

interface FieldTranslation {
  text: string | null;
  shipped: string | null;
  effective: string | null;
  updated_at: string | null;
}

interface ContentTranslationsOut {
  entity_type: ContentEntityType;
  entity_id: string;
  locales: string[];
  fields: { field: string; source: string | null; translations: Record<string, FieldTranslation> }[];
}

const LANGUAGE_NAMES: Record<string, string> = { ar: 'العربية', fr: 'Français', bn: 'বাংলা', ru: 'Русский' };
const RTL = new Set(['ar']);
const LONG_FIELDS = new Set(['description', 'bio', 'body', 'notes']);

/** Checklist items are addressed by a natural key so built-in defaults can be translated too. */
export const checklistEntityId = (route: string, nationality: string | null | undefined, itemKey: string) =>
  `${route}:${(nationality || '*').toUpperCase()}:${itemKey}`;

const contentKey = (type: string, id: string) => ['admin', 'content-translations', type, id] as const;
const path = (type: string, id: string) =>
  `/admin/content-translations/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;

export function ContentTranslationsDialog({
  open,
  onClose,
  entityType,
  entityId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  entityType: ContentEntityType;
  entityId: string;
  label: string;
}) {
  const { t } = useAppTranslation();
  const query = useQuery({
    queryKey: contentKey(entityType, entityId),
    queryFn: () => request<ContentTranslationsOut>('GET', path(entityType, entityId)),
    enabled: open && !!entityId,
  });
  const data = query.data;
  const locales = data?.locales ?? [];
  const [locale, setLocale] = useState<string>('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const activeLocale = locale || locales[0] || '';

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const f of data.fields) for (const code of data.locales) next[`${code}.${f.field}`] = f.translations[code]?.text ?? '';
    setDraft(next);
  }, [data]);
  useEffect(() => {
    if (!open) setLocale('');
  }, [open]);

  const changes = useMemo(() => {
    if (!data) return [];
    const out: { locale: string; field: string; text: string | null }[] = [];
    for (const f of data.fields) {
      for (const code of data.locales) {
        const saved = f.translations[code]?.text ?? '';
        const value = (draft[`${code}.${f.field}`] ?? '').trim();
        if (value !== saved.trim()) out.push({ locale: code, field: f.field, text: value || null });
      }
    }
    return out;
  }, [data, draft]);

  const save = useOpsMutation({
    mutationFn: () =>
      request<ContentTranslationsOut>('PUT', path(entityType, entityId), { body: { translations: changes } }),
    success: () => t('contentTranslations.saved'),
    invalidate: [contentKey(entityType, entityId)],
    onSuccess: onClose,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('contentTranslations.title', { label })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={changes.length === 0}>
            {t('contentTranslations.save', { count: changes.length })}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{t('contentTranslations.help')}</p>
      {query.isLoading && <p className="text-sm text-muted">{t('contentTranslations.loading')}</p>}
      {query.isError && <p className="text-sm text-red-600 dark:text-red-400">{t('contentTranslations.loadError')}</p>}
      {data && (
        <>
          <div role="tablist" aria-label={t('contentTranslations.language')} className="mb-3 flex flex-wrap gap-1">
            {locales.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={code === activeLocale}
                onClick={() => setLocale(code)}
                className={`rounded-md border px-3 py-1 text-sm ${code === activeLocale ? 'border-primary bg-primary/10 font-medium' : 'border-border'}`}
              >
                <span lang={code}>{LANGUAGE_NAMES[code] ?? code}</span> <span className="text-muted">({code})</span>
              </button>
            ))}
          </div>
          <div className="grid gap-4">
            {data.fields.map((f) => {
              const tr = f.translations[activeLocale];
              const key = `${activeLocale}.${f.field}`;
              const value = draft[key] ?? '';
              const status = value.trim() ? 'custom' : tr?.shipped ? 'shipped' : 'english';
              return (
                <div key={f.field} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t(`contentTranslations.fields.${f.field}`, { defaultValue: f.field })}</span>
                    <Badge tone={status === 'custom' ? 'success' : status === 'shipped' ? 'info' : 'warning'}>
                      {t(`contentTranslations.status.${status}`)}
                    </Badge>
                  </div>
                  <p className="mb-2 whitespace-pre-wrap text-sm text-muted" lang="en" dir="ltr">
                    <span className="font-medium">{t('contentTranslations.english')}:</span> {f.source || '—'}
                  </p>
                  <Field
                    label={t('contentTranslations.translation', { language: LANGUAGE_NAMES[activeLocale] ?? activeLocale })}
                    hint={
                      tr?.shipped && !value.trim()
                        ? t('contentTranslations.shippedHint', { text: tr.shipped })
                        : tr?.updated_at
                          ? t('contentTranslations.updatedAt', { date: formatDateTime(tr.updated_at) })
                          : undefined
                    }
                  >
                    {(id) => (
                      <Textarea
                        id={id}
                        lang={activeLocale}
                        dir={RTL.has(activeLocale) ? 'rtl' : 'ltr'}
                        rows={LONG_FIELDS.has(f.field) ? 4 : 2}
                        maxLength={10000}
                        value={value}
                        placeholder={tr?.shipped ?? f.source ?? ''}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    )}
                  </Field>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

/** Small icon button that opens the translations dialog for one entity. */
export function TranslationsButton({
  entityType,
  entityId,
  label,
  size = 'sm',
  withText = false,
}: {
  entityType: ContentEntityType;
  entityId: string;
  label: string;
  size?: 'sm' | 'md';
  withText?: boolean;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        variant={withText ? 'outline' : 'ghost'}
        aria-label={t('contentTranslations.open', { label })}
        title={t('contentTranslations.open', { label })}
        icon={<Languages className="size-3.5" />}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {withText ? t('contentTranslations.button') : undefined}
      </Button>
      {open && (
        <ContentTranslationsDialog
          open={open}
          onClose={() => setOpen(false)}
          entityType={entityType}
          entityId={entityId}
          label={label}
        />
      )}
    </>
  );
}
