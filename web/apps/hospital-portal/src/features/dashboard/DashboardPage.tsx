import { useQuery } from '@tanstack/react-query';
import { Activity, BedDouble, CalendarClock, FileText, IndianRupee, Inbox } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router';
import { hospitalPortalApi } from '@hig/shared/api';
import { heroActionClass, PageHero } from '@hig/shared/layout';
import { useHospital } from '../../auth/HospitalProvider';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { formatMoney, formatMonth, fromMinor, toMinor } from '../../lib/format';
import { useTheme } from '../../lib/prefs';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { CasesTable } from '../cases/CasesTable';

function ChartTooltip({
  active,
  payload,
  label,
  render,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
  render: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-border bg-raised px-3 py-2 text-xs shadow-raised">
      <p className="font-semibold text-fg">{String(label ?? '')}</p>
      <p className="text-muted">{render(value)}</p>
    </div>
  );
}

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { current } = useHospital();
  const { isDark } = useTheme();
  const dashboard = useQuery({ queryKey: qk.dashboard, queryFn: hospitalPortalApi.dashboard });

  const axis = isDark ? '#94a3b8' : '#64748b';
  const grid = isDark ? '#1f2b47' : '#e2e8f0';

  if (dashboard.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      </>
    );
  }

  const d = dashboard.data;
  const currency = d?.currency ?? 'INR';
  const series = (d?.monthly ?? []).map((m) => ({
    month: formatMonth(m.month),
    bookings: m.bookings,
    revenue: fromMinor(m.revenue_minor, currency),
  }));

  return (
    <>
      <PageHero
        eyebrow="Hospital portal"
        title={`Welcome${current ? `, ${current.name}` : ''}`}
        description="Your international patient pipeline at a glance."
        actions={
          <>
            <Link to="/cases?status=enquiry" className={heroActionClass('solid')}>
              <Inbox className="h-4 w-4" aria-hidden />
              Open enquiries
            </Link>
            <Link to="/bookings" className={heroActionClass('glass')}>
              <CalendarClock className="h-4 w-4" aria-hidden />
              Upcoming admissions
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        {d ? (
          <>
            <StatCard label="Open enquiries" value={d.enquiries_open} icon={<Inbox className="h-5 w-5" aria-hidden />} tone="blue" />
            <StatCard label="Quotes awaiting patient" value={d.quotes_pending} icon={<FileText className="h-5 w-5" aria-hidden />} tone="violet" />
            <StatCard label="Upcoming admissions" value={d.bookings_upcoming} icon={<CalendarClock className="h-5 w-5" aria-hidden />} tone="amber" />
            <StatCard label="Patients in treatment" value={d.patients_in_treatment} icon={<BedDouble className="h-5 w-5" aria-hidden />} tone="red" />
            <StatCard
              label="Revenue this month"
              value={formatMoney(d.revenue_month_minor, currency, { compact: d.revenue_month_minor >= 10_000_000 })}
              icon={<IndianRupee className="h-5 w-5" aria-hidden />}
              tone="green"
              hint="Completed bookings, before commission"
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue" description="Monthly booking revenue" />
          <CardBody className="h-72">
            {!d ? (
              <Skeleton className="h-full w-full" />
            ) : series.length === 0 ? (
              <EmptyState icon={<Activity className="h-6 w-6" aria-hidden />} title="No revenue yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="month" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke={axis}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
                    }
                  />
                  <Tooltip
                    content={(props) => (
                      <ChartTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        render={(v) => formatMoney(toMinor(v, currency) ?? 0, currency, { trimZeros: true })}
                      />
                    )}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#16A34A" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Bookings" description="Confirmed bookings per month" />
          <CardBody className="h-72">
            {!d ? (
              <Skeleton className="h-full w-full" />
            ) : series.length === 0 ? (
              <EmptyState icon={<Activity className="h-6 w-6" aria-hidden />} title="No bookings yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="month" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip
                    cursor={{ fill: isDark ? '#1f2630' : '#f1f5f9' }}
                    content={(props) => (
                      <ChartTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        render={(v) => `${v} booking${v === 1 ? '' : 's'}`}
                      />
                    )}
                  />
                  <Bar dataKey="bookings" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent enquiries"
          actions={
            <LinkButton to="/cases" variant="outline" size="sm">
              View all
            </LinkButton>
          }
        />
        {!d ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : d.recent_cases.length === 0 ? (
          <EmptyState title="No enquiries yet" description="New patient enquiries will appear here as soon as they arrive." />
        ) : (
          <CasesTable cases={d.recent_cases} />
        )}
      </Card>
    </>
  );
}
