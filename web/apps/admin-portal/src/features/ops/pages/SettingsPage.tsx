import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Globe, Lock, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import { adminApi, type PlatformSettingOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { Badge, Button, Card, ErrorState, Input, LoadingState, PageHeader, Textarea } from '../ui';
import { bpsToPctInput, formatBps, formatDateTime, formatMoney, pctInputToBps, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { isFinanceSettingKey } from '../lib/permissions';
import { useOpsPermissions } from '../lib/session';
import { useSettings } from '../lib/settings';
import { opsPaths } from '../lib/paths';
import { SettingPendingChange } from '../components/DualControl';
import type { SettingWithPending } from '../lib/phase1Api';

/** SEC-011 / SEC-044: changes of these keys wait for a second finance user. */
const DUAL_CONTROL_KEYS: ReadonlySet<string> = new Set([
  'bank_transfer_details',
  'default_commission_bps',
  'default_agent_commission_bps',
]);
/** SEC-044: default commission rates (shown as percentages in the pending-change banner). */
const COMMISSION_KEYS: ReadonlySet<string> = new Set(['default_commission_bps', 'default_agent_commission_bps']);
const bpsText = (value: unknown): string => (typeof value === 'number' ? formatBps(value) : String(value ?? '—'));

type EditorKind =
  | 'bps'
  | 'pct'
  | 'days'
  | 'hours'
  | 'inr_minor'
  | 'text'
  | 'refund_policy'
  | 'string_map'
  | 'string_list'
  | 'json';

type SettingGroup = 'commercial' | 'tax' | 'settlements' | 'payments' | 'patientSupport' | 'other';

interface SettingMeta {
  label: string;
  description: string;
  editor: EditorKind;
  group: SettingGroup;
}

/** Known settings: editor + group. Label and description: `settings.items.<key>.label|description`. */
const META: Record<string, { editor: EditorKind; group: SettingGroup; /** catalog prefix of label/description */ i18nKey?: string }> = {
  default_commission_bps: { editor: 'bps', group: 'commercial' },
  default_agent_commission_bps: { editor: 'bps', group: 'commercial' },
  patient_service_fee_bps: { editor: 'bps', group: 'commercial' },
  deposit_pct: { editor: 'pct', group: 'commercial' },
  gst_rate_bps: { editor: 'bps', group: 'tax' },
  tds_194o_rate_bps: { editor: 'bps', group: 'tax' },
  settlement_hold_days: { editor: 'days', group: 'settlements' },
  settlement_cycle_days: { editor: 'days', group: 'settlements' },
  refund_policy: { editor: 'refund_policy', group: 'settlements' },
  cancellation_retention_hospital_share_bps: { editor: 'bps', group: 'settlements' },
  agent_tds_rate_bps: { editor: 'bps', group: 'tax' },
  agent_nonresident_withholding_bps: { editor: 'bps', group: 'tax' },
  platform_gstin: { editor: 'text', group: 'tax' },
  platform_gst_state: { editor: 'text', group: 'tax' },
  refund_dual_approval_threshold_minor: { editor: 'inr_minor', group: 'payments' },
  fx_rate_max_age_hours: { editor: 'hours', group: 'payments' },
  bank_transfer_details: { editor: 'string_map', group: 'payments' },
  supported_currencies: { editor: 'string_list', group: 'patientSupport' },
  referral_programme: { editor: 'json', group: 'payments', i18nKey: 'referral.setting' },
};

const GROUP_ORDER: SettingGroup[] = ['commercial', 'tax', 'settlements', 'payments', 'patientSupport', 'other'];

function metaFor(s: PlatformSettingOut, t: TFunction): SettingMeta {
  const known = META[s.key];
  if (known) {
    const prefix = known.i18nKey ?? `settings.items.${s.key}`;
    return { editor: known.editor, group: known.group, label: t(`${prefix}.label`), description: t(`${prefix}.description`) };
  }
  return {
    label: s.key,
    description: t('settings.rawJson'),
    editor:
      typeof s.value === 'number' && s.key.endsWith('_bps')
        ? 'bps'
        : typeof s.value === 'number' && s.key.endsWith('_days')
          ? 'days'
          : 'json',
    group: 'other',
  };
}

export default function SettingsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('settings.documentTitle'));
  const perms = useOpsPermissions();
  const q = useSettings();

  const groups = useMemo(() => {
    const map = new Map<SettingGroup, PlatformSettingOut[]>();
    for (const s of q.data ?? []) {
      if (s.group === 'website') continue; // edited on System -> Website & contact
      const g = metaFor(s, t).group;
      map.set(g, [...(map.get(g) ?? []), s]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [q.data, t]);

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <Card>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Globe className="size-4 text-slate-500" aria-hidden />
              <Trans
                t={t}
                i18nKey="settings.websiteNotice"
                components={{ 0: <Link to={opsPaths.website} className="font-medium underline" /> }}
              />
            </p>
          </Card>
          {groups.map(([group, settings]) => (
            <Card key={group} title={t(`settings.groups.${group}`)}>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {settings.map((s) => {
                  const finance = isFinanceSettingKey(s.key);
                  const canEdit = finance ? perms.editFinanceSettings : perms.editGeneralSettings;
                  return <SettingRow key={s.key} setting={s} canEdit={canEdit} finance={finance} />;
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingRow({ setting, canEdit, finance }: { setting: PlatformSettingOut; canEdit: boolean; finance: boolean }) {
  const { t } = useAppTranslation();
  const meta = metaFor(setting, t);
  const [draft, setDraft] = useState<unknown>(setting.value);
  const [error, setError] = useState<string | null>(null);
  const [valid, setValid] = useState(true);
  /** bumped to re-mount the editor (reset / server value changed) */
  const [version, setVersion] = useState(0);
  const savedJson = JSON.stringify(setting.value);

  useEffect(() => {
    setDraft(setting.value);
    setError(null);
    setValid(true);
    setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedJson]);

  const save = useOpsMutation({
    mutationFn: (value: unknown) => adminApi.updateSetting(setting.key, value),
    success: (result) =>
      (result as SettingWithPending).pending_change && DUAL_CONTROL_KEYS.has(setting.key)
        ? t('security.setting.sentForApproval', { label: meta.label })
        : t('settings.updated', { label: meta.label }),
    invalidate: [opsKeys.settings],
  });
  const dualControl = DUAL_CONTROL_KEYS.has(setting.key);

  const dirty = JSON.stringify(draft) !== savedJson;
  const onChange = (value: unknown, ok = true, message: string | null = null) => {
    setDraft(value);
    setValid(ok);
    setError(message);
  };

  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {meta.label}
          {finance && (
            <Badge tone="violet">
              <Lock className="size-3" aria-hidden /> {t('settings.financeBadge')}
            </Badge>
          )}
          {setting.is_default && <Badge>{t('settings.defaultBadge')}</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{meta.description}</p>
        <p className="mt-1 font-mono text-[11px] text-slate-400">{setting.key}</p>
        {setting.updated_at && (
          <p className="mt-1 text-[11px] text-slate-400">
            {setting.updated_by_name
              ? t('settings.updatedAtBy', { date: formatDateTime(setting.updated_at), name: setting.updated_by_name })
              : t('settings.updatedAt', { date: formatDateTime(setting.updated_at) })}
          </p>
        )}
      </div>
      <div className="space-y-2">
        {dualControl && (
          <SettingPendingChange
            setting={setting as SettingWithPending}
            label={meta.label}
            {...(COMMISSION_KEYS.has(setting.key)
              ? { formatValue: bpsText, checkBody: t('commissionApproval.settingCheckBody') }
              : {})}
          />
        )}
        {dualControl && canEdit && <p className="text-xs text-muted">{t('security.setting.dualControlNote')}</p>}
        <SettingEditor key={version} kind={meta.editor} value={draft} disabled={!canEdit} onChange={onChange} />
        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
        {canEdit ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={!dirty || !valid} loading={save.isPending} onClick={() => save.mutate(draft)}>
              {t('settings.save')}
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => {
                  onChange(setting.value);
                  setVersion((v) => v + 1);
                }}
              >
                {t('settings.reset')}
              </Button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Lock className="size-3" aria-hidden /> {t('settings.readOnly')}
          </p>
        )}
      </div>
    </div>
  );
}

type OnChange = (value: unknown, valid?: boolean, error?: string | null) => void;

function SettingEditor({ kind, value, disabled, onChange }: { kind: EditorKind; value: unknown; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  switch (kind) {
    case 'bps':
      return <BpsEditor value={typeof value === 'number' ? value : null} disabled={disabled} onChange={onChange} />;
    case 'pct':
    case 'days':
    case 'hours':
      return (
        <IntEditor
          value={typeof value === 'number' ? value : null}
          disabled={disabled}
          onChange={onChange}
          suffix={kind === 'pct' ? '%' : t(`settings.units.${kind}`)}
          max={kind === 'pct' ? 100 : kind === 'hours' ? 720 : 365}
        />
      );
    case 'inr_minor':
      return <InrMinorEditor value={typeof value === 'number' ? value : null} disabled={disabled} onChange={onChange} />;
    case 'text':
      return <TextEditor value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={onChange} />;
    case 'refund_policy':
      return <RefundPolicyEditor value={value} disabled={disabled} onChange={onChange} />;
    case 'string_map':
      return <StringMapEditor value={value} disabled={disabled} onChange={onChange} />;
    case 'string_list':
      return <StringListEditor value={value} disabled={disabled} onChange={onChange} />;
    default:
      return <JsonEditor value={value} disabled={disabled} onChange={onChange} />;
  }
}

function Suffixed({ children, suffix }: { children: ReactNode; suffix: string }) {
  return (
    <div className="flex max-w-xs items-center gap-2">
      {children}
      <span className="text-sm text-slate-500">{suffix}</span>
    </div>
  );
}

function BpsEditor({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(bpsToPctInput(value));
  return (
    <Suffixed suffix={t('settings.editors.bpsSuffix', { bps: value ?? '—' })}>
      <Input
        aria-label={t('settings.editors.percentage')}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const bps = pctInputToBps(e.target.value);
          if (bps === undefined || bps === null) onChange(value, false, t('settings.editors.percentageError'));
          else onChange(bps);
        }}
      />
    </Suffixed>
  );
}

function IntEditor({
  value,
  disabled,
  onChange,
  suffix,
  max,
}: {
  value: number | null;
  disabled: boolean;
  onChange: OnChange;
  suffix: string;
  max: number;
}) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(value?.toString() ?? '');
  return (
    <Suffixed suffix={suffix}>
      <Input
        aria-label={suffix}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() === '' || !Number.isInteger(n) || n < 0 || n > max) {
            onChange(value, false, t('settings.editors.wholeNumberError', { max }));
          } else onChange(n);
        }}
      />
    </Suffixed>
  );
}

/** Whole rupees in the input; stored as INR minor units (paise). */
function InrMinorEditor({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(value === null ? '' : String(value / 100));
  return (
    <Suffixed suffix={value === null ? 'INR' : `INR (${formatMoney(value, 'INR')})`}>
      <Input
        aria-label={t('settings.editors.amountInr')}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.replace(/,/g, '').trim();
          const n = Number(raw);
          if (raw === '' || !/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(n) || n > 10_000_000_000) {
            onChange(value, false, t('settings.editors.amountInrError'));
          } else onChange(Math.round(n * 100));
        }}
      />
    </Suffixed>
  );
}

function TextEditor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(value);
  return (
    <Input
      aria-label={t('settings.editors.value')}
      className="max-w-xs"
      value={text}
      disabled={disabled}
      maxLength={100}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value.trim();
        if (!v) onChange(value, false, t('settings.editors.valueRequired'));
        else onChange(v);
      }}
    />
  );
}

