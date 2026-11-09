import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Link } from 'react-router';
import { DoorRedirect, routerBasename } from '@hig/shared/auth';
import { RequireAgent } from './auth/RequireAgent';
import { AgentLayout } from './layout/AgentLayout';
import { EmptyState, LoadingBlock } from './components/ui';

function page<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K): LazyExoticComponent<ComponentType> {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}

function withSuspense(Component: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Component />
    </Suspense>
  );
}
const DashboardPage = page(() => import('./features/dashboard/DashboardPage'), 'DashboardPage');
const PatientsPage = page(() => import('./features/patients/PatientsPage'), 'PatientsPage');
const PatientDetailPage = page(() => import('./features/patients/PatientDetailPage'), 'PatientDetailPage');
const ScreeningFormPage = page(() => import('./features/screening/ScreeningFormPage'), 'ScreeningFormPage');
const ScreeningResultPage = page(() => import('./features/screening/ScreeningResultPage'), 'ScreeningResultPage');
const ScreeningsPage = page(() => import('./features/screening/ScreeningsPage'), 'ScreeningsPage');
const CasesPage = page(() => import('./features/cases/CasesPage'), 'CasesPage');
const CaseDetailPage = page(() => import('./features/cases/CaseDetailPage'), 'CaseDetailPage');
const NewEnquiryPage = page(() => import('./features/cases/NewEnquiryPage'), 'NewEnquiryPage');
const QuoteComparePage = page(() => import('./features/cases/QuoteComparePage'), 'QuoteComparePage');
const BookCasePage = page(() => import('./features/cases/BookCasePage'), 'BookCasePage');
const BookingsPage = page(() => import('./features/cases/BookingsPage'), 'BookingsPage');
const PayBookingPage = page(() => import('./features/payments/PayBookingPage'), 'PayBookingPage');
const HospitalsPage = page(() => import('./features/directory/HospitalsPage'), 'HospitalsPage');
const HospitalDetailPage = page(() => import('./features/directory/HospitalDetailPage'), 'HospitalDetailPage');
const DoctorsPage = page(() => import('./features/directory/DoctorsPage'), 'DoctorsPage');
const DoctorDetailPage = page(() => import('./features/directory/DoctorDetailPage'), 'DoctorDetailPage');
const CommissionsPage = page(() => import('./features/finance/CommissionsPage'), 'CommissionsPage');
const PayoutAccountPage = page(() => import('./features/finance/PayoutAccountPage'), 'PayoutAccountPage');
const ReferralPage = page(() => import('./features/referral/ReferralPage'), 'ReferralPage');
const MessagesPage = page(() => import('./features/messages/MessagesPage'), 'MessagesPage');
const NotificationsPage = page(() => import('./features/notifications/NotificationsPage'), 'NotificationsPage');
const ProfilePage = page(() => import('./features/profile/ProfilePage'), 'ProfilePage');

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or was moved."
      action={
        <Link to="/" className="font-semibold text-primary-ink hover:underline">
          Back to dashboard
        </Link>
      }
    />
  );
}

export const router = createBrowserRouter([
  // PLAN 3.1: no login form here - the website is the door (sign-in, agent registration).
  { path: '/login', element: <DoorRedirect to="login" /> },
  { path: '/register', element: <DoorRedirect to="register" role="agent" /> },
  {
    path: '/',
    element: (
      <RequireAgent>
        <AgentLayout />
      </RequireAgent>
    ),
    children: [
      { index: true, element: withSuspense(DashboardPage) },
      { path: 'patients', element: withSuspense(PatientsPage) },
      { path: 'patients/:patientId', element: withSuspense(PatientDetailPage) },
      { path: 'patients/:patientId/screenings/new', element: withSuspense(ScreeningFormPage) },
      { path: 'screenings', element: withSuspense(ScreeningsPage) },
      { path: 'screenings/:screeningId', element: withSuspense(ScreeningResultPage) },
      { path: 'screenings/:screeningId/edit', element: withSuspense(ScreeningFormPage) },
      { path: 'cases', element: withSuspense(CasesPage) },
      { path: 'cases/new', element: withSuspense(NewEnquiryPage) },
      { path: 'cases/compare', element: withSuspense(QuoteComparePage) },
      { path: 'cases/:caseId', element: withSuspense(CaseDetailPage) },
      { path: 'cases/:caseId/book', element: withSuspense(BookCasePage) },
      { path: 'bookings', element: withSuspense(BookingsPage) },
      { path: 'bookings/:bookingId/pay', element: withSuspense(PayBookingPage) },
      { path: 'hospitals', element: withSuspense(HospitalsPage) },
      { path: 'hospitals/:slug', element: withSuspense(HospitalDetailPage) },
      { path: 'doctors', element: withSuspense(DoctorsPage) },
      { path: 'doctors/:doctorId', element: withSuspense(DoctorDetailPage) },
      { path: 'commissions', element: withSuspense(CommissionsPage) },
      { path: 'payout-account', element: withSuspense(PayoutAccountPage) },
      { path: 'referral', element: withSuspense(ReferralPage) },
      { path: 'messages', element: withSuspense(MessagesPage) },
      { path: 'messages/:conversationId', element: withSuspense(MessagesPage) },
      { path: 'notifications', element: withSuspense(NotificationsPage) },
      { path: 'profile', element: withSuspense(ProfilePage) },
      { path: '*', element: <NotFound /> },
    ],
  },
], { basename: routerBasename() });
