import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filters & page kept in the URL query string (shareable, survives reloads). Setting any filter resets the
 * page to 1. Empty values are removed from the URL.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const k of keys) out[k] = params.get(k) ?? '';
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, keys.join('|')]);

  const page = Math.max(1, Number(params.get('page')) || 1);

  const set = useCallback(
    (patch: Partial<Record<K | 'page', string | number | null>>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let resetPage = false;
          for (const [k, v] of Object.entries(patch) as [string, string | number | null | undefined][]) {
            if (k !== 'page') resetPage = true;
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { values, page, set, params };
}
