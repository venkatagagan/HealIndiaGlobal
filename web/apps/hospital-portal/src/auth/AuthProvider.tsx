/**
 * The hospital portal uses the shared session provider (PLAN 3.1 public door): bootstrap via POST /auth/refresh
 * (cookie `hig_refresh`) then GET /auth/me; logout = POST /auth/logout, then the website home.
 */
export { AuthProvider, useAuth } from '@hig/shared/auth';
