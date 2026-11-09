/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** patient / agent / hospital portal URLs (links from the staff console) */
  readonly VITE_PATIENT_APP_URL?: string;
  readonly VITE_AGENT_PORTAL_URL?: string;
  readonly VITE_HOSPITAL_PORTAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
