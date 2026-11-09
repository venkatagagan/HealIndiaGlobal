import type { CSSProperties } from 'react';
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
import { specialtyIconAsset } from '@/lib/brand';

/** Specialty `icon` values in the catalogue are lucide icon names (PLAN §4.4). */
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
};

/** Accent colours echoing the coloured icons of the "What brings you to India?" design screen. */
const TONES = ['text-primary-300', 'text-champagne', 'text-rose-300', 'text-amber-300', 'text-slate-300'];

export function specialtyTone(index: number): string {
  return TONES[index % TONES.length] ?? 'text-health-400';
}

/** Light-surface tints: each specialty gets its own gentle icon tile (bg + icon colour + ring) and hover border. */
const TINTS = [
  { tile: 'bg-primary-50 text-primary-700 ring-primary-100', hover: 'hover:border-primary-200' },
  { tile: 'bg-slate-100 text-slate-800 ring-slate-200', hover: 'hover:border-slate-300' },
  { tile: 'bg-champagne-soft/70 text-champagne ring-champagne/30', hover: 'hover:border-champagne/50' },
  { tile: 'bg-rose-50 text-rose-700 ring-rose-100', hover: 'hover:border-rose-200' },
  { tile: 'bg-amber-50 text-amber-700 ring-amber-100', hover: 'hover:border-amber-200' },
] as const;

export function specialtyTint(index: number): (typeof TINTS)[number] {
  return TINTS[((index % TINTS.length) + TINTS.length) % TINTS.length]!;
}

/**
 * Design icons are stroke="currentColor" SVG files; an <img> cannot inherit CSS colour, so the file is used as
 * a CSS mask over `currentColor`. Falls back to the matching lucide icon.
 */
export function SpecialtyIcon({ slug, icon, className = 'h-6 w-6' }: { slug: string; icon: string | null; className?: string }) {
  const asset = specialtyIconAsset(slug);
  if (asset) {
    const style: CSSProperties = {
      backgroundColor: 'currentColor',
      WebkitMaskImage: `url(${asset})`,
      maskImage: `url(${asset})`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    };
    return <span aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={style} />;
  }
  const Icon = (icon && ICONS[icon]) || Stethoscope;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.75} />;
}
