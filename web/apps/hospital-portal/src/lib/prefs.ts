import { useCallback, useSyncExternalStore } from 'react';

/** localStorage for NON-SENSITIVE UI preferences only (theme, selected hospital). Never tokens or PII. */
export const prefs = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(`hig:hospital-portal:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(`hig:hospital-portal:${key}`);
      else window.localStorage.setItem(`hig:hospital-portal:${key}`, value);
    } catch {
      /* storage unavailable */
    }
  },
};

type ThemePref = 'light' | 'dark' | 'system';
const themeListeners = new Set<() => void>();

function storedTheme(): ThemePref {
  const v = prefs.get('theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}

function applyTheme(): void {
  const pref = storedTheme();
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  for (const l of themeListeners) l();
}

export function initTheme(): void {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (storedTheme() === 'system') applyTheme();
  });
}

function subscribe(cb: () => void): () => void {
  themeListeners.add(cb);
  return () => themeListeners.delete(cb);
}

export function useTheme(): { isDark: boolean; toggle: () => void } {
  const isDark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
  const toggle = useCallback(() => {
    prefs.set('theme', document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    applyTheme();
  }, []);
  return { isDark, toggle };
}
