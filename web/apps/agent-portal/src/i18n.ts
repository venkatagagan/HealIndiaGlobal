/**
 * Language setup for this app. Catalogs: `src/locales/<lng>/<namespace>.json` (namespace `agent`; the shared
 * `common`, `docai` and `voice` namespaces come from @hig/shared). English is bundled, the other languages are
 * lazy chunks; admin overrides for app `agent` are merged at runtime. See docs/i18n/README.md.
 */
import { useTranslation } from 'react-i18next';
import { setupI18n } from '@hig/shared/lib';

/** i18next namespace of this app: `useTranslation('agent')`. */
export const APP_NS = 'agent';

export const i18nReady = setupI18n({
  app: 'agent',
  eager: import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' }),
  lazy: import.meta.glob(['./locales/*/*.json', '!./locales/en/*.json'], { import: 'default' }),
});

/** `const { t } = useAppTranslation()` - `t('bookings.title')` reads this app's namespace. */
export function useAppTranslation() {
  return useTranslation(APP_NS);
}

/** The `t` of this app's namespace, for helpers that build labels outside components (`columns(t)`). */
export type AppT = ReturnType<typeof useAppTranslation>['t'];
