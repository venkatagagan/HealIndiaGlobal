import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import {
  Bell,
  Bookmark,
  BriefcaseMedical,
  CalendarCheck,
  CalendarRange,
  FileText,
  HeartHandshake,
  HeartPulse,
  Home,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Plane,
  Receipt,
  Search,
  Star,
  Stethoscope,
  User,
  UserRound,
  Video,
} from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { websiteUrl } from '@hig/shared/auth';
import { NotificationBell, PortalLayout, type NavItem } from '@hig/shared/layout';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError, type MessageOut } from '@hig/shared/api';
import type { TFunction } from 'i18next';
import { useAppTranslation } from '../../../i18n';
import { qk, useUnreadCount } from '../api/queries';
import { GuardianConsentGate } from '../components/GuardianConsent';
import { GuestAiLimitGate } from '../components/GuestAiLimit';
import { useRealtimeConnection, useRealtimeEvent } from '../lib/realtime';
import { paths, PORTAL_BASE } from '../lib/paths';
import { useLogout, useMe } from '../lib/session';
import { cn, formatNumber, i18n } from '../lib/shared';
import { Button, ButtonLink, ErrorState, Spinner } from '../ui/primitives';

/** Unread notification counter for nav items. */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-danger-strong px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
      {count > 99 ? `${formatNumber(99)}+` : formatNumber(count)}
    </span>
  );
}

/** Sidebar: Dashboard, then accordion sections (one open at a time; the section of the current page opens). */
function buildNav(unread: number, t: TFunction): NavItem[] {
  const badge = unread > 0 ? <CountBadge count={unread} /> : undefined;
  return [
    { to: paths.dashboard, label: t('shell.nav.dashboard'), icon: LayoutDashboard, end: true, accent: 'green' },
    {
      id: 'care',
      label: t('shell.nav.care'),
      icon: HeartPulse,
      accent: 'rose',
      children: [
        { to: paths.screenings, label: t('shell.nav.screenings'), icon: Stethoscope },
        { to: paths.browse(), label: t('shell.nav.browse'), icon: Search },
        { to: paths.cases, label: t('shell.nav.cases'), icon: BriefcaseMedical },
        { to: paths.consultations, label: t('shell.nav.consultations'), icon: Video },
        { to: paths.aftercare, label: t('shell.nav.aftercare'), icon: HeartHandshake },
      ],
    },
    {
      id: 'bookings',
      label: t('shell.nav.bookingsPayments'),
      icon: CalendarRange,
      accent: 'blue',
      children: [
        { to: paths.bookings, label: t('shell.nav.bookings'), icon: CalendarCheck },
        { to: paths.payments, label: t('shell.nav.payments'), icon: Receipt },
      ],
    },
    {
      id: 'trip',
      label: t('shell.nav.tripDocuments'),
      icon: Plane,
      accent: 'cyan',
      children: [
        { to: paths.tripIndex, label: t('shell.nav.trip'), icon: Plane },
        { to: paths.documents, label: t('shell.nav.documents'), icon: FileText },
      ],
    },
    {
      id: 'inbox',
      label: t('shell.nav.inbox'),
      icon: MessagesSquare,
      accent: 'violet',
      children: [
        { to: paths.messages, label: t('shell.nav.messages'), icon: MessageSquare },
        { to: paths.notifications, label: t('shell.nav.notifications'), icon: Bell, badge },
      ],
    },
    {
      id: 'account',
      label: t('shell.nav.account'),
      icon: UserRound,
      accent: 'amber',
      children: [
        { to: paths.saved, label: t('shell.nav.saved'), icon: Bookmark },
        { to: paths.reviews, label: t('shell.nav.reviews'), icon: Star },
        { to: paths.profile, label: t('shell.nav.profile'), icon: User },
      ],
    },
  ];
}

interface BottomItem {
  to: string;
  /** catalog key of the label */
  labelKey: string;
  icon: ReactNode;
  end?: boolean;
}

const BOTTOM_NAV: BottomItem[] = [
  { to: paths.dashboard, labelKey: 'shell.bottomNav.home', icon: <Home className="h-5 w-5" aria-hidden />, end: true },
  { to: `${PORTAL_BASE}/screening/new`, labelKey: 'shell.bottomNav.screening', icon: <Stethoscope className="h-5 w-5" aria-hidden /> },
  { to: paths.tripIndex, labelKey: 'shell.bottomNav.trip', icon: <Plane className="h-5 w-5" aria-hidden /> },
  { to: paths.messages, labelKey: 'shell.bottomNav.messages', icon: <MessageSquare className="h-5 w-5" aria-hidden /> },
  { to: paths.profile, labelKey: 'shell.bottomNav.profile', icon: <User className="h-5 w-5" aria-hidden /> },
];

const MENU_LINK =
  'flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none';

function PageFallback() {
  const { t } = useAppTranslation();
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={t('shell.loadingPage')} />
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
          title={i18n.t('patient:shell.pageError.title')}
          error={new Error(i18n.t('patient:shell.pageError.description'))}
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
        // consultation scheduled / reminder notifications: refresh the consultation pages too
        void qc.invalidateQueries({ queryKey: ['consultations'] });
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
  const { t } = useAppTranslation();
  const me = useMe();
  const location = useLocation();
  const logout = useLogout();
  const unread = useUnreadCount();

  if (me.isPending) {
    return (
      <FullScreen>
        <Spinner label={t('shell.loadingPortal')} />
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
          <h1 className="text-lg font-semibold text-fg">{t('shell.wrongRole.title')}</h1>
          <p className="mt-2 text-sm text-muted">
            {t('shell.wrongRole.description', {
              role: t(`shell.roles.${user.role}`, { defaultValue: user.role.replace('_', ' ') }),
            })}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <ButtonLink to="/" variant="outline">
              {t('shell.wrongRole.home')}
            </ButtonLink>
            <Button variant="primary" loading={logout.isPending} onClick={signOut}>
              {t('shell.signOut')}
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  const count = unread.data?.count ?? 0;
  const displayName = user.is_guest ? t('shell.guest') : user.full_name;

  return (
    <>
      <RealtimeBridge />
      <GuardianConsentGate />
      <GuestAiLimitGate />
      <PortalLayout
        nav={buildNav(count, t)}
        homeTo={paths.dashboard}
        subtitle={t('shell.subtitle')}
        primaryAction={{ label: t('shell.startScreening'), to: paths.newScreening(), icon: Stethoscope }}
        user={{ name: displayName, email: user.email, role: user.role, avatarUrl: user.avatar_url }}
        userMenuItems={
          <>
            <Link to={paths.profile} role="menuitem" className={MENU_LINK}>
              <User className="size-4 text-muted" aria-hidden />
              {t('shell.menu.profile')}
            </Link>
            <Link to={paths.saved} role="menuitem" className={MENU_LINK}>
              <Bookmark className="size-4 text-muted" aria-hidden />
              {t('shell.menu.saved')}
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
        aria-label={t('shell.bottomNav.label')}
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
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
