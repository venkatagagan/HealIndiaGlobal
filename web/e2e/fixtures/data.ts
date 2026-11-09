import { randomBytes } from 'node:crypto';
import { DEMO_EMAIL_DOMAIN } from './env';

/** Short unique token for names/emails created by a test run, e.g. "m2k9f3a7". */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36).slice(-5)}${randomBytes(2).toString('hex')}`;
}

/** Unique, clearly-marked name for e2e-created records ("E2E Specialty m2k9f3a7"). */
export function e2eName(kind: string): string {
  return `E2E ${kind} ${uniqueSuffix()}`;
}

/** Unique email on the demo domain for users registered by a test. */
export function e2eEmail(kind: string): string {
  return `e2e.${kind}.${uniqueSuffix()}@${DEMO_EMAIL_DOMAIN}`;
}

/** YYYY-MM-DD for today + `days` (UTC). */
export function isoDate(days: number, from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/** Escape a string for use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive RegExp matching `value` literally. */
export function literal(value: string): RegExp {
  return new RegExp(escapeRegExp(value), 'i');
}

/** Unique 12-character bank UTR-like reference. */
export function fakeUtr(): string {
  return `E2E${Date.now().toString().slice(-9)}`;
}
