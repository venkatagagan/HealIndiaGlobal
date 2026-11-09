/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** website sign-in door (default http://localhost:3000/login in dev, /login in production) */
  readonly VITE_PUBLIC_LOGIN_URL?: string;
  /** website home, where logout lands (default http://localhost:3000/) */
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_PATIENT_APP_URL?: string;
  readonly VITE_AGENT_PORTAL_URL?: string;
  readonly VITE_HOSPITAL_PORTAL_URL?: string;
  readonly VITE_ADMIN_PORTAL_URL?: string;
  /** "true" to offer the mock payment gateway outside dev builds (staging) */
  readonly VITE_ENABLE_MOCK_PAYMENTS?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
