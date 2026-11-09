import { useCallback, useSyncExternalStore } from 'react';
import { prefs } from './storage';

export type ThemePreference = 'light' | 'dark' | 'system';

const listeners = new Set<() => void>();

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function getThemePreference(): ThemePreference {
  const value = prefs.get('theme');
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/** Apply the `.dark` class on <html> according to the stored preference. Call once before render. */
export function applyTheme(pref: ThemePreference = getThemePreference()): void {
  if (typeof document === 'undefined') return;
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemePreference(pref: ThemePreference): void {
  prefs.set('theme', pref);
  applyTheme(pref);
  for (const l of listeners) l();
}

/** Initialise theme handling (applies stored theme + follows OS changes when "system"). */
export function initTheme(): void {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') {
      applyTheme('system');
      for (const l of listeners) l();
    }
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isDarkNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/** { preference, isDark, setPreference, toggle } */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getThemePreference, () => 'system' as ThemePreference);
  const isDark = useSyncExternalStore(subscribe, isDarkNow, () => false);
  const toggle = useCallback(() => setThemePreference(isDarkNow() ? 'light' : 'dark'), []);
  return { preference, isDark, setPreference: setThemePreference, toggle };
}
