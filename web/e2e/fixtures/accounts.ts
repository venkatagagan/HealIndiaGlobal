import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from './env';

/** UserRole (PLAN 5). */
export type UserRole = 'patient' | 'agent' | 'hospital' | 'admin' | 'finance' | 'support' | 'super_admin';

export interface Account {
  email: string;
  password: string;
  role: UserRole;
  /** Short human label used in test titles / error messages. */
  label: string;
}

function demo(local: string, role: UserRole, label: string): Account {
  return { email: `${local}@${DEMO_EMAIL_DOMAIN}`, password: DEMO_PASSWORD, role, label };
}

/**
 * Seeded demo accounts (backend/scripts/seed.py). Password for all of them: "HealIndia@2026".
 * Hospital owners follow the pattern owner.<hospital-slug>@healindia.example - see `hospitalOwner()`.
 */
export const ACCOUNTS = {
  superadmin: demo('superadmin', 'super_admin', 'super admin'),
  admin: demo('admin', 'admin', 'ops admin'),
  finance1: demo('finance1', 'finance', 'finance (maker)'),
  finance2: demo('finance2', 'finance', 'finance (checker)'),
  support: demo('support', 'support', 'support coordinator'),
  agent: demo('agent.lagos', 'agent', 'agent (Lagos)'),
  patient: demo('patient.us', 'patient', 'patient (US)'),
} as const satisfies Record<string, Account>;

export type AccountKey = keyof typeof ACCOUNTS;

/** Owner account of a seeded hospital. */
export function hospitalOwner(slug: string): Account {
  return demo(`owner.${slug}`, 'hospital', `hospital owner (${slug})`);
}

/** Staff roles that may use the admin portal (PLAN 5). */
export const STAFF_ROLES: readonly UserRole[] = ['admin', 'finance', 'support', 'super_admin'];
