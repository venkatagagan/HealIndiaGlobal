/**
 * Operations console (web-admin-ops) - public surface for the admin-portal shell.
 *
 *   import { opsRoutes, opsNav, opsIndexPath } from './features/ops';
 *   // inside the authenticated layout route (children are root-relative paths, e.g. "users"):
 *   { path: '/', element: <PortalLayout â€¦/>, children: [{ index: true, element: <Navigate to={opsIndexPath} replace /> }, ...opsRoutes, ...financeRoutes] }
 *
 * Pages are code-split (`lazy`). `opsNav` items carry the staff roles that should see them; the API remains
 * the authority on every action.
 */
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Building2,
  Briefcase,
  CalendarCheck,
  FileClock,
  Flag,
  FolderKanban,
  Inbox,
  Handshake,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Newspaper,
  Plane,
  Settings,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  UsersRound,
  Globe,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type { UserRole } from '@hig/shared/api';
import { opsPaths } from './lib/paths';

export { opsPaths } from './lib/paths';
export { permissionsFor, type OpsPermissions } from './lib/permissions';

export const opsIndexPath = opsPaths.dashboard;

const page = (loader: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await loader()).default,
});

/** Child routes (relative paths) to mount under the shell's authenticated layout. */
export const opsRoutes: RouteObject[] = [
  { path: 'dashboard', lazy: page(() => import('./pages/DashboardPage')) },
  { path: 'users', lazy: page(() => import('./pages/UsersPage')) },
  { path: 'staff', lazy: page(() => import('./pages/StaffPage')) },
  { path: 'hospitals', lazy: page(() => import('./pages/HospitalsPage')) },
  { path: 'hospitals/:id', lazy: page(() => import('./pages/HospitalDetailPage')) },
  { path: 'agents', lazy: page(() => import('./pages/AgentsPage')) },
  { path: 'cases', lazy: page(() => import('./pages/CasesPage')) },
  { path: 'cases/:id', lazy: page(() => import('./pages/CaseDetailPage')) },
  { path: 'bookings', lazy: page(() => import('./pages/BookingsPage')) },
  { path: 'travel', lazy: page(() => import('./pages/TravelDeskPage')) },
  { path: 'catalog', lazy: page(() => import('./pages/CatalogPage')) },
  { path: 'content', lazy: page(() => import('./pages/ContentPage')) },
  { path: 'settings', lazy: page(() => import('./pages/SettingsPage')) },
  { path: 'settings/website', lazy: page(() => import('./pages/WebsiteSettingsPage')) },
  { path: 'audit-logs', lazy: page(() => import('./pages/AuditLogsPage')) },
  { path: 'messages', lazy: page(() => import('./pages/MessagesPage')) },
  { path: 'moderation', lazy: page(() => import('./pages/ModerationPage')) },
  { path: 'enquiries', lazy: page(() => import('./pages/EnquiriesPage')) },
];

export interface OpsNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** staff roles that see this entry */
  roles: readonly UserRole[];
  /** sidebar accordion section (`null` = top-level link) */
  group: OpsNavGroup | null;
  /** active only on the exact path (not on child pages such as settings/website) */
  end?: boolean;
}

/** Sidebar sections of the operations console, in display order. */
export const OPS_NAV_GROUPS = [
  { id: 'operations', label: 'Patient operations', icon: Stethoscope },
  { id: 'partners', label: 'Partners', icon: Handshake },
  { id: 'catalog', label: 'Catalog & content', icon: Library },
  { id: 'people', label: 'People & access', icon: UsersRound },
  { id: 'system', label: 'System', icon: Settings2 },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];
export type OpsNavGroup = (typeof OPS_NAV_GROUPS)[number]['id'];

const ALL_STAFF: readonly UserRole[] = ['admin', 'finance', 'support', 'super_admin'];
const OPS_STAFF: readonly UserRole[] = ['admin', 'support', 'super_admin'];
const ADMINS: readonly UserRole[] = ['admin', 'super_admin'];

/** Sidebar entries (filter by the current user's role before rendering). */
export const opsNav: OpsNavItem[] = [
  { to: opsPaths.dashboard, label: 'Dashboard', icon: LayoutDashboard, roles: ALL_STAFF, group: null },
  { to: opsPaths.hospitals, label: 'Hospitals', icon: Building2, roles: ALL_STAFF, group: 'partners' },
  { to: opsPaths.agents, label: 'Agents', icon: Briefcase, roles: ALL_STAFF, group: 'partners' },
  { to: opsPaths.cases, label: 'Cases', icon: FolderKanban, roles: ALL_STAFF, group: 'operations' },
  { to: opsPaths.bookings, label: 'Bookings', icon: CalendarCheck, roles: ALL_STAFF, group: 'operations' },
  { to: opsPaths.travel, label: 'Travel desk', icon: Plane, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.messages, label: 'Support inbox', icon: MessagesSquare, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.moderation, label: 'Reports', icon: Flag, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.enquiries, label: 'Website enquiries', icon: Inbox, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.users, label: 'Users', icon: Users, roles: ALL_STAFF, group: 'people' },
  { to: opsPaths.staff, label: 'Staff', icon: ShieldCheck, roles: ADMINS, group: 'people' },
  { to: opsPaths.catalog, label: 'Catalog', icon: BookOpen, roles: ALL_STAFF, group: 'catalog' },
  { to: opsPaths.content, label: 'Content', icon: Newspaper, roles: ALL_STAFF, group: 'catalog' },
  { to: opsPaths.settings, label: 'Settings', icon: Settings, roles: ALL_STAFF, group: 'system', end: true },
  { to: opsPaths.website, label: 'Website & contact', icon: Globe, roles: ALL_STAFF, group: 'system' },
  { to: opsPaths.audit, label: 'Audit log', icon: FileClock, roles: ALL_STAFF, group: 'system' },
];

/** opsNav filtered for a role. */
export function opsNavFor(role: UserRole | null | undefined): OpsNavItem[] {
  return role ? opsNav.filter((item) => item.roles.includes(role)) : [];
}
