import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { STAFF_ROLES } from '@hig/shared/api';
import { LoginPage, RequireAuth, routerBasename } from '@hig/shared/auth';
import { PortalLayout, type NavItem } from '@hig/shared/layout';
import { EmptyState } from '@hig/shared/ui';
import { useAppTranslation } from './i18n';
import { OPS_NAV_GROUPS, opsIndexPath, opsNav, opsRoutes, type OpsNavGroup, type OpsNavItem } from './features/ops';
import { FINANCE_NAV_GROUPS, financeNav, financeRoutes, type FinanceNavItem } from './features/finance';

type LabelledEntry = { label: string; labelKey?: string };

/**
 * Translated label of a nav entry. Ops entries carry an `admin` catalog key; finance entries are labelled by
 * the finance feature (its own `finance` namespace: either a `labelKey` or an already translated `label`).
 */
function labelOf(entry: LabelledEntry, t: TFunction): string {
  return entry.labelKey ? t(entry.labelKey, { defaultValue: entry.label }) : entry.label;
}

function link(item: OpsNavItem | FinanceNavItem, t: TFunction): NavItem {
  return {
    label: labelOf(item as LabelledEntry, t),
    to: item.to,
    icon: item.icon,
    roles: item.roles,
    ...('end' in item && item.end ? { end: true } : {}),
  };
}

function section(
  group: { id: string; label: string; icon: NavItem['icon'] },
  items: (OpsNavItem | FinanceNavItem)[],
  t: TFunction,
): NavItem {
  return { id: group.id, label: labelOf(group as LabelledEntry, t), icon: group.icon, children: items.map((item) => link(item, t)) };
}

/**
 * Sidebar: Dashboard, then accordion sections (one open at a time; PortalLayout hides items - and sections left
 * empty - by role): day-to-day operations first, then money, then reference data and administration.
 * Built on every render (cheap) so the labels follow the UI language and admin overrides merged later.
 */
function useNav(): NavItem[] {
  const { t } = useAppTranslation();
  const { t: tFinance } = useTranslation('finance');
  const opsSection = (id: OpsNavGroup): NavItem =>
    section(
      OPS_NAV_GROUPS.find((group) => group.id === id)!,
      opsNav.filter((item) => item.group === id),
      t,
    );
  const financeSections = FINANCE_NAV_GROUPS.map((group) =>
    section(
      group,
      financeNav.filter((item) => item.group === group.id),
      tFinance,
    ),
  );
  return [
    ...opsNav.filter((item) => item.group === null).map((item) => link(item, t)),
    opsSection('operations'),
    opsSection('partners'),
    ...financeSections,
    opsSection('catalog'),
    opsSection('people'),
    opsSection('system'),
  ];
}

function StaffShell() {
  const { t } = useAppTranslation();
  const nav = useNav();
  return (
    <RequireAuth roles={STAFF_ROLES} loginUrl="/login">
      <PortalLayout nav={nav} title={t('shell.title')} />
    </RequireAuth>
  );
}

function StaffLogin() {
  const { t } = useAppTranslation();
  // STAFF DOOR (PLAN 3.1): email + password + TOTP step ("mfa_required") against /auth/staff/login.
  return (
    <LoginPage
      door="staff"
      title={t('shell.login.title')}
      subtitle={t('shell.login.subtitle')}
      onSuccessPath={opsIndexPath}
      forgotPasswordUrl={null}
      registerUrl={null}
    />
  );
}

function NotFound() {
  const { t } = useAppTranslation();
  return <EmptyState title={t('shell.notFound.title')} description={t('shell.notFound.description')} />;
}

const routes: RouteObject[] = [
  {
    path: '/login',
    element: <StaffLogin />,
  },
  {
    path: '/',
    element: <StaffShell />,
    children: [
      { index: true, element: <Navigate to={opsIndexPath} replace /> },
      ...opsRoutes,
      ...financeRoutes,
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes, { basename: routerBasename() }); // '/gahi' (Vite base)
