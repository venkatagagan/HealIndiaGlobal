import { useState, type KeyboardEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '../../lib/shared';
import { Chip, SegmentedControl } from '../../ui/primitives';

/** Body-map regions (identical to the backend catalog BODY_AREAS). */
export const BODY_AREA_LABELS: Record<string, string> = {
  head: 'Head',
  neck: 'Neck',
  chest: 'Chest',
  abdomen: 'Abdomen',
  pelvis: 'Pelvis',
  back: 'Back',
  left_arm: 'Left arm',
  right_arm: 'Right arm',
  left_leg: 'Left leg',
  right_leg: 'Right leg',
  skin: 'Skin',
  general: 'Whole body / general',
};

export const MAP_AREAS = ['head', 'neck', 'chest', 'abdomen', 'pelvis', 'back', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
export const EXTRA_AREAS = ['skin', 'general'];

type View = 'front' | 'back';

interface Region {
  area: string;
  d: string;
}

// Silhouette geometry (viewBox 0 0 200 420). Viewer's left/right are swapped for the front view:
// the patient's left arm is drawn on the viewer's right when facing them.
const HEAD = 'M100 8c15 0 26 12 26 29s-11 31-26 31-26-14-26-31 11-29 26-29z';
const NECK = 'M89 66h22v18H89z';
const UPPER_TORSO = 'M62 86c10-4 24-6 38-6s28 2 38 6l4 74H58z';
const LOWER_TORSO = 'M58 160h84l-4 56H62z';
const PELVIS = 'M62 216h76l4 36H58z';
const ARM_VIEWER_LEFT = 'M60 88c-12 4-18 14-20 28l-8 70-6 52c-1 8 9 10 11 2l14-56 10-56z';
const ARM_VIEWER_RIGHT = 'M140 88c12 4 18 14 20 28l8 70 6 52c1 8-9 10-11 2l-14-56-10-56z';
const LEG_VIEWER_LEFT = 'M58 252h40l-4 80-4 70c0 8-14 8-16 0l-10-70z';
const LEG_VIEWER_RIGHT = 'M102 252h40l-6 80-10 70c-2 8-16 8-16 0l-4-70z';

function regionsFor(view: View): Region[] {
  const front = view === 'front';
  return [
    { area: 'head', d: HEAD },
    { area: 'neck', d: NECK },
    { area: front ? 'chest' : 'back', d: UPPER_TORSO },
    { area: front ? 'abdomen' : 'back', d: LOWER_TORSO },
    { area: 'pelvis', d: PELVIS },
    { area: front ? 'right_arm' : 'left_arm', d: ARM_VIEWER_LEFT },
    { area: front ? 'left_arm' : 'right_arm', d: ARM_VIEWER_RIGHT },
    { area: front ? 'right_leg' : 'left_leg', d: LEG_VIEWER_LEFT },
    { area: front ? 'left_leg' : 'right_leg', d: LEG_VIEWER_RIGHT },
  ];
}

export function BodyMap({ value, onChange }: { value: string[]; onChange: (areas: string[]) => void }) {
  const [view, setView] = useState<View>('front');
  const selected = new Set(value);

  function toggle(area: string) {
    const next = new Set(selected);
    if (next.has(area)) next.delete(area);
    else next.add(area);
    onChange([...next]);
  }

  function onKey(e: KeyboardEvent<SVGPathElement>, area: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(area);
    }
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,280px)_1fr]">
      <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-[#0B0F14] p-4">
        <SegmentedControl
          ariaLabel="Body view"
          value={view}
          onChange={setView}
          options={[
            { value: 'front', label: 'Front' },
            { value: 'back', label: 'Back' },
          ]}
        />
        <svg
          viewBox="0 0 200 420"
          className="mx-auto mt-4 h-[360px] w-auto max-w-full"
          role="group"
          aria-label={`Body map, ${view} view. Select the areas where you have symptoms.`}
        >
          {regionsFor(view).map((region, i) => {
            const isSelected = selected.has(region.area);
            const label = `${BODY_AREA_LABELS[region.area] ?? region.area}${isSelected ? ' (selected)' : ''}`;
            return (
              <path
                key={`${view}-${i}`}
                d={region.d}
                role="checkbox"
                aria-checked={isSelected}
                aria-label={label}
                tabIndex={0}
                onClick={() => toggle(region.area)}
                onKeyDown={(e) => onKey(e, region.area)}
                className={cn(
                  'cursor-pointer stroke-[1.5] transition-colors focus:outline-none focus-visible:stroke-white focus-visible:stroke-[3]',
                  isSelected
                    ? 'fill-red-500/80 stroke-red-300 hover:fill-red-500'
                    : 'fill-slate-600/70 stroke-slate-400 hover:fill-green-500/50',
                )}
              >
                <title>{label}</title>
              </path>
            );
          })}
          <text x="100" y="416" textAnchor="middle" className="fill-slate-400 text-[10px]">
            {view === 'front' ? 'Front (facing you)' : 'Back'}
          </text>
        </svg>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Selected areas</p>
          {value.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {value.map((a) => (
                <Chip key={a} selected onClick={() => toggle(a)} ariaLabel={`Remove ${BODY_AREA_LABELS[a] ?? a}`}>
                  {BODY_AREA_LABELS[a] ?? a} <span aria-hidden>×</span>
                </Chip>
              ))}
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Clear
              </button>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tap on the body to select an area.</p>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Or choose from the list</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...MAP_AREAS, ...EXTRA_AREAS].map((a) => (
              <Chip key={a} selected={selected.has(a)} onClick={() => toggle(a)}>
                {BODY_AREA_LABELS[a]}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PAIN_FACES = ['😀', '🙂', '🙂', '🙂', '😐', '😐', '😟', '😣', '😣', '😫', '😭'];

export function painLabel(value: number): string {
  if (value === 0) return 'No pain';
  if (value <= 3) return 'Mild';
  if (value <= 6) return 'Moderate';
  if (value <= 8) return 'Severe';
  return 'Worst imaginable';
}

export function PainSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const tone = value <= 3 ? 'text-green-500' : value <= 6 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <label htmlFor="pain-intensity" className="font-medium">
          Pain intensity
        </label>
        <span className="flex items-center gap-2">
          <span className="text-3xl" aria-hidden>
            {PAIN_FACES[value] ?? '🙂'}
          </span>
          <span className={cn('text-sm font-semibold', tone)}>
            {value}/10 · {painLabel(value)}
          </span>
        </span>
      </div>
      <input
        id="pain-intensity"
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value} out of 10, ${painLabel(value)}`}
        className="mt-4 w-full accent-green-500"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>0 · None</span>
        <span>5 · Moderate</span>
        <span>10 · Worst</span>
      </div>
    </div>
  );
}
