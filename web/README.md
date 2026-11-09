# Heal India Global — web apps

npm workspace (Node 22 from `C:\NewProjects\nodejs`; `. scripts\env.ps1` or `source scripts/env.sh`).

| App | Dev URL | Vite `base` / router `basename` | Door |
|---|---|---|---|
| `apps/patient-web` | http://localhost:5173/app/ | `/app/` / `/` (routes already start with `/app`) | public (website) |
| `apps/agent-portal` | http://localhost:5174/agent/ | `/agent/` / `/agent` | public (website) |
| `apps/hospital-portal` | http://localhost:5175/hospital/ | `/hospital/` / `/hospital` | public (website) |
| `apps/admin-portal` | http://localhost:5176/gahi/ | `/gahi/` / `/gahi` | **staff** (own login + TOTP) |
| `packages/shared` | `@hig/shared` (TypeScript source) | | |

Every dev server proxies `/api` (incl. the `/api/v1/ws` WebSocket) to `http://127.0.0.1:8000` and redirects `/` to its base.

```
npm run dev:patient | dev:agent | dev:hospital | dev:admin
npm run typecheck          # all workspaces
npm run build              # all four apps (each runs its typecheck first)
```

## Access doors (docs/PLAN.md §3.1)

* Patient, agent and hospital portals have **no login form**. `<AuthProvider door="public">` restores the session
  (POST `/auth/refresh` with the `hig_refresh` cookie, then GET `/auth/me`); `<RequireAuth roles={[…]} redirectWrongRole>`
  sends anonymous visitors to `${VITE_PUBLIC_LOGIN_URL}?next=<current url>` and other roles to their own portal.
  Their `/login` and `/register` routes are `<DoorRedirect>`s to the website. Logout = POST `/auth/logout`, then the
  website home (`VITE_PUBLIC_SITE_URL`).
* The admin console is the staff door: `<AuthProvider door="staff">` + `<LoginPage door="staff">` use
  `/auth/staff/login|refresh|logout` (cookie `hig_staff_refresh`) and never the public endpoints; `noindex`.
* URLs come from `VITE_*` variables (see each app's `.env.example`); dev defaults are the URLs above, production
  builds default to same-origin paths (`/login`, `/app/`, `/agent/`, …).

## Conventions

* API: `import { casesApi, type CaseOut } from '@hig/shared/api'` — one typed function per PLAN §8 endpoint; enums
  (PLAN §5) as const arrays + unions + `*_LABELS` (e.g. `BODY_AREAS`, the single body-area vocabulary).
* Session/doors: `@hig/shared/auth`; UI kit: `@hig/shared/ui`; layouts: `@hig/shared/layout`; utilities
  (money, dates, cn, queryClient, i18n, ws, theme): `@hig/shared/lib`; Tailwind tokens: `@import '@hig/shared/theme.css'`
  plus `@source '../../../packages/shared/src'` in each app's `index.css`. Document AI / voice: `@hig/shared/docai`,
  `@hig/shared/voice`.
* React Query keys `[domain, params]` (e.g. `['cases', params]`); forms with React Hook Form + zod.
* Access tokens live only in memory — never in localStorage.
* Contrast: no white text on `#22C55E` / `#EF4444`; use dark text (`text-primary-fg`) or `green-700`/`red-700`
  (`#15803D` / `#B91C1C`) fills.
* Brand assets (from `design/`): `public/favicon.svg`, `public/brand/*`, `manifest.webmanifest` per app.
