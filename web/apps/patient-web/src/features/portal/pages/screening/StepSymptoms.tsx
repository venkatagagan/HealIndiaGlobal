import { useMemo, useState, type FormEvent } from 'react';
import { Check, Minus, Plus, Sparkles, X } from 'lucide-react';
import type { ScreeningSymptom, SymptomAnswer } from '@hig/shared/api';
import { useSymptomLibrary } from '../../api/queries';
import { cn } from '../../lib/shared';
import { Badge, Button, Field, Input, Skeleton, Textarea } from '../../ui/primitives';

const ANSWER_STYLES: Record<SymptomAnswer, { tone: 'green' | 'amber' | 'neutral'; label: string }> = {
  yes: { tone: 'green', label: 'Yes' },
  maybe: { tone: 'amber', label: 'Maybe' },
  no: { tone: 'neutral', label: 'No' },
};

const FALLBACK_SUGGESTIONS = ['Pain', 'Fatigue', 'Swelling', 'Fever', 'Headaches', 'Dizziness', 'Shortness of breath', 'Weight loss'];

export function StepSymptoms({
  specialtySlug,
  bodyAreas,
  symptoms,
  notes,
  onSymptoms,
  onNotes,
}: {
  specialtySlug: string | null;
  bodyAreas: string[];
  symptoms: ScreeningSymptom[];
  notes: string;
  onSymptoms: (s: ScreeningSymptom[]) => void;
  onNotes: (n: string) => void;
}) {
  const library = useSymptomLibrary(specialtySlug ? { specialty: specialtySlug } : {});
  const [custom, setCustom] = useState('');

  const suggestions = useMemo(() => {
    const items = library.data ?? [];
    const areas = new Set(bodyAreas);
    const scored = items
      .map((item) => {
        let score = 0;
        if (specialtySlug && item.specialty_slugs.includes(specialtySlug)) score += 2;
        if (item.body_areas.some((a) => areas.has(a))) score += 3;
        if (item.body_areas.includes('general')) score += 1;
        return { name: item.name, score };
      })
      .filter((x) => x.score > 0 || (!specialtySlug && areas.size === 0))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((x) => x.name);
    const unique = [...new Set(scored)];
    return unique.length ? unique.slice(0, 24) : library.isSuccess ? FALLBACK_SUGGESTIONS : [];
  }, [library.data, library.isSuccess, bodyAreas, specialtySlug]);

  const answered = new Map(symptoms.map((s) => [s.name.toLowerCase(), s.answer]));
  const queue = suggestions.filter((name) => !answered.has(name.toLowerCase()));
  const current = queue[0];

  function answer(name: string, value: SymptomAnswer) {
    const rest = symptoms.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
    onSymptoms([...rest, { name, answer: value }]);
  }

  function remove(name: string) {
    onSymptoms(symptoms.filter((s) => s.name !== name));
  }

  function addCustom(e: FormEvent) {
    e.preventDefault();
    const name = custom.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!name) return;
    answer(name, 'yes');
    setCustom('');
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card deck */}
        <div>
          {library.isPending ? (
            <Skeleton className="h-64 w-full rounded-2xl" />
          ) : current ? (
            <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-center text-white shadow-lg">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                {queue.length} suggestion{queue.length === 1 ? '' : 's'} left
              </p>
              <div className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                <Sparkles className="h-7 w-7" aria-hidden />
              </div>
              <p className="mt-4 text-2xl font-bold" aria-live="polite">
                {current}
              </p>
              <p className="mt-1 text-sm text-slate-400">Do you have this symptom?</p>
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => answer(current, 'no')}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/40 hover:bg-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  aria-label={`No, I do not have ${current}`}
                >
                  <X className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => answer(current, 'maybe')}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 hover:bg-amber-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  aria-label={`Maybe ${current}`}
                >
                  <Minus className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => answer(current, 'yes')}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 text-green-400 ring-1 ring-green-500/40 hover:bg-green-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                  aria-label={`Yes, I have ${current}`}
                >
                  <Check className="h-6 w-6" />
                </button>
              </div>
              <div className="mt-3 flex justify-center gap-10 text-xs text-slate-400">
                <span>No</span>
                <span>Maybe</span>
                <span>Yes</span>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
              <Check className="h-8 w-8 text-green-500" aria-hidden />
              <p className="mt-2 font-semibold">All suggestions answered</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Add anything else below.</p>
            </div>
          )}

          {queue.length > 1 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Quick select</p>
              <div className="flex flex-wrap gap-2">
                {queue.slice(1, 13).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => answer(name, 'yes')}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-sm hover:border-green-500 hover:text-green-700 dark:border-slate-700 dark:hover:text-green-400"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> {name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Answers */}
        <div className="space-y-4">
          <div>
            <p className="font-semibold">Your symptoms</p>
            {symptoms.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {symptoms.map((s) => (
                  <li
                    key={s.name}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-sm',
                      s.answer === 'no'
                        ? 'border-slate-200 text-slate-400 line-through dark:border-slate-800'
                        : 'border-slate-300 dark:border-slate-700',
                    )}
                  >
                    {s.name}
                    <Badge tone={ANSWER_STYLES[s.answer].tone}>{ANSWER_STYLES[s.answer].label}</Badge>
                    <select
                      aria-label={`Change answer for ${s.name}`}
                      value={s.answer}
                      onChange={(e) => answer(s.name, e.target.value as SymptomAnswer)}
                      className="rounded bg-transparent text-xs text-slate-500 focus:outline-none"
                    >
                      <option value="yes">Yes</option>
                      <option value="maybe">Maybe</option>
                      <option value="no">No</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(s.name)}
                      className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      aria-label={`Remove ${s.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Answer the cards or add your own symptoms.</p>
            )}
          </div>

          <form onSubmit={addCustom} className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Add another symptom (e.g. knee stiffness)"
              aria-label="Add another symptom"
              maxLength={80}
            />
            <Button type="submit" variant="outline" disabled={!custom.trim()}>
              Add
            </Button>
          </form>

          <Field
            label="Describe it in your own words (optional)"
            htmlFor="symptom-notes"
            hint="When did it start, what makes it better or worse, any diagnosis you already have."
          >
            <Textarea
              id="symptom-notes"
              rows={5}
              maxLength={4000}
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
