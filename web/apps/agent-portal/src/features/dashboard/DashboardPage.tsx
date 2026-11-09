import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertCircle,
  Briefcase,
  CalendarCheck,
  ChevronRight,
  CreditCard,
  FileSignature,
  HandCoins,
  Landmark,
  Percent,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { heroActionClass, PageHero } from '@hig/shared/layout';
import { agentPortalApi, bookingsApi, casesApi, type CaseOut } from '@hig/shared/api';
import { listOwnPayoutAccounts } from '../../lib/financeAdapters';
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Skeleton,
  StatCard,
  StatusBadge,
} from '../../components/ui';
import { qk, useAgentProfile } from '../../lib/queries';
import { formatDate, formatMoney, formatMonth, formatPercent, fromMinor, useDocumentTitle } from '../../lib/shared';
import { useAuth } from '../../auth/AuthProvider';

const tooltipStyle = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-fg)',
  fontSize: 12,
};

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: qk.dashboard, queryFn: agentPortalApi.dashboard });
  const data = dashboard.data;

  const chartData = (data?.monthly ?? []).map((m) => ({
    month: formatMonth(m.month, 'MMM yy'),
    cases: m.cases,
    bookings: m.bookings,
    commission: fromMinor(m.commission_minor, data?.currency ?? 'INR'),
  }));

  return (
    <div>
      <PageHero
        eyebrow="Agent portal"
        title={`Welcome back${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`}
        description="Your patients, enquiries and earnings at a glance."
        actions={
          <>
            <Link to="/cases/new" className={heroActionClass('solid')}>
              <Briefcase className="h-4 w-4" aria-hidden />
              New enquiry
            </Link>
            <Link to="/patients?new=1" className={heroActionClass('glass')}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Add patient
            </Link>
          </>
        }
      />

      {dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            {dashboard.isPending || !data ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)
            ) : (
              <>
                <StatCard label="Patients" value={data.patients_total} icon={<Users className="h-4 w-4" />} />
                <StatCard label="Active cases" value={data.active_cases} icon={<Briefcase className="h-4 w-4" />} tone="info" />
                <StatCard
                  label="Confirmed bookings"
                  value={data.bookings_confirmed}
                  icon={<CalendarCheck className="h-4 w-4" />}
                  hint={`Conversion ${formatPercent(data.conversion_rate)}`}
                  tone="accent"
                />
                <StatCard
                  label="Commission pending"
                  value={formatMoney(data.commission_pending_minor, data.currency)}
                  icon={<HandCoins className="h-4 w-4" />}
                  tone="warning"
                />
                <StatCard
                  label="Commission paid"
                  value={formatMoney(data.commission_paid_minor, data.currency)}
                  icon={<Percent className="h-4 w-4" />}
                />
              </>
            )}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Cases and bookings per month" description="Enquiries you created and the bookings they turned into" />
              <div className="h-72 px-2 py-4">
                {dashboard.isPending ? (
                  <Skeleton className="mx-4 h-full" />
                ) : chartData.length === 0 ? (
                  <EmptyState title="No activity yet" description="Create your first enquiry to see monthly activity." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={2} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-surface-2)' }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
                      <Bar dataKey="cases" name="Cases" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="bookings" name="Bookings" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Commission earned" description={data ? `Per month, ${data.currency}` : undefined} />
              <div className="h-72 px-2 py-4">
                {dashboard.isPending ? (
                  <Skeleton className="mx-4 h-full" />
                ) : chartData.length === 0 ? (
                  <EmptyState title="No commission yet" description="Commission is earned when a booked treatment completes." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                        tickFormatter={(v: number) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(v)}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'var(--color-surface-2)' }}
                        formatter={(value) => [
                          new Intl.NumberFormat(undefined, {
                            style: 'currency',
                            currency: data?.currency ?? 'INR',
                          }).format(Number(value)),
                          'Commission',
                        ]}
                      />
                      <Bar dataKey="commission" name="Commission" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent cases"
                actions={
                  <Link to="/cases" className="text-sm font-medium text-primary-ink hover:underline">
                    View all
                  </Link>
                }
              />
              {dashboard.isPending ? (
                <LoadingBlock />
              ) : !data?.recent_cases.length ? (
                <EmptyState
                  title="No cases yet"
                  description="Send an enquiry to hospitals on behalf of a patient to get quotes."
                  action={<ButtonLink to="/cases/new">New enquiry</ButtonLink>}
                />
              ) : (
                <RecentCases cases={data.recent_cases} />
              )}
            </Card>
            <PendingActions />
          </div>
        </>
      )}
    </div>
  );
}

