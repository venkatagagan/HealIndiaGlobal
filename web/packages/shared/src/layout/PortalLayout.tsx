import { isValidElement, useState, type ComponentType, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ChevronDown, ChevronRight, Menu, PanelLeftClose } from 'lucide-react';
import type { UserRole } from '../api/enums';
import { useOptionalAuth } from '../auth/AuthProvider';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { prefs } from '../lib/storage';
import { Drawer } from '../ui/overlay';
import { BrandLogo } from './Brand';
import { ThemeToggle, UserMenu, type UserMenuUser } from './controls';

/** A lucide icon component (`icon: LayoutDashboard`) or any element (`icon: <MyIcon />`). */
export type NavIcon = ComponentType<{ className?: string }> | ReactNode;

/** Colour of a top-level item's icon tile (default: a palette colour picked by position). */
export type NavAccent = 'green' | 'blue' | 'violet' | 'amber' | 'cyan' | 'rose' | 'indigo' | 'orange' | 'fuchsia' | 'sky' | 'slate';

export interface NavItem {
  label: ReactNode;
  /** router path (relative to the router basename); optional for groups (items with `children`) */
  to?: string;
  /** stable key for a group (default: its label) */
  id?: string;
  icon?: NavIcon;
  /** only shown to these roles (needs <AuthProvider>) */
  roles?: readonly UserRole[];
  /**
   * sub-items: the item becomes an accordion group (only one group is open at a time; the group holding the active
   * route opens automatically). A group whose children are all hidden for the role is hidden too.
   */
  children?: readonly NavItem[];
  /** match the path exactly (default: true for "/", false otherwise) */
  end?: boolean;
  /**
   * counter / badge after the label. On a closed group a child's badge is summarised as a dot on the group
   * header (pass `badge` on the group itself to show a specific value instead).
   */
  badge?: ReactNode;
  /** render as a plain <a href> (other app / external site) */
  external?: boolean;
  /** top-level items: colour of the icon tile */
  accent?: NavAccent;
}

/** Prominent call to action at the top of the sidebar (e.g. "Start AI screening"). */
export interface SidebarAction {
  label: string;
  to: string;
  icon?: NavIcon;
}

export interface PortalLayoutProps {
  /** sidebar brand (default: the Heal India Global logo) */
  brand?: ReactNode;
  /** brand shown when the sidebar is collapsed (default: the logo mark) */
  brandCompact?: ReactNode;
  /** caption under the default brand name (e.g. "Agent portal") */
  subtitle?: ReactNode;
  /** where the default brand links to (default "/") */
  homeTo?: string;
  nav: readonly NavItem[];
  /** call to action shown above the navigation (icon-only when the sidebar is collapsed) */
  primaryAction?: SidebarAction;
  /** replaces the default account menu (avatar + sign out) */
  userMenu?: ReactNode;
  /** user shown in the default account menu (default: the AuthProvider user) */
  user?: UserMenuUser | null;
  /** extra entries of the default account menu (links / buttons, rendered above "Sign out") */
  userMenuItems?: ReactNode;
  /** elements in the top bar before the theme toggle (notifications bell, hospital switcher, ...) */
  topbarExtra?: ReactNode;
  /** text / element at the start of the top bar */
  title?: ReactNode;
  /** bottom of the sidebar (e.g. help link, version) */
  sidebarFooter?: ReactNode;
  showThemeToggle?: boolean;
  /** override the default sign-out action (default: useAuth().logout()) */
  onLogout?: () => void;
  /** page content (default: <Outlet /> for layout routes) */
  children?: ReactNode;
  /** class of the <main> element */
  contentClassName?: string;
}

const ACCENT_ORDER: readonly NavAccent[] = ['green', 'blue', 'violet', 'amber', 'cyan', 'rose', 'indigo', 'orange', 'fuchsia', 'sky'];

