import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import {
  COMMISSION_SCOPES,
  financeApi,
  type CommissionRuleIn,
  type CommissionRuleOut,
  type CommissionScope,
  type Uuid,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, matchesSearch, useTableState } from '@hig/shared/lib';
import {
  Badge,
  Button as UiButton,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  TextCell,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatBps, formatDate, formatNumber, todayIsoDate, useDocumentTitle } from '../lib/shared';
import { enumLabel, ft, useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { financeKeys, useProcedureLookup, useSaveCommissionRule, useSpecialtyLookup, useToggleCommissionRule } from '../api/queries';
import { EnumSelect, notifyError, notifySuccess, useSearchBox } from '../components/finance';
import { PayeePicker } from '../components/settlements';
import { useFinancePermissions } from '../lib/permissions';
import { bpsToPercentText, percentToBps } from '../lib/rates';
import { Button, Callout, Field, Input, Modal, Select } from '../components/ui';

/** What a rule applies to, in the current UI language (call at render time). */
function scopeTarget(r: CommissionRuleOut): string {
  switch (r.scope) {
    case 'global':
      return ft('commissionRules.allBookings');
    case 'hospital':
      return r.hospital_name ?? r.hospital_id ?? '—';
    case 'specialty':
      return r.specialty_name ?? r.specialty_id ?? '—';
    case 'procedure': {
      const procedure = r.procedure_name ?? r.procedure_id ?? '';
      return r.hospital_id
        ? ft('commissionRules.procedureAt', { procedure, hospital: r.hospital_name ?? r.hospital_id })
        : procedure;
    }
    case 'agent':
      return r.agent_name ?? r.agent_id ?? '—';
    default:
      return '—';
  }
}

// ---------------------------------------------------------------------------------------------------------
// State: inactive (switched off) / scheduled (starts later) / expired (ended) / active (in effect today)
// ---------------------------------------------------------------------------------------------------------
/** Catalog: commissionRules.states.<state> */
const STATES = ['active', 'scheduled', 'expired', 'inactive'] as const;
type RuleState = (typeof STATES)[number];
const STATE_TONES = { active: 'success', scheduled: 'warning', expired: 'neutral', inactive: 'neutral' } as const;
const stateLabel = (s: RuleState) => ft(`commissionRules.states.${s}`);

function ruleState(r: CommissionRuleOut, today: string): RuleState {
  if (!r.is_active) return 'inactive';
  if (r.effective_from > today) return 'scheduled';
  if (r.effective_to && r.effective_to < today) return 'expired';
  return 'active';
}

/** The rule is in effect on at least one day of the [from, to] window. */
function overlaps(r: CommissionRuleOut, from: string, to: string): boolean {
  if (to && r.effective_from > to) return false;
  if (from && r.effective_to && r.effective_to < from) return false;
  return true;
}

const FILTERS = {
  q: filterParam.text(),
  state: filterParam.oneOf(STATES),
  scope: filterParam.list(COMMISSION_SCOPES),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['scope', 'target', 'rate', 'effective', 'created'] as const;

// ---------------------------------------------------------------------------------------------------------
// Columns (client-side sorting: the whole rule set is loaded at once)
// ---------------------------------------------------------------------------------------------------------
function baseColumns(t: FinanceT, today: string): DataTableColumn<CommissionRuleOut>[] {
  return [
    {
      key: 'target',
      header: t('commissionRules.columns.appliesTo'),
      sortable: true,
      sortValue: (r) => scopeTarget(r),
      sticky: true,
      mobile: 'primary',
      className: 'max-w-72',
      cell: (r) => <TextCell primary={<span className="font-medium">{scopeTarget(r)}</span>} secondary={enumLabel('commissionScope', r.scope)} />,
      exportValue: (r) => scopeTarget(r),
    },
    {
      key: 'scope',
      header: t('commissionRules.columns.scope'),
      sortable: true,
      sortValue: (r) => COMMISSION_SCOPES.indexOf(r.scope),
      mobile: 'badge',
      cell: (r) => <Badge tone={r.scope === 'agent' ? 'accent' : 'info'}>{enumLabel('commissionScope', r.scope)}</Badge>,
      exportValue: (r) => enumLabel('commissionScope', r.scope),
    },
    {
      key: 'rate',
      header: t('commissionRules.columns.rate'),
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (r) => r.rate_bps,
      mobile: 'secondary',
      cell: (r) => (
        <span className="block text-end tabular-nums">
          <span className="font-semibold">{formatBps(r.rate_bps)}</span>
          <span className="block text-xs text-muted">{t('commissionRules.bps', { bps: formatNumber(r.rate_bps) })}</span>
        </span>
      ),
      exportValue: (r) => r.rate_bps / 100,
    },
    {
      key: 'effective',
      header: t('commissionRules.columns.effective'),
      sortable: true,
      sortDescFirst: true,
      sortValue: (r) => r.effective_from,
      cell: (r) => (
        <span className="block whitespace-nowrap tabular-nums">
          {formatDate(r.effective_from)} <span className="inline-block text-muted rtl:-scale-x-100">→</span>{' '}
          {r.effective_to ? formatDate(r.effective_to) : <span className="text-muted">{t('commissionRules.openEnded')}</span>}
        </span>
      ),
      exportValue: (r) => `${r.effective_from} - ${r.effective_to ?? ''}`,
    },
    {
      key: 'state',
      header: t('orders.columns.status'),
      mobile: 'badge',
      cell: (r) => {
        const s = ruleState(r, today);
        return (
          <Badge tone={STATE_TONES[s]} dot>
            {stateLabel(s)}
          </Badge>
        );
      },
      exportValue: (r) => stateLabel(ruleState(r, today)),
    },
    {
      key: 'created',
      header: t('orders.columns.created'),
      sortable: true,
      sortDescFirst: true,
      sortValue: (r) => r.created_at,
      defaultHidden: true,
      cell: (r) => <DateCell value={r.created_at} display="relative" className="text-muted" />,
      exportValue: (r) => r.created_at,
    },
  ];
}

export default function CommissionRulesPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('nav.items.commissionRules'));
  const perms = useFinancePermissions();
  const table = useTableState({ filters: FILTERS, defaultSort: '-effective', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const rules = useQuery({
    queryKey: [...financeKeys.all, 'commission-rules', 'all'],
    queryFn: () => fetchAllPages((page, size) => financeApi.listCommissionRulesPage({ page, page_size: size })),
  });
  const toggle = useToggleCommissionRule();
  const [editing, setEditing] = useState<CommissionRuleOut | 'new' | null>(null);
  const today = todayIsoDate();

  // every filter except the state tab, then the tab (so the tab counts follow the other filters)
  const base = useMemo(
    () =>
      (rules.data ?? [])
        .filter(matchesSearch(filters.q, (r) => [scopeTarget(r), enumLabel('commissionScope', r.scope), formatBps(r.rate_bps)]))
        .filter((r) => !filters.scope.length || filters.scope.includes(r.scope))
        .filter((r) => overlaps(r, filters.from, filters.to)),
    // `t` changes with the language: the searchable labels are translated
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules.data, filters.q, filters.scope, filters.from, filters.to, t],
  );
  const stateCounts = useMemo(() => {
    const out: Record<RuleState, number> = { active: 0, scheduled: 0, expired: 0, inactive: 0 };
    for (const r of base) out[ruleState(r, today)] += 1;
    return out;
  }, [base, today]);
  const rows = filters.state ? base.filter((r) => ruleState(r, today) === filters.state) : base;
  const scopeCounts = useMemo(() => {
    const out: Partial<Record<CommissionScope, number>> = {};
    for (const r of rules.data ?? []) out[r.scope] = (out[r.scope] ?? 0) + 1;
    return out;
  }, [rules.data]);

  const columns: DataTableColumn<CommissionRuleOut>[] = [
    ...baseColumns(t, today),
    {
      key: 'actions',
      header: <span className="sr-only">{t('orderDetail.actions')}</span>,
      title: t('orderDetail.actions'),
      align: 'end',
      hideable: false,
      exportable: false,
      mobile: 'secondary',
      cell: (r) =>
        perms.editCommissionRules ? (
          <span className="flex justify-end gap-1.5">
            <UiButton size="xs" variant="outline" onClick={() => setEditing(r)} leftIcon={<Pencil className="size-3.5" aria-hidden />}>
              {t('commissionRules.edit')}
            </UiButton>
            <UiButton
              size="xs"
              variant="ghost"
              loading={toggle.isPending && toggle.variables?.id === r.id}
              onClick={() =>
                toggle.mutate(
                  { id: r.id, is_active: !r.is_active },
                  {
                    onSuccess: () => notifySuccess(r.is_active ? ft('commissionRules.deactivated') : ft('commissionRules.activated')),
                    onError: (e) => notifyError(e, ft('commissionRules.updateFailed')),
                  },
                )
              }
            >
              {r.is_active ? t('commissionRules.deactivate') : t('commissionRules.activate')}
            </UiButton>
          </span>
        ) : null,
    },
  ];

  const quickItems: QuickFilterItem<RuleState>[] = [
    { value: '', label: t('common.all'), count: rules.data ? base.length : undefined },
    ...STATES.map((s) => ({ value: s, label: stateLabel(s), count: rules.data ? stateCounts[s] : undefined })),
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items.commissionRules')}
        description={t('commissionRules.description')}
        actions={
          perms.editCommissionRules && (
            <UiButton onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" aria-hidden />}>
              {t('commissionRules.newRule')}
            </UiButton>
          )
        }
      />
      <DataTable
        id="admin.finance.commission-rules"
        caption={t('nav.items.commissionRules')}
        table={table}
        columns={columns}
        rows={rules.data ? rows : undefined}
        loading={rules.isLoading}
        fetching={rules.isFetching && !rules.isLoading}
        error={rules.error}
        onRetry={() => void rules.refetch()}
        emptyTitle={t('commissionRules.emptyTitle')}
        emptyDescription={t('commissionRules.emptyDescription')}
        emptyAction={
          perms.editCommissionRules ? (
            <UiButton variant="outline" onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" aria-hidden />}>
              {t('commissionRules.newRule')}
            </UiButton>
          ) : undefined
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('commissionRules.statusLabel')} items={quickItems} value={filters.state} onChange={(s) => setFilter('state', s)} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('commissionRules.searchPlaceholder') }}
            onReset={table.resetFilters}
            resultCount={rules.data ? rows.length : undefined}
            resultLabel={(n) => t('commissionRules.ruleCount', { count: n, n: formatNumber(n) })}
            actions={<ExportButton filename="commission-rules" columns={columns} rows={rows} />}
          >
            <MultiSelectFilter
              label={t('commissionRules.columns.scope')}
              value={filters.scope}
              onChange={(v) => setFilter('scope', v)}
              options={COMMISSION_SCOPES.map((s) => ({ value: s, label: enumLabel('commissionScope', s), count: rules.data ? (scopeCounts[s] ?? 0) : undefined }))}
            />
            <DateRangeFilter label={t('commissionRules.inEffect')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('commissionRules.newTitle') : t('commissionRules.editTitle')}
        size="lg"
      >
        {editing !== null && (
          <RuleForm key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  );
}


function RuleForm({ rule, onDone }: { rule: CommissionRuleOut | null; onDone: () => void }) {
  const { t } = useFinanceTranslation();
  const save = useSaveCommissionRule();
  const [scope, setScope] = useState<CommissionScope>(rule?.scope ?? 'hospital');
  const [hospitalId, setHospitalId] = useState<string>(rule?.hospital_id ?? '');
  const [specialtyId, setSpecialtyId] = useState<string>(rule?.specialty_id ?? '');
  const [procedureId, setProcedureId] = useState<string>(rule?.procedure_id ?? '');
  const [agentId, setAgentId] = useState<string>(rule?.agent_id ?? '');
  const [percent, setPercent] = useState(rule ? bpsToPercentText(rule.rate_bps) : '');
  const [from, setFrom] = useState(rule?.effective_from ?? todayIsoDate());
  const [to, setTo] = useState(rule?.effective_to ?? '');
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [submitted, setSubmitted] = useState(false);

  const bps = percentToBps(percent);
  const errors: Record<string, string | null> = {
    rate: percent.trim() === '' ? (submitted ? t('commissionRules.form.rateRequired') : null) : bps === null ? t('commissionRules.form.rateInvalid') : null,
    hospital: submitted && scope === 'hospital' && !hospitalId ? t('commissionRules.form.chooseHospital') : null,
    specialty: submitted && scope === 'specialty' && !specialtyId ? t('commissionRules.form.chooseSpecialty') : null,
    procedure: submitted && scope === 'procedure' && !procedureId ? t('commissionRules.form.chooseProcedure') : null,
    agent: submitted && scope === 'agent' && !agentId ? t('commissionRules.form.chooseAgent') : null,
    from: submitted && !from ? t('commissionRules.form.chooseStart') : null,
    to: to && from && to < from ? t('commissionRules.form.endBeforeStart') : null,
  };

  const submit = () => {
    setSubmitted(true);
    const missingTarget =
      (scope === 'hospital' && !hospitalId) ||
      (scope === 'specialty' && !specialtyId) ||
      (scope === 'procedure' && !procedureId) ||
      (scope === 'agent' && !agentId);
    if (bps === null || missingTarget || !from || (to && to < from)) return;
    const body: CommissionRuleIn = {
      scope,
      hospital_id: scope === 'hospital' || scope === 'procedure' ? ((hospitalId || null) as Uuid | null) : null,
      specialty_id: scope === 'specialty' ? (specialtyId as Uuid) : null,
      procedure_id: scope === 'procedure' ? (procedureId as Uuid) : null,
      agent_id: scope === 'agent' ? (agentId as Uuid) : null,
      rate_bps: bps,
      effective_from: from,
      effective_to: to || null,
      is_active: active,
    };
    save.mutate(
      { id: rule?.id, body },
      {
        onSuccess: () => {
          notifySuccess(rule ? ft('commissionRules.form.updated') : ft('commissionRules.form.created'));
          onDone();
        },
        onError: (e) => notifyError(e, ft('commissionRules.form.saveFailed')),
      },
    );
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('commissionRules.columns.scope')} required>
          {(p) => (
            <EnumSelect id={p.id} value={scope} values={COMMISSION_SCOPES} enumGroup="commissionScope" includeAll={false}
              onChange={(v) => v && setScope(v)} />
          )}
        </Field>
        <Field
          label={t('commissionRules.form.rate')}
          required
          error={errors.rate}
          hint={bps !== null ? t('commissionRules.form.basisPoints', { bps: formatNumber(bps) }) : t('commissionRules.form.rateHint')}
        >
          {(p) => (
            <div className="relative">
              <Input {...p} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className="pe-8" placeholder="15" />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </div>
          )}
        </Field>
      </div>

      {scope === 'agent' && <Callout tone="info">{t('commissionRules.form.agentNote')}</Callout>}

      {(scope === 'hospital' || scope === 'procedure') && (
        <Field
          label={scope === 'procedure' ? t('commissionRules.form.hospitalOptional') : t('reconciliation.hospital')}
          required={scope === 'hospital'}
          error={errors.hospital}
        >
          {(p) => (
            <PayeePicker
              id={p.id}
              payeeType="hospital"
              value={hospitalId}
              onChange={setHospitalId}
              allowAll={scope === 'procedure'}
              allLabel={t('commissionRules.form.anyHospital')}
              selectedLabel={rule?.hospital_name}
            />
          )}
        </Field>
      )}
      {scope === 'specialty' && (
        <Field label={enumLabel('commissionScope', 'specialty')} required error={errors.specialty}>
          {(p) => <SpecialtyPicker id={p.id} value={specialtyId} onChange={setSpecialtyId} />}
        </Field>
      )}
      {scope === 'procedure' && (
        <Field label={enumLabel('commissionScope', 'procedure')} required error={errors.procedure}>
          {(p) => <ProcedurePicker id={p.id} value={procedureId} onChange={setProcedureId} selectedLabel={rule?.procedure_name} />}
        </Field>
      )}
      {scope === 'agent' && (
        <Field label={enumLabel('commissionScope', 'agent')} required error={errors.agent}>
          {(p) => (
            <PayeePicker id={p.id} payeeType="agent" value={agentId} onChange={setAgentId} allowAll={false} selectedLabel={rule?.agent_name} />
          )}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('commissionRules.form.effectiveFrom')} required error={errors.from}>
          {(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label={t('commissionRules.form.effectiveTo')} hint={t('commissionRules.form.effectiveToHint')} error={errors.to}>
          {(p) => <Input {...p} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />}
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" className="size-4 accent-green-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {enumLabel('status', 'active')}
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {rule ? t('commissionRules.form.saveChanges') : t('commissionRules.form.createRule')}
        </Button>
      </div>
    </form>
  );
}

function SpecialtyPicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useFinanceTranslation();
  const specialties = useSpecialtyLookup();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        {specialties.isLoading
          ? t('ui.loading')
          : specialties.isError
            ? t('commissionRules.form.specialtiesFailed')
            : t('commissionRules.form.selectSpecialty')}
      </option>
      {(specialties.data ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

function ProcedurePicker({ id, value, onChange, selectedLabel }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  selectedLabel?: string | null;
}) {
  const { t } = useFinanceTranslation();
  const [committed, setCommitted] = useState('');
  const [text, setText] = useSearchBox(committed, setCommitted, 300);
  const procedures = useProcedureLookup(committed);
  const options = procedures.data ?? [];
  const missing = value && !options.some((p) => p.id === value);
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row">
      <Input
        aria-label={t('commissionRules.form.searchProcedures')}
        placeholder={t('commissionRules.form.searchProceduresPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="sm:w-44"
      />
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="sm:min-w-56">
        <option value="" disabled>
          {procedures.isLoading ? t('ui.loading') : t('commissionRules.form.selectProcedure')}
        </option>
        {missing && <option value={value}>{selectedLabel ?? t('settlementUi.picker.selected', { id: value.slice(0, 8) })}</option>}
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.specialty.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
