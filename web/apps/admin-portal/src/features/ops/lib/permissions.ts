import type { UserRole } from '@hig/shared/api';

/**
 * Client-side capability map for the operations console. It only hides/disables UI the current staff role
 * cannot use; the API stays authoritative (PLAN 8.13 legend: S = any staff, AD = admin|super_admin,
 * F = finance|super_admin).
 */
export interface OpsPermissions {
  role: UserRole | null;
  isStaff: boolean;
  isSuperAdmin: boolean;
  /** AD: suspend/activate users, change roles, create staff */
  manageUsers: boolean;
  /** AD: approve / reject / suspend hospitals and agents, featured flag */
  approvePartners: boolean;
  /** AD or F: hospital/agent commission rate, settlement cycle, agent tier */
  editCommercials: boolean;
  /** AD: catalog & content CRUD */
  editCatalog: boolean;
  /** AD: non-finance platform settings */
  editGeneralSettings: boolean;
  /** F: finance platform settings */
  editFinanceSettings: boolean;
  /** admin|support|super_admin: case status changes and coordinator assignment */
  manageCases: boolean;
  /** S: cancel bookings, admit / complete on behalf of the hospital */
  manageBookings: boolean;
  /** admin|support|super_admin: travel desk updates & SOS handling */
  manageTravel: boolean;
  /** S: read audit logs */
  viewAudit: boolean;
  /** admin|support|super_admin: content reports (moderation queue) and website enquiries */
  moderateContent: boolean;
}

const AD: readonly UserRole[] = ['admin', 'super_admin'];
const F: readonly UserRole[] = ['finance', 'super_admin'];
const STAFF: readonly UserRole[] = ['admin', 'finance', 'support', 'super_admin'];
const OPS: readonly UserRole[] = ['admin', 'support', 'super_admin'];

export function permissionsFor(role: UserRole | null | undefined): OpsPermissions {
  const r = role ?? null;
  const has = (list: readonly UserRole[]) => r !== null && list.includes(r);
  return {
    role: r,
    isStaff: has(STAFF),
    isSuperAdmin: r === 'super_admin',
    manageUsers: has(AD),
    approvePartners: has(AD),
    editCommercials: has(AD) || has(F),
    editCatalog: has(AD),
    editGeneralSettings: has(AD),
    editFinanceSettings: has(F),
    manageCases: has(OPS),
    manageBookings: has(STAFF),
    manageTravel: has(OPS),
    viewAudit: has(STAFF),
    moderateContent: has(OPS),
  };
}

/** Platform setting keys that only finance|super_admin may change (PLAN 6.3 defaults). */
export const FINANCE_SETTING_KEYS: ReadonlySet<string> = new Set([
  'default_commission_bps',
  'default_agent_commission_bps',
  'gst_rate_bps',
  'tds_194o_rate_bps',
  'deposit_pct',
  'settlement_hold_days',
  'settlement_cycle_days',
  'patient_service_fee_bps',
  'fx_rate_max_age_hours',
  'refund_dual_approval_threshold_minor',
  'cancellation_retention_hospital_share_bps',
  'agent_tds_rate_bps',
  'agent_nonresident_withholding_bps',
  'platform_gstin',
  'platform_gst_state',
  'refund_policy',
  'bank_transfer_details',
]);

export function isFinanceSettingKey(key: string): boolean {
  return FINANCE_SETTING_KEYS.has(key) || /(_bps|commission|settlement|refund|payout|tax|gst|tds|bank)/.test(key);
}

/** Staff roles an admin may assign. Only a super_admin may grant super_admin. */
export function assignableRoles(actor: UserRole | null): UserRole[] {
  const base: UserRole[] = ['patient', 'agent', 'hospital', 'admin', 'finance', 'support'];
  return actor === 'super_admin' ? [...base, 'super_admin'] : base;
}