/** soft tile (idle) and solid tile (active section) per accent */
const ACCENT_TILE: Record<NavAccent, { soft: string; solid: string }> = {
  green: {
    soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    solid: 'bg-linear-to-br from-emerald-500 to-green-700 text-white shadow-sm shadow-emerald-700/30',
  },
  blue: {
    soft: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
    solid: 'bg-linear-to-br from-blue-500 to-blue-700 text-white shadow-sm shadow-blue-700/30',
  },
  violet: {
    soft: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    solid: 'bg-linear-to-br from-violet-500 to-violet-700 text-white shadow-sm shadow-violet-700/30',
  },
  amber: {
    soft: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    solid: 'bg-linear-to-br from-amber-500 to-orange-600 text-white shadow-sm shadow-amber-700/30',
  },
  cyan: {
    soft: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300',
    solid: 'bg-linear-to-br from-cyan-500 to-cyan-700 text-white shadow-sm shadow-cyan-700/30',
  },
  rose: {
    soft: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    solid: 'bg-linear-to-br from-rose-500 to-rose-700 text-white shadow-sm shadow-rose-700/30',
  },
  indigo: {
    soft: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
    solid: 'bg-linear-to-br from-indigo-500 to-indigo-700 text-white shadow-sm shadow-indigo-700/30',
  },
  orange: {
    soft: 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300',
    solid: 'bg-linear-to-br from-orange-500 to-orange-700 text-white shadow-sm shadow-orange-700/30',
  },
  fuchsia: {
    soft: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300',
    solid: 'bg-linear-to-br from-fuchsia-500 to-fuchsia-700 text-white shadow-sm shadow-fuchsia-700/30',
  },
  sky: {
    soft: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
    solid: 'bg-linear-to-br from-sky-500 to-sky-700 text-white shadow-sm shadow-sky-700/30',
  },
  slate: {
    soft: 'bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300',
    solid: 'bg-linear-to-br from-slate-500 to-slate-700 text-white shadow-sm shadow-slate-700/30',
  },
};

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar';

function renderIcon(icon: NavIcon | undefined, className: string): ReactNode {
  if (icon === undefined || icon === null || icon === false) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === 'function' || (typeof icon === 'object' && '$$typeof' in (icon as object))) {
    const Icon = icon as ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
    return <Icon className={className} aria-hidden />;
  }
  return icon as ReactNode;
}

function visibleItems(items: readonly NavItem[], role: UserRole | null): NavItem[] {
  return items
    .filter((item) => !item.roles || (role !== null && item.roles.includes(role)))
    .map((item) => (item.children ? { ...item, children: visibleItems(item.children, role) } : item))
    .filter((item) => !item.children || item.children.length > 0);
}

function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.to === undefined) return false;
  const end = item.end ?? item.to === '/';
  if (end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(item.to.endsWith('/') ? item.to : `${item.to}/`);
}

function isGroup(item: NavItem): boolean {
  return Boolean(item.children && item.children.length > 0);
}

function groupKey(item: NavItem): string {
  return item.id ?? (typeof item.label === 'string' ? item.label : (item.to ?? ''));
}

function hasBadge(item: NavItem): boolean {
  return item.badge !== undefined && item.badge !== null && item.badge !== false;
}

/** Key of the group holding the active route (null when the route is a top-level item or unknown). */
function activeGroupKey(items: readonly NavItem[], pathname: string): string | null {
  const group = items.find((item) => isGroup(item) && item.children!.some((child) => isActivePath(pathname, child)));
  return group ? groupKey(group) : null;
}

/** Coloured square behind a top-level icon. */
function IconTile({ item, accent, solid, dot }: { item: NavItem; accent: NavAccent; solid: boolean; dot?: boolean }) {
  const tile = ACCENT_TILE[accent];
  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
        solid ? tile.solid : tile.soft,
      )}
    >
      {renderIcon(item.icon, 'size-[18px]')}
      {dot && <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-sidebar bg-danger" aria-hidden />}
    </span>
  );
}

