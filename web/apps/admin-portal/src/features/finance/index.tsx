/**
 * Finance console (PLAN 10 features/finance): route table + navigation for the admin portal shell.
 *
 * Shell usage (React Router 7):
 *   import { financeRoutes, financeNav } from './features/finance';
 *   { element: <PortalLayout ... />, children: [...opsRoutes, ...financeRoutes] }
 * Routes are relative children (`finance`, `finance/orders`, ...) so they mount under the portal's layout route;
 * every page is lazy-loaded and guarded by role (the API stays authoritative).
 */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import {
  ArrowLeftRight,
  BarChart3,
  BookOpenCheck,
  Building,
  FileText,
  Landmark,
  Layers,
  LayoutDashboard,
  Percent,
  ReceiptText,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@hig/shared/api';
import { Card, EmptyState, ErrorState, LoadingState } from './components/ui';
import { FINANCE_OR_ADMIN_ROLES, FINANCE_PORTAL_ROLES, FINANCE_ROLES, useCurrentUser } from './lib/permissions';
import { FINANCE_BASE, financePath } from './paths';

export { FINANCE_BASE, financePath } from './paths';
export { financePermissionsFor, useFinancePermissions, type FinancePermissions } from './lib/permissions';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));
const RefundsPage = lazy(() => import('./pages/RefundsPage'));
const AccountsPage = lazy(() => import('./pages/ledger/AccountsPage'));
const AccountEntriesPage = lazy(() => import('./pages/ledger/AccountEntriesPage'));
const JournalPage = lazy(() => import('./pages/ledger/JournalPage'));
const TrialBalancePage = lazy(() => import('./pages/ledger/TrialBalancePage'));
const AdjustmentsPage = lazy(() => import('./pages/ledger/AdjustmentsPage'));
const DocumentsPage = lazy(() => import('./pages/settlements/DocumentsPage'));
const SettlementItemsPage = lazy(() => import('./pages/settlements/SettlementItemsPage'));
const BatchesPage = lazy(() => import('./pages/settlements/BatchesPage'));
const BatchDetailPage = lazy(() => import('./pages/settlements/BatchDetailPage'));
const PayoutsPage = lazy(() => import('./pages/settlements/PayoutsPage'));
const CommissionRulesPage = lazy(() => import('./pages/CommissionRulesPage'));
const PayoutAccountsPage = lazy(() => import('./pages/PayoutAccountsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

/** Renders children only for the allowed roles (waits for /auth/me). */
export function FinanceGuard({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const me = useCurrentUser();
  if (me.isLoading) return <LoadingState />;
  if (me.isError || !me.data)
    return (
      <Card>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Card>
    );
  if (!roles.includes(me.data.role))
    return (
      <Card>
        <EmptyState
          title="You don't have access to this page"
          description="This finance page is limited to finance staff. Ask a super admin if you need access."
        />
      </Card>
    );
  return <>{children}</>;
}

function page(Component: LazyExoticComponent<ComponentType>, roles: readonly UserRole[]): ReactNode {
  return (
    <FinanceGuard roles={roles}>
      <Suspense fallback={<LoadingState />}>
        <Component />
      </Suspense>
    </FinanceGuard>
  );
}

const S = FINANCE_PORTAL_ROLES;
const F = FINANCE_ROLES;
const F_AD = FINANCE_OR_ADMIN_ROLES;
const base = FINANCE_BASE.replace(/^\/+/, '');

export const financeRoutes: RouteObject[] = [
  {
    path: base,
    children: [
      { index: true, element: page(OverviewPage, S) },
      { path: 'orders', element: page(OrdersPage, S) },
      { path: 'orders/:orderId', element: page(OrderDetailPage, S) },
      { path: 'reconciliation', element: page(ReconciliationPage, F) },
      { path: 'refunds', element: page(RefundsPage, F_AD) },
      { path: 'ledger', element: page(AccountsPage, F) },
      { path: 'ledger/accounts/:accountId', element: page(AccountEntriesPage, F) },
      { path: 'ledger/journal', element: page(JournalPage, F) },
      { path: 'ledger/trial-balance', element: page(TrialBalancePage, F) },
      { path: 'ledger/adjustments', element: page(AdjustmentsPage, F) },
      { path: 'settlements', element: page(SettlementItemsPage, F) },
      { path: 'settlements/batches', element: page(BatchesPage, F) },
      { path: 'settlements/batches/:batchId', element: page(BatchDetailPage, F) },
      { path: 'settlements/payouts', element: page(PayoutsPage, F) },
      { path: 'settlements/documents', element: page(DocumentsPage, F) },
      { path: 'payouts', element: <Navigate to={financePath('settlements/payouts')} replace /> },
      { path: 'commission-rules', element: page(CommissionRulesPage, F_AD) },
      { path: 'payout-accounts', element: page(PayoutAccountsPage, F) },
      { path: 'reports', element: page(ReportsPage, S) },
    ],
  },
];

export interface FinanceNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** roles that see the item (filter with the signed-in user's role) */
  roles: readonly UserRole[];
  /** exact match for active state */
  end?: boolean;
  /** sidebar accordion section */
  group: FinanceNavGroup;
}

/** Sidebar sections of the finance console, in display order. */
export const FINANCE_NAV_GROUPS = [
  { id: 'finance', label: 'Payments', icon: Landmark },
  { id: 'settlements', label: 'Settlements', icon: ArrowLeftRight },
  { id: 'accounting', label: 'Accounting & reports', icon: BookOpenCheck },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];
export type FinanceNavGroup = (typeof FINANCE_NAV_GROUPS)[number]['id'];

export const financeNav: FinanceNavItem[] = [
  { label: 'Finance overview', to: financePath(), icon: LayoutDashboard, roles: S, end: true, group: 'finance' },
  { label: 'Payment orders', to: financePath('orders'), icon: ReceiptText, roles: S, group: 'finance' },
  { label: 'Bank reconciliation', to: financePath('reconciliation'), icon: Landmark, roles: F, group: 'finance' },
  { label: 'Refunds', to: financePath('refunds'), icon: Undo2, roles: F_AD, group: 'finance' },
  { label: 'Settlement items', to: financePath('settlements'), icon: ArrowLeftRight, roles: F, end: true, group: 'settlements' },
  { label: 'Batches', to: financePath('settlements/batches'), icon: Layers, roles: F, group: 'settlements' },
  { label: 'Payouts', to: financePath('settlements/payouts'), icon: Wallet, roles: F, group: 'settlements' },
  { label: 'Invoices & credit notes', to: financePath('settlements/documents'), icon: FileText, roles: F, group: 'settlements' },
  { label: 'Payout accounts', to: financePath('payout-accounts'), icon: Building, roles: F, group: 'settlements' },
  { label: 'Commission rules', to: financePath('commission-rules'), icon: Percent, roles: F_AD, group: 'settlements' },
  { label: 'Ledger', to: financePath('ledger'), icon: BookOpenCheck, roles: F, group: 'accounting' },
  { label: 'Reports', to: financePath('reports'), icon: BarChart3, roles: S, group: 'accounting' },
];

/** Nav items visible to a role. */
export function financeNavFor(role: UserRole | null | undefined): FinanceNavItem[] {
  return role ? financeNav.filter((item) => item.roles.includes(role)) : [];
}
