import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import {
  Bell,
  Bookmark,
  BriefcaseMedical,
  CalendarCheck,
  CalendarRange,
  FileText,
  HeartPulse,
  Home,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Plane,
  Receipt,
  Stethoscope,
  User,
  UserRound,
} from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { websiteUrl } from '@hig/shared/auth';
import { NotificationBell, PortalLayout, type NavItem } from '@hig/shared/layout';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError, type MessageOut } from '@hig/shared/api';
import { qk, useUnreadCount } from '../api/queries';
import { useRealtimeConnection, useRealtimeEvent } from '../lib/realtime';
import { paths, PORTAL_BASE } from '../lib/paths';
import { useLogout, useMe } from '../lib/session';
import { cn } from '../lib/shared';
import { Button, ButtonLink, ErrorState, Spinner } from '../ui/primitives';

/** Unread notification counter for nav items. */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-danger-strong px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Sidebar: Dashboard, then accordion sections (one open at a time; the section of the current page opens). */
function buildNav(unread: number): NavItem[] {
  const badge = unread > 0 ? <CountBadge count={unread} /> : undefined;
  return [
    { to: paths.dashboard, label: 'Dashboard', icon: LayoutDashboard, end: true, accent: 'green' },
    {
      id: 'care',
      label: 'Care',
      icon: HeartPulse,
      accent: 'rose',
      children: [
        { to: paths.screenings, label: 'AI screenings', icon: Stethoscope },
        { to: paths.cases, label: 'My cases', icon: BriefcaseMedical },
      ],
    },
    {
      id: 'bookings',
      label: 'Bookings & payments',
      icon: CalendarRange,
      accent: 'blue',
      children: [
        { to: paths.bookings, label: 'Bookings', icon: CalendarCheck },
        { to: paths.payments, label: 'Payments', icon: Receipt },
      ],
    },
    {
      id: 'trip',
      label: 'Trip & documents',
      icon: Plane,
      accent: 'cyan',
      children: [
        { to: paths.tripIndex, label: 'Trip', icon: Plane },
        { to: paths.documents, label: 'Documents', icon: FileText },
      ],
    },
    {
      id: 'inbox',
      label: 'Messages & alerts',
      icon: MessagesSquare,
      accent: 'violet',
      children: [
        { to: paths.messages, label: 'Messages', icon: MessageSquare },
        { to: paths.notifications, label: 'Notifications', icon: Bell, badge },
      ],
    },
    {
      id: 'account',
      label: 'Account',
      icon: UserRound,
      accent: 'amber',
      children: [
        { to: paths.saved, label: 'Saved', icon: Bookmark },
        { to: paths.profile, label: 'Profile', icon: User },
      ],
    },
  ];
}

interface BottomItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const BOTTOM_NAV: BottomItem[] = [
  { to: paths.dashboard, label: 'Home', icon: <Home className="h-5 w-5" aria-hidden />, end: true },
  { to: `${PORTAL_BASE}/screening/new`, label: 'Screening', icon: <Stethoscope className="h-5 w-5" aria-hidden /> },
  { to: paths.tripIndex, label: 'Trip', icon: <Plane className="h-5 w-5" aria-hidden /> },
  { to: paths.messages, label: 'Messages', icon: <MessageSquare className="h-5 w-5" aria-hidden /> },
  { to: paths.profile, label: 'Profile', icon: <User className="h-5 w-5" aria-hidden /> },
];

const MENU_LINK =
  'flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none';

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label="Loading page" />
    </div>
  );
}

/** Catches render errors (incl. failed lazy chunk loads) so one broken page does not blank the portal. */
class PageErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Portal page crashed', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="This page could not be displayed"
          error={new Error('Please reload the page. If it keeps happening, contact support.')}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

