import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import { fieldErrors, type CrudEndpoints } from '@hig/shared/api';
import type { TableStateLike } from '@hig/shared/lib';
import { useAppTranslation } from '../../../i18n';
import { Button as UiButton, DataTable, ExportButton, FilterBar, type DataTableColumn } from '@hig/shared/ui';
import { Button, Checkbox, ConfirmDialog, Field, Input, Modal, Select, Textarea, type SelectOption } from '../ui';
import { MoneyInput } from './MoneyInput';
import { fromMinor, splitList, toMinor } from '../lib/format';
import { useOpsMutation } from '../lib/mutations';

export type FieldKind = 'text' | 'textarea' | 'int' | 'decimal' | 'bool' | 'select' | 'list' | 'money' | 'url' | 'email';

export interface FieldDef<Row> {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: readonly SelectOption[];
  /** money: the form field holding the ISO currency */
  currencyField?: string;
  hint?: ReactNode;
  maxLength?: number;
  /** span both form columns */
  wide?: boolean;
  /** value for a new record (form string / boolean) */
  defaultValue?: string | boolean;
  /** read the initial value from a row (defaults to row[name]) */
  getValue?: (row: Row) => unknown;
  /** decimal fields are sent as strings (exact) instead of numbers */
  decimalAsString?: boolean;
  min?: number;
  max?: number;
  /** text is upper-cased before sending (country / currency codes) */
  uppercase?: boolean;
  /** only shown/sent when creating */
  createOnly?: boolean;
}

type FormState = Record<string, string | boolean>;

function initialForm<Row>(fields: readonly FieldDef<Row>[], row: Row | null): FormState {
  const form: FormState = {};
  // currencies first so money fields can be converted
  for (const f of fields) {
    const raw = row ? (f.getValue ? f.getValue(row) : (row as Record<string, unknown>)[f.name]) : undefined;
    if (!row) {
      form[f.name] = f.defaultValue ?? (f.kind === 'bool' ? false : '');
      continue;
    }
    switch (f.kind) {
      case 'bool':
        form[f.name] = Boolean(raw);
        break;
      case 'list':
        form[f.name] = Array.isArray(raw) ? raw.join(', ') : '';
        break;
      default:
        form[f.name] = raw === null || raw === undefined ? '' : String(raw);
    }
  }
  for (const f of fields) {
    if (f.kind !== 'money' || !row) continue;
    const raw = f.getValue ? f.getValue(row) : (row as Record<string, unknown>)[f.name];
    const ccy = String(form[f.currencyField ?? 'currency'] || 'INR');
    form[f.name] = typeof raw === 'number' ? String(fromMinor(raw, ccy)) : '';
  }
  return form;
}

function buildPayload<Row>(
  fields: readonly FieldDef<Row>[],
  form: FormState,
  isCreate: boolean,
  t: TFunction,
): { payload: Record<string, unknown>; errors: Record<string, string> } {
  const payload: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.createOnly && !isCreate) continue;
    const v = form[f.name];
    if (f.kind === 'bool') {
      payload[f.name] = Boolean(v);
      continue;
    }
    const text = String(v ?? '').trim();
    if (text === '') {
      if (f.required) errors[f.name] = t('components.crud.errors.required');
      else payload[f.name] = f.kind === 'list' ? [] : null;
      continue;
    }
    switch (f.kind) {
      case 'int': {
        const n = Number(text);
        if (!Number.isInteger(n)) errors[f.name] = t('components.crud.errors.wholeNumber');
        else if (f.min !== undefined && n < f.min) errors[f.name] = t('components.crud.errors.min', { min: f.min });
        else if (f.max !== undefined && n > f.max) errors[f.name] = t('components.crud.errors.max', { max: f.max });
        else payload[f.name] = n;
        break;
      }
      case 'decimal': {
        const n = Number(text);
        if (!Number.isFinite(n)) errors[f.name] = t('components.crud.errors.number');
        else if (f.min !== undefined && n < f.min) errors[f.name] = t('components.crud.errors.min', { min: f.min });
        else if (f.max !== undefined && n > f.max) errors[f.name] = t('components.crud.errors.max', { max: f.max });
        else payload[f.name] = f.decimalAsString ? text : n;
        break;
      }
      case 'money': {
        const ccy = String(form[f.currencyField ?? 'currency'] || 'INR');
        const minor = toMinor(text, ccy);
        if (minor === null || minor < 0) errors[f.name] = t('components.crud.errors.amount');
        else payload[f.name] = minor;
        break;
      }
      case 'list':
        payload[f.name] = splitList(text);
        break;
      case 'url':
        if (!/^https?:\/\/\S+$/i.test(text)) errors[f.name] = t('components.crud.errors.url');
        else payload[f.name] = text;
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[f.name] = t('components.crud.errors.email');
        else payload[f.name] = text;
        break;
      default:
        payload[f.name] = f.uppercase ? text.toUpperCase() : text;
    }
  }
  return { payload, errors };
}

