'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown, Languages } from 'lucide-react';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isEnglishOnlyPath,
  localizePath,
  splitLocale,
  type Locale,
} from '@/i18n/config';

export interface SwitcherLanguage {
  code: Locale;
  nativeName: string;
}

function remember(locale: Locale) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Header language menu: plain links to the same page in each enabled language (English-only pages link to the other
 * language's home page). Choosing a language stores it in a cookie, so the first-visit browser-language redirect in
 * src/proxy.ts never overrides the choice.
 */
export function LanguageSwitcher({
  current,
  languages,
  label,
}: {
  current: Locale;
  languages: SwitcherLanguage[];
  label: string;
}) {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (languages.length < 2) return null;
  const { path } = splitLocale(pathname);
  const englishOnly = isEnglishOnlyPath(path);
  const currentName = languages.find((l) => l.code === current)?.nativeName ?? current.toUpperCase();

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-800 hover:bg-cloud focus-visible:outline-2 focus-visible:outline-primary-600"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label}: ${currentName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
        <span className="hidden md:inline">{currentName}</span>
        <span className="md:hidden">{current.toUpperCase()}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <ul
        id={menuId}
        aria-label={label}
        className={`${open ? 'block' : 'hidden'} absolute end-0 top-full z-50 mt-1 min-w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg`}
      >
        {languages.map((l) => {
          const target = englishOnly && l.code !== current ? localizePath('/', l.code) : localizePath(path, l.code);
          const active = l.code === current;
          return (
            <li key={l.code}>
              <a
                href={target}
                hrefLang={l.code}
                lang={l.code}
                aria-current={active ? 'true' : undefined}
                onClick={() => remember(l.code)}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-cloud ${active ? 'font-semibold text-primary-800' : 'text-slate-800'}`}
              >
                {l.nativeName}
                {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
