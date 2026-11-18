/**
 * Operations console (web-admin-ops) - public surface for the admin-portal shell.
 *
 *   import { opsRoutes, opsNav, opsIndexPath } from './features/ops';
 *   // inside the authenticated layout route (children are root-relative paths, e.g. "users"):
 *   { path: '/', element: <PortalLayout …/>, children: [{ index: true, element: <Navigate to={opsIndexPath} replace /> }, ...opsRoutes, ...financeRoutes] }
 *
 * Pages are code-split (`lazy`). `opsNav` items carry the staff roles that should see them; the API remains
 * the authority on every action. Labels: `label` is the English text, `labelKey` the `admin` catalog key the
 * shell translates (`t(item.labelKey)`).
 */
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Building2,
  Briefcase,
  CalendarCheck,
  FileClock,
  Flag,
  FolderKanban,
  Inbox,
  Handshake,
  HandCoins,
  HeartHandshake,
  Languages,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Newspaper,
  Plane,
  Scale,
  Settings,
  Settings2,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Stethoscope,
  Users,
  UsersRound,
  Globe,
  MessageCircle,
  MessageSquareQuote,
  Stamp,
  Type,
  Video,
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
  { path: 'analytics', lazy: page(() => import('./pages/AnalyticsPage')) },
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
  { path: 'settings/languages', lazy: page(() => import('./pages/LanguagesPage')) },
  { path: 'settings/translations', lazy: page(() => import('./pages/TranslationsPage')) },
  { path: 'settings/whatsapp', lazy: page(() => import('./pages/WhatsAppSettingsPage')) },
  { path: 'audit-logs', lazy: page(() => import('./pages/AuditLogsPage')) },
  { path: 'messages', lazy: page(() => import('./pages/MessagesPage')) },
  { path: 'privacy-requests', lazy: page(() => import('./pages/PrivacyRequestsPage')) },
  { path: 'privacy-tools', lazy: page(() => import('./pages/PrivacyToolsPage')) },
  { path: 'moderation', lazy: page(() => import('./pages/ModerationPage')) },
  { path: 'enquiries', lazy: page(() => import('./pages/EnquiriesPage')) },
  { path: 'reviews', lazy: page(() => import('./pages/ReviewsPage')) },
  { path: 'intro-calls', lazy: page(() => import('./pages/IntroConsultationsPage')) },
  { path: 'visa-rules', lazy: page(() => import('./pages/VisaRulesPage')) },
  { path: 'insurance/products', lazy: page(() => import('./pages/PartnerCatalogPage').then((m) => ({ default: m.InsuranceProductsPage }))) },
  { path: 'insurance/requests', lazy: page(() => import('./pages/PartnerLeadsPage').then((m) => ({ default: m.InsuranceRequestsPage }))) },
  { path: 'financing/partners', lazy: page(() => import('./pages/PartnerCatalogPage').then((m) => ({ default: m.FinancingPartnersPage }))) },
  { path: 'financing/requests', lazy: page(() => import('./pages/PartnerLeadsPage').then((m) => ({ default: m.FinancingRequestsPage }))) },
];

export interface OpsNavItem {
  to: string;
  /** English label (fallback) */
  label: string;
  /** `admin` catalog key of the label */
  labelKey: string;
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
  { id: 'operations', label: 'Patient operations', labelKey: 'nav.groups.operations', icon: Stethoscope },
  { id: 'partners', label: 'Partners', labelKey: 'nav.groups.partners', icon: Handshake },
  { id: 'insurance', label: 'Insurance & financing', labelKey: 'nav.groups.insurance', icon: HeartHandshake },
  { id: 'catalog', label: 'Catalog & content', labelKey: 'nav.groups.catalog', icon: Library },
  { id: 'people', label: 'People & access', labelKey: 'nav.groups.people', icon: UsersRound },
  { id: 'system', label: 'System', labelKey: 'nav.groups.system', icon: Settings2 },
] as const satisfies readonly { id: string; label: string; labelKey: string; icon: LucideIcon }[];
export type OpsNavGroup = (typeof OPS_NAV_GROUPS)[number]['id'];

const ALL_STAFF: readonly UserRole[] = ['admin', 'finance', 'support', 'super_admin'];
const OPS_STAFF: readonly UserRole[] = ['admin', 'support', 'super_admin'];
const ADMINS: readonly UserRole[] = ['admin', 'super_admin'];

