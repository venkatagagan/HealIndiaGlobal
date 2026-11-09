/** Encode a single path segment (ids, slugs). */
export const seg = (value: string | number): string => encodeURIComponent(String(value));
