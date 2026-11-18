import { BrainCircuit, ShieldCheck } from 'lucide-react';
import { DOCTOR_GENDER_PREFS, DOCTOR_GENDER_PREF_LABELS, type DoctorGenderPref } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { countryOptions, LANGUAGE_OPTIONS } from '../../lib/countries';
import { SUPPORTED_CURRENCIES, currencySymbol, formatNumber, isoDateFromToday } from '../../lib/shared';
import { Checkbox, Chip, Field, Input, SegmentedControl, Select, Switch } from '../../ui/primitives';
import type { WizardDraft } from './wizardModel';

const BUDGET_PRESETS: { min: string; max: string }[] = [
  { min: '', max: '5000' },
  { min: '5000', max: '15000' },
  { min: '15000', max: '30000' },
  { min: '30000', max: '50000' },
  { min: '50000', max: '' },
];

/** "5K" (en), "5 k" (fr), ... */
const compact = (value: string) => formatNumber(Number(value), { notation: 'compact' });

export function StepPreferences({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  const { t } = useAppTranslation();
  const symbol = currencySymbol(draft.budget_currency);
  const today = isoDateFromToday(0);

  function presetLabel(p: { min: string; max: string }): string {
    if (!p.min) return t('screening.preferences.budgetUnder', { amount: compact(p.max) });
    if (!p.max) return t('screening.preferences.budgetOver', { amount: compact(p.min) });
    return t('screening.preferences.budgetBetween', { min: compact(p.min), max: compact(p.max) });
  }

  function toggleLanguage(lang: string) {
    onChange({
      languages: draft.languages.includes(lang) ? draft.languages.filter((l) => l !== lang) : [...draft.languages, lang],
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-semibold">{t('screening.preferences.language')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('screening.preferences.languageHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((l) => (
            <Chip key={l.value} selected={draft.languages.includes(l.value)} onClick={() => toggleLanguage(l.value)}>
              <span aria-hidden>{l.flag}</span> {l.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="max-w-md">
        <h3 className="mb-3 font-semibold">{t('screening.preferences.doctorGender')}</h3>
        <SegmentedControl<DoctorGenderPref>
          ariaLabel={t('screening.preferences.doctorGenderLabel')}
          value={draft.doctor_gender}
          onChange={(v) => onChange({ doctor_gender: v })}
          options={DOCTOR_GENDER_PREFS.map((g) => ({ value: g, label: DOCTOR_GENDER_PREF_LABELS[g] }))}
        />
      </section>

      <section>
        <h3 className="font-semibold">{t('screening.preferences.budget')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('screening.preferences.budgetHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((p) => (
            <Chip
              key={`${p.min}-${p.max}`}
              selected={draft.budget_min === p.min && draft.budget_max === p.max}
              onClick={() => onChange({ budget_min: p.min, budget_max: p.max })}
            >
              {symbol}
              {presetLabel(p)}
            </Chip>
          ))}
        </div>
        <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-3">
          <Field label={t('screening.preferences.currency')} htmlFor="budget-ccy">
            <Select
              id="budget-ccy"
              value={draft.budget_currency}
              onChange={(e) => onChange({ budget_currency: e.target.value })}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('screening.preferences.minimum', { symbol })} htmlFor="budget-min">
            <Input
              id="budget-min"
              inputMode="decimal"
              value={draft.budget_min}
              onChange={(e) => onChange({ budget_min: e.target.value })}
              placeholder={t('screening.preferences.noMinimum')}
            />
          </Field>
          <Field label={t('screening.preferences.maximum', { symbol })} htmlFor="budget-max">
            <Input
              id="budget-max"
              inputMode="decimal"
              value={draft.budget_max}
              onChange={(e) => onChange({ budget_max: e.target.value })}
              placeholder={t('screening.preferences.noMaximum')}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="font-semibold">{t('screening.preferences.travelWindow')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('screening.preferences.travelWindowHint')}</p>
        <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
          <Field label={t('screening.preferences.earliest')} htmlFor="tw-start">
            <Input
              id="tw-start"
              type="date"
              min={today}
              value={draft.travel_window_start}
              onChange={(e) => onChange({ travel_window_start: e.target.value })}
            />
          </Field>
          <Field label={t('screening.preferences.latest')} htmlFor="tw-end">
            <Input
              id="tw-end"
              type="date"
              min={draft.travel_window_start || today}
              value={draft.travel_window_end}
              onChange={(e) => onChange({ travel_window_end: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="max-w-xl">
        <Field
          label={t('screening.preferences.homeCountry')}
          htmlFor="home-country"
          hint={t('screening.preferences.homeCountryHint')}
        >
          <Select id="home-country" value={draft.home_country} onChange={(e) => onChange({ home_country: e.target.value })}>
            <option value="">{t('screening.preferences.selectCountry')}</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <Switch
          checked={draft.use_ai}
          onChange={(v) => onChange({ use_ai: v })}
          label={
            <span className="inline-flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-violet-500" aria-hidden /> {t('screening.preferences.useAi')}
            </span>
          }
          description={t('screening.preferences.useAiHint')}
        />
        {draft.use_ai ? (
          <div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
              <ShieldCheck className="h-4 w-4" aria-hidden /> {t('screening.preferences.aiInfoTitle')}
            </p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-violet-900/80 dark:text-violet-200/80">
              <li>{t('screening.preferences.aiInfo.sent')}</li>
              <li>{t('screening.preferences.aiInfo.notDiagnosis')}</li>
              <li>{t('screening.preferences.aiInfo.hospitals')}</li>
              <li>{t('screening.preferences.aiInfo.withdraw')}</li>
            </ul>
            <Checkbox
              className="mt-3"
              label={t('screening.preferences.aiConsent')}
              checked={draft.consent_ai}
              onChange={(e) => onChange({ consent_ai: e.target.checked })}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
