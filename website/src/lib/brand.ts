/**
 * Brand assets synced from ../design by scripts/prebuild.mjs (the manifest lists the copied web images).
 * Every lookup is optional: without design assets the site falls back to its inline SVG mark and lucide icons.
 */
import manifest from '@/data/brand-manifest.json';

const files = new Set<string>(((manifest as { files?: { path: string }[] }).files ?? []).map((f) => f.path));

function first(...candidates: string[]): string | null {
  return candidates.find((c) => files.has(c)) ?? null;
}

/** Square brand mark (lotus + cross), used next to the HTML wordmark. */
export function brandMark(): string | null {
  return first('/brand/logo/logo-mark.svg', '/brand/icons/favicon.svg');
}

/** Specialty line icon (stroke = currentColor), e.g. /brand/specialties/cardiology.svg. */
export function specialtyIconAsset(slug: string): string | null {
  const safe = slug.replace(/[^a-z0-9-]/gi, '');
  return first(`/brand/specialties/${safe}.svg`, `/brand/icons/specialties/${safe}.svg`);
}

/** Illustration by name, e.g. "no-results", "ai-processing", "onboarding-security", "success", "error". */
export function illustration(name: string): string | null {
  return first(`/brand/illustrations/${name}.svg`, `/brand/illustrations/${name}.png`);
}

/** Favicon from design/icons (SVG). */
export function favicon(): string | null {
  return first('/brand/icons/favicon.svg', '/brand/logo/logo-mark.svg');
}
