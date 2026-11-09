/**
 * Strings for the docai components, backed by i18next (namespace `docai`, catalogs in
 * `src/locales/<lng>/docai.json`). `useDocaiText()` / `useVoiceText()` return `{ t }` where `t(key, vars?)`
 * interpolates `{name}` placeholders (single braces, kept from the original string tables).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addTranslations } from '../lib/i18n';
import en from '../locales/en/docai.json';

export type Vars = Record<string, string | number>;
export type Dictionary<K extends string> = Record<K, string>;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * Creates a `useText()` hook over a namespace whose English strings are `dictionary`. `t` changes only when
 * the language (or the catalog, e.g. after admin overrides load) changes.
 */
export function createTextHook<K extends string>(dictionary: Dictionary<K>, ns: string) {
  addTranslations(ns, dictionary);
  return function useText() {
    const { t: translate, i18n } = useTranslation(ns);
    const language = i18n.language;
    return useMemo(() => {
      void language;
      const t = (key: K, vars?: Vars): string => {
        const text = translate(key, { defaultValue: dictionary[key] ?? key });
        return interpolate(typeof text === 'string' ? text : String(text), vars);
      };
      return { t };
    }, [translate, language]);
  };
}

export type DocaiTextKey = keyof typeof en;

export const useDocaiText = createTextHook<DocaiTextKey>(en, 'docai');
