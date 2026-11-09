/**
 * Indian-rupee formatting for the staff dashboard and detail pages. One convention everywhere:
 * - compact (tiles, axes, ranked bars): below ₹1 lakh the full amount with Indian grouping (₹50,400),
 *   then lakh / crore with one or two decimals (₹2.1 L, ₹1.25 Cr);
 * - full (tooltips, tables): ₹21,00,000 (en-IN grouping, no paise unless present).
 * Amounts arrive in minor units (paise) from the API.
 */
const FULL = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

function trim(n: number, digits: number): string {
  return Number(n.toFixed(digits)).toLocaleString('en-IN', { maximumFractionDigits: digits });
}

/** Rupees (major units) -> "₹50,400" / "₹2.1 L" / "₹1.25 Cr". */
export function inrCompactMajor(rupees: number): string {
  const sign = rupees < 0 ? '-' : '';
  const abs = Math.abs(rupees);
  if (abs < LAKH) return `${sign}₹${GROUPED.format(abs)}`;
  if (abs < CRORE) return `${sign}₹${trim(abs / LAKH, abs < 10 * LAKH ? 2 : 1)} L`;
  return `${sign}₹${trim(abs / CRORE, 2)} Cr`;
}

/** Paise -> compact rupees. */
export function inrCompact(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  return inrCompactMajor(minor / 100);
}

/** Paise -> "₹21,00,000" (Indian grouping). */
export function inrFull(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  return FULL.format(minor / 100);
}

/** "Nice" 0-based axis ticks (1-2-2.5-5 steps) covering `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
