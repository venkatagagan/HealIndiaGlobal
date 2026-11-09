/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" to offer the mock payment gateway outside dev builds (staging) */
  readonly VITE_ENABLE_MOCK_PAYMENTS?: string;
  /** absolute ws(s) URL override for the realtime socket; defaults to same origin /api/v1/ws */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
