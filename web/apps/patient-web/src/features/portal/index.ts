/**
 * Patient portal (PLAN 10, owner: web-patient). Mount at /app:
 *   data router:      createBrowserRouter([... , portalRoute])
 *   component router: <Route path="/app/*" element={<PortalRoutes />} />
 * Needs QueryClientProvider + sonner <Toaster /> from the app shell.
 */
export { portalRoute, portalChildRoutes, PortalRoutes } from './routes';
export { PortalShell } from './layout/PortalShell';
export { paths as portalPaths, PORTAL_BASE } from './lib/paths';
