import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { DoorRedirect, routerBasename } from '@hig/shared/auth';
import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router';
import { RequireHospital } from './auth/RequireHospital';
import { HospitalProvider } from './auth/HospitalProvider';
import { ErrorState, LinkButton, PageLoader } from './components/ui';
import { PortalLayout } from './layout/PortalLayout';
import { RealtimeProvider } from './lib/realtime';

/** Code-split page: the lazy component is created once at module load (never per render). */
function lazyPage<T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T): ComponentType {
  const Component = lazy(async () => ({ default: (await loader())[name] as ComponentType }));
  return function LazyPage() {
    return (
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    );
  };
}

const DashboardPage = lazyPage(() => import('./features/dashboard/DashboardPage'), 'DashboardPage');
const CasesPage = lazyPage(() => import('./features/cases/CasesPage'), 'CasesPage');
const CaseDetailPage = lazyPage(() => import('./features/cases/CaseDetailPage'), 'CaseDetailPage');
const BookingsPage = lazyPage(() => import('./features/bookings/BookingsPage'), 'BookingsPage');
const BookingDetailPage = lazyPage(() => import('./features/bookings/BookingDetailPage'), 'BookingDetailPage');
const DoctorsPage = lazyPage(() => import('./features/doctors/DoctorsPage'), 'DoctorsPage');
const AvailabilityPage = lazyPage(() => import('./features/doctors/AvailabilityPage'), 'AvailabilityPage');
const ProceduresPage = lazyPage(() => import('./features/procedures/ProceduresPage'), 'ProceduresPage');
const TeamPage = lazyPage(() => import('./features/team/TeamPage'), 'TeamPage');
const ReviewsPage = lazyPage(() => import('./features/reviews/ReviewsPage'), 'ReviewsPage');
const FinancePage = lazyPage(() => import('./features/finance/FinancePage'), 'FinancePage');
const MessagesPage = lazyPage(() => import('./features/messages/MessagesPage'), 'MessagesPage');
const NotificationsPage = lazyPage(() => import('./features/notifications/NotificationsPage'), 'NotificationsPage');
const OnboardingPage = lazyPage(async () => {
    const m = await import('./features/onboarding/HospitalSetupPage');
    return { OnboardingPage: () => <m.HospitalSetupPage mode="onboarding" /> };
  }, 'OnboardingPage');
const ProfilePage = lazyPage(async () => {
    const m = await import('./features/onboarding/HospitalSetupPage');
    return { ProfilePage: () => <m.HospitalSetupPage mode="profile" /> };
  }, 'ProfilePage');

function RouteError() {
  const error = useRouteError();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
      <ErrorState title="Something went wrong" error={error} onRetry={() => window.location.reload()} />
      <LinkButton to="/" variant="ghost" size="sm">
        Back to dashboard
      </LinkButton>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireHospital>
      <HospitalProvider>
        <RealtimeProvider enabled>{children}</RealtimeProvider>
      </HospitalProvider>
    </RequireHospital>
  );
}

export const router = createBrowserRouter([
  // PLAN 3.1: no login form here - the website is the door (sign-in, hospital registration).
  { path: '/login', element: <DoorRedirect to="login" />, errorElement: <RouteError /> },
  { path: '/register', element: <DoorRedirect to="register" role="hospital" />, errorElement: <RouteError /> },
  {
    path: '/',
    errorElement: <RouteError />,
    element: (
      <Protected>
        <PortalLayout />
      </Protected>
    ),
    children: [
      {
        errorElement: <RouteError />,
        element: <Outlet />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'onboarding', element: <OnboardingPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'cases', element: <CasesPage /> },
          { path: 'cases/:caseId', element: <CaseDetailPage /> },
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'bookings/:bookingId', element: <BookingDetailPage /> },
          { path: 'doctors', element: <DoctorsPage /> },
          { path: 'doctors/:doctorId/availability', element: <AvailabilityPage /> },
          { path: 'procedures', element: <ProceduresPage /> },
          { path: 'team', element: <TeamPage /> },
          { path: 'reviews', element: <ReviewsPage /> },
          { path: 'finance', element: <FinancePage /> },
          { path: 'messages', element: <MessagesPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
], { basename: routerBasename() }); // '/hospital' (Vite base)
