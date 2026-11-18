# Extracting strings (web portals)

Working notes for moving the React portals' hard-coded English into catalogs. Read
[README.md](README.md) first.

## Setup that already exists

- `web/packages/shared/src/lib/i18n.ts`: i18next setup, catalog registry, overrides, `useLanguage()`,
  `useCommonTranslation()`, `formatNumber()`, `intlLocale()`, `i18n` (the i18next instance).
- `formatDate`, `formatDateTime`, `formatRelative`, `formatMonth` (`lib/dates.ts`) and `formatMoney`,
  `formatPercent`, `formatBps` (`lib/money.ts`) already follow the UI language.
- Each app has `src/i18n.ts` exporting `APP_NS` and `useAppTranslation()`, and catalogs in
  `src/locales/<lng>/<ns>.json` (all JSON files in that folder are loaded; the file name is the namespace).

## Rules

1. **English text must stay exactly as it is today** (same wording, punctuation, capitalisation): end-to-end
   tests look for it. Only move it into the catalog.
2. Components: `const { t } = useAppTranslation();` then `t('bookings.list.title')`. Keys are nested by
   feature/page, camelCase leaves, e.g. `bookings.detail.cancelButton`.
3. Interpolation: `t('cases.count', { count })`, `"Hello {{name}}"`. Never build sentences by concatenating
   translated pieces; one key per sentence.
4. Plurals: `key_one` / `key_other` in English. Arabic: `_zero _one _two _few _many _other`; Russian:
   `_one _few _many _other`; French/Bengali: `_one _other`.
5. Text with inline links or bold: `<Trans t={t} i18nKey="x" components={{ 0: <Link to="/terms" />, 1: <strong /> }} />`
   with `"Read the <0>terms</0>"` in the catalog. Import `Trans` from `react-i18next`.
6. Outside a component (module-level arrays of options, table column definitions, zod schemas, toast
   messages in plain functions): turn them into functions that take `t`, build them inside the component
   (`useMemo(() => columns(t), [t])`), or call `i18n.t('<ns>:<key>')` **lazily at call time**. Never call
   `t` at import time.
7. Translate: visible text, `placeholder`, `title`, `aria-label`, `alt`, toast messages, confirm dialogs,
   empty states, validation messages, document titles (`useDocumentTitle`), table headers, filter labels,
   enum/status labels shown to users.
8. Do **not** translate: data from the API (names, addresses, notes, chat text, procedure names), IDs, codes,
   URLs, CSS classes, test ids, console/log messages, the brand name "Heal India Global".
9. Numbers/dates/money: use the shared formatters. Replace `toLocaleString()` / `toLocaleDateString('en-…')`
   / `new Intl.NumberFormat('en-…')` with `formatNumber(...)`, the date helpers or `intlLocale()`.
10. Right-to-left: replace physical classes with logical ones: `ml-/mr-` → `ms-/me-`, `pl-/pr-` → `ps-/pe-`,
    `left-/right-` → `start-/end-`, `text-left/right` → `text-start/end`, `border-l/r` → `border-s/e`,
    `rounded-l/r(-*)` → `rounded-s/e(-*)`, `space-x-*` stays (works) but `-space-x` / `divide-x` are fine too.
    Flip directional icons that mean "back/forward/next/previous" (ArrowLeft/Right, ChevronLeft/Right) with
    `className="… rtl:-scale-x-100"`. Do not flip icons that are not directional (e.g. a play button, charts).
    Keep `left/right` only where it is truly physical (e.g. a chart axis).
11. Catalogs: write the English file first, then `ar`, `fr`, `bn`, `ru` with exactly the same keys. Plain,
    friendly, simple wording; formal address (French *vous*, Russian *вы*, Bengali *আপনি*); Modern Standard
    Arabic. Keep every `{{placeholder}}`, `{placeholder}` and `<0>…</0>` tag. Leave "Heal India Global", currency
    codes and units (MB, km) as they are. Medical, consent, privacy, emergency, payment and AI-disclaimer
    strings must be accurate and conservative - list their keys for `docs/i18n/TRANSLATION_REVIEW.md`.
12. Check: `node scripts/i18n/check-catalogs.mjs <locales dir>` from the repo root.
