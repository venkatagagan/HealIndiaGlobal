import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, Lock, MessageCircle, PhoneCall, Plus, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import { adminApi, type PlatformSettingOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
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

function phoneError(t: TFunction, v: string, opts: { min: number; plus: boolean }): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^\+?[0-9][0-9 ().-]*$/.test(s) || digits(s).length < opts.min || digits(s).length > 15) {
    return opts.plus
      ? t('websiteSettings.errors.phoneDigitsExample', { min: opts.min })
      : t('websiteSettings.errors.phoneDigits', { min: opts.min });
  }
  if (opts.plus && !s.startsWith('+')) return t('websiteSettings.errors.phoneInternational');
  return null;
}

function urlError(t: TFunction, v: string, { allowPath = false } = {}): string | null {
  const s = v.trim();
  if (!s) return null;
  if (allowPath && /^\/[^/\s]/.test(s)) return null;
  return isHttps(s) ? null : t('websiteSettings.errors.httpsUrl');
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

// ----------------------------------------------------------------------------------------------- page
export default function WebsiteSettingsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('websiteSettings.title'));
  const perms = useOpsPermissions();
  const q = useSettings();
  const byKey = useMemo(() => new Map((q.data ?? []).map((s) => [s.key, s])), [q.data]);
  const canEdit = perms.isSuperAdmin;

  return (
    <div>
      <PageHeader title={t('websiteSettings.title')} description={t('websiteSettings.description')} />
      {!canEdit && perms.role && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          <Lock className="size-4" aria-hidden /> {t('websiteSettings.readOnly')}
        </p>
      )}
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <Section setting={byKey.get('helplines')} title={t('websiteSettings.sections.contact')} canEdit={canEdit} validate={validateHelplines}>
            {(v, set, disabled, errors) => <ContactEditor value={v} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_floating_buttons')} title={t('websiteSettings.sections.buttons')} canEdit={canEdit}>
            {(v, set, disabled) => <ButtonsEditor value={v} set={set} disabled={disabled} contact={obj(byKey.get('helplines')?.value)} />}
          </Section>
          <Section setting={byKey.get('website_social_links')} title={t('websiteSettings.sections.social')} canEdit={canEdit} validate={validateSocial}>
            {(v, set, disabled, errors) => <SocialEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_analytics')} title={t('websiteSettings.sections.analytics')} canEdit={canEdit} validate={validateAnalytics}>
            {(v, set, disabled, errors) => <AnalyticsEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section
            setting={byKey.get('website_search_verification')}
            title={t('websiteSettings.sections.search')}
            canEdit={canEdit}
            validate={validateVerification}
          >
            {(v, set, disabled, errors) => <VerificationEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_marketing')} title={t('websiteSettings.sections.marketing')} canEdit={canEdit} validate={validateMarketing}>
            {(v, set, disabled, errors) => <MarketingEditor value={v as Obj} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_reviewers')} title={t('websiteSettings.sections.reviewers')} canEdit={canEdit} validate={validateReviewers}>
            {(v, set, disabled, errors) => <ReviewersEditor value={v} set={set} disabled={disabled} errors={errors} />}
          </Section>
          <Section setting={byKey.get('website_footer')} title={t('websiteSettings.sections.footer')} canEdit={canEdit} validate={validateFooter}>
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
  validate?: (value: unknown, t: TFunction) => Errors;
  children: (value: unknown, set: (next: unknown) => void, disabled: boolean, errors: Errors) => ReactNode;
}) {
  const { t } = useAppTranslation();
  const savedJson = JSON.stringify(setting?.value ?? null);
  const [draft, setDraft] = useState<unknown>(setting?.value);
  useEffect(() => setDraft(setting ? JSON.parse(savedJson) : undefined), [savedJson, setting]);
  const save = useOpsMutation({
    mutationFn: (value: unknown) => adminApi.updateSetting(setting!.key, value),
    success: t('websiteSettings.saved', { title }),
    invalidate: [opsKeys.settings],
  });
  if (!setting) return null;
  const errors = validate ? validate(draft, t) : {};
  const invalid = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(draft) !== savedJson;
  return (
    <div data-testid={`website-setting-${setting.key}`}>
      <Card
        title={
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            {setting.is_default && <Badge>{t('websiteSettings.defaultBadge')}</Badge>}
            {!canEdit && (
              <Badge>
                <Lock className="size-3" aria-hidden /> {t('websiteSettings.superAdminBadge')}
              </Badge>
            )}
          </div>
        }
        actions={
          setting.updated_at ? (
            <span className="text-[11px] text-muted">
              {setting.updated_by_name
                ? t('websiteSettings.updatedAtBy', { date: formatDateTime(setting.updated_at), name: setting.updated_by_name })
                : t('websiteSettings.updatedAt', { date: formatDateTime(setting.updated_at) })}
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
              {t('websiteSettings.save')}
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(JSON.parse(savedJson))}>
                {t('websiteSettings.reset')}
              </Button>
            )}
            {invalid && <span className="text-xs text-danger">{t('websiteSettings.fixErrors')}</span>}
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
function validateHelplines(value: unknown, t: TFunction): Errors {
  const v = obj(value);
  const e: Errors = {};
  const set = (k: string, m: string | null) => m && (e[k] = m);
  set('whatsapp', phoneError(t, str(v.whatsapp), { min: 7, plus: true }));
  set('24x7', phoneError(t, str(v['24x7']), { min: 7, plus: true }));
  set('emergency', phoneError(t, str(v.emergency), { min: 3, plus: false }));
  const email = str(v.email).trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = t('websiteSettings.errors.email');
  return e;
}

function placeholderHint(t: TFunction, v: string, hint: string): ReactNode {
  return PLACEHOLDER_NUMBERS.has(v.trim()) ? (
    <span className="text-warning-ink">{t('websiteSettings.contact.placeholderNumber')}</span>
  ) : (
    hint
  );
}

function ContactEditor({ value, set, errors }: { value: unknown; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  const v = obj(value);
  const patch = (k: string) => (x: string) => set({ ...v, [k]: x });
  return (
    <div className={grid}>
      <TextField label={t('websiteSettings.contact.whatsapp')} value={str(v.whatsapp)} onChange={patch('whatsapp')} error={errors.whatsapp} placeholder="+91 98765 43210" maxLength={30}
        hint={placeholderHint(t, str(v.whatsapp), t('websiteSettings.contact.whatsappHint'))} />
      <TextField label={t('websiteSettings.contact.phone')} value={str(v['24x7'])} onChange={patch('24x7')} error={errors['24x7']} placeholder="+91 80 4000 1234" maxLength={30}
        hint={placeholderHint(t, str(v['24x7']), t('websiteSettings.contact.phoneHint'))} />
      <TextField label={t('websiteSettings.contact.emergency')} value={str(v.emergency)} onChange={patch('emergency')} error={errors.emergency} placeholder="112" maxLength={30} hint={t('websiteSettings.contact.emergencyHint')} />
      <TextField label={t('websiteSettings.contact.email')} value={str(v.email)} onChange={patch('email')} error={errors.email} placeholder="care@healindiaglobal.com" maxLength={254} hint={t('websiteSettings.contact.emailHint')} />
      <TextField label={t('websiteSettings.contact.supportHours')} value={str(v.support_hours)} onChange={patch('support_hours')} placeholder={t('websiteSettings.contact.supportHoursPlaceholder')} maxLength={120} hint={t('websiteSettings.contact.supportHoursHint')} />
      <TextField label={t('websiteSettings.contact.whatsappMessage')} value={str(v.whatsapp_message)} onChange={patch('whatsapp_message')} maxLength={500} multiline hint={t('websiteSettings.contact.whatsappMessageHint')} />
    </div>
  );
}

function ButtonsEditor({ value, set, disabled, contact }: { value: unknown; set: (v: unknown) => void; disabled: boolean; contact: Obj }) {
  const { t } = useAppTranslation();
  const v = obj(value);
  const showWa = bool(v.show_whatsapp, true);
  const showCall = bool(v.show_call, true);
  const wa = PLACEHOLDER_NUMBERS.has(str(contact.whatsapp)) ? '' : digits(str(contact.whatsapp));
  const tel = PLACEHOLDER_NUMBERS.has(str(contact['24x7'])) ? '' : digits(str(contact['24x7']));
  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div className="space-y-3">
        <Switch label={t('websiteSettings.buttons.showWhatsapp')} checked={showWa} disabled={disabled} onChange={(x) => set({ ...v, show_whatsapp: x })} />
        <br />
        <Switch label={t('websiteSettings.buttons.showCall')} checked={showCall} disabled={disabled} onChange={(x) => set({ ...v, show_call: x })} />
        <p className="max-w-md text-xs text-muted">{t('websiteSettings.buttons.note')}</p>
      </div>
      <div aria-label={t('websiteSettings.buttons.preview')} className="flex items-end gap-4 rounded-xl border border-dashed border-border p-3">
        <span className="text-xs text-muted">{t('websiteSettings.buttons.preview')}</span>
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
          {!(showWa && wa) && !(showCall && tel) && <span className="text-xs text-muted">{t('websiteSettings.buttons.none')}</span>}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------- social
function validateSocial(value: unknown, t: TFunction): Errors {
  const v = obj(value);
  const e: Errors = {};
  for (const [k] of SOCIAL) {
    const m = urlError(t, str(v[k]));
    if (m) e[k] = m;
  }
  return e;
}

function SocialEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  return (
    <div className={grid}>
      {SOCIAL.map(([k, label, example]) => (
        <TextField
          key={k}
          label={t('websiteSettings.social.urlLabel', { network: label })}
          value={str(value[k])}
          onChange={(x) => set({ ...value, [k]: x })}
          error={errors[k]}
          placeholder={example}
          maxLength={300}
        />
      ))}
      <p className="text-xs text-muted md:col-span-2">{t('websiteSettings.social.note')}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ analytics
function validateAnalytics(value: unknown, t: TFunction): Errors {
  const v = obj(value);
  const e: Errors = {};
  const provider = str(v.provider) || 'none';
  const ga4 = str(v.ga4_measurement_id).trim().toUpperCase();
  if (ga4 && !/^G-[A-Z0-9]{4,20}$/.test(ga4)) e.ga4_measurement_id = t('websiteSettings.errors.ga4Format');
  if (provider === 'ga4' && !ga4) e.ga4_measurement_id = t('websiteSettings.errors.ga4Required');
  const domain = str(v.plausible_domain).trim();
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) e.plausible_domain = t('websiteSettings.errors.hostName');
  const m = urlError(t, str(v.plausible_script_url));
  if (m) e.plausible_script_url = m;
  return e;
}

function AnalyticsEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  const provider = str(value.provider) || 'none';
  const patch = (k: string) => (x: string) => set({ ...value, [k]: x });
  return (
    <div className="space-y-4">
      <Field label={t('websiteSettings.analytics.provider')} hint={t('websiteSettings.analytics.providerHint')}>
        {(id) => (
          <Select
            id={id}
            className="max-w-xs"
            value={provider}
            onChange={(e) => set({ ...value, provider: e.target.value })}
            options={[
              { value: 'none', label: t('websiteSettings.analytics.none') },
              { value: 'plausible', label: t('websiteSettings.analytics.plausible') },
              { value: 'ga4', label: t('websiteSettings.analytics.ga4') },
            ]}
          />
        )}
      </Field>
      {provider === 'plausible' && (
        <div className={grid}>
          <TextField label={t('websiteSettings.analytics.plausibleDomain')} value={str(value.plausible_domain)} onChange={patch('plausible_domain')} error={errors.plausible_domain} placeholder="healindiaglobal.com" hint={t('websiteSettings.analytics.plausibleDomainHint')} />
          <TextField label={t('websiteSettings.analytics.plausibleScript')} value={str(value.plausible_script_url)} onChange={patch('plausible_script_url')} error={errors.plausible_script_url} placeholder="https://plausible.io/js/script.js" hint={t('websiteSettings.analytics.plausibleScriptHint')} />
        </div>
      )}
      {provider === 'ga4' && (
        <TextField label={t('websiteSettings.analytics.ga4Id')} className="max-w-xs" value={str(value.ga4_measurement_id)} onChange={(x) => set({ ...value, ga4_measurement_id: x.toUpperCase() })} error={errors.ga4_measurement_id} placeholder="G-XXXXXXXXXX" maxLength={30} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------- search engines
function validateVerification(value: unknown, t: TFunction): Errors {
  const v = obj(value);
  const e: Errors = {};
  for (const k of ['google', 'bing']) {
    const s = str(v[k]).trim();
    if (s && !/content\s*=/.test(s) && !/^[A-Za-z0-9_=.-]{4,128}$/.test(s)) e[k] = t('websiteSettings.errors.verificationCode', { tag: '<meta>' });
  }
  const key = str(v.indexnow_key).trim();
  if (key && !/^[A-Za-z0-9-]{8,128}$/.test(key)) e.indexnow_key = t('websiteSettings.errors.indexNowKey');
  return e;
}

function VerificationEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  const patch = (k: string) => (x: string) => set({ ...value, [k]: x });
  const generate = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    set({ ...value, indexnow_key: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') });
  };
  return (
    <div className={grid}>
      <TextField label={t('websiteSettings.search.google')} value={str(value.google)} onChange={patch('google')} error={errors.google} placeholder={t('websiteSettings.search.googlePlaceholder')} hint={t('websiteSettings.search.googleHint')} />
      <TextField label={t('websiteSettings.search.bing')} value={str(value.bing)} onChange={patch('bing')} error={errors.bing} placeholder={t('websiteSettings.search.bingPlaceholder')} hint={t('websiteSettings.search.bingHint')} />
      <div className="flex items-end gap-2 md:col-span-2">
        <TextField className="flex-1" label={t('websiteSettings.search.indexNow')} value={str(value.indexnow_key)} onChange={patch('indexnow_key')} error={errors.indexnow_key}
          hint={t('websiteSettings.search.indexNowHint')} />
        <Button size="sm" variant="outline" type="button" onClick={generate} className="mb-5">
          {t('websiteSettings.search.generate')}
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

function validateMarketing(value: unknown, t: TFunction): Errors {
  const v = obj(value);
  const e: Errors = {};
  const pct = obj(v.max_savings_pct).value;
  if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 0 || pct > 100) e.max_savings = t('websiteSettings.errors.wholePercent');
  const stats = (Array.isArray(v.stats) ? v.stats : []) as Stat[];
  const ids = new Set<string>();
  stats.forEach((s, i) => {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(s.id)) e[`stat${i}`] = t('websiteSettings.errors.statId');
    else if (ids.has(s.id)) e[`stat${i}`] = t('websiteSettings.errors.uniqueId');
    else if (!s.label.trim() || !s.value.trim()) e[`stat${i}`] = t('websiteSettings.errors.statRequired');
    ids.add(s.id);
  });
  return e;
}

function MarketingEditor({ value, set, disabled, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  const savings = obj(value.max_savings_pct);
  const stats = (Array.isArray(value.stats) ? value.stats : []) as Stat[];
  const setSavings = (patch: Obj) => set({ ...value, max_savings_pct: { ...savings, ...patch } });
  const setStats = (next: Stat[]) => set({ ...value, stats: next });
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">{t('websiteSettings.marketing.intro')}</p>
      <div className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-end">
        <Field label={t('websiteSettings.marketing.maxSavings')} error={errors.max_savings}>
          {(id) => (
            <Input id={id} inputMode="numeric" value={String(savings.value ?? '')} onChange={(e) => setSavings({ value: e.target.value === '' ? '' : Number(e.target.value) })} />
          )}
        </Field>
        <TextField label={t('websiteSettings.marketing.savingsSource')} value={str(savings.source)} onChange={(x) => setSavings({ source: x })} maxLength={300} placeholder={t('websiteSettings.marketing.savingsSourcePlaceholder')} />
        <Checkbox label={t('websiteSettings.marketing.showInHero')} checked={bool(savings.show, true)} disabled={disabled} onChange={(x) => setSavings({ show: x })} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-fg">{t('websiteSettings.marketing.stats')}</p>
        {stats.map((s, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)_8rem_minmax(0,1.4fr)_auto_auto] md:items-end">
              <TextField label={t('websiteSettings.marketing.statId')} value={s.id} maxLength={40} onChange={(x) => setStats(stats.map((st, j) => (j === i ? { ...st, id: x } : st)))} />
              <TextField label={t('websiteSettings.marketing.statLabel')} value={s.label} maxLength={60} onChange={(x) => setStats(stats.map((st, j) => (j === i ? { ...st, label: x } : st)))} />
              <TextField label={t('websiteSettings.marketing.statValue')} value={s.value} maxLength={30} onChange={(x) => setStats(stats.map((st, j) => (j === i ? { ...st, value: x } : st)))} />
              <TextField label={t('websiteSettings.marketing.statSource')} value={s.source} maxLength={300} onChange={(x) => setStats(stats.map((st, j) => (j === i ? { ...st, source: x } : st)))} />
              <Checkbox label={t('websiteSettings.marketing.statShow')} checked={s.show} disabled={disabled} onChange={(x) => setStats(stats.map((st, j) => (j === i ? { ...st, show: x } : st)))} />
              {!disabled && (
                <Button size="sm" variant="ghost" aria-label={t('websiteSettings.marketing.removeStat', { name: s.label || i + 1 })} icon={<Trash2 className="size-3.5" />} onClick={() => setStats(stats.filter((_, j) => j !== i))} />
              )}
            </div>
            {errors[`stat${i}`] && <p className="mt-1 text-xs text-danger">{errors[`stat${i}`]}</p>}
          </div>
        ))}
        {!disabled && stats.length < 12 && (
          <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => setStats([...stats, { id: `stat${stats.length + 1}`, label: '', value: '', source: '', show: true }])}>
            {t('websiteSettings.marketing.addStat')}
          </Button>
        )}
      </div>

      <TextField label={t('websiteSettings.marketing.indiaWait')} value={str(value.india_wait)} onChange={(x) => set({ ...value, india_wait: x })} maxLength={200} hint={t('websiteSettings.marketing.indiaWaitHint')} />
      <div className="flex flex-wrap gap-6">
        <Checkbox label={t('websiteSettings.marketing.showTestimonials')} checked={bool(value.show_testimonials, true)} disabled={disabled} onChange={(x) => set({ ...value, show_testimonials: x })} />
        <Checkbox label={t('websiteSettings.marketing.claimsVerified')} checked={bool(value.claims_verified, false)} disabled={disabled} onChange={(x) => set({ ...value, claims_verified: x })} />
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

function validateReviewers(value: unknown, t: TFunction): Errors {
  const list = (Array.isArray(value) ? value : []) as Reviewer[];
  const e: Errors = {};
  const ids = new Set<string>();
  list.forEach((r, i) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id)) e[`r${i}`] = t('websiteSettings.errors.reviewerId');
    else if (ids.has(r.id)) e[`r${i}`] = t('websiteSettings.errors.uniqueId');
    else if (urlError(t, r.photo_url, { allowPath: true })) e[`r${i}`] = t('websiteSettings.errors.reviewerPhoto');
    else if (r.active && (!r.name.trim() || !r.credentials.trim() || !r.registration_number.trim() || !r.registration_council.trim())) {
      e[`r${i}`] = t('websiteSettings.errors.reviewerIncomplete');
    }
    ids.add(r.id);
  });
  return e;
}

function ReviewersEditor({ value, set, disabled, errors }: { value: unknown; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  const list = (Array.isArray(value) ? value : []) as Reviewer[];
  const patch = (i: number, p: Partial<Reviewer>) => set(list.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('websiteSettings.reviewers.intro', { tag: '<id>' })}</p>
      {list.map((r, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Switch
              label={r.active ? t('websiteSettings.reviewers.active') : t('websiteSettings.reviewers.inactive')}
              checked={r.active}
              disabled={disabled}
              onChange={(x) => patch(i, { active: x })}
            />
            {!disabled && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => set(list.filter((_, j) => j !== i))}>
                {t('websiteSettings.reviewers.remove')}
              </Button>
            )}
          </div>
          <div className={grid}>
            <TextField label={t('websiteSettings.reviewers.id')} value={r.id} maxLength={80} onChange={(x) => patch(i, { id: x.toLowerCase() })} />
            <TextField label={t('websiteSettings.reviewers.name')} value={r.name} maxLength={120} onChange={(x) => patch(i, { name: x })} />
            <TextField label={t('websiteSettings.reviewers.credentials')} value={r.credentials} maxLength={200} placeholder="MBBS, MD (Cardiology)" onChange={(x) => patch(i, { credentials: x })} />
            <TextField label={t('websiteSettings.reviewers.registrationNumber')} value={r.registration_number} maxLength={60} onChange={(x) => patch(i, { registration_number: x })} />
            <TextField label={t('websiteSettings.reviewers.registrationCouncil')} value={r.registration_council} maxLength={160} placeholder={t('websiteSettings.reviewers.registrationCouncilPlaceholder')} onChange={(x) => patch(i, { registration_council: x })} />
            <TextField label={t('websiteSettings.reviewers.photoUrl')} value={r.photo_url} maxLength={500} placeholder={t('websiteSettings.reviewers.photoUrlPlaceholder')} onChange={(x) => patch(i, { photo_url: x })} />
            <TextField className="md:col-span-2" label={t('websiteSettings.reviewers.bio')} value={r.bio} maxLength={600} multiline onChange={(x) => patch(i, { bio: x })} />
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
          {t('websiteSettings.reviewers.add')}
        </Button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------------------------- footer
function validateFooter(value: unknown, t: TFunction): Errors {
  const v = obj(value);
  const m = urlError(t, str(v.developer_url));
  return m ? { developer_url: m } : {};
}

function FooterEditor({ value, set, errors }: { value: Obj; set: (v: unknown) => void; disabled: boolean; errors: Errors }) {
  const { t } = useAppTranslation();
  const patch = (k: string) => (x: string) => set({ ...value, [k]: x });
  const name = str(value.developer_name).trim();
  const url = str(value.developer_url).trim();
  return (
    <div className="space-y-4">
      <div className={grid}>
        <TextField label={t('websiteSettings.footer.developedBy')} value={str(value.developer_name)} onChange={patch('developer_name')} maxLength={60} hint={t('websiteSettings.footer.developedByHint')} />
        <TextField label={t('websiteSettings.footer.developerUrl')} value={str(value.developer_url)} onChange={patch('developer_url')} error={errors.developer_url} maxLength={300} placeholder="https://dvsoft.in" />
      </div>
      <TextField label={t('websiteSettings.footer.disclaimer')} value={str(value.disclaimer)} onChange={patch('disclaimer')} maxLength={1000} multiline hint={t('websiteSettings.footer.disclaimerHint')} />
      <div aria-label={t('websiteSettings.footer.preview')} className="rounded-xl bg-slate-900 px-4 py-3 text-xs text-slate-400">
        <p>
          <strong className="font-semibold text-slate-200">{t('websiteSettings.footer.disclaimerLabel')} </strong>
          {str(value.disclaimer) || t('websiteSettings.footer.builtInDisclaimer')}
        </p>
        {name && (
          <p className="mt-2 text-end">
            <Trans
              t={t}
              i18nKey="websiteSettings.footer.developedByPreview"
              values={{ name }}
              components={{
                0: <span className="inline-flex items-center gap-1 font-semibold text-slate-200" />,
                1: isHttps(url) ? <ExternalLink className="size-3" aria-hidden /> : <></>,
              }}
            />
          </p>
        )}
      </div>
    </div>
  );
}