/** Sidebar entries (filter by the current user's role before rendering). */
export const opsNav: OpsNavItem[] = [
  { to: opsPaths.dashboard, label: 'Dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ALL_STAFF, group: null },
  { to: opsPaths.analytics, label: 'Analytics', labelKey: 'nav.analytics', icon: BarChart3, roles: ALL_STAFF, group: null },
  { to: opsPaths.hospitals, label: 'Hospitals', labelKey: 'nav.hospitals', icon: Building2, roles: ALL_STAFF, group: 'partners' },
  { to: opsPaths.agents, label: 'Agents', labelKey: 'nav.agents', icon: Briefcase, roles: ALL_STAFF, group: 'partners' },
  { to: opsPaths.cases, label: 'Cases', labelKey: 'nav.cases', icon: FolderKanban, roles: ALL_STAFF, group: 'operations' },
  { to: opsPaths.bookings, label: 'Bookings', labelKey: 'nav.bookings', icon: CalendarCheck, roles: ALL_STAFF, group: 'operations' },
  { to: opsPaths.travel, label: 'Travel desk', labelKey: 'nav.travel', icon: Plane, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.messages, label: 'Support inbox', labelKey: 'nav.messages', icon: MessagesSquare, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.moderation, label: 'Reports', labelKey: 'nav.moderation', icon: Flag, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.introCalls, label: 'Free intro calls', labelKey: 'nav.introCalls', icon: Video, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.enquiries, label: 'Website enquiries', labelKey: 'nav.enquiries', icon: Inbox, roles: OPS_STAFF, group: 'operations' },
  { to: opsPaths.reviews, label: 'Reviews', labelKey: 'nav.reviews', icon: MessageSquareQuote, roles: ALL_STAFF, group: 'partners' },
  { to: opsPaths.insuranceProducts, label: 'Insurance products', labelKey: 'nav.insuranceProducts', icon: ShieldPlus, roles: ALL_STAFF, group: 'insurance' },
  { to: opsPaths.insuranceRequests, label: 'Insurance requests', labelKey: 'nav.insuranceRequests', icon: ClipboardList, roles: ALL_STAFF, group: 'insurance' },
  { to: opsPaths.financingPartners, label: 'Pay-later partners', labelKey: 'nav.financingPartners', icon: HandCoins, roles: ALL_STAFF, group: 'insurance' },
  { to: opsPaths.financingRequests, label: 'Pay-later requests', labelKey: 'nav.financingRequests', icon: Inbox, roles: ALL_STAFF, group: 'insurance' },
  { to: opsPaths.users, label: 'Users', labelKey: 'nav.users', icon: Users, roles: ALL_STAFF, group: 'people' },
  { to: opsPaths.staff, label: 'Staff', labelKey: 'nav.staff', icon: ShieldCheck, roles: ADMINS, group: 'people' },
  { to: opsPaths.privacy, label: 'Privacy requests', labelKey: 'nav.privacy', icon: Scale, roles: OPS_STAFF, group: 'people' },
  { to: opsPaths.privacyTools, label: 'Privacy compliance', labelKey: 'nav.privacyTools', icon: ShieldAlert, roles: ADMINS, group: 'people' },
  { to: opsPaths.catalog, label: 'Catalog', labelKey: 'nav.catalog', icon: BookOpen, roles: ALL_STAFF, group: 'catalog' },
  { to: opsPaths.content, label: 'Content', labelKey: 'nav.content', icon: Newspaper, roles: ALL_STAFF, group: 'catalog' },
  { to: opsPaths.visaRules, label: 'Visa rules', labelKey: 'nav.visaRules', icon: Stamp, roles: ALL_STAFF, group: 'catalog' },
  { to: opsPaths.settings, label: 'Settings', labelKey: 'nav.settings', icon: Settings, roles: ALL_STAFF, group: 'system', end: true },
  { to: opsPaths.website, label: 'Website & contact', labelKey: 'nav.website', icon: Globe, roles: ALL_STAFF, group: 'system' },
  { to: opsPaths.languages, label: 'Languages', labelKey: 'nav.languages', icon: Languages, roles: ADMINS, group: 'system' },
  { to: opsPaths.translations, label: 'Translations', labelKey: 'nav.translations', icon: Type, roles: ADMINS, group: 'system' },
  { to: opsPaths.whatsapp, label: 'WhatsApp', labelKey: 'whatsapp.nav', icon: MessageCircle, roles: ALL_STAFF, group: 'system' },
  { to: opsPaths.audit, label: 'Audit log', labelKey: 'nav.audit', icon: FileClock, roles: ALL_STAFF, group: 'system' },
];

/** opsNav filtered for a role. */
export function opsNavFor(role: UserRole | null | undefined): OpsNavItem[] {
  return role ? opsNav.filter((item) => item.roles.includes(role)) : [];
}