/** URL table state of a CrudSection (from `useTableState({ filters: { q: filterParam.text(), ... } })`). */
export interface CrudTableState extends TableStateLike {
  filters: { q: string };
  setFilter(key: 'q', value: string): void;
}

export interface CrudSectionProps<Row, In> {
  /** singular, e.g. "specialty" */
  entityName: string;
  /** plural for empty states / captions, e.g. "specialties" (default entityName + "s") */
  entityPlural?: string;
  /** DataTable id (column visibility / density persistence), e.g. "admin.catalog.specialties" */
  id: string;
  table: CrudTableState;
  queryKey: QueryKey;
  endpoints: CrudEndpoints<Row, In>;
  listParams?: object;
  fields: readonly FieldDef<Row>[];
  columns: DataTableColumn<Row>[];
  rowKey: (row: Row) => string;
  /** id used in /admin/<resource>/{id}; defaults to rowKey */
  rowId?: (row: Row) => string;
  rowLabel: (row: Row) => string;
  canEdit: boolean;
  /** client-side row filter (the pill filters of the page) */
  filterRow?: (row: Row) => boolean;
  /** client-side text search over these strings */
  searchText?: (row: Row) => string;
  /** pill filters (SelectFilter …) shown after the search box */
  filters?: ReactNode;
  /** invalidate these too after writes */
  alsoInvalidate?: readonly QueryKey[];
  description?: ReactNode;
}

/** Client-side list (search + pill filters + sortable table) with create/edit modal and delete confirmation
 *  for an /admin catalog resource. */
