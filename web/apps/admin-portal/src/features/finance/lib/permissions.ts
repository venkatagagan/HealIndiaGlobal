/**
 * Client-side capability map for the finance console (PLAN 8.11 / 8.12 legend: F = finance|super_admin,
 * AD = admin|super_admin, S = any staff). It only hides/disables UI; the API remains authoritative.
 */
import { useQuery } from '@tanstack/react-query';
import { authApi, type SettlementBatchOut, type UserOut, type UserRole, type Uuid } from '@hig/shared/api';

export interface FinancePermissions {
  userId: Uuid | null;
  userName: string | null;
  role: UserRole | null;
  /** F: ledger, settlements, payouts, reconciliation, refund approval */
  finance: boolean;
  /** F or AD: create refunds */
  createRefunds: boolean;
  /** F or AD: commission rules */
  editCommissionRules: boolean;
  /** S: overview + reports */
  staff: boolean;
}

const F: readonly UserRole[] = ['finance', 'super_admin'];
const AD: readonly UserRole[] = ['admin', 'super_admin'];
const S: readonly UserRole[] = ['admin', 'finance', 'support', 'super_admin'];

export function financePermissionsFor(
  role: UserRole | null | undefined,
  userId: Uuid | null = null,
  userName: string | null = null,
): FinancePermissions {
  const r = role ?? null;
  const has = (list: readonly UserRole[]) => r !== null && list.includes(r);
  return {
    userId,
    userName,
    role: r,
    finance: has(F),
    createRefunds: has(F) || has(AD),
    editCommissionRules: has(F) || has(AD),
    staff: has(S),
  };
}

/**
 * Current signed-in staff user (GET /auth/me), cached under ['auth', 'me'] (shared with the rest of the portal).
 * The shell's auth layer owns the session; this read-only query lets finance pages adapt to the role.
 */
export function useCurrentUser() {
  return useQuery<UserOut>({ queryKey: ['auth', 'me'], queryFn: () => authApi.me(), staleTime: 5 * 60_000 });
}

export function useFinancePermissions(): FinancePermissions {
  const { data: user } = useCurrentUser();
  return financePermissionsFor(user?.role, user?.id ?? null, user?.full_name ?? null);
}

/** Roles allowed into any finance page (route guard + nav). */
export const FINANCE_PORTAL_ROLES: readonly UserRole[] = S;
export const FINANCE_ROLES: readonly UserRole[] = F;
export const FINANCE_OR_ADMIN_ROLES: readonly UserRole[] = ['admin', 'finance', 'super_admin'];

/**
 * Maker-checker (PLAN 6.4): the approver of a settlement batch must differ from its creator. Compares ids when
 * the API exposes `created_by`, otherwise falls back to the display name.
 */
export function isBatchMaker(batch: SettlementBatchOut, perms: Pick<FinancePermissions, 'userId' | 'userName'>): boolean {
  if (batch.created_by && perms.userId) return batch.created_by === perms.userId;
  return Boolean(perms.userName && batch.created_by_name && batch.created_by_name === perms.userName);
}
