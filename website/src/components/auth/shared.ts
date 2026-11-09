'use client';

import type { Dictionary } from '@/i18n';
import type { ApiResult } from '@/lib/auth-client';

export type AuthLabels = Dictionary['auth'];

/** Map an API failure to a user-facing message. Staff accounts get the same generic 401 as bad passwords. */
export function authErrorMessage(res: Extract<ApiResult<unknown>, { ok: false }>, t: AuthLabels): string {
  if (res.status === 0) return t.networkError;
  if (res.status === 429) return t.rateLimited;
  if (res.status === 401) return t.invalidCredentials;
  if (res.status === 409) return t.errors.emailTaken;
  if (res.status === 422) return t.errors.checkFields;
  return t.genericError;
}

/** Field names mentioned in a FastAPI/Pydantic validation error payload. */
export function invalidFields(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  const out: string[] = [];
  for (const d of details) {
    const loc = (d as { loc?: unknown[] })?.loc;
    const field = Array.isArray(loc) ? loc[loc.length - 1] : (d as { field?: string })?.field;
    if (typeof field === 'string') out.push(field);
  }
  return out;
}
