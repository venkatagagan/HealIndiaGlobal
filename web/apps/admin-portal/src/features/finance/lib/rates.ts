/** Rate helpers: the API stores rates in basis points (1500 = 15%); finance edits them as percentages. */

/** "15" / "15.5" percent -> basis points; null when invalid or outside 0-100% (max 2 decimals). */
export function percentToBps(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [whole = '0', frac = ''] = t.split('.');
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

/** 1550 bps -> "15.5" (for the % input) */
export function bpsToPercentText(bps: number): string {
  return String(bps / 100);
}
