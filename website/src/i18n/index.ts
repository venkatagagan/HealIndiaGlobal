import en, { type Dictionary } from './dictionaries/en';

export type { Dictionary };

/** The site is English only; all UI copy lives in `dictionaries/en.ts`. */
export function getDictionary(): Dictionary {
  return en;
}
