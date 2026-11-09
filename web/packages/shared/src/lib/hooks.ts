import { useEffect, useState } from 'react';

/** Debounce a changing value (search boxes): const q = useDebouncedValue(input, 300) */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Matches a CSS media query, e.g. useMediaQuery('(min-width: 1024px)') */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Sets document.title while mounted: useDocumentTitle('Cases') -> "Cases · Heal India Global" */
export function useDocumentTitle(title: string | null | undefined, suffix = 'Heal India Global'): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${suffix}`;
    return () => {
      document.title = previous;
    };
  }, [title, suffix]);
}
