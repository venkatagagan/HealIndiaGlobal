import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, useLocation, useParams, type RouteObject } from 'react-router';
import { DoorRedirect, RequireAuth, websiteUrl } from '@hig/shared/auth';
import { LoadingState } from '@hig/shared/ui';
import { portalPaths, portalRoute } from './features/portal';

const PATIENT_ONLY = ['patient'] as const;

/** Public home-doctor view of a shared discharge summary: no login, no portal layout. */
const PublicSharePage = lazy(() =>
  import('./features/portal/pages/discharge/PublicSharePage').then((m) => ({ default: m.PublicSharePage })),
);

function PublicShare() {
  return (
    <Suspense fallback={<LoadingState fullScreen />}>
      <PublicSharePage />
    </Suspense>
  );
}

/** Links built as `<patient web>/share/<token>` or `/discharge-summaries/<id>` (emails) -> the /app routes. */
function ShareRedirect() {
  const { token = '' } = useParams();
  return <Navigate to={portalPaths.dischargeShare(token)} replace />;
}

function DischargeRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={portalPaths.dischargeSummary(id)} replace />;
}

/**
 * Anything outside /app (public pages: hospitals, doctors, specialties, ...) belongs to the website: full-page
 * navigation to the same path there.
 */
function ToWebsite() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    const site = new URL(websiteUrl(), window.location.origin);
    window.location.replace(new URL(`${pathname.replace(/^\//, '')}${search}${hash}`, site).toString());
  }, [hash, pathname, search]);
  return <LoadingState fullScreen />;
}

const routes: RouteObject[] = [
  // before the protected portal: the home doctor has no account
  { path: '/app/share/:token', element: <PublicShare /> },
  { path: '/share/:token', element: <ShareRedirect /> },
  { path: '/discharge-summaries/:id', element: <DischargeRedirect /> },
  {
    // PLAN 3.1: anonymous -> website door with ?next=<url>; other roles -> their own portal
    element: <RequireAuth roles={PATIENT_ONLY} redirectWrongRole />,
    children: [portalRoute],
  },
  // no login form here: the website is the door
  { path: '/login', element: <DoorRedirect to="login" /> },
  { path: '/auth/login', element: <DoorRedirect to="login" /> },
  { path: '/register', element: <DoorRedirect to="register" role="patient" /> },
  { path: '/auth/register', element: <DoorRedirect to="register" role="patient" /> },
  { path: '*', element: <ToWebsite /> },
];

// basename stays '/': the portal routes already start with /app (Vite base '/app/')
export const router = createBrowserRouter(routes);
