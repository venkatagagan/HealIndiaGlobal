import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, Lock, MessageCircle, PhoneCall, Plus, Trash2 } from 'lucide-react';
import { adminApi, type PlatformSettingOut } from '@hig/shared/api';
import { Badge, Button, Card, Checkbox, ErrorState, Field, Input, LoadingState, PageHeader, Select, Switch, Textarea } from '../ui';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';
import { useSettings } from '../lib/settings';

/**
 * System -> Website & contact: the public website's contact numbers, floating buttons, social links, analytics,
 * search-engine verification, marketing claims, medical reviewers and footer. Stored as platform settings (one key per
 * card, see backend app/core/site_settings.py); only a super admin may save, every staff role can view. The website
 * reads them from GET /site-config and is revalidated automatically after each save, so changes are live in seconds.
 */

type Errors = Record<string, string>;
type Obj = Record<string, unknown>;

const PLACEHOLDER_NUMBERS = new Set(['+91-11-4000-0000', '+91-90000-00000']);
const SOCIAL = [
  ['facebook', 'Facebook', 'https://www.facebook.com/healindiaglobal'],
  ['instagram', 'Instagram', 'https://www.instagram.com/healindiaglobal'],
  ['linkedin', 'LinkedIn', 'https://www.linkedin.com/company/healindiaglobal'],
  ['x', 'X (Twitter)', 'https://x.com/healindiaglobal'],
  ['youtube', 'YouTube', 'https://www.youtube.com/@healindiaglobal'],
] as const;

// ------------------------------------------------------------------------------------------- validation
const digits = (v: string) => v.replace(/\D/g, '');
const isHttps = (v: string) => /^https:\/\/[^\s/?#]+\.[^\s]*$/.test(v);

function phoneError(v: string, opts: { min: number; plus: boolean }): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^\+?[0-9][0-9 ().-]*$/.test(s) || digits(s).length < opts.min || digits(s).length > 15) {
    return `Use ${opts.min}-15 digits${opts.plus ? ', e.g. +91 98765 43210' : ''}.`;
  }
  if (opts.plus && !s.startsWith('+')) return 'Use international format: + and the country code.';
  return null;
}

