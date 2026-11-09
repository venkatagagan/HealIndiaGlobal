/**
 * Safe localStorage access for NON-SENSITIVE UI preferences only (theme, language, sidebar state).
 * Never store tokens or personal data here.
 */
export const prefs = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(`hig:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(`hig:${key}`);
      else window.localStorage.setItem(`hig:${key}`, value);
    } catch {
      /* storage unavailable (private mode) - ignore */
    }
  },
};
