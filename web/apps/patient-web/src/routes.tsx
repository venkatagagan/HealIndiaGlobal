import { useEffect } from 'react';
import { createBrowserRouter, useLocation, type RouteObject } from 'react-router';
import { DoorRedirect, RequireAuth, websiteUrl } from '@hig/shared/auth';
import { LoadingState } from '@hig/shared/ui';
import { portalRoute } from './features/portal';

const PATIENT_ONLY = ['patient'] as const;

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
