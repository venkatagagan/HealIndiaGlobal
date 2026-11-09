import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { STAFF_ROLES } from '@hig/shared/api';
import { LoginPage, RequireAuth, routerBasename } from '@hig/shared/auth';
import { PortalLayout, type NavItem } from '@hig/shared/layout';
import { EmptyState } from '@hig/shared/ui';
import { OPS_NAV_GROUPS, opsIndexPath, opsNav, opsRoutes, type OpsNavGroup, type OpsNavItem } from './features/ops';
import { FINANCE_NAV_GROUPS, financeNav, financeRoutes, type FinanceNavItem } from './features/finance';

function link(item: OpsNavItem | FinanceNavItem): NavItem {
  return { label: item.label, to: item.to, icon: item.icon, roles: item.roles, ...('end' in item && item.end ? { end: true } : {}) };
}

function section(group: { id: string; label: string; icon: NavItem['icon'] }, items: (OpsNavItem | FinanceNavItem)[]): NavItem {
  return { id: group.id, label: group.label, icon: group.icon, children: items.map(link) };
}

const opsSection = (id: OpsNavGroup): NavItem =>
  section(
    OPS_NAV_GROUPS.find((group) => group.id === id)!,
    opsNav.filter((item) => item.group === id),
  );
const financeSections = FINANCE_NAV_GROUPS.map((group) =>
  section(
    group,
    financeNav.filter((item) => item.group === group.id),
  ),
);

/**
 * Sidebar: Dashboard, then accordion sections (one open at a time; PortalLayout hides items - and sections left
 * empty - by role): day-to-day operations first, then money, then reference data and administration.
 */
const nav: NavItem[] = [
  ...opsNav.filter((item) => item.group === null).map(link),
  opsSection('operations'),
  opsSection('partners'),
  ...financeSections,
  opsSection('catalog'),
  opsSection('people'),
  opsSection('system'),
];

const routes: RouteObject[] = [
  {
    // STAFF DOOR (PLAN 3.1): email + password + TOTP step ("mfa_required") against /auth/staff/login.
    path: '/login',
    element: (
      <LoginPage
        door="staff"
        title="Staff sign-in"
        subtitle="Heal India Global operations & finance console"
        onSuccessPath={opsIndexPath}
        forgotPasswordUrl={null}
        registerUrl={null}
      />
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth roles={STAFF_ROLES} loginUrl="/login">
        <PortalLayout nav={nav} title="Staff console" />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to={opsIndexPath} replace /> },
      ...opsRoutes,
      ...financeRoutes,
      {
        path: '*',
        element: <EmptyState title="Page not found" description="The page you are looking for does not exist or was moved." />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes, { basename: routerBasename() }); // '/gahi' (Vite base)
