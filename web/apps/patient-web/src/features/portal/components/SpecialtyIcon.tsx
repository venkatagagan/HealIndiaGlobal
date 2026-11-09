import {
  Baby,
  Bean,
  Bone,
  Brain,
  Droplets,
  Ear,
  Eye,
  HandHeart,
  HeartPulse,
  Leaf,
  Microscope,
  PersonStanding,
  Ribbon,
  Scale,
  Smile,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/shared';

/** Icons used by the catalog (`specialties.icon`, lucide kebab-case names). Unknown names fall back. */
const ICONS: Record<string, LucideIcon> = {
  'heart-pulse': HeartPulse,
  bone: Bone,
  sparkles: Sparkles,
  smile: Smile,
  ribbon: Ribbon,
  brain: Brain,
  baby: Baby,
  'hand-heart': HandHeart,
  scale: Scale,
  eye: Eye,
  'person-standing': PersonStanding,
  droplets: Droplets,
  microscope: Microscope,
  ear: Ear,
  bean: Bean,
  leaf: Leaf,
  stethoscope: Stethoscope,
};

export function SpecialtyIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && ICONS[name]) || Stethoscope;
  return <Icon className={className} aria-hidden />;
}

// ---------------------------------------------------------------------------------------------------------
// Brand specialty artwork (design/specialties, 48 x 48 line icons) with a colour per specialty
// ---------------------------------------------------------------------------------------------------------
const ART = import.meta.glob<string>('../assets/specialties/*.svg', { query: '?url', import: 'default', eager: true });

function artUrl(slug: string | null | undefined): string | undefined {
  return (slug && ART[`../assets/specialties/${slug}.svg`]) || ART['../assets/specialties/more.svg'];
}

interface SpecialtyColors {
  /** soft tile */
  tile: string;
  /** solid tile while the surrounding `group` is hovered */
  hover: string;
  /** border colour of the surrounding card on hover */
  border: string;
}

