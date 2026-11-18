import { Link, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardList,
  FilePlus2,
  Gift,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Network,
  ShieldAlert,
  Stethoscope,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { NotificationBell, PortalLayout, type NavItem } from '@hig/shared/layout';
import { qk, useAgentProfile, useUnreadCount } from '../lib/queries';
import { useRealtimeEvent } from '../lib/realtime';
import { cn } from '../lib/shared';
import { useAppTranslation, type AppT } from '../i18n';

function CountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-danger-strong px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Sidebar: Dashboard, then accordion sections (one open at a time; the section of the current page opens). */
function buildNav(unread: number, t: AppT): NavItem[] {
  return [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, end: true, accent: 'green' },
    {
      id: 'patients',
      label: t('nav.patientsAndCases'),
      icon: Users,
      accent: 'blue',
      children: [
        { to: '/patients', label: t('nav.patients'), icon: Users },
        { to: '/screenings', label: t('nav.screenings'), icon: ClipboardList },
        { to: '/cases', label: t('nav.casesAndQuotes'), icon: Briefcase },
        { to: '/bookings', label: t('nav.bookings'), icon: CalendarCheck },
      ],
    },
    {
      id: 'network',
      label: t('nav.hospitalNetwork'),
      icon: Network,
      accent: 'cyan',
      children: [
        { to: '/hospitals', label: t('nav.hospitals'), icon: Building2 },
        { to: '/doctors', label: t('nav.doctors'), icon: Stethoscope },
      ],
    },
    {
      id: 'earnings',
      label: t('nav.earnings'),
      icon: Wallet,
      accent: 'amber',
      children: [
        { to: '/commissions', label: t('nav.commissions'), icon: Wallet },
        { to: '/payout-account', label: t('nav.payoutAccount'), icon: Landmark },
      ],
    },
    {
      id: 'inbox',
      label: t('nav.messagesAndAlerts'),
      icon: MessagesSquare,
      accent: 'violet',
      children: [
        { to: '/messages', label: t('nav.messages'), icon: MessageSquare },
        { to: '/notifications', label: t('nav.notifications'), icon: Bell, badge: unread > 0 ? <CountBadge count={unread} /> : undefined },
      ],
    },
    {
      id: 'account',
      label: t('nav.account'),
      icon: UserRound,
      accent: 'rose',
      children: [
        { to: '/profile', label: t('nav.profileKyc'), icon: UserCog },
        { to: '/referral', label: t('nav.referral'), icon: Gift },
      ],
    },
  ];
}

const MENU_LINK =
  'flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none';

function KycBanner() {
  const { data: profile } = useAgentProfile();
  const { pathname } = useLocation();
  const { t } = useAppTranslation();
  if (!profile) return null;
  if (profile.status === 'active' && profile.kyc_status === 'approved') return null;

  let message: string;
  let tone: 'warning' | 'danger' | 'info' = 'warning';
  if (profile.status === 'suspended') {
    message = t('layout.kyc.suspended');
    tone = 'danger';
  } else if (profile.kyc_status === 'rejected' || profile.status === 'rejected') {
    message = profile.rejection_reason
      ? t('layout.kyc.rejectedWithReason', { reason: profile.rejection_reason })
      : t('layout.kyc.rejected');
    tone = 'danger';
  } else if (profile.kyc_status === 'pending') {
    message = t('layout.kyc.pending');
    tone = 'info';
  } else {
    message = t('layout.kyc.incomplete');
  }
  const toneClass = {
    warning: 'border-warning/40 bg-warning-soft text-warning-ink',
    danger: 'border-danger/40 bg-danger-soft text-danger-ink',
    info: 'border-info/40 bg-info-soft text-info-ink',
  }[tone];
  return (
    <div role="status" className={cn('mb-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm', toneClass)}>
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      {pathname !== '/profile' && profile.status !== 'suspended' && (
        <Link to="/profile" className="font-semibold underline underline-offset-2">
          {profile.kyc_status === 'pending' ? t('layout.kyc.view') : t('layout.kyc.complete')}
        </Link>
      )}
    </div>
  );
}

export function AgentLayout() {
  const queryClient = useQueryClient();
  const { data: unreadData } = useUnreadCount();
  const unread = unreadData?.count ?? 0;
  const { t } = useAppTranslation();

  useRealtimeEvent('notification.created', (event) => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    toast(event.data.title, { description: event.data.body ?? undefined });
  });
  useRealtimeEvent('message.created', () => {
    void queryClient.invalidateQueries({ queryKey: qk.conversations });
  });
  useRealtimeEvent(['case.updated', 'booking.updated'], (event) => {
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    if (event.type === 'case.updated') void queryClient.invalidateQueries({ queryKey: qk.case(event.data.case_id) });
  });
  useRealtimeEvent('screening.completed', (event) => {
    void queryClient.invalidateQueries({ queryKey: qk.screening(event.data.screening_id) });
    void queryClient.invalidateQueries({ queryKey: ['screenings'] });
  });

  return (
    <PortalLayout
      nav={buildNav(unread, t)}
      subtitle={t('layout.subtitle')}
      primaryAction={{ label: t('layout.newEnquiry'), to: '/cases/new', icon: FilePlus2 }}
      userMenuItems={
        <>
          <Link to="/profile" role="menuitem" className={MENU_LINK}>
            <UserCog className="size-4 text-muted" aria-hidden />
            {t('nav.profileKyc')}
          </Link>
          <Link to="/payout-account" role="menuitem" className={MENU_LINK}>
            <Landmark className="size-4 text-muted" aria-hidden />
            {t('nav.payoutAccount')}
          </Link>
        </>
      }
      topbarExtra={<NotificationBell to="/notifications" count={unread} />}
    >
      <div className="mx-auto w-full max-w-7xl">
        <KycBanner />
        <Outlet />
      </div>
    </PortalLayout>
  );
}
