import { request, type APIRequestContext, type FullConfig } from '@playwright/test';
import { API_ROOT, API_URL, ENV_KEYS, ORIGINS, PLAN_BASE_PATHS, PUBLIC_LOGIN_URL, type PortalName } from './fixtures/env';
import { exportWorld, resolveWorld } from './fixtures/world';

/**
 * Detects where an SPA's router root is. Vite (dev and preview) answers `GET /` with a 302 to its `base` when one
 * is configured (PLAN 3.1: /agent/, /hospital/, /gahi/) and serves the app at `/` otherwise.
 */
async function detectRoot(ctx: APIRequestContext, portal: PortalName): Promise<string | null> {
  const origin = ORIGINS[portal];
  const res = await ctx.get(`${origin}/`, { maxRedirects: 0, failOnStatusCode: false, timeout: 15_000 }).catch(() => null);
  if (!res) return null;
  if (res.status() >= 300 && res.status() < 400) {
    const location = res.headers()['location'];
    if (location) return new URL(location, origin).toString().replace(/\/+$/, '');
  }
  if (res.status() === 404 && PLAN_BASE_PATHS[portal]) return `${origin}${PLAN_BASE_PATHS[portal]}`;
  return res.ok() ? origin : null;
}

/**
 * Preflight for the whole run:
 *  1. fails fast with instructions when the API is not running;
 *  2. detects each portal's root URL (base path or not) and warns about portals that do not answer;
 *  3. resolves the seeded hospitals used by the flows and exports everything as env vars for the workers.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const ctx = await request.newContext();
  try {
    const health = await ctx.get(`${API_ROOT}/health/live`, { failOnStatusCode: false, timeout: 15_000 }).catch(() => null);
    if (!health || !health.ok()) {
      throw new Error(
        `API not reachable at ${API_ROOT}/health/live (E2E_API_URL=${API_URL}). Start the stack first ` +
          '(scripts/dev.ps1 after alembic upgrade + seed), or point E2E_API_URL at a running API.',
      );
    }

    for (const portal of Object.keys(ORIGINS) as PortalName[]) {
      const key = ENV_KEYS[portal];
      const root = await detectRoot(ctx, portal);
      if (!root) {
        console.warn(`[e2e] ${portal} portal is not answering at ${ORIGINS[portal]} - its tests will fail.`);
        continue;
      }
      // the patient portal's routes carry /app themselves; keep its root at the origin
      if (!process.env[key]) process.env[key] = portal === 'patient' ? ORIGINS.patient : root;
      console.log(`[e2e] ${portal}: ${process.env[key]}`);
    }

    const door = await ctx.get(PUBLIC_LOGIN_URL, { failOnStatusCode: false, timeout: 10_000 }).catch(() => null);
    process.env.E2E_PUBLIC_DOOR_UP = door && door.status() < 500 ? '1' : '0';
    if (process.env.E2E_PUBLIC_DOOR_UP !== '1') {
      console.warn(`[e2e] public login door (website) not answering at ${PUBLIC_LOGIN_URL} - door tests use the portals' own forms or skip.`);
    }

    const world = await resolveWorld(ctx);
    exportWorld(world);
    console.log(`[e2e] hospitals: primary=${world.hospitalSlug} secondary=${world.secondHospitalSlug}`);
  } finally {
    await ctx.dispose();
  }
}
