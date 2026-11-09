import { api } from '../client';
import type {
  AccountDeleteIn,
  DeletionPolicyOut,
  DeletionRequestIn,
  DeletionRequestOut,
  ChangePasswordIn,
  ConsentIn,
  ConsentOut,
  DeviceIn,
  EmailIn,
  GoogleLoginIn,
  GuestUpgradeIn,
  LoginIn,
  MeUpdateIn,
  MfaCodeIn,
  MfaSetupOut,
  RegisterIn,
  ResetPasswordIn,
  TokenIn,
  TokenOut,
  UserOut,
} from '../types';

/** PLAN 8.1 - /auth. Prefer `useAuth()` for login/register/logout so the session state stays in sync. */
export const authApi = {
  register: (body: RegisterIn) => api.post<TokenOut>('/auth/register', body, { skipAuth: true }),
  login: (body: LoginIn) => api.post<TokenOut>('/auth/login', body, { skipAuth: true }),
  google: (body: GoogleLoginIn) => api.post<TokenOut>('/auth/google', body, { skipAuth: true }),
  guest: () => api.post<TokenOut>('/auth/guest', {}, { skipAuth: true }),
  upgradeGuest: (body: GuestUpgradeIn) => api.post<TokenOut>('/auth/guest/upgrade', body),
  /** Rotates the httpOnly refresh cookie. Prefer `refreshSession()` (single-flight) from the client. */
  refresh: () => api.post<TokenOut>('/auth/refresh', {}, { skipAuth: true, skipRefresh: true }),
  logout: () => api.post<void>('/auth/logout', {}, { skipRefresh: true }),
  me: () => api.get<UserOut>('/auth/me'),
  updateMe: (body: MeUpdateIn) => api.patch<UserOut>('/auth/me', body),
  /** Permanently delete (anonymise) the account (204). Password accounts re-authenticate; 409 `account_deletion_blocked`. */
  deleteMe: (body: AccountDeleteIn = {}) => api.request<void>('DELETE', '/auth/me', { body }),
  deletionPolicy: () => api.get<DeletionPolicyOut>('/auth/me/deletion-policy'),
  /** when deletion is blocked: ask support to close the account once the blockers are resolved */
  requestDeletion: (body: DeletionRequestIn = {}) => api.post<DeletionRequestOut>('/auth/me/deletion-request', body),
  changePassword: (body: ChangePasswordIn) => api.post<void>('/auth/change-password', body),
  verifyEmail: (body: TokenIn) => api.post<void>('/auth/verify-email', body, { skipAuth: true }),
  resendVerification: () => api.post<void>('/auth/resend-verification', {}),
  /** always 202 */
  forgotPassword: (body: EmailIn) => api.post<void>('/auth/forgot-password', body, { skipAuth: true }),
  resetPassword: (body: ResetPasswordIn) => api.post<void>('/auth/reset-password', body, { skipAuth: true }),
  mfaSetup: () => api.post<MfaSetupOut>('/auth/mfa/setup', {}),
  mfaEnable: (body: MfaCodeIn) => api.post<void>('/auth/mfa/enable', body),
  mfaDisable: (body: MfaCodeIn) => api.post<void>('/auth/mfa/disable', body),
  registerDevice: (body: DeviceIn) => api.post<void>('/auth/devices', body),
  listConsents: () => api.get<ConsentOut[]>('/auth/consents'),
  giveConsent: (body: ConsentIn) => api.post<ConsentOut>('/auth/consents', body),

  // --- STAFF DOOR (PLAN 3.1): admin console at /gahi; roles admin|finance|support|super_admin only ---------
  /** `{email, password, otp_code?}`; 401 `{error.code: "mfa_required"}` when a TOTP code is needed. */
  staffLogin: (body: LoginIn) => api.post<TokenOut>('/auth/staff/login', body, { skipAuth: true }),
  /** Rotates the `hig_staff_refresh` cookie. Prefer `refreshSession()` after `configureApiClient({ refreshPath })`. */
  staffRefresh: () => api.post<TokenOut>('/auth/staff/refresh', {}, { skipAuth: true, skipRefresh: true }),
  staffLogout: () => api.post<void>('/auth/staff/logout', {}, { skipRefresh: true }),
};