function urlError(v: string, { allowPath = false } = {}): string | null {
  const s = v.trim();
  if (!s) return null;
  if (allowPath && /^\/[^/\s]/.test(s)) return null;
  return isHttps(s) ? null : 'Enter a full https:// URL.';
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

// ----------------------------------------------------------------------------------------------- page
export default function WebsiteSettingsPage() {
  useDocumentTitle('Website & contact');
  const perms = useOpsPermissions();
  const q = useSettings();
  const byKey = useMemo(() => new Map((q.data ?? []).map((s) => [s.key, s])), [q.data]);
  const canEdit = perms.isSuperAdmin;

  return (
    <div>
      <PageHeader
        title="Website & contact"
        description="What the public website shows: contact numbers, floating buttons, social links, analytics, search-engine verification, marketing claims, medical reviewers and the footer. Saved changes reach the website within seconds and are recorded in the audit log. An empty field means unset: the website then uses its deployment default (or hides the item)."
      />
      {!canEdit && perms.role && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          <Lock className="size-4" aria-hidden /> Read-only: only a super admin can change these settings.
        </p>
      )}
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <Section setting={byKey.get('helplines')} title="Contact & helplines" canEdit={canEdit} validate={validateHelplines}>
            {(v, set, disabled, errors) => <ContactEditor value={v} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_floating_buttons')} title="Floating buttons" canEdit={canEdit}>
            {(v, set, disabled) => <ButtonsEditor value={v} set={set} disabled={disabled} contact={obj(byKey.get('helplines')?.value)} />}
          </Section>
          <Section setting={byKey.get('website_social_links')} title="Social profiles" canEdit={canEdit} validate={validateSocial}>
            {(v, set, disabled, errors) => <SocialEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_analytics')} title="Analytics" canEdit={canEdit} validate={validateAnalytics}>
            {(v, set, disabled, errors) => <AnalyticsEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_search_verification')} title="Search engines" canEdit={canEdit} validate={validateVerification}>
            {(v, set, disabled, errors) => <VerificationEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_marketing')} title="Marketing claims" canEdit={canEdit} validate={validateMarketing}>
            {(v, set, disabled, errors) => <MarketingEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_reviewers')} title="Medical reviewers" canEdit={canEdit} validate={validateReviewers}>
            {(v, set, disabled, errors) => <ReviewersEditor value={v} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_footer')} title="Footer" canEdit={canEdit} validate={validateFooter}>
            {(v, set, disabled, errors) => <FooterEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------------------------- section
function Section({
  setting,
  title,
  canEdit,
  validate,
  children,
}: {
  setting: PlatformSettingOut | undefined;
  title: string;
  canEdit: boolean;
  validate?: (value: unknown) => Errors;
  children: (value: unknown, set: (next: unknown) => void, disabled: boolean, errors: Errors) => ReactNode;
}) {
  const savedJson = JSON.stringify(setting?.value ?? null);
  const [draft, setDraft] = useState<unknown>(setting?.value);
  useEffect(() => setDraft(setting ? JSON.parse(savedJson) : undefined), [savedJson, setting]);
  const save = useOpsMutation({
    mutationFn: (value: unknown) => adminApi.updateSetting(setting!.key, value),
    success: `${title} saved - the website updates within a few seconds`,
    invalidate: [opsKeys.settings],
  });
  if (!setting) return null;
  const errors = validate ? validate(draft) : {};
  const invalid = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(draft) !== savedJson;
  return (
    <div data-testid={`website-setting-${setting.key}`}>
      <Card
        title={
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            {setting.is_default && <Badge>Default</Badge>}
            {!canEdit && (
              <Badge>
                <Lock className="size-3" aria-hidden /> Super admin
              </Badge>
            )}
          </div>
        }
        actions={
          setting.updated_at ? (
            <span className="text-[11px] text-muted">
              Updated {formatDateTime(setting.updated_at)}
              {setting.updated_by_name ? ` by ${setting.updated_by_name}` : ''}
            </span>
          ) : null
        }
      >
        <fieldset disabled={!canEdit} className="space-y-4">
          {children(draft, setDraft, !canEdit, errors)}
        </fieldset>
        {canEdit && (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
            <Button size="sm" disabled={!dirty || invalid} loading={save.isPending} onClick={() => save.mutate(draft)}>
              Save
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(JSON.parse(savedJson))}>
                Reset
              </Button>
            )}
            {invalid && <span className="text-xs text-danger">Fix the highlighted fields to save.</span>}
          </div>
        )}
      </Card>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  maxLength,
  multiline,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) =>
        multiline ? (
          <Textarea id={id} rows={3} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input id={id} value={value} placeholder={placeholder} maxLength={maxLength} invalid={!!error} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

const grid = 'grid gap-4 md:grid-cols-2';

// -------------------------------------------------------------------------------------------- contact
function validateHelplines(value: unknown): Errors {
  const v = obj(value);
  const e: Errors = {};
  const set = (k: string, m: string | null) => m && (e[k] = m);
  set('whatsapp', phoneError(str(v.whatsapp), { min: 7, plus: true }));
  set('24x7', phoneError(str(v['24x7']), { min: 7, plus: true }));
  set('emergency', phoneError(str(v.emergency), { min: 3, plus: false }));
  const email = str(v.email).trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = 'Enter a valid email address.';
  return e;
}

function placeholderHint(v: string, hint: string): ReactNode {
  return PLACEHOLDER_NUMBERS.has(v.trim()) ? (
    <span className="text-warning-ink">Placeholder number: hidden on the website until you enter a real one.</span>
  ) : (
    hint
  );
}

function ContactEditor({ value, set, errors }: { value: unknown; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const v = obj(value);
  const patch = (k: string) => (x: string) => set({ ...v, [k]: x });
  return (
    <div className={grid}>
      <TextField label="WhatsApp number" value={str(v.whatsapp)} onChange={patch('whatsapp')} error={errors.whatsapp} placeholder="+91 98765 43210" maxLength={30}
        hint={placeholderHint(str(v.whatsapp), 'Floating WhatsApp button, footer and contact page. Empty = hidden.')} />
      <TextField label="Phone / helpline number" value={str(v['24x7'])} onChange={patch('24x7')} error={errors['24x7']} placeholder="+91 80 4000 1234" maxLength={30}
        hint={placeholderHint(str(v['24x7']), 'Floating Call button, footer, contact page and the patient app (24/7 helpline). Empty = hidden.')} />
      <TextField label="Emergency number" value={str(v.emergency)} onChange={patch('emergency')} error={errors.emergency} placeholder="112" maxLength={30} hint="Shown on the contact page and in the patient app." />
      <TextField label="Public contact email" value={str(v.email)} onChange={patch('email')} error={errors.email} placeholder="care@healindiaglobal.com" maxLength={254} hint="Footer, contact page, account deletion page and Organization data. Empty = deployment default." />
      <TextField label="Support hours" value={str(v.support_hours)} onChange={patch('support_hours')} placeholder="24/7, every day" maxLength={120} hint="Shown on the contact page. Empty = not shown." />
      <TextField label="WhatsApp prefilled message" value={str(v.whatsapp_message)} onChange={patch('whatsapp_message')} maxLength={500} multiline hint="Text the visitor's WhatsApp opens with." />
    </div>
  );
}

function ButtonsEditor({ value, set, disabled, contact }: { value: unknown; set: (v: unknown) => void; disabled: boolean; contact: Obj }) {
  const v = obj(value);
  const showWa = bool(v.show_whatsapp, true);
  const showCall = bool(v.show_call, true);
  const wa = PLACEHOLDER_NUMBERS.has(str(contact.whatsapp)) ? '' : digits(str(contact.whatsapp));
  const tel = PLACEHOLDER_NUMBERS.has(str(contact['24x7'])) ? '' : digits(str(contact['24x7']));
  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div className="space-y-3">
        <Switch label="Show WhatsApp button" checked={showWa} disabled={disabled} onChange={(x) => set({ ...v, show_whatsapp: x })} />
        <br />
        <Switch label="Show Call button" checked={showCall} disabled={disabled} onChange={(x) => set({ ...v, show_call: x })} />
        <p className="max-w-md text-xs text-muted">A button is only shown when it is switched on and its number is set (saved numbers in Contact & helplines).</p>
      </div>
      <div aria-label="Preview" className="flex items-end gap-4 rounded-xl border border-dashed border-border p-3">
        <span className="text-xs text-muted">Preview</span>
        <div className="flex flex-col items-end gap-2">
          {showWa && wa ? (
            <span title={`https://wa.me/${wa}`} className="flex size-10 items-center justify-center rounded-full bg-[#25D366] text-white shadow">
              <MessageCircle className="size-5" aria-hidden />
            </span>
          ) : null}
          {showCall && tel ? (
            <span title={`tel:+${tel}`} className="flex size-10 items-center justify-center rounded-full bg-accent text-white shadow">
              <PhoneCall className="size-4" aria-hidden />
            </span>
          ) : null}
          {!(showWa && wa) && !(showCall && tel) && <span className="text-xs text-muted">No floating buttons</span>}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------- social
function validateSocial(value: unknown): Errors {
  const v = obj(value);
  const e: Errors = {};
  for (const [k] of SOCIAL) {
    const m = urlError(str(v[k]));
    if (m) e[k] = m;
  }
  return e;
}

function SocialEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  return (
    <div className={grid}>
      {SOCIAL.map(([k, label, example]) => (
        <TextField key={k} label={`${label} URL`} value={str(value[k])} onChange={(x) => set({ ...value, [k]: x })} error={errors[k]} placeholder={example} maxLength={300} />
      ))}
      <p className="text-xs text-muted md:col-span-2">Shown as icons in the footer and listed as sameAs in the Organization structured data. Empty = not shown.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ analytics
function validateAnalytics(value: unknown): Errors {
  const v = obj(value);
  const e: Errors = {};
  const provider = str(v.provider) || 'none';
  const ga4 = str(v.ga4_measurement_id).trim().toUpperCase();
  if (ga4 && !/^G-[A-Z0-9]{4,20}$/.test(ga4)) e.ga4_measurement_id = 'Use the format G-XXXXXXXXXX.';
  if (provider === 'ga4' && !ga4) e.ga4_measurement_id = 'Required for Google Analytics 4.';
  const domain = str(v.plausible_domain).trim();
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) e.plausible_domain = 'Enter a host name such as healindiaglobal.com.';
  const m = urlError(str(v.plausible_script_url));
  if (m) e.plausible_script_url = m;
  return e;
}

function AnalyticsEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const provider = str(value.provider) || 'none';
  const patch = (k: string) => (x: string) => set({ ...value, [k]: x });
  return (
    <div className="space-y-4">
      <Field label="Provider" hint="None = use the deployment's environment setting (off unless configured there). The site's Content-Security-Policy follows this choice.">
        {(id) => (
          <Select
            id={id}
            className="max-w-xs"
            value={provider}
            onChange={(e) => set({ ...value, provider: e.target.value })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'plausible', label: 'Plausible (cookieless, no banner)' },
              { value: 'ga4', label: 'Google Analytics 4 (after cookie consent)' },
            ]}
          />
        )}
      </Field>
      {provider === 'plausible' && (
        <div className={grid}>
          <TextField label="Plausible domain" value={str(value.plausible_domain)} onChange={patch('plausible_domain')} error={errors.plausible_domain} placeholder="healindiaglobal.com" hint="Empty = the website's own host." />
          <TextField label="Plausible script URL" value={str(value.plausible_script_url)} onChange={patch('plausible_script_url')} error={errors.plausible_script_url} placeholder="https://plausible.io/js/script.js" hint="Empty = plausible.io. A self-hosted script works too." />
        </div>
      )}
      {provider === 'ga4' && (
        <TextField label="GA4 measurement ID" className="max-w-xs" value={str(value.ga4_measurement_id)} onChange={(x) => set({ ...value, ga4_measurement_id: x.toUpperCase() })} error={errors.ga4_measurement_id} placeholder="G-XXXXXXXXXX" maxLength={30} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------- search engines
function validateVerification(value: unknown): Errors {
  const v = obj(value);
  const e: Errors = {};
  for (const k of ['google', 'bing']) {
    const s = str(v[k]).trim();
    if (s && !/content\s*=/.test(s) && !/^[A-Za-z0-9_=.-]{4,128}$/.test(s)) e[k] = 'Paste only the verification code (or the whole <meta> tag).';
  }
  const key = str(v.indexnow_key).trim();
  if (key && !/^[A-Za-z0-9-]{8,128}$/.test(key)) e.indexnow_key = '8-128 characters: letters, digits and -.';
  return e;
}

function VerificationEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const patch = (k: string) => (x: string) => set({ ...value, [k]: x });
  const generate = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    set({ ...value, indexnow_key: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') });
  };
  return (
    <div className={grid}>
      <TextField label="Google site verification" value={str(value.google)} onChange={patch('google')} error={errors.google} placeholder="Search Console HTML tag content" hint='Search Console -> Settings -> Ownership -> HTML tag: the content="..." value.' />
      <TextField label="Bing site verification" value={str(value.bing)} onChange={patch('bing')} error={errors.bing} placeholder="msvalidate.01 content" hint="Bing Webmaster Tools -> HTML meta tag value." />
      <div className="flex items-end gap-2 md:col-span-2">
        <TextField className="flex-1" label="IndexNow key" value={str(value.indexnow_key)} onChange={patch('indexnow_key')} error={errors.indexnow_key}
          hint="Server-side only: served at /indexnow-key.txt and used to notify Bing and others of changed pages. Needs the website revalidation secret configured." />
        <Button size="sm" variant="outline" type="button" onClick={generate} className="mb-5">
          Generate
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ marketing
interface Stat {
  id: string;
  label: string;
  value: string;
  source: string;
  show: boolean;
}

function validateMarketing(value: unknown): Errors {
  const v = obj(value);
  const e: Errors = {};
  const pct = obj(v.max_savings_pct).value;
  if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 0 || pct > 100) e.max_savings = 'Enter a whole percentage 0-100.';
  const stats = (Array.isArray(v.stats) ? v.stats : []) as Stat[];
  const ids = new Set<string>();
  stats.forEach((s, i) => {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(s.id)) e[`stat${i}`] = 'Id: start with a letter; letters, digits, - and _ only.';
    else if (ids.has(s.id)) e[`stat${i}`] = 'Each id must be unique.';
    else if (!s.label.trim() || !s.value.trim()) e[`stat${i}`] = 'Label and value are required.';
    ids.add(s.id);
  });
  return e;
}

function MarketingEditor({ value, set, disabled, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const savings = obj(value.max_savings_pct);
  const stats = (Array.isArray(value.stats) ? value.stats : []) as Stat[];
  const setSavings = (patch: Obj) => set({ ...value, max_savings_pct: { ...savings, ...patch } });
  const setStats = (next: Stat[]) => set({ ...value, stats: next });
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        Claims shown on the home page and procedure pages. A claim without a source is printed with an &quot;indicative figure&quot; footnote; switch off
        anything you cannot back up.
      </p>
      <div className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-end">
        <Field label="Maximum savings (%)" error={errors.max_savings}>
          {(id) => (
            <Input id={id} inputMode="numeric" value={String(savings.value ?? '')} onChange={(e) => setSavings({ value: e.target.value === '' ? '' : Number(e.target.value) })} />
          )}
        </Field>
        <TextField label="Savings source" value={str(savings.source)} onChange={(x) => setSavings({ source: x })} maxLength={300} placeholder="e.g. Partner hospital price lists vs. US self-pay, 2026" />
        <Checkbox label="Show in hero" checked={bool(savings.show, true)} disabled={disabled} onChange={(x) => setSavings({ show: x })} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-fg">Home-page stats</p>
        {stats.map((s, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)_8rem_minmax(0,1.4fr)_auto_auto] md:items-end">
              <TextField label="Id" value={s.id} maxLength={40} onChange={(x) => setStats(stats.map((t, j) => (j === i ? { ...t, id: x } : t)))} />
              <TextField label="Label" value={s.label} maxLength={60} onChange={(x) => setStats(stats.map((t, j) => (j === i ? { ...t, label: x } : t)))} />
              <TextField label="Value" value={s.value} maxLength={30} onChange={(x) => setStats(stats.map((t, j) => (j === i ? { ...t, value: x } : t)))} />
              <TextField label="Source note" value={s.source} maxLength={300} onChange={(x) => setStats(stats.map((t, j) => (j === i ? { ...t, source: x } : t)))} />
              <Checkbox label="Show" checked={s.show} disabled={disabled} onChange={(x) => setStats(stats.map((t, j) => (j === i ? { ...t, show: x } : t)))} />
              {!disabled && (
                <Button size="sm" variant="ghost" aria-label={`Remove stat ${s.label || i + 1}`} icon={<Trash2 className="size-3.5" />} onClick={() => setStats(stats.filter((_, j) => j !== i))} />
              )}
            </div>
            {errors[`stat${i}`] && <p className="mt-1 text-xs text-danger">{errors[`stat${i}`]}</p>}
          </div>
        ))}
        {!disabled && stats.length < 12 && (
          <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => setStats([...stats, { id: `stat${stats.length + 1}`, label: '', value: '', source: '', show: true }])}>
            Add stat
          </Button>
        )}
      </div>

      <TextField label="Typical wait in India" value={str(value.india_wait)} onChange={(x) => set({ ...value, india_wait: x })} maxLength={200} hint="Shown in the cost calculator on procedure pages." />
      <div className="flex flex-wrap gap-6">
        <Checkbox label="Show testimonials (always labelled illustrative)" checked={bool(value.show_testimonials, true)} disabled={disabled} onChange={(x) => set({ ...value, show_testimonials: x })} />
        <Checkbox label="All claims verified by marketing / legal" checked={bool(value.claims_verified, false)} disabled={disabled} onChange={(x) => set({ ...value, claims_verified: x })} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ reviewers
interface Reviewer {
  id: string;
  name: string;
  credentials: string;
  registration_number: string;
  registration_council: string;
  bio: string;
  photo_url: string;
  active: boolean;
}

function validateReviewers(value: unknown): Errors {
  const list = (Array.isArray(value) ? value : []) as Reviewer[];
  const e: Errors = {};
  const ids = new Set<string>();
  list.forEach((r, i) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id)) e[`r${i}`] = 'Id: lowercase letters, digits and hyphens (e.g. dr-asha-rao).';
    else if (ids.has(r.id)) e[`r${i}`] = 'Each id must be unique.';
    else if (urlError(r.photo_url, { allowPath: true })) e[`r${i}`] = 'Photo: an https:// URL or a site path such as /brand/reviewers/name.jpg.';
    else if (r.active && (!r.name.trim() || !r.credentials.trim() || !r.registration_number.trim() || !r.registration_council.trim())) {
      e[`r${i}`] = 'An active reviewer needs name, credentials, registration number and council.';
    }
    ids.add(r.id);
  });
  return e;
}

function ReviewersEditor({ value, set, disabled, errors }: { value: unknown; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const list = (Array.isArray(value) ? value : []) as Reviewer[];
  const patch = (i: number, p: Partial<Reviewer>) => set(list.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Credited on health pages whose front matter names them (reviewedBy: &lt;id&gt;). Only active reviewers with a complete registration are shown publicly.
        Add a real person only with their written consent and a verifiable medical registration.
      </p>
      {list.map((r, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Switch label={r.active ? 'Active (shown on the website)' : 'Inactive'} checked={r.active} disabled={disabled} onChange={(x) => patch(i, { active: x })} />
            {!disabled && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => set(list.filter((_, j) => j !== i))}>
                Remove
              </Button>
            )}
          </div>
          <div className={grid}>
            <TextField label="Id (used by pages)" value={r.id} maxLength={80} onChange={(x) => patch(i, { id: x.toLowerCase() })} />
            <TextField label="Full name" value={r.name} maxLength={120} onChange={(x) => patch(i, { name: x })} />
            <TextField label="Credentials" value={r.credentials} maxLength={200} placeholder="MBBS, MD (Cardiology)" onChange={(x) => patch(i, { credentials: x })} />
            <TextField label="Registration number" value={r.registration_number} maxLength={60} onChange={(x) => patch(i, { registration_number: x })} />
            <TextField label="Registration council" value={r.registration_council} maxLength={160} placeholder="e.g. Karnataka Medical Council" onChange={(x) => patch(i, { registration_council: x })} />
            <TextField label="Photo URL" value={r.photo_url} maxLength={500} placeholder="https://... or /brand/reviewers/name.jpg" onChange={(x) => patch(i, { photo_url: x })} />
            <TextField className="md:col-span-2" label="Short bio" value={r.bio} maxLength={600} multiline onChange={(x) => patch(i, { bio: x })} />
          </div>
          {errors[`r${i}`] && <p className="text-xs text-danger">{errors[`r${i}`]}</p>}
        </div>
      ))}
      {!disabled && list.length < 50 && (
        <Button
          size="sm"
          variant="outline"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            set([...list, { id: `reviewer-${list.length + 1}`, name: '', credentials: '', registration_number: '', registration_council: '', bio: '', photo_url: '', active: false }])
          }
        >
          Add reviewer
        </Button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------------------------- footer
function validateFooter(value: unknown): Errors {
  const v = obj(value);
  const m = urlError(str(v.developer_url));
  return m ? { developer_url: m } : {};
}

function FooterEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const patch = (k: string) => (x: string) => set({ ...value, [k]: x });
  const name = str(value.developer_name).trim();
  const url = str(value.developer_url).trim();
  return (
    <div className="space-y-4">
      <div className={grid}>
        <TextField label="Developed by" value={str(value.developer_name)} onChange={patch('developer_name')} maxLength={60} hint="Empty = no credit line." />
        <TextField label="Developer URL" value={str(value.developer_url)} onChange={patch('developer_url')} error={errors.developer_url} maxLength={300} placeholder="https://dvsoft.in" />
      </div>
      <TextField label="Disclaimer" value={str(value.disclaimer)} onChange={patch('disclaimer')} maxLength={1000} multiline hint="Short disclaimer in the footer. Empty = the built-in text." />
      <div aria-label="Footer preview" className="rounded-xl bg-slate-900 px-4 py-3 text-xs text-slate-400">
        <p>
          <strong className="font-semibold text-slate-200">Disclaimer: </strong>
          {str(value.disclaimer) || 'Built-in disclaimer text'}
        </p>
        {name && (
          <p className="mt-2 text-right">
            Developed by{' '}
            <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
              {name}
              {isHttps(url) && <ExternalLink className="size-3" aria-hidden />}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