export function CrudSection<Row, In>({
  entityName,
  entityPlural,
  id,
  table,
  queryKey,
  endpoints,
  listParams,
  fields,
  columns,
  rowKey,
  rowId,
  rowLabel,
  canEdit,
  searchText,
  filterRow,
  filters,
  alsoInvalidate = [],
  description,
}: CrudSectionProps<Row, In>) {
  const { t } = useAppTranslation();
  const list = useQuery({ queryKey: [...queryKey, listParams ?? {}], queryFn: () => endpoints.list(listParams) });
  const [editing, setEditing] = useState<{ row: Row | null } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const q = table.filters.q;
  const idOf = rowId ?? rowKey;
  const plural = entityPlural ?? `${entityName}s`;
  const Title = `${entityName[0]!.toUpperCase()}${entityName.slice(1)}`;

  const remove = useOpsMutation({
    mutationFn: (row: Row) => endpoints.delete(idOf(row)),
    success: () => t('components.crud.deleted', { entity: Title }),
    invalidate: [queryKey, ...alsoInvalidate],
    onSuccess: () => setDeleting(null),
  });

  const rows = useMemo(() => {
    let data = list.data ?? undefined;
    if (!data) return data;
    if (filterRow) data = data.filter(filterRow);
    const needle = q.trim().toLowerCase();
    if (searchText && needle) data = data.filter((r) => searchText(r).toLowerCase().includes(needle));
    return data;
  }, [list.data, q, searchText, filterRow]);

  const allColumns: DataTableColumn<Row>[] = canEdit
    ? [
        ...columns,
        {
          key: '_actions',
          header: <span className="sr-only">{t('components.crud.actions')}</span>,
          title: t('components.crud.actions'),
          align: 'end',
          hideable: false,
          exportable: false,
          mobile: 'meta',
          cell: (row) => (
            <span className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('components.crud.editRow', { label: rowLabel(row) })}
                icon={<Pencil className="size-3.5" />}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing({ row });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400"
                aria-label={t('components.crud.deleteRow', { label: rowLabel(row) })}
                icon={<Trash2 className="size-3.5" />}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(row);
                }}
              />
            </span>
          ),
        },
      ]
    : columns;

  const addButton = canEdit ? (
    <UiButton size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ row: null })}>
      {t('components.crud.add', { entity: entityName })}
    </UiButton>
  ) : null;

  return (
    <div>
      {description && <p className="mb-3 text-sm text-muted">{description}</p>}
      <DataTable
        id={id}
        caption={plural[0]!.toUpperCase() + plural.slice(1)}
        table={table}
        columns={allColumns}
        rows={rows}
        rowKey={(r) => rowKey(r)}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={canEdit ? (row) => setEditing({ row }) : undefined}
        rowLabel={(r) => t('components.crud.editRow', { label: rowLabel(r) })}
        emptyTitle={t('components.crud.empty', { entities: plural })}
        emptyAction={addButton ?? undefined}
        toolbar={
          <FilterBar
            search={searchText ? { value: q, onChange: (v) => table.setFilter('q', v), placeholder: t('components.crud.search', { entities: plural }) } : undefined}
            onReset={table.resetFilters}
            actions={
              <>
                <ExportButton filename={id.replace(/^admin\./, '').replace(/\./g, '-')} columns={columns} rows={rows} />
                {addButton}
              </>
            }
          >
            {filters}
          </FilterBar>
        }
      />
      {!canEdit && <p className="mt-3 text-xs text-muted">{t('components.crud.readOnly')}</p>}
      <CrudForm
        open={!!editing}
        row={editing?.row ?? null}
        entityName={entityName}
        fields={fields}
        onClose={() => setEditing(null)}
        save={(payload, row) => (row ? endpoints.update(idOf(row), payload as Partial<In>) : endpoints.create(payload as In))}
        invalidate={[queryKey, ...alsoInvalidate]}
      />
      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title={t('components.crud.deleteTitle', { entity: entityName })}
        message={
          <Trans
            t={t}
            i18nKey="components.crud.deleteMessage"
            values={{ label: deleting ? rowLabel(deleting) : '' }}
            components={{ 0: <strong /> }}
          />
        }
        confirmLabel={t('components.crud.delete')}
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function CrudForm<Row>({
  open,
  row,
  entityName,
  fields,
  onClose,
  save,
  invalidate,
}: {
  open: boolean;
  row: Row | null;
  entityName: string;
  fields: readonly FieldDef<Row>[];
  onClose: () => void;
  save: (payload: Record<string, unknown>, row: Row | null) => Promise<unknown>;
  invalidate: readonly QueryKey[];
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<FormState>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setForm(initialForm(fields, row));
      setErrors({});
    }
    // fields are read once per open; callers may pass a new array each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row]);

  const mutation = useOpsMutation({
    mutationFn: (payload: Record<string, unknown>) => save(payload, row),
    success: () =>
      row ? t('components.crud.updated', { entity: entityName }) : t('components.crud.created', { entity: entityName }),
    invalidate,
    onSuccess: onClose,
  });
  const serverErrors = fieldErrors(mutation.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { payload, errors: errs } = buildPayload(fields, form, !row, t);
    setErrors(errs);
    if (Object.keys(errs).length === 0) mutation.mutate(payload);
  };

  const set = (name: string, value: string | boolean) => setForm((prev) => ({ ...prev, [name]: value }));
  const visible = fields.filter((f) => !(f.createOnly && row));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={row ? t('components.crud.editTitle', { entity: entityName }) : t('components.crud.newTitle', { entity: entityName })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('ui.cancel')}
          </Button>
          <Button type="submit" form="crud-form" loading={mutation.isPending}>
            {row ? t('components.crud.saveChanges') : t('components.crud.create')}
          </Button>
        </>
      }
    >
      <form id="crud-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        {visible.map((f) => {
          const err = errors[f.name] ?? serverErrors[f.name] ?? null;
          if (f.kind === 'bool') {
            return (
              <div key={f.name} className={f.wide ? 'sm:col-span-2' : undefined}>
                <Checkbox label={f.label} checked={Boolean(form[f.name])} onChange={(v) => set(f.name, v)} />
              </div>
            );
          }
          if (f.currencyField === undefined && fields.some((o) => o.kind === 'money' && (o.currencyField ?? 'currency') === f.name)) {
            // currency selector rendered next to the money inputs
            return null;
          }
          return (
            <Field
              key={f.name}
              label={f.label}
              required={f.required}
              hint={f.hint ?? (f.kind === 'list' ? t('components.crud.commaSeparated') : undefined)}
              error={err}
              className={f.wide || f.kind === 'textarea' ? 'sm:col-span-2' : undefined}
            >
              {(id) =>
                f.kind === 'textarea' ? (
                  <Textarea
                    id={id}
                    value={String(form[f.name] ?? '')}
                    maxLength={f.maxLength ?? 5000}
                    onChange={(e) => set(f.name, e.target.value)}
                    invalid={!!err}
                  />
                ) : f.kind === 'select' ? (
                  <Select
                    id={id}
                    value={String(form[f.name] ?? '')}
                    onChange={(e) => set(f.name, e.target.value)}
                    options={f.options ?? []}
                    placeholder={f.required ? t('components.crud.select') : '—'}
                  />
                ) : f.kind === 'money' ? (
                  <MoneyInput
                    id={id}
                    value={{
                      amount: String(form[f.name] ?? ''),
                      currency: String(form[f.currencyField ?? 'currency'] || 'INR'),
                    }}
                    invalid={!!err}
                    onChange={(v) => {
                      set(f.name, v.amount);
                      set(f.currencyField ?? 'currency', v.currency);
                    }}
                  />
                ) : (
                  <Input
                    id={id}
                    type={f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text'}
                    inputMode={f.kind === 'int' ? 'numeric' : f.kind === 'decimal' ? 'decimal' : undefined}
                    value={String(form[f.name] ?? '')}
                    maxLength={f.maxLength ?? 300}
                    onChange={(e) => set(f.name, e.target.value)}
                    invalid={!!err}
                  />
                )
              }
            </Field>
          );
        })}
      </form>
    </Modal>
  );
}