function RecentCases({ cases }: { cases: CaseOut[] }) {
  return (
    <ul className="divide-y divide-border">
      {cases.slice(0, 8).map((c) => (
        <li key={c.id}>
          <Link to={`/cases/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.patient.full_name} <span className="text-muted">· {c.hospital.name}</span>
              </p>
              <p className="text-xs text-muted">
                {c.case_number} · {c.procedure?.name ?? c.specialty?.name ?? 'General enquiry'} · {formatDate(c.updated_at)}
              </p>
            </div>
            {c.latest_quote && (
              <Money minor={c.latest_quote.total_minor} currency={c.latest_quote.currency} className="hidden text-sm font-medium sm:inline" />
            )}
            <StatusBadge kind="case" status={c.status} />
            <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PendingActions() {
  const profile = useAgentProfile();
  const quoted = useQuery({ queryKey: qk.cases({ status: 'quoted', page_size: 5 }), queryFn: () => casesApi.list({ status: 'quoted', page_size: 5 }) });
  const accepted = useQuery({
    queryKey: qk.cases({ status: 'accepted', page_size: 5 }),
    queryFn: () => casesApi.list({ status: 'accepted', page_size: 5 }),
  });
  const unpaid = useQuery({
    queryKey: qk.bookings({ status: 'pending_payment', page_size: 5 }),
    queryFn: () => bookingsApi.list({ status: 'pending_payment', page_size: 5 }),
  });
  const accounts = useQuery({ queryKey: qk.payoutAccounts, queryFn: listOwnPayoutAccounts });

  const items: { key: string; icon: ReactNode; title: string; detail: string; to: string }[] = [];
  const p = profile.data;
  if (p && p.kyc_status !== 'approved' && p.kyc_status !== 'pending') {
    items.push({
      key: 'kyc',
      icon: <ShieldCheck className="h-4 w-4" />,
      title: 'Complete your KYC',
      detail: 'Upload agency documents and submit for review',
      to: '/profile',
    });
  }
  if (accounts.data && accounts.data.length === 0) {
    items.push({
      key: 'payout',
      icon: <Landmark className="h-4 w-4" />,
      title: 'Add a payout account',
      detail: 'Needed to receive commission payouts',
      to: '/payout-account',
    });
  }
  for (const c of quoted.data?.items ?? []) {
    items.push({
      key: `q-${c.id}`,
      icon: <FileSignature className="h-4 w-4" />,
      title: `Review quote for ${c.patient.full_name}`,
      detail: `${c.hospital.name} · ${c.case_number}`,
      to: `/cases/${c.id}`,
    });
  }
  for (const c of accepted.data?.items ?? []) {
    if (c.booking) continue;
    items.push({
      key: `a-${c.id}`,
      icon: <CalendarCheck className="h-4 w-4" />,
      title: `Book treatment for ${c.patient.full_name}`,
      detail: `Quote accepted · ${c.hospital.name}`,
      to: `/cases/${c.id}/book`,
    });
  }
  for (const b of unpaid.data?.items ?? []) {
    items.push({
      key: `b-${b.id}`,
      icon: <CreditCard className="h-4 w-4" />,
      title: `Payment due for ${b.patient.full_name}`,
      detail: `${b.booking_number} · ${formatMoney(b.balance_due_minor, b.currency)} outstanding`,
      to: `/bookings/${b.id}/pay`,
    });
  }

  const loading = quoted.isPending || unpaid.isPending || accepted.isPending;
  return (
    <Card>
      <CardHeader title="Pending actions" description="Things that need your attention" />
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState icon={<AlertCircle className="h-6 w-6" />} title="You're all caught up" description="New quotes and payment reminders will appear here." />
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 10).map((item) => (
            <li key={item.key}>
              <Link to={item.to} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                <span className="mt-0.5 rounded-lg bg-warning-soft p-1.5 text-amber-700 dark:text-amber-300">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted">{item.detail}</span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
