import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Globe, Lock, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { adminApi, type PlatformSettingOut } from '@hig/shared/api';
import { Badge, Button, Card, ErrorState, Input, LoadingState, PageHeader, Textarea } from '../ui';
import { bpsToPctInput, formatDateTime, pctInputToBps, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { isFinanceSettingKey } from '../lib/permissions';
import { useOpsPermissions } from '../lib/session';
import { useSettings } from '../lib/settings';
import { opsPaths } from '../lib/paths';

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

interface SettingMeta {
  label: string;
  description: string;
  editor: EditorKind;
  group: string;
}

const META: Record<string, SettingMeta> = {
  default_commission_bps: {
    label: 'Default hospital commission',
    description: 'Platform commission on hospital revenue when no hospital or rule-specific rate applies.',
    editor: 'bps',
    group: 'Commercial',
  },
  default_agent_commission_bps: {
    label: 'Default agent commission',
    description: 'Paid to referring agents out of the platform commission.',
    editor: 'bps',
    group: 'Commercial',
  },
  patient_service_fee_bps: {
    label: 'Patient service fee',
    description: 'Added on top of the treatment price at booking.',
    editor: 'bps',
    group: 'Commercial',
  },
  deposit_pct: {
    label: 'Booking deposit',
    description: 'Share of the booking total required to confirm a booking (deposit option).',
    editor: 'pct',
    group: 'Commercial',
  },
  gst_rate_bps: { label: 'GST on commission', description: 'GST charged on platform commission.', editor: 'bps', group: 'Tax' },
  tds_194o_rate_bps: {
    label: 'TDS (section 194-O)',
    description: 'Tax deducted at source on hospital gross amount.',
    editor: 'bps',
    group: 'Tax',
  },
  settlement_hold_days: {
    label: 'Settlement hold',
    description: 'Days after treatment completion before items become eligible for payout.',
    editor: 'days',
    group: 'Settlements',
  },
  settlement_cycle_days: {
    label: 'Default settlement cycle',
    description: 'Days between automatic payout batches (hospitals may override).',
    editor: 'days',
    group: 'Settlements',
  },
  refund_policy: {
    label: 'Refund policy',
    description: 'Refund percentage by days before admission. The first matching tier (highest days first) applies.',
    editor: 'refund_policy',
    group: 'Settlements',
  },
  cancellation_retention_hospital_share_bps: {
    label: 'Cancellation retention: hospital share',
    description: 'Share of the amount retained on a cancellation that goes to the hospital (100% = all to the hospital).',
    editor: 'bps',
    group: 'Settlements',
  },
  agent_tds_rate_bps: {
    label: 'Agent TDS (section 194H)',
    description: 'Tax deducted at source on commission paid to resident agents.',
    editor: 'bps',
    group: 'Tax',
  },
  agent_nonresident_withholding_bps: {
    label: 'Non-resident agent withholding',
    description: 'Withholding on commission paid to non-resident agents (set per CA / DTAA advice).',
    editor: 'bps',
    group: 'Tax',
  },
  platform_gstin: {
    label: 'Platform GSTIN',
    description: 'Supplier GSTIN printed on commission tax invoices and credit notes.',
    editor: 'text',
    group: 'Tax',
  },
  platform_gst_state: {
    label: 'Platform GST state',
    description: 'State of registration: CGST + SGST when the hospital is in the same state, IGST otherwise.',
    editor: 'text',
    group: 'Tax',
  },
  refund_dual_approval_threshold_minor: {
    label: 'Refund dual-approval threshold',
    description:
      'Refunds above this amount (converted to INR) must be approved by a finance user other than the requester. 0 = every refund needs a second approver.',
    editor: 'inr_minor',
    group: 'Payments',
  },
  fx_rate_max_age_hours: {
    label: 'Maximum FX rate age',
    description:
      'Foreign-currency orders are refused (fx_rate_unavailable) in production when the stored exchange rate is older than this. 0 disables the check.',
    editor: 'hours',
    group: 'Payments',
  },
  bank_transfer_details: {
    label: 'Bank transfer details',
    description: 'Shown to patients who pay by SWIFT / bank transfer.',
    editor: 'string_map',
    group: 'Payments',
  },
  supported_currencies: {
    label: 'Supported currencies',
    description: 'ISO-4217 codes patients may pay in.',
    editor: 'string_list',
    group: 'Patient support',
  },
};

const GROUP_ORDER = ['Commercial', 'Tax', 'Settlements', 'Payments', 'Patient support', 'Other'];

function metaFor(s: PlatformSettingOut): SettingMeta {
  return (
    META[s.key] ?? {
      label: s.key,
      description: 'Raw JSON value.',
      editor:
        typeof s.value === 'number' && s.key.endsWith('_bps')
          ? 'bps'
          : typeof s.value === 'number' && s.key.endsWith('_days')
            ? 'days'
            : 'json',
      group: 'Other',
    }
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const perms = useOpsPermissions();
  const q = useSettings();

  const groups = useMemo(() => {
    const map = new Map<string, PlatformSettingOut[]>();
    for (const s of q.data ?? []) {
      if (s.group === 'website') continue; // edited on System -> Website & contact
      const g = metaFor(s).group;
      map.set(g, [...(map.get(g) ?? []), s]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [q.data]);

  return (
    <div>
      <PageHeader
        title="Platform settings"
        description="Changes take effect immediately and are recorded in the audit log. Finance settings can only be changed by finance staff or a super admin."
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <Card>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Globe className="size-4 text-slate-500" aria-hidden />
              Helplines, WhatsApp, social links, analytics, search-engine verification, marketing claims, medical reviewers and the
              footer are edited on
              <Link to={opsPaths.website} className="font-medium underline">
                Website &amp; contact
              </Link>
              (super admin).
            </p>
          </Card>
          {groups.map(([group, settings]) => (
            <Card key={group} title={group}>
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
  const meta = metaFor(setting);
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
    success: `${meta.label} updated`,
    invalidate: [opsKeys.settings],
  });

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
              <Lock className="size-3" aria-hidden /> Finance
            </Badge>
          )}
          {setting.is_default && <Badge>Default</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{meta.description}</p>
        <p className="mt-1 font-mono text-[11px] text-slate-400">{setting.key}</p>
        {setting.updated_at && (
          <p className="mt-1 text-[11px] text-slate-400">
            Updated {formatDateTime(setting.updated_at)}
            {setting.updated_by_name ? ` by ${setting.updated_by_name}` : ''}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <SettingEditor key={version} kind={meta.editor} value={draft} disabled={!canEdit} onChange={onChange} />
        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
        {canEdit ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={!dirty || !valid} loading={save.isPending} onClick={() => save.mutate(draft)}>
              Save
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => {
                  onChange(setting.value);
                  setVersion((v) => v + 1);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Lock className="size-3" aria-hidden /> Read-only for your role
          </p>
        )}
      </div>
    </div>
  );
}

type OnChange = (value: unknown, valid?: boolean, error?: string | null) => void;

function SettingEditor({ kind, value, disabled, onChange }: { kind: EditorKind; value: unknown; disabled: boolean; onChange: OnChange }) {
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
          suffix={kind === 'pct' ? '%' : kind}
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
  const [text, setText] = useState(bpsToPctInput(value));
  return (
    <Suffixed suffix={`% (${value ?? '—'} bps)`}>
      <Input
        aria-label="Percentage"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const bps = pctInputToBps(e.target.value);
          if (bps === undefined || bps === null) onChange(value, false, 'Enter a percentage between 0 and 100.');
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
            onChange(value, false, `Enter a whole number between 0 and ${max}.`);
          } else onChange(n);
        }}
      />
    </Suffixed>
  );
}

/** Whole rupees in the input; stored as INR minor units (paise). */
function InrMinorEditor({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: OnChange }) {
  const [text, setText] = useState(value === null ? '' : String(value / 100));
  const fmt = (minor: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minor / 100);
  return (
    <Suffixed suffix={value === null ? 'INR' : `INR (${fmt(value)})`}>
      <Input
        aria-label="Amount in INR"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.replace(/,/g, '').trim();
          const n = Number(raw);
          if (raw === '' || !/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(n) || n > 10_000_000_000) {
            onChange(value, false, 'Enter an amount in rupees (up to 2 decimals); 0 means every refund needs a second approver.');
          } else onChange(Math.round(n * 100));
        }}
      />
    </Suffixed>
  );
}

function TextEditor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: OnChange }) {
  const [text, setText] = useState(value);
  return (
    <Input
      aria-label="Value"
      className="max-w-xs"
      value={text}
      disabled={disabled}
      maxLength={100}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value.trim();
        if (!v) onChange(value, false, 'Enter a value.');
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
  const tiers: RefundTier[] = Array.isArray(value)
    ? value.map((t) => ({
        days_before: Number((t as RefundTier).days_before) || 0,
        refund_pct: Number((t as RefundTier).refund_pct) || 0,
      }))
    : [];
  const emit = (next: RefundTier[]) => {
    const bad = next.some(
      (t) => !Number.isInteger(t.days_before) || t.days_before < 0 || t.refund_pct < 0 || t.refund_pct > 100 || !Number.isInteger(t.refund_pct),
    );
    const days = next.map((t) => t.days_before);
    const dupes = new Set(days).size !== days.length;
    const sorted = [...next].sort((a, b) => b.days_before - a.days_before);
    onChange(
      sorted,
      !bad && !dupes && next.length > 0,
      bad ? 'Days must be whole numbers ≥ 0 and refunds 0–100%.' : dupes ? 'Each "days before" value must be unique.' : next.length === 0 ? 'Add at least one tier.' : null,
    );
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-500">
        <span>At least N days before admission</span>
        <span>Refund %</span>
        <span className="w-8" />
      </div>
      {tiers.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <Input
            aria-label="Days before"
            inputMode="numeric"
            value={String(t.days_before)}
            disabled={disabled}
            onChange={(e) => emit(tiers.map((x, j) => (j === i ? { ...x, days_before: Number(e.target.value) } : x)))}
          />
          <Input
            aria-label="Refund percent"
            inputMode="numeric"
            value={String(t.refund_pct)}
            disabled={disabled}
            onChange={(e) => emit(tiers.map((x, j) => (j === i ? { ...x, refund_pct: Number(e.target.value) } : x)))}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label="Remove tier"
            disabled={disabled}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => emit(tiers.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {!disabled && (
        <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => emit([...tiers, { days_before: 0, refund_pct: 0 }])}>
          Add tier
        </Button>
      )}
    </div>
  );
}

function StringMapEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: OnChange }) {
  const initial = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
  const [rows, setRows] = useState<[string, string][]>(initial.map(([k, v]) => [k, v == null ? '' : String(v)]));
  const emit = (next: [string, string][]) => {
    setRows(next);
    const keys = next.map(([k]) => k.trim());
    const ok = keys.every(Boolean) && new Set(keys).size === keys.length;
    onChange(Object.fromEntries(next.map(([k, v]) => [k.trim(), v.trim()])), ok, ok ? null : 'Keys must be unique and non-empty.');
  };
  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
          <Input aria-label="Key" value={k} disabled={disabled} maxLength={60} onChange={(e) => emit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
          <Input aria-label="Value" value={v} disabled={disabled} maxLength={300} onChange={(e) => emit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <Button
            size="sm"
            variant="ghost"
            aria-label="Remove entry"
            disabled={disabled}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => emit(rows.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {!disabled && (
        <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => emit([...rows, ['', '']])}>
          Add entry
        </Button>
      )}
    </div>
  );
}

function StringListEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: OnChange }) {
  const list = Array.isArray(value) ? value.map(String) : [];
  const [text, setText] = useState(list.join(', '));
  return (
    <div className="space-y-2">
      <Input
        aria-label="Values"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const items = e.target.value
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
          const ok = items.length > 0 && items.every((c) => /^[A-Z]{3}$/.test(c));
          onChange(Array.from(new Set(items)), ok, ok ? null : 'Use 3-letter ISO currency codes separated by commas.');
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
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  return (
    <Textarea
      aria-label="JSON value"
      className="font-mono text-xs"
      rows={Math.min(12, Math.max(3, text.split('\n').length))}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          onChange(value, false, 'Invalid JSON.');
        }
      }}
    />
  );
}
