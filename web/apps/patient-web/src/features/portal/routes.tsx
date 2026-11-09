import { lazy } from 'react';
import { Navigate, Route, Routes, type RouteObject } from 'react-router';
import { PortalShell } from './layout/PortalShell';
import { PORTAL_BASE } from './lib/paths';

/* Pages are code-split; PortalShell renders them inside <Suspense> + an error boundary. */
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const NewScreeningPage = lazy(() => import('./pages/screening/NewScreeningPage').then((m) => ({ default: m.NewScreeningPage })));
const WizardPage = lazy(() => import('./pages/screening/WizardPage').then((m) => ({ default: m.WizardPage })));
const ProcessingPage = lazy(() => import('./pages/screening/ProcessingPage').then((m) => ({ default: m.ProcessingPage })));
const ResultsPage = lazy(() => import('./pages/screening/ResultsPage').then((m) => ({ default: m.ResultsPage })));
const ComparePage = lazy(() => import('./pages/screening/ComparePage').then((m) => ({ default: m.ComparePage })));
const ScreeningsListPage = lazy(() => import('./pages/screening/ScreeningsListPage').then((m) => ({ default: m.ScreeningsListPage })));
const CasesPage = lazy(() => import('./pages/cases/CasesPage').then((m) => ({ default: m.CasesPage })));
const NewCasePage = lazy(() => import('./pages/cases/NewCasePage').then((m) => ({ default: m.NewCasePage })));
const CaseDetailPage = lazy(() => import('./pages/cases/CaseDetailPage').then((m) => ({ default: m.CaseDetailPage })));
const BookPage = lazy(() => import('./pages/bookings/BookPage').then((m) => ({ default: m.BookPage })));
const BookingsPage = lazy(() => import('./pages/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const PaymentsPage = lazy(() => import('./pages/bookings/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const BookingDetailPage = lazy(() => import('./pages/bookings/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })));
const PayPage = lazy(() => import('./pages/bookings/PayPage').then((m) => ({ default: m.PayPage })));
const PaymentResultPage = lazy(() => import('./pages/bookings/PaymentResultPage').then((m) => ({ default: m.PaymentResultPage })));
const TripIndexPage = lazy(() => import('./pages/trip/TripPage').then((m) => ({ default: m.TripIndexPage })));
const TripPage = lazy(() => import('./pages/trip/TripPage').then((m) => ({ default: m.TripPage })));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SavedPage = lazy(() => import('./pages/SavedPage').then((m) => ({ default: m.SavedPage })));

/** Child routes, relative to the portal mount point (/app). */
export const portalChildRoutes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'screening/new', element: <NewScreeningPage /> },
  { path: 'screening/:id', element: <Navigate to="step/1" replace /> },
  { path: 'screening/:id/step/:step', element: <WizardPage /> },
  { path: 'screening/:id/processing', element: <ProcessingPage /> },
  { path: 'screening/:id/results', element: <ResultsPage /> },
  { path: 'screening/:id/compare', element: <ComparePage /> },
  { path: 'screenings', element: <ScreeningsListPage /> },
  { path: 'cases', element: <CasesPage /> },
  { path: 'cases/new', element: <NewCasePage /> },
  { path: 'cases/:id', element: <CaseDetailPage /> },
  { path: 'cases/:id/book', element: <BookPage /> },
  { path: 'bookings', element: <BookingsPage /> },
  { path: 'payments', element: <PaymentsPage /> },
  { path: 'bookings/:id', element: <BookingDetailPage /> },
  { path: 'bookings/:id/pay', element: <PayPage /> },
  { path: 'bookings/:id/pay/result', element: <PaymentResultPage /> },
  { path: 'trip', element: <TripIndexPage /> },
  { path: 'trip/:bookingId', element: <TripPage /> },
  { path: 'documents', element: <DocumentsPage /> },
  { path: 'messages', element: <MessagesPage /> },
  { path: 'messages/:conversationId', element: <MessagesPage /> },
  { path: 'notifications', element: <NotificationsPage /> },
  { path: 'profile', element: <ProfilePage /> },
  { path: 'saved', element: <SavedPage /> },
  { path: '*', element: <Navigate to={PORTAL_BASE} replace /> },
];

/**
 * Route object for data routers: `createBrowserRouter([...publicRoutes, portalRoute])`.
 * Requires a QueryClientProvider (and ideally a sonner <Toaster/>) above the router.
 */
export const portalRoute: RouteObject = {
  path: PORTAL_BASE,
  element: <PortalShell />,
  children: portalChildRoutes,
};

/** For component routers: `<Route path="/app/*" element={<PortalRoutes />} />`. */
export function PortalRoutes() {
  return (
    <Routes>
      <Route element={<PortalShell />}>
        {portalChildRoutes.map((r, i) =>
          r.index ? <Route key={i} index element={r.element} /> : <Route key={i} path={r.path} element={r.element} />,
        )}
      </Route>
    </Routes>
  );
}
