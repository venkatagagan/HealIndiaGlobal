import {
  test as base,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { ACCOUNTS, type Account, type AccountKey } from './accounts';
import { ApiClient, apiLogin, loginBrowserContext } from './api';
import { ORIGINS, PORTALS, type PortalName } from './env';
import { Scenarios } from './scenarios';
import type { TokenOut } from './types';
import { resolveWorld, worldFromEnv, type World } from './world';

export { expect };

export type Who = AccountKey | Account;

export function resolveAccount(who: Who): Account {
  return typeof who === 'string' ? ACCOUNTS[who] : who;
}

/** Portal whose dev-server origin matches `url` (the project's baseURL). */
export function portalFromUrl(url: string | undefined): PortalName {
  let origin = '';
  try {
    origin = new URL(url ?? '').origin;
  } catch {
    return 'patient';
  }
  const match = (Object.entries(ORIGINS) as [PortalName, string][]).find(([, o]) => o === origin);
  return match ? match[0] : 'patient';
}

/**
 * Per-worker cache of API sessions used for test-data setup (one login per account per worker, re-login
 * shortly before the access token expires). Browser sessions never share these tokens.
 */
class ApiSessionCache {
  private readonly sessions = new Map<string, { token: TokenOut; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<TokenOut>>();

  constructor(private readonly request: APIRequestContext) {}

  async token(account: Account): Promise<TokenOut> {
    const cached = this.sessions.get(account.email);
    if (cached && cached.expiresAt - Date.now() > 90_000) return cached.token;
    let inflight = this.pending.get(account.email);
    if (!inflight) {
      inflight = apiLogin(this.request, account).then((token) => {
        this.sessions.set(account.email, { token, expiresAt: Date.now() + (token.expires_in || 900) * 1000 });
        return token;
      });
      this.pending.set(account.email, inflight);
      inflight.finally(() => this.pending.delete(account.email)).catch(() => undefined);
    }
    return inflight;
  }

  async client(account: Account): Promise<ApiClient> {
    const token = await this.token(account);
    return new ApiClient(this.request, token.access_token);
  }
}

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  /** null for an anonymous session */
  token: TokenOut | null;
}

interface WorkerFixtures {
  workerRequest: APIRequestContext;
  apiSessions: ApiSessionCache;
  world: World;
}

interface TestFixtures {
  /** Portal under test, derived from the project's baseURL. */
  portal: PortalName;
  /** Unauthenticated API client. */
  anonApi: ApiClient;
  /** API client authenticated as a demo account (setup / API-level assertions). */
  apiAs: (who: Who) => Promise<ApiClient>;
  /** Data builders: quoted cases, confirmed bookings, pending partners... */
  scenarios: Scenarios;
  /**
   * Signs the default `page`'s browser context in as `who` (cookie-based, like the SPA) - then `page.goto()` any
   * protected route. Defaults to the portal of the current project.
   */
  loginAs: (who: Who, portal?: PortalName) => Promise<TokenOut>;
  /** A second, isolated browser context + page (another user, or anonymous when `who` is null). */
  newSession: (who: Who | null, portal: PortalName) => Promise<BrowserSession>;
  /** Uncaught page errors collected during the test (attached to the report on failure). */
  pageErrors: string[];
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ------------------------------------------------------------------------------------------ worker scope
  workerRequest: [
    async ({}, use) => {
      const ctx = await playwrightRequest.newContext();
      await use(ctx);
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],

  apiSessions: [
    async ({ workerRequest }, use) => {
      await use(new ApiSessionCache(workerRequest));
    },
    { scope: 'worker' },
  ],

  world: [
    async ({ workerRequest }, use) => {
      // Normally exported by global-setup.ts; resolve here when the suite runs without it.
      await use(worldFromEnv() ?? (await resolveWorld(workerRequest)));
    },
    { scope: 'worker' },
  ],

  // ------------------------------------------------------------------------------------------ test scope
  portal: async ({ baseURL }, use) => {
    await use(portalFromUrl(baseURL));
  },

  anonApi: async ({ workerRequest }, use) => {
    await use(new ApiClient(workerRequest));
  },

  apiAs: async ({ apiSessions }, use) => {
    await use((who) => apiSessions.client(resolveAccount(who)));
  },

  scenarios: async ({ world, anonApi, apiSessions }, use) => {
    await use(
      new Scenarios({
        world,
        anon: anonApi,
        apiAs: (account) => apiSessions.client(account),
        tokenOf: (account) => apiSessions.token(account),
      }),
    );
  },

  loginAs: async ({ page, portal }, use) => {
    await use((who, target) => loginBrowserContext(page.context(), target ?? portal, resolveAccount(who)));
  },

  newSession: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async (who, portal) => {
      const context = await browser.newContext({
        baseURL: PORTALS[portal],
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'light',
      });
      contexts.push(context);
      const token = who ? await loginBrowserContext(context, portal, resolveAccount(who)) : null;
      const page = await context.newPage();
      return { context, page, token };
    });
    for (const [index, context] of contexts.entries()) {
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [pageIndex, extraPage] of context.pages().entries()) {
          const shot = await extraPage.screenshot({ fullPage: true }).catch(() => null);
          if (shot) {
            await testInfo.attach(`session-${index + 1}-page-${pageIndex + 1}.png`, { body: shot, contentType: 'image/png' });
          }
        }
      }
      await context.close();
    }
  },

  pageErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
      await use(errors);
      if (errors.length > 0 && testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('page-errors.txt', { body: errors.join('\n'), contentType: 'text/plain' });
      }
    },
    { auto: true },
  ],
});
