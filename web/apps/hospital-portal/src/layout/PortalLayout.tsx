import { Link, Outlet } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Building,
  Building2,
  CalendarCheck,
  ClipboardList,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Star,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { HOSPITAL_MEMBER_ROLE_LABELS } from '@hig/shared/api';
import { formatNumber } from '@hig/shared/lib';
import { NotificationBell, PortalLayout as ShellLayout, type NavItem } from '@hig/shared/layout';
import { useAppTranslation } from '../i18n';
import { useAuth } from '../auth/AuthProvider';
import { useHospital } from '../auth/HospitalProvider';
import { Select } from '../components/ui';
import { prefs } from '../lib/prefs';
import { qk, useUnreadCount } from '../lib/queries';
import { useRealtimeEvent } from '../lib/realtime';
import { StatusBanner } from '../features/onboarding/StatusBanner';

function CountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-danger-strong px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
      {count > 99 ? `${formatNumber(99)}+` : formatNumber(count)}
    </span>
  );
}

/** Sidebar: Dashboard, then accordion sections (one open at a time; the section of the current page opens). */
function buildNav(t: TFunction, { unread, canFinance }: { unread: number; canFinance: boolean }): NavItem[] {
  return [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, end: true, accent: 'green' },
    {
      id: 'patients',
      label: t('nav.patients'),
      icon: HeartPulse,
      accent: 'blue',
      children: [
        { to: '/cases', label: t('nav.cases'), icon: Inbox },
        { to: '/bookings', label: t('nav.bookings'), icon: CalendarCheck },
        { to: '/aftercare', label: t('nav.aftercare'), icon: Activity },
      ],
    },
    {
      id: 'services',
      label: t('nav.services'),
      icon: Stethoscope,
      accent: 'rose',
      children: [
        { to: '/doctors', label: t('nav.doctors'), icon: Stethoscope },
        { to: '/procedures', label: t('nav.procedures'), icon: ClipboardList },
      ],
    },
    {
      id: 'hospital',
      label: t('nav.hospital'),
      icon: Building,
      accent: 'cyan',
      children: [
        { to: '/profile', label: t('nav.profile'), icon: Building2 },
        { to: '/accreditations', label: t('nav.accreditations'), icon: Award },
        { to: '/team', label: t('nav.team'), icon: Users },
      ],
    },
    {
      id: 'performance',
      label: canFinance ? t('nav.performanceFinance') : t('nav.performanceReviews'),
      icon: TrendingUp,
      accent: 'amber',
      children: [
        { to: '/performance', label: t('nav.performance'), icon: BarChart3 },
        { to: '/reviews', label: t('nav.reviews'), icon: Star },
        ...(canFinance ? [{ to: '/finance', label: t('nav.finance'), icon: Wallet }] : []),
      ],
    },
    {
      id: 'inbox',
      label: t('nav.inbox'),
      icon: MessagesSquare,
      accent: 'violet',
      children: [
        { to: '/messages', label: t('nav.messages'), icon: MessageSquare },
        { to: '/notifications', label: t('nav.notifications'), icon: Bell, badge: unread > 0 ? <CountBadge count={unread} /> : undefined },
      ],
    },
  ];
}

const MENU_LINK =
  'flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none';

function HospitalSwitcher() {
  const { t } = useAppTranslation();
  const { hospitals, current, switchHospital } = useHospital();
  if (hospitals.length <= 1) {
    return current ? (
      <span className="hidden truncate text-sm font-semibold text-fg md:inline">
        {current.name}
      </span>
    ) : null;
  }
  return (
    <div className="w-full max-w-[16rem]">
      <label htmlFor="hospital-switcher" className="sr-only">
        {t('layout.activeHospital')}
      </label>
      <Select
        id="hospital-switcher"
        value={current?.id ?? ''}
        onChange={(e) => switchHospital(e.target.value)}
        options={hospitals.map((h) => ({ value: h.id, label: h.name }))}
        className="h-9"
      />
    </div>
  );
}

export function PortalLayout() {
  const { t } = useAppTranslation();
  const { user, logout } = useAuth();
  const { memberRole, canFinance } = useHospital();
  const queryClient = useQueryClient();
  const { data: unread } = useUnreadCount();
  const count = unread?.count ?? 0;

  useRealtimeEvent('notification.created', (event) => {
    if (event.type !== 'notification.created') return;
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    toast(event.data.title, { description: event.data.body ?? undefined });
  });
  useRealtimeEvent(['case.updated', 'booking.updated'], (event) => {
    if (event.type === 'case.updated') void queryClient.invalidateQueries({ queryKey: ['cases'] });
    if (event.type === 'booking.updated') void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
  });

  const roleLabel = memberRole ? HOSPITAL_MEMBER_ROLE_LABELS[memberRole] : t('layout.member');

  return (
    <ShellLayout
      nav={buildNav(t, { unread: count, canFinance })}
      subtitle={t('layout.subtitle')}
      title={<HospitalSwitcher />}
      user={user ? { name: user.full_name, email: user.email, role: roleLabel, avatarUrl: user.avatar_url } : null}
      userMenuItems={
        <Link to="/profile" role="menuitem" className={MENU_LINK}>
          <Building2 className="size-4 text-muted" aria-hidden />
          {t('nav.profile')}
        </Link>
      }
      onLogout={() => {
        void logout().then(() => {
          prefs.set('hospital_id', null);
          queryClient.clear();
        });
      }}
      topbarExtra={<NotificationBell to="/notifications" count={count} />}
    >
      <div className="mx-auto w-full max-w-7xl">
        <StatusBanner />
        <Outlet />
      </div>
    </ShellLayout>
  );
}