/** Colour per specialty slug (vivid but harmonious; unknown slugs use the neutral "more" style). */
const SPECIALTY_COLORS: Record<string, SpecialtyColors> = {
  cardiology: {
    tile: 'bg-rose-50 text-rose-600 ring-rose-200/70 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20',
    hover: 'group-hover:bg-rose-500 group-hover:text-white group-hover:ring-rose-500',
    border: 'hover:border-rose-300 dark:hover:border-rose-400/40',
  },
  orthopedics: {
    tile: 'bg-blue-50 text-blue-600 ring-blue-200/70 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20',
    hover: 'group-hover:bg-blue-600 group-hover:text-white group-hover:ring-blue-600',
    border: 'hover:border-blue-300 dark:hover:border-blue-400/40',
  },
  cosmetic: {
    tile: 'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-200/70 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20',
    hover: 'group-hover:bg-fuchsia-600 group-hover:text-white group-hover:ring-fuchsia-600',
    border: 'hover:border-fuchsia-300 dark:hover:border-fuchsia-400/40',
  },
  dental: {
    tile: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20',
    hover: 'group-hover:bg-cyan-600 group-hover:text-white group-hover:ring-cyan-600',
    border: 'hover:border-cyan-300 dark:hover:border-cyan-400/40',
  },
  oncology: {
    tile: 'bg-purple-50 text-purple-600 ring-purple-200/70 dark:bg-purple-400/10 dark:text-purple-300 dark:ring-purple-400/20',
    hover: 'group-hover:bg-purple-600 group-hover:text-white group-hover:ring-purple-600',
    border: 'hover:border-purple-300 dark:hover:border-purple-400/40',
  },
  neurology: {
    tile: 'bg-indigo-50 text-indigo-600 ring-indigo-200/70 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20',
    hover: 'group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600',
    border: 'hover:border-indigo-300 dark:hover:border-indigo-400/40',
  },
  fertility: {
    tile: 'bg-pink-50 text-pink-600 ring-pink-200/70 dark:bg-pink-400/10 dark:text-pink-300 dark:ring-pink-400/20',
    hover: 'group-hover:bg-pink-600 group-hover:text-white group-hover:ring-pink-600',
    border: 'hover:border-pink-300 dark:hover:border-pink-400/40',
  },
  transplant: {
    tile: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    hover: 'group-hover:bg-emerald-600 group-hover:text-white group-hover:ring-emerald-600',
    border: 'hover:border-emerald-300 dark:hover:border-emerald-400/40',
  },
  bariatric: {
    tile: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
    hover: 'group-hover:bg-amber-500 group-hover:text-white group-hover:ring-amber-500',
    border: 'hover:border-amber-300 dark:hover:border-amber-400/40',
  },
  ophthalmology: {
    tile: 'bg-sky-50 text-sky-600 ring-sky-200/70 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20',
    hover: 'group-hover:bg-sky-600 group-hover:text-white group-hover:ring-sky-600',
    border: 'hover:border-sky-300 dark:hover:border-sky-400/40',
  },
  spine: {
    tile: 'bg-orange-50 text-orange-600 ring-orange-200/70 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/20',
    hover: 'group-hover:bg-orange-500 group-hover:text-white group-hover:ring-orange-500',
    border: 'hover:border-orange-300 dark:hover:border-orange-400/40',
  },
  urology: {
    tile: 'bg-teal-50 text-teal-700 ring-teal-200/70 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20',
    hover: 'group-hover:bg-teal-600 group-hover:text-white group-hover:ring-teal-600',
    border: 'hover:border-teal-300 dark:hover:border-teal-400/40',
  },
  gastroenterology: {
    tile: 'bg-lime-50 text-lime-700 ring-lime-200/70 dark:bg-lime-400/10 dark:text-lime-300 dark:ring-lime-400/20',
    hover: 'group-hover:bg-lime-600 group-hover:text-white group-hover:ring-lime-600',
    border: 'hover:border-lime-300 dark:hover:border-lime-400/40',
  },
  ent: {
    tile: 'bg-violet-50 text-violet-600 ring-violet-200/70 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20',
    hover: 'group-hover:bg-violet-600 group-hover:text-white group-hover:ring-violet-600',
    border: 'hover:border-violet-300 dark:hover:border-violet-400/40',
  },
  nephrology: {
    tile: 'bg-red-50 text-red-600 ring-red-200/70 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20',
    hover: 'group-hover:bg-red-600 group-hover:text-white group-hover:ring-red-600',
    border: 'hover:border-red-300 dark:hover:border-red-400/40',
  },
  wellness: {
    tile: 'bg-green-50 text-green-700 ring-green-200/70 dark:bg-green-400/10 dark:text-green-300 dark:ring-green-400/20',
    hover: 'group-hover:bg-green-600 group-hover:text-white group-hover:ring-green-600',
    border: 'hover:border-green-300 dark:hover:border-green-400/40',
  },
};

const NEUTRAL_COLORS: SpecialtyColors = {
  tile: 'bg-slate-100 text-slate-600 ring-slate-200/70 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/20',
  hover: 'group-hover:bg-slate-700 group-hover:text-white group-hover:ring-slate-700',
  border: 'hover:border-slate-300 dark:hover:border-slate-400/40',
};

export function specialtyColors(slug: string | null | undefined): SpecialtyColors {
  return (slug && SPECIALTY_COLORS[slug]) || NEUTRAL_COLORS;
}

/**
 * Brand specialty artwork in a coloured tile. Inside an element with the `group` class the tile turns solid on
 * hover. The SVG is applied as a CSS mask, so it takes the tile's text colour (no inline SVG markup).
 */
export function SpecialtyTile({
  slug,
  size = 'md',
  className,
}: {
  slug: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const colors = specialtyColors(slug);
  const url = artUrl(slug);
  const box = size === 'sm' ? 'size-9 rounded-lg' : size === 'lg' ? 'size-14 rounded-2xl' : 'size-12 rounded-xl';
  const art = size === 'sm' ? 'size-5' : size === 'lg' ? 'size-8' : 'size-7';
  const mask = url ? `url("${url}") center / contain no-repeat` : undefined;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center ring-1 ring-inset transition-colors duration-200',
        box,
        colors.tile,
        colors.hover,
        className,
      )}
      aria-hidden
    >
      <span className={cn('bg-current', art)} style={mask ? { mask, WebkitMask: mask } : undefined} />
    </span>
  );
}
