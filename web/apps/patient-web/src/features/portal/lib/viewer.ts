/**
 * Who is looking: display currency (server `display_*` amounts) and the home country used for
 * "Your country vs India". Both are optional - the server falls back to the profile or detection.
 */
import { useSyncExternalStore } from 'react';
import { usePatientProfile } from '../api/queries';
import { useMe } from './session';
import { prefs } from './shared';

const HOME_COUNTRY_KEY = 'home_country';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Home country chosen in the cost block (null = detect automatically). Kept in localStorage (try/catch). */
export function useHomeCountryPref(): [string | null, (code: string | null) => void] {
  const value = useSyncExternalStore(subscribe, () => prefs.get(HOME_COUNTRY_KEY), () => null);
  const set = (code: string | null) => {
    prefs.set(HOME_COUNTRY_KEY, code);
    for (const l of listeners) l();
  };
  return [value, set];
}

const GUEST_CURRENCY_KEY = 'display_currency';

/** Remember the home-country currency the cost block resolved for a guest (they have no profile currency). */
export function rememberGuestCurrency(currency: string | null | undefined): void {
  const code = currency && /^[A-Z]{3}$/.test(currency) && currency !== 'INR' ? currency : null;
  if (prefs.get(GUEST_CURRENCY_KEY) === code) return;
  prefs.set(GUEST_CURRENCY_KEY, code);
  for (const l of listeners) l();
}

/**
 * Currency for `?currency=`: the patient's preferred currency (signed-in patients get `display_*` in it anyway,
 * this keeps cached catalogue reads keyed by currency). Guests: the currency of their home country as resolved by
 * "Your country vs India" (undefined until then - amounts stay in INR).
 */
export function useViewerCurrency(): string | undefined {
  const me = useMe();
  const isGuest = me.data?.is_guest ?? true;
  const profile = usePatientProfile(!!me.data && !isGuest);
  const guestCurrency = useSyncExternalStore(subscribe, () => prefs.get(GUEST_CURRENCY_KEY), () => null);
  if (!isGuest) return profile.data?.preferred_currency ?? undefined;
  return guestCurrency ?? undefined;
}
