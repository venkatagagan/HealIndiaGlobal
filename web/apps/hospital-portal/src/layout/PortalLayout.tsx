import { Link, Outlet } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
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
import { NotificationBell, PortalLayout as ShellLayout, type NavItem } from '@hig/shared/layout';
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
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Sidebar: Dashboard, then accordion sections (one open at a time; the section of the current page opens). */
function buildNav({ unread, canFinance }: { unread: number; canFinance: boolean }): NavItem[] {
  return [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, accent: 'green' },
    {
      id: 'patients',
      label: 'Patients',
      icon: HeartPulse,
      accent: 'blue',
      children: [
        { to: '/cases', label: 'Enquiries & cases', icon: Inbox },
        { to: '/bookings', label: 'Bookings', icon: CalendarCheck },
      ],
    },
    {
      id: 'services',
      label: 'Doctors & services',
      icon: Stethoscope,
      accent: 'rose',
      children: [
        { to: '/doctors', label: 'Doctors', icon: Stethoscope },
        { to: '/procedures', label: 'Procedures & pricing', icon: ClipboardList },
      ],
    },
    {
      id: 'hospital',
      label: 'Hospital',
      icon: Building,
      accent: 'cyan',
      children: [
        { to: '/profile', label: 'Hospital profile', icon: Building2 },
        { to: '/team', label: 'Team', icon: Users },
      ],
    },
    {
      id: 'performance',
      label: canFinance ? 'Reviews & finance' : 'Reviews',
      icon: TrendingUp,
      accent: 'amber',
      children: [
        { to: '/reviews', label: 'Reviews', icon: Star },
        ...(canFinance ? [{ to: '/finance', label: 'Finance', icon: Wallet }] : []),
      ],
    },
    {
      id: 'inbox',
      label: 'Messages & alerts',
      icon: MessagesSquare,
      accent: 'violet',
      children: [
        { to: '/messages', label: 'Messages', icon: MessageSquare },
        { to: '/notifications', label: 'Notifications', icon: Bell, badge: unread > 0 ? <CountBadge count={unread} /> : undefined },
      ],
    },
  ];
}

const MENU_LINK =
  'flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none';

function HospitalSwitcher() {
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
        Active hospital
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

  const roleLabel = memberRole ? memberRole.charAt(0).toUpperCase() + memberRole.slice(1).replace(/_/g, ' ') : 'Member';

  return (
    <ShellLayout
      nav={buildNav({ unread: count, canFinance })}
      subtitle="Hospital portal"
      title={<HospitalSwitcher />}
      user={user ? { name: user.full_name, email: user.email, role: roleLabel, avatarUrl: user.avatar_url } : null}
      userMenuItems={
        <Link to="/profile" role="menuitem" className={MENU_LINK}>
          <Building2 className="size-4 text-muted" aria-hidden />
          Hospital profile
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