/** Invalidates cached data when the server pushes realtime events. */
function RealtimeBridge() {
  const qc = useQueryClient();
  const location = useLocation();
  useRealtimeConnection(true);
  useRealtimeEvent(null, (event) => {
    switch (event.type) {
      case 'message.created': {
        const message: MessageOut = event.data;
        qc.setQueryData<MessageOut[]>(qk.messages(message.conversation_id), (prev) =>
          prev ? (prev.some((m) => m.id === message.id) ? prev : [...prev, message]) : prev,
        );
        void qc.invalidateQueries({ queryKey: qk.conversations });
        break;
      }
      case 'notification.created': {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        if (!location.pathname.startsWith(paths.notifications)) {
          toast(event.data.title, { description: event.data.body ?? undefined });
        }
        break;
      }
      case 'screening.completed': {
        void qc.invalidateQueries({ queryKey: qk.screening(event.data.screening_id) });
        void qc.invalidateQueries({ queryKey: ['screenings', 'list'] });
        void qc.invalidateQueries({ queryKey: qk.dashboard });
        break;
      }
      case 'booking.updated': {
        void qc.invalidateQueries({ queryKey: ['bookings'] });
        void qc.invalidateQueries({ queryKey: ['payments'] });
        void qc.invalidateQueries({ queryKey: ['cases'] });
        void qc.invalidateQueries({ queryKey: qk.dashboard });
        break;
      }
      case 'case.updated': {
        void qc.invalidateQueries({ queryKey: ['cases'] });
        void qc.invalidateQueries({ queryKey: qk.dashboard });
        break;
      }
      default:
        break;
    }
  });
  return null;
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-bg p-4">{children}</div>;
}

export function PortalShell() {
  const me = useMe();
  const location = useLocation();
  const logout = useLogout();
  const unread = useUnreadCount();

  if (me.isPending) {
    return (
      <FullScreen>
        <Spinner label="Loading your portal" />
      </FullScreen>
    );
  }
  if (me.isError) {
    if (isApiError(me.error) && (me.error.status === 401 || me.error.status === 403)) {
      return <Navigate to={paths.login(location.pathname + location.search)} replace />;
    }
    return (
      <FullScreen>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </FullScreen>
    );
  }
  const user = me.data;
  const signOut = () => logout.mutate(undefined, { onSettled: () => window.location.assign(websiteUrl()) });
  if (user.role !== 'patient') {
    return (
      <FullScreen>
        <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-fg">This portal is for patients</h1>
          <p className="mt-2 text-sm text-muted">
            You are signed in as a {user.role.replace('_', ' ')} account. Please use your own portal, or sign out and
            sign in with a patient account.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <ButtonLink to="/" variant="outline">
              Home
            </ButtonLink>
            <Button variant="primary" loading={logout.isPending} onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  const count = unread.data?.count ?? 0;
  const displayName = user.is_guest ? 'Guest' : user.full_name;

  return (
    <>
      <RealtimeBridge />
      <PortalLayout
        nav={buildNav(count)}
        homeTo={paths.dashboard}
        subtitle="Patient portal"
        primaryAction={{ label: 'Start AI screening', to: paths.newScreening(), icon: Stethoscope }}
        user={{ name: displayName, email: user.email, role: user.role, avatarUrl: user.avatar_url }}
        userMenuItems={
          <>
            <Link to={paths.profile} role="menuitem" className={MENU_LINK}>
              <User className="size-4 text-muted" aria-hidden />
              Profile
            </Link>
            <Link to={paths.saved} role="menuitem" className={MENU_LINK}>
              <Bookmark className="size-4 text-muted" aria-hidden />
              Saved hospitals & doctors
            </Link>
          </>
        }
        onLogout={signOut}
        topbarExtra={<NotificationBell to={paths.notifications} count={count} />}
        contentClassName="pb-28 lg:pb-12"
      >
        <div className="mx-auto w-full max-w-6xl">
          <PageErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </div>
      </PortalLayout>

      {/* Mobile bottom navigation (mirrors the app design) */}
      <nav
        aria-label="Quick navigation"
        className="surface-glass fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive
                  ? 'text-primary-ink before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-brand-gradient'
                  : 'text-muted hover:text-fg',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
