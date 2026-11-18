import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  ACCREDITATIONS,
  ACCREDITATION_LABELS,
  errorMessage,
  hospitalPortalApi,
  type HospitalProfileOut,
} from '@hig/shared/api';
import { Button, Checkbox, Chip, FormField, Input, Switch } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { parseOptionalNumber } from '../../lib/format';
import { qk } from '../../lib/queries';

type T = ReturnType<typeof useAppTranslation>['t'];

function accreditationHint(code: string, t: T): string | undefined {
  switch (code) {
    case 'jci':
      return t('onboarding.services.accreditationHints.jci');
    case 'nabh':
      return t('onboarding.services.accreditationHints.nabh');
    case 'nabl':
      return t('onboarding.services.accreditationHints.nabl');
    case 'iso':
      return t('onboarding.services.accreditationHints.iso');
    default:
      return undefined;
  }
}

/** Language names are stored (and shown to patients) as entered, in English - data, not UI text. */
export const COMMON_LANGUAGES = [
  'English',
  'Hindi',
  'Arabic',
  'French',
  'Russian',
  'Bengali',
  'Swahili',
  'Spanish',
  'Persian',
  'Uzbek',
  'Amharic',
  'Portuguese',
];

/** Step 2 - accreditations, spoken languages, international patient desk, airport distance. */
export function ServicesStep({ profile, onSaved }: { profile: HospitalProfileOut; onSaved?: () => void }) {
  const { t } = useAppTranslation();
  const ids = useId();
  const queryClient = useQueryClient();
  const [accreditations, setAccreditations] = useState<string[]>(profile.accreditations ?? []);
  const [languages, setLanguages] = useState<string[]>(profile.languages?.length ? profile.languages : ['English']);
  const [customLanguage, setCustomLanguage] = useState('');
  const [desk, setDesk] = useState(profile.international_desk);
  const [airport, setAirport] = useState(profile.airport_distance_km != null ? String(profile.airport_distance_km) : '');
  const airportValue = parseOptionalNumber(airport, { min: 0, max: 500 });

  const save = useMutation({
    mutationFn: () =>
      hospitalPortalApi.updateProfile({
        accreditations,
        languages,
        international_desk: desk,
        airport_distance_km: airportValue ?? null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.profile, updated);
      toast.success(t('onboarding.services.saved'));
      onSaved?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const allLanguages = [...new Set([...COMMON_LANGUAGES, ...languages])];

  const addCustom = () => {
    const v = customLanguage.trim();
    if (!v) return;
    const normalized = v.charAt(0).toUpperCase() + v.slice(1);
    if (!languages.includes(normalized)) setLanguages([...languages, normalized]);
    setCustomLanguage('');
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('onboarding.services.accreditations')}</h3>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('onboarding.services.accreditationsHelp')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACCREDITATIONS.map((a) => (
            <div key={a} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Checkbox
                label={ACCREDITATION_LABELS[a]}
                description={accreditationHint(a, t)}
                checked={accreditations.includes(a)}
                onChange={() => setAccreditations(toggle(accreditations, a))}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('onboarding.services.languages')}</h3>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('onboarding.services.languagesHelp')}</p>
        <div className="flex flex-wrap gap-2">
          {allLanguages.map((lang) => (
            <Chip key={lang} selected={languages.includes(lang)} onClick={() => setLanguages(toggle(languages, lang))}>
              {lang}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex max-w-sm gap-2">
          <label htmlFor={`${ids}-lang`} className="sr-only">
            {t('onboarding.services.addLanguage')}
          </label>
          <Input
            id={`${ids}-lang`}
            placeholder={t('onboarding.services.addLanguage')}
            value={customLanguage}
            maxLength={40}
            onChange={(e) => setCustomLanguage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button variant="outline" onClick={addCustom} icon={<Plus className="h-4 w-4" aria-hidden />}>
            {t('onboarding.services.add')}
          </Button>
        </div>
      </section>

      <section className="max-w-xl space-y-4">
        <Switch
          checked={desk}
          onChange={setDesk}
          label={t('onboarding.services.desk')}
          description={t('onboarding.services.deskHelp')}
        />
        <FormField
          label={t('onboarding.services.airportDistance')}
          htmlFor={`${ids}-airport`}
          error={airportValue === undefined ? t('onboarding.services.airportDistanceError') : undefined}
        >
          <Input
            id={`${ids}-airport`}
            inputMode="decimal"
            value={airport}
            onChange={(e) => setAirport(e.target.value)}
            aria-invalid={airportValue === undefined}
          />
        </FormField>
      </section>

      <div className="flex justify-end">
        <Button
          loading={save.isPending}
          disabled={airportValue === undefined || languages.length === 0}
          onClick={() => save.mutate()}
        >
          {onSaved ? t('onboarding.saveAndContinue') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