interface RefundTier {
  days_before: number;
  refund_pct: number;
}

function RefundPolicyEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const tiers: RefundTier[] = Array.isArray(value)
    ? value.map((tier) => ({
        days_before: Number((tier as RefundTier).days_before) || 0,
        refund_pct: Number((tier as RefundTier).refund_pct) || 0,
      }))
    : [];
  const emit = (next: RefundTier[]) => {
    const bad = next.some(
      (x) => !Number.isInteger(x.days_before) || x.days_before < 0 || x.refund_pct < 0 || x.refund_pct > 100 || !Number.isInteger(x.refund_pct),
    );
    const days = next.map((x) => x.days_before);
    const dupes = new Set(days).size !== days.length;
    const sorted = [...next].sort((a, b) => b.days_before - a.days_before);
    onChange(
      sorted,
      !bad && !dupes && next.length > 0,
      bad
        ? t('settings.refundPolicy.invalidTier')
        : dupes
          ? t('settings.refundPolicy.duplicateDays')
          : next.length === 0
            ? t('settings.refundPolicy.noTiers')
            : null,
    );
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-500">
        <span>{t('settings.refundPolicy.daysHeader')}</span>
        <span>{t('settings.refundPolicy.refundHeader')}</span>
        <span className="w-8" />
      </div>
      {tiers.map((tier, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <Input
            aria-label={t('settings.refundPolicy.daysBefore')}
            inputMode="numeric"
            value={String(tier.days_before)}
            disabled={disabled}
            onChange={(e) => emit(tiers.map((x, j) => (j === i ? { ...x, days_before: Number(e.target.value) } : x)))}
          />
          <Input
            aria-label={t('settings.refundPolicy.refundPercent')}
            inputMode="numeric"
            value={String(tier.refund_pct)}
            disabled={disabled}
            onChange={(e) => emit(tiers.map((x, j) => (j === i ? { ...x, refund_pct: Number(e.target.value) } : x)))}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('settings.refundPolicy.removeTier')}
            disabled={disabled}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => emit(tiers.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {!disabled && (
        <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => emit([...tiers, { days_before: 0, refund_pct: 0 }])}>
          {t('settings.refundPolicy.addTier')}
        </Button>
      )}
    </div>
  );
}

function StringMapEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const initial = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
  const [rows, setRows] = useState<[string, string][]>(initial.map(([k, v]) => [k, v == null ? '' : String(v)]));
  const emit = (next: [string, string][]) => {
    setRows(next);
    const keys = next.map(([k]) => k.trim());
    const ok = keys.every(Boolean) && new Set(keys).size === keys.length;
    onChange(Object.fromEntries(next.map(([k, v]) => [k.trim(), v.trim()])), ok, ok ? null : t('settings.stringMap.keysError'));
  };
  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
          <Input
            aria-label={t('settings.stringMap.key')}
            value={k}
            disabled={disabled}
            maxLength={60}
            onChange={(e) => emit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
          />
          <Input
            aria-label={t('settings.stringMap.value')}
            value={v}
            disabled={disabled}
            maxLength={300}
            onChange={(e) => emit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('settings.stringMap.removeEntry')}
            disabled={disabled}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => emit(rows.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {!disabled && (
        <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => emit([...rows, ['', '']])}>
          {t('settings.stringMap.addEntry')}
        </Button>
      )}
    </div>
  );
}

function StringListEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const list = Array.isArray(value) ? value.map(String) : [];
  const [text, setText] = useState(list.join(', '));
  return (
    <div className="space-y-2">
      <Input
        aria-label={t('settings.stringList.values')}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const items = e.target.value
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
          const ok = items.length > 0 && items.every((c) => /^[A-Z]{3}$/.test(c));
          onChange(Array.from(new Set(items)), ok, ok ? null : t('settings.stringList.error'));
        }}
      />
      <div className="flex flex-wrap gap-1">
        {list.map((c) => (
          <Badge key={c}>{c}</Badge>
        ))}
      </div>
    </div>
  );
}

function JsonEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: OnChange }) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  return (
    <Textarea
      aria-label={t('settings.json.label')}
      className="font-mono text-xs"
      dir="ltr"
      rows={Math.min(12, Math.max(3, text.split('\n').length))}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          onChange(value, false, t('settings.json.invalid'));
        }
      }}
    />
  );
}
