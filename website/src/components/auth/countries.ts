/** ISO 3166-1 alpha-2 codes; names are rendered with Intl.DisplayNames in the page language. */
const CODES =
  'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW';

export const COUNTRY_CODES: string[] = CODES.split(' ');

export function countryOptions(intlLocale: string): { value: string; label: string }[] {
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames([intlLocale], { type: 'region' });
  } catch {
    dn = null;
  }
  return COUNTRY_CODES.map((code) => ({ value: code, label: dn?.of(code) ?? code })).sort((a, b) =>
    a.label.localeCompare(b.label, intlLocale),
  );
}
