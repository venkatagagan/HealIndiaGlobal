/**
 * Semantic colour tones shared by Badge, StatusBadge, StatCard, ProgressBar ...
 * Colour-name aliases (green, blue, amber, red, violet, gray) are accepted so screens written against the
 * apps' local kits keep working when they switch to @hig/shared/ui.
 */
export type SemanticTone = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'accent';
export type ToneAlias = 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'gray' | 'slate';
export type Tone = SemanticTone | ToneAlias;

const ALIASES: Record<ToneAlias, SemanticTone> = {
  green: 'success',
  blue: 'info',
  amber: 'warning',
  red: 'danger',
  violet: 'accent',
  gray: 'neutral',
  slate: 'neutral',
};

export function normalizeTone(tone: Tone | null | undefined): SemanticTone {
  if (!tone) return 'neutral';
  return (ALIASES as Record<string, SemanticTone>)[tone] ?? (tone as SemanticTone);
}

/** soft background + readable text (badges, icon tiles) */
export const TONE_SOFT: Record<SemanticTone, string> = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  primary: 'bg-primary-soft text-primary-ink',
  success: 'bg-success-soft text-success-ink',
  info: 'bg-info-soft text-info-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  accent: 'bg-accent-soft text-accent-ink',
};

/** solid fill (progress bars, dots) */
export const TONE_SOLID: Record<SemanticTone, string> = {
  neutral: 'bg-muted',
  primary: 'bg-primary',
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
};
