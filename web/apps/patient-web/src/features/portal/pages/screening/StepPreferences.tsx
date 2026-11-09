import { BrainCircuit, ShieldCheck } from 'lucide-react';
import { DOCTOR_GENDER_PREFS, DOCTOR_GENDER_PREF_LABELS, type DoctorGenderPref } from '@hig/shared/api';
import { COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from '../../lib/countries';
import { SUPPORTED_CURRENCIES, currencySymbol, isoDateFromToday } from '../../lib/shared';
import { Checkbox, Chip, Field, Input, SegmentedControl, Select, Switch } from '../../ui/primitives';
import type { WizardDraft } from './wizardModel';

const BUDGET_PRESETS: { label: string; min: string; max: string }[] = [
  { label: 'Under 5K', min: '', max: '5000' },
  { label: '5K – 15K', min: '5000', max: '15000' },
  { label: '15K – 30K', min: '15000', max: '30000' },
  { label: '30K – 50K', min: '30000', max: '50000' },
  { label: '50K+', min: '50000', max: '' },
];

export function StepPreferences({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  const symbol = currencySymbol(draft.budget_currency);
  const today = isoDateFromToday(0);

  function toggleLanguage(lang: string) {
    onChange({
      languages: draft.languages.includes(lang) ? draft.languages.filter((l) => l !== lang) : [...draft.languages, lang],
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-semibold">Language</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">We prefer doctors and staff who speak these languages.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((l) => (
            <Chip key={l.value} selected={draft.languages.includes(l.value)} onClick={() => toggleLanguage(l.value)}>
              <span aria-hidden>{l.flag}</span> {l.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="max-w-md">
        <h3 className="mb-3 font-semibold">Doctor gender</h3>
        <SegmentedControl<DoctorGenderPref>
          ariaLabel="Doctor gender preference"
          value={draft.doctor_gender}
          onChange={(v) => onChange({ doctor_gender: v })}
          options={DOCTOR_GENDER_PREFS.map((g) => ({ value: g, label: DOCTOR_GENDER_PREF_LABELS[g] }))}
        />
      </section>

      <section>
        <h3 className="font-semibold">Budget range</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Total treatment budget, including the hospital stay.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((p) => (
            <Chip
              key={p.label}
              selected={draft.budget_min === p.min && draft.budget_max === p.max}
              onClick={() => onChange({ budget_min: p.min, budget_max: p.max })}
            >
              {symbol}
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-3">
          <Field label="Currency" htmlFor="budget-ccy">
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
          <Field label={`Minimum (${symbol})`} htmlFor="budget-min">
            <Input
              id="budget-min"
              inputMode="decimal"
              value={draft.budget_min}
              onChange={(e) => onChange({ budget_min: e.target.value })}
              placeholder="No minimum"
            />
          </Field>
          <Field label={`Maximum (${symbol})`} htmlFor="budget-max">
            <Input
              id="budget-max"
              inputMode="decimal"
              value={draft.budget_max}
              onChange={(e) => onChange({ budget_max: e.target.value })}
              placeholder="No maximum"
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="font-semibold">Travel window</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">When could you travel to India?</p>
        <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
          <Field label="Earliest" htmlFor="tw-start">
            <Input
              id="tw-start"
              type="date"
              min={today}
              value={draft.travel_window_start}
              onChange={(e) => onChange({ travel_window_start: e.target.value })}
            />
          </Field>
          <Field label="Latest" htmlFor="tw-end">
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
          label="Your home country"
          htmlFor="home-country"
          hint="Used to compare treatment costs and waiting times with your country."
        >
          <Select id="home-country" value={draft.home_country} onChange={(e) => onChange({ home_country: e.target.value })}>
            <option value="">Select a country</option>
            {COUNTRY_OPTIONS.map((c) => (
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
              <BrainCircuit className="h-4 w-4 text-violet-500" aria-hidden /> Use AI recommendations
            </span>
          }
          description="An AI model reviews your answers to suggest specialties and procedures. Turn off to use our rule-based matching only."
        />
        {draft.use_ai ? (
          <div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
              <ShieldCheck className="h-4 w-4" aria-hidden /> How your information is used
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-violet-900/80 dark:text-violet-200/80">
              <li>Your answers (and any reports you attached) are sent securely to our AI provider to prepare a triage summary.</li>
              <li>It is not a diagnosis. A doctor always reviews your case before any treatment.</li>
              <li>Hospitals only see your information after you request a quote and agree to share it.</li>
              <li>You can withdraw this consent at any time in your profile.</li>
            </ul>
            <Checkbox
              className="mt-3"
              label="I agree to AI processing of my health information for this screening"
              checked={draft.consent_ai}
              onChange={(e) => onChange({ consent_ai: e.target.checked })}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
