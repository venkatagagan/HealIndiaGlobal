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
import { parseOptionalNumber } from '../../lib/format';
import { qk } from '../../lib/queries';

const ACCREDITATION_HINTS: Record<string, string> = {
  jci: 'Joint Commission International',
  nabh: 'National Accreditation Board for Hospitals & Healthcare Providers',
  nabl: 'National Accreditation Board for Testing & Calibration Laboratories',
  iso: 'ISO 9001 / 15189 certification',
};

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
      toast.success('Saved');
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
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Accreditations</h3>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Select only accreditations you currently hold. Upload certificates in the KYC step - they are verified before
          being shown to patients.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACCREDITATIONS.map((a) => (
            <div key={a} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Checkbox
                label={ACCREDITATION_LABELS[a]}
                description={ACCREDITATION_HINTS[a]}
                checked={accreditations.includes(a)}
                onChange={() => setAccreditations(toggle(accreditations, a))}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Languages spoken by staff</h3>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Used to match international patients.</p>
        <div className="flex flex-wrap gap-2">
          {allLanguages.map((lang) => (
            <Chip key={lang} selected={languages.includes(lang)} onClick={() => setLanguages(toggle(languages, lang))}>
              {lang}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex max-w-sm gap-2">
          <label htmlFor={`${ids}-lang`} className="sr-only">
            Add another language
          </label>
          <Input
            id={`${ids}-lang`}
            placeholder="Add another language"
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
            Add
          </Button>
        </div>
      </section>

      <section className="max-w-xl space-y-4">
        <Switch
          checked={desk}
          onChange={setDesk}
          label="International patient desk"
          description="A dedicated team that handles visas, interpreters and airport pickups."
        />
        <FormField
          label="Distance from nearest international airport (km)"
          htmlFor={`${ids}-airport`}
          error={airportValue === undefined ? 'Enter a distance between 0 and 500 km' : undefined}
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
          {onSaved ? 'Save & continue' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