function NavEntry({
  item,
  accent,
  collapsed,
  depth,
  open = false,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  accent: NavAccent;
  collapsed: boolean;
  depth: number;
  /** groups only: whether this accordion section is open */
  open?: boolean;
  /** groups only: toggle this section (expanded sidebar) or expand the sidebar onto it (collapsed sidebar) */
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const hasChildren = isGroup(item);
  const childActive = hasChildren && item.children!.some((child) => isActivePath(location.pathname, child));
  const childBadge = hasChildren && item.children!.some(hasBadge);
  const label = typeof item.label === 'string' ? item.label : undefined;

  // ---- second level (inside an open group) ------------------------------------------------------------
  if (depth > 0) {
    const childContent = (
      <>
        {renderIcon(item.icon, 'size-4 shrink-0 opacity-80')}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {hasBadge(item) && <span className="shrink-0">{item.badge}</span>}
      </>
    );
    const childBase = cn(
      'relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-[13px] font-medium transition-colors',
      FOCUS,
    );
    const childIdle = 'text-muted hover:bg-surface-2/80 hover:text-fg';
    const childActiveCls =
      'bg-primary-soft font-semibold text-primary-ink before:absolute before:-start-[9px] before:inset-y-1.5 before:w-[3px] before:rounded-full before:bg-linear-to-b before:from-primary before:to-accent';
    return (
      <li>
        {item.external ? (
          <a href={item.to} className={cn(childBase, childIdle)} onClick={onNavigate}>
            {childContent}
          </a>
        ) : (
          <NavLink
            to={item.to ?? '/'}
            end={item.end ?? item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => cn(childBase, isActive ? childActiveCls : childIdle)}
          >
            {childContent}
          </NavLink>
        )}
      </li>
    );
  }

  // ---- top level ------------------------------------------------------------------------------------------
  const base = cn(
    'group relative flex w-full items-center gap-2.5 rounded-xl text-start text-sm font-medium transition-all',
    FOCUS,
    collapsed ? 'justify-center p-1.5' : 'px-1.5 py-1.5',
  );
  const idle = 'text-fg/80 hover:bg-surface-2/80 hover:text-fg dark:text-fg/85';
  const groupBadgeDot = childBadge && !hasBadge(item) && (collapsed || !open);
  const textPart = (
    <>
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{item.label}</span>
      {!collapsed && hasBadge(item) && (!hasChildren || !open) && <span className="shrink-0">{item.badge}</span>}
    </>
  );

  if (item.external) {
    return (
      <li>
        <a href={item.to} className={cn(base, idle)} title={collapsed ? label : undefined} onClick={onNavigate}>
          <IconTile item={item} accent={accent} solid={false} />
          {textPart}
        </a>
      </li>
    );
  }

  if (hasChildren) {
    const panelId = `nav-group-${groupKey(item).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    if (collapsed) {
      // icon-only sidebar: the group icon expands the sidebar with this section open
      return (
        <li>
          <button
            type="button"
            onClick={onToggle}
            title={label}
            aria-label={label}
            className={cn(base, childActive ? 'bg-surface-2/70' : idle)}
          >
            <IconTile item={item} accent={accent} solid={childActive} dot={groupBadgeDot || hasBadge(item)} />
            {textPart}
          </button>
        </li>
      );
    }
    return (
      <li>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(base, childActive || open ? 'font-semibold text-fg' : idle, open && !childActive && 'bg-surface-2/50')}
        >
          <IconTile item={item} accent={accent} solid={childActive} dot={groupBadgeDot} />
          {textPart}
          <ChevronDown
            className={cn('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180 text-fg')}
            aria-hidden
          />
        </button>
        {open && (
          <ul id={panelId} className="mb-1 ms-[1.375rem] mt-1 flex animate-fade-in flex-col gap-0.5 border-s border-sidebar-border ps-2">
            {item.children!.map((child) => (
              <NavEntry key={child.to} item={child} accent={accent} collapsed={false} depth={1} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <NavLink
        to={item.to ?? '/'}
        end={item.end ?? item.to === '/'}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(base, isActive ? 'bg-brand-gradient font-semibold text-white shadow-glow [&>span:first-child]:bg-white/20 [&>span:first-child]:text-white' : idle)
        }
      >
        <IconTile item={item} accent={accent} solid={false} dot={collapsed && hasBadge(item)} />
        {textPart}
      </NavLink>
    </li>
  );
}

function NavList({
  items,
  collapsed,
  onNavigate,
  onExpand,
  label,
  action,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  /** collapsed sidebar: a group icon was clicked - expand the sidebar */
  onExpand?: () => void;
  label: string;
  action?: SidebarAction;
}) {
  const location = useLocation();
  const routeGroup = activeGroupKey(items, location.pathname);
  // accordion: one open section; it follows the active route whenever the route moves into another section
  const [openGroup, setOpenGroup] = useState<string | null>(routeGroup);
  const [lastRouteGroup, setLastRouteGroup] = useState(routeGroup);
  if (routeGroup !== lastRouteGroup) {
    setLastRouteGroup(routeGroup);
    if (routeGroup !== null) setOpenGroup(routeGroup);
  }

  const toggle = (key: string) => {
    if (collapsed) {
      setOpenGroup(key);
      onExpand?.();
    } else {
      setOpenGroup((current) => (current === key ? null : key));
    }
  };

  return (
    <nav aria-label={label} className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2.5' : 'px-3')}>
      {action && (
        <Link
          to={action.to}
          onClick={onNavigate}
          title={collapsed ? action.label : undefined}
          aria-label={collapsed ? action.label : undefined}
          className={cn(
            'mb-4 flex items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-white shadow-glow transition hover:brightness-110',
            FOCUS,
            collapsed ? 'size-11' : 'h-11 px-4',
          )}
        >
          {renderIcon(action.icon, 'size-[18px] shrink-0')}
          <span className={cn('truncate', collapsed && 'sr-only')}>{action.label}</span>
        </Link>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((item, index) => {
          const key = isGroup(item) ? groupKey(item) : `${item.to}-${typeof item.label === 'string' ? item.label : ''}`;
          return (
            <NavEntry
              key={key}
              item={item}
              accent={item.accent ?? ACCENT_ORDER[index % ACCENT_ORDER.length]!}
              collapsed={collapsed}
              depth={0}
              open={openGroup === key}
              onToggle={isGroup(item) ? () => toggle(key) : undefined}
              onNavigate={onNavigate}
            />
          );
        })}
      </ul>
    </nav>
  );
}

const SIDEBAR_SURFACE =
  'bg-sidebar bg-[radial-gradient(120%_45%_at_0%_0%,var(--color-sidebar-tint),transparent_70%),radial-gradient(110%_40%_at_100%_100%,var(--color-sidebar-glow),transparent_70%)]';

/**
 * Authenticated portal shell: collapsible sidebar (desktop) with colour-coded accordion sections, drawer navigation
 * (mobile), sticky top bar with extra actions, theme toggle and account menu. Use as a layout route element
 * (renders <Outlet />) or pass the page as children.
 */
export function PortalLayout({
  brand,
  brandCompact,
  subtitle,
  homeTo = '/',
  nav,
  primaryAction,
  userMenu,
  user,
  userMenuItems,
  topbarExtra,
  title,
  sidebarFooter,
  showThemeToggle = true,
  onLogout,
  children,
  contentClassName,
}: PortalLayoutProps) {
  const { t } = useCommonTranslation();
  const auth = useOptionalAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => prefs.get('sidebar-collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  // close the mobile drawer whenever the route changes
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMobileOpen(false);
  }

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      prefs.set('sidebar-collapsed', value ? null : '1');
      return !value;
    });
  };
  const expandSidebar = () => {
    prefs.set('sidebar-collapsed', null);
    setCollapsed(false);
  };

  const role = auth?.user?.role ?? null;
  const items = visibleItems(nav, role);
  const menuUser: UserMenuUser | null =
    user !== undefined
      ? user
      : auth?.user
        ? { name: auth.user.full_name, email: auth.user.email, role: auth.user.role, avatarUrl: auth.user.avatar_url }
        : null;
  const logout = onLogout ?? (auth ? () => void auth.logout() : undefined);
  const navLabel = t('layout.mainNavigation');
  const fullBrand = brand ?? <BrandLogo to={homeTo} subtitle={subtitle} />;
  const compactBrand = brandCompact ?? <BrandLogo compact to={homeTo} />;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-fg shadow focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('layout.skipToContent')}
      </a>

      {/* desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-30 hidden flex-col border-e border-sidebar-border transition-[width] duration-200 lg:flex',
          SIDEBAR_SURFACE,
          collapsed ? 'w-18' : 'w-64',
        )}
      >
        <div className={cn('relative flex h-16 shrink-0 items-center gap-2', collapsed ? 'justify-center px-2' : 'ps-4 pe-3')}>
          {collapsed ? (
            <>
              {compactBrand}
              <button
                type="button"
                onClick={expandSidebar}
                aria-label={t('layout.expandSidebar')}
                title={t('layout.expandSidebar')}
                className={cn(
                  'absolute -end-3 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-surface text-muted shadow-raised transition-colors hover:text-fg',
                  FOCUS,
                )}
              >
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">{fullBrand}</div>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={t('layout.collapseSidebar')}
                title={t('layout.collapseSidebar')}
                className={cn(
                  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg',
                  FOCUS,
                )}
              >
                <PanelLeftClose className="size-[18px]" aria-hidden />
              </button>
            </>
          )}
        </div>
        <div className="mx-4 h-px shrink-0 bg-linear-to-r from-transparent via-sidebar-border to-transparent" aria-hidden />
        <NavList items={items} collapsed={collapsed} onExpand={expandSidebar} label={navLabel} action={primaryAction} />
        {sidebarFooter && !collapsed && <div className="border-t border-sidebar-border px-4 py-3 text-xs text-muted">{sidebarFooter}</div>}
      </aside>

      {/* mobile navigation */}
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="start"
        size="sm"
        title={brand ?? <BrandLogo subtitle={subtitle} />}
        aria-label={navLabel}
        className="max-w-72 lg:hidden"
      >
        <div className={cn('-mx-5 -my-4 flex h-full flex-col', SIDEBAR_SURFACE)}>
          <NavList
            items={items}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
            label={navLabel}
            action={primaryAction}
          />
          {sidebarFooter && <div className="border-t border-sidebar-border px-4 py-3 text-xs text-muted">{sidebarFooter}</div>}
        </div>
      </Drawer>

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:ps-18' : 'lg:ps-64')}>
        <header className="surface-glass sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t('layout.openMenu')}
            aria-expanded={mobileOpen}
            className="-ms-1.5 inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="lg:hidden">{compactBrand}</div>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{title}</div>
          <div className="flex items-center gap-1 sm:gap-2">
            {topbarExtra}
            {showThemeToggle && <ThemeToggle />}
            {userMenu ??
              (menuUser ? (
                <UserMenu user={menuUser} onLogout={logout}>
                  {userMenuItems}
                </UserMenu>
              ) : null)}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={cn('flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8', contentClassName)}>
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
