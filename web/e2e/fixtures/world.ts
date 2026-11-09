import type { APIRequestContext } from '@playwright/test';
import { hospitalOwner } from './accounts';
import { ApiClient, apiLogin } from './api';
import type { HospitalCard, HospitalDetail, Page } from './types';

/**
 * Hospital slugs created by backend/scripts/seed.py, in preference order. Their owners log in as
 * owner.<slug>@healindia.example. Override with E2E_HOSPITAL_SLUG / E2E_HOSPITAL_SLUG_2.
 */
export const SEEDED_HOSPITAL_SLUGS: readonly string[] = [];

/** Resolved demo data shared by all tests of a run (filled by global-setup.ts, exported via env vars). */
export interface World {
  /** primary hospital: patient flows, hospital-portal flows, settlements */
  hospitalSlug: string;
  /** second active hospital (agent "enquire at two hospitals") */
  secondHospitalSlug: string;
}

const ENV_PRIMARY = 'E2E_HOSPITAL_SLUG';
const ENV_SECONDARY = 'E2E_HOSPITAL_SLUG_2';

export function worldFromEnv(): World | null {
  const hospitalSlug = process.env[ENV_PRIMARY];
  const secondHospitalSlug = process.env[ENV_SECONDARY];
  if (!hospitalSlug || !secondHospitalSlug) return null;
  return { hospitalSlug, secondHospitalSlug };
}

export function exportWorld(world: World): void {
  process.env[ENV_PRIMARY] = world.hospitalSlug;
  process.env[ENV_SECONDARY] = world.secondHospitalSlug;
}

async function activeHospitalSlugs(api: ApiClient): Promise<string[]> {
  const page = await api.get<Page<HospitalCard>>('/hospitals', { page_size: 100, sort: 'name' });
  return page.items.map((h) => h.slug);
}

/** A hospital is usable when it is publicly listed and has at least one doctor and one priced procedure. */
async function isUsable(api: ApiClient, slug: string): Promise<boolean> {
  const { status, body } = await api.raw('GET', `/hospitals/${encodeURIComponent(slug)}`);
  if (status !== 200 || !body) return false;
  const detail = body as HospitalDetail;
  return (detail.doctors?.length ?? 0) > 0 && (detail.procedures?.length ?? 0) > 0;
}

async function ownerCanLogin(request: APIRequestContext, slug: string): Promise<boolean> {
  try {
    await apiLogin(request, hospitalOwner(slug));
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks the hospitals the suite works with. Preference: env overrides, then the seeded slugs, then any active
 * hospital whose owner account (owner.<slug>@...) can log in.
 */
export async function resolveWorld(request: APIRequestContext): Promise<World> {
  const fromEnv = worldFromEnv();
  if (fromEnv) return fromEnv;

  const api = new ApiClient(request);
  const listed = await activeHospitalSlugs(api);
  if (listed.length === 0) {
    throw new Error('GET /hospitals returned no active hospitals - seed the database first (backend/scripts/seed.py).');
  }
  const preferred = [
    ...(process.env[ENV_PRIMARY] ? [process.env[ENV_PRIMARY]] : []),
    ...SEEDED_HOSPITAL_SLUGS.filter((s) => listed.includes(s)),
    ...listed,
  ];
  const candidates = [...new Set(preferred)];

  let primary: string | null = null;
  let attempts = 0;
  for (const slug of candidates) {
    if (attempts >= 6) break;
    if (!(await isUsable(api, slug))) continue;
    attempts += 1;
    if (await ownerCanLogin(request, slug)) {
      primary = slug;
      break;
    }
  }
  if (!primary) {
    throw new Error(
      `No seeded hospital owner could log in (tried owner.<slug>@healindia.example for ${candidates.slice(0, 6).join(', ')}). ` +
        'Seed the database or set E2E_HOSPITAL_SLUG.',
    );
  }
  const secondary =
    process.env[ENV_SECONDARY] ?? candidates.find((slug) => slug !== primary) ?? primary;
  return { hospitalSlug: primary, secondHospitalSlug: secondary };
}
