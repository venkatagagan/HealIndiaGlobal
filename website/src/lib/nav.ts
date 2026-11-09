import 'server-only';
import { cache } from 'react';
import type { Dictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { featuredOrder, getCities, getDoctors, getHospitals, getProcedures, getSpecialties } from '@/lib/data/catalog';
import { getDestinations } from '@/lib/destinations';
import { formatMoneyCompact, toNumber } from '@/lib/money';
import { href, routes } from '@/lib/routes';
import { getSiteConfig } from '@/lib/site-config';
import { marketing } from '@/config/marketing';
import { assessmentUrl } from '@/config/site';

export type NavGroupId = 'treatments' | 'hospitals' | 'doctors' | 'trip' | 'partners';

export interface NavLink {
  href: string;
  label: string;
  /** Small secondary text (count, price, blurb). */
  meta?: string;
}

export interface NavSpecialty extends NavLink {
  slug: string;
  /** Full catalogue name (the short menu label is `label`). */
  name: string;
  icon: string | null;
  /** Index in the catalogue order (drives the per-specialty tint). */
  tint: number;
}

export interface NavHospital extends NavLink {
  initials: string;
  city: string;
  accreditations: string[];
  rating: string | null;
  reviews: string | null;
}

export interface NavDoctor extends NavLink {
  initials: string;
  specialty: string;
  years: string | null;
  hospital: string | null;
  badge: string | null;
}

export interface NavStep extends NavLink {
  icon: 'pre' | 'visa' | 'india' | 'after';
  step: string;
}

export interface NavPartner {
  id: 'hospitals' | 'agents';
  title: string;
  body: string;
  benefits: string[];
  href: string;
  cta: NavLink;
}

export interface NavSpecialtyGroup {
  title: string;
  items: NavSpecialty[];
}

/**
 * Short, single-line menu labels per specialty slug (the catalogue names stay on the pages themselves).
 * Unknown slugs fall back to the catalogue name.
 */
const MENU_LABELS: Record<string, string> = {
  cardiology: 'Heart & cardiology',
  neurology: 'Brain & neurosurgery',
  spine: 'Spine surgery',
  orthopedics: 'Orthopedics & joints',
  bariatric: 'Weight-loss surgery',
  cosmetic: 'Cosmetic & plastic',
  ent: 'Ear, nose & throat',
  gastroenterology: 'Gastro & GI surgery',
  oncology: 'Cancer care',
  transplant: 'Organ & marrow transplant',
  nephrology: 'Kidney & dialysis',
  urology: 'Urology',
  fertility: 'Fertility & IVF',
  ophthalmology: 'Eye care',
  dental: 'Dental care',
  wellness: 'Health check-ups',
};

/** Short menu labels for the popular procedures (fallback: the catalogue name without a trailing "(per ...)"). */
const PROCEDURE_LABELS: Record<string, string> = {
  cabg: 'Heart bypass surgery (CABG)',
  'total-knee-replacement': 'Total knee replacement',
  'ivf-cycle': 'IVF treatment cycle',
  'dental-implants': 'Dental implant with crown',
};

/** Menu groups (by slug, in display order); catalogue specialties not listed here go to "Other specialties". */
const SPECIALTY_GROUPS: { key: 'heart' | 'bones' | 'cancer' | 'women'; slugs: string[] }[] = [
  { key: 'heart', slugs: ['cardiology', 'neurology', 'spine'] },
  { key: 'bones', slugs: ['orthopedics', 'bariatric', 'cosmetic', 'ent', 'gastroenterology'] },
  { key: 'cancer', slugs: ['oncology', 'transplant', 'nephrology', 'urology'] },
  { key: 'women', slugs: ['fertility', 'ophthalmology', 'dental', 'wellness'] },
];

export interface NavData {
  labels: Dictionary['nav']['menu'] & {
    treatments: string;
    hospitals: string;
    doctors: string;
    trip: string;
    partners: string;
    company: string;
    allTreatments: string;
    allHospitals: string;
    allDoctors: string;
    allDestinations: string;
    destinations: string;
    login: string;
    assessment: string;
    assessmentTitle: string;
    assessmentBody: string;
    assessmentNote: string;
    ctaEyebrow: string;
    assessmentPoints: string[];
    exploreSpecialties: string;
    doctorsLead: string;
    hospitalsLead: string;
    main: string;
    openMenu: string;
    closeMenu: string;
    menuTitle: string;
  };
  links: {
    treatments: string;
    costs: string;
    hospitals: string;
    doctors: string;
    destinations: string;
    assessment: string;
  };
  specialties: NavSpecialty[];
  specialtyGroups: NavSpecialtyGroup[];
  /** "Typically up to 70% less ..." (empty when the marketing figure is hidden). */
  savingsLine: string;
  popular: NavLink[];
  cities: NavLink[];
  featuredHospitals: NavHospital[];
  hospitalFilters: NavLink[];
  hospitalSpecialties: NavLink[];
  doctorSpecialties: NavSpecialty[];
  featuredDoctors: NavDoctor[];
  steps: NavStep[];
  destinations: NavLink[];
  tripLinks: NavLink[];
  contact: { whatsapp: string; whatsappDisplay: string; phone: string; phoneDisplay: string; message: string };
  partners: NavPartner[];
  company: NavLink[];
}

const empty = { data: [], source: 'fallback' as const };
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Mega-menu content built from the live catalogue, destinations and site settings (cached per request). */
export const getNavData = cache(async (t: Dictionary): Promise<NavData> => {
  const n = t.nav;
  const m = n.menu;
  const [specialties, procedures, hospitals, cities, doctors, destinations, site] = await Promise.all([
    safe(getSpecialties(), empty),
    safe(getProcedures(), empty),
    safe(getHospitals(), empty),
    safe(getCities(), empty),
    safe(getDoctors(), empty),
    safe(getDestinations(), empty),
    getSiteConfig(),
  ]);
  const intl = 'en';

  const tintOf = new Map(specialties.data.map((s, i) => [s.slug, i]));
  const navSpecialty = (s: (typeof specialties.data)[number], linkHref: string, meta?: string): NavSpecialty => ({
    href: linkHref,
    label: MENU_LABELS[s.slug] ?? s.name,
    name: s.name,
    slug: s.slug,
    icon: s.icon,
    tint: tintOf.get(s.slug) ?? 0,
    meta,
  });

  // Popular procedures: the marketing examples first, then the cheapest procedure of the first specialties.
  const bySlug = new Map(procedures.data.map((p) => [p.slug, p]));
  const popularList = [
    ...marketing.savingsExampleProcedures.map((slug) => bySlug.get(slug)).filter((p): p is NonNullable<typeof p> => !!p),
    ...procedures.data,
  ]
    .filter((p, i, all) => all.findIndex((x) => x.slug === p.slug) === i)
    .slice(0, 4);

  const groupTitles = { heart: m.groupHeart, bones: m.groupBones, cancer: m.groupCancer, women: m.groupWomen };
  const grouped = new Set(SPECIALTY_GROUPS.flatMap((g) => g.slugs));
  const specialtyGroups: NavSpecialtyGroup[] = SPECIALTY_GROUPS.map((g) => ({
    title: groupTitles[g.key],
    items: g.slugs
      .map((slug) => specialties.data.find((s) => s.slug === slug))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => navSpecialty(s, href(routes.specialty(s.slug)))),
  })).filter((g) => g.items.length);
  const others = specialties.data.filter((s) => !grouped.has(s.slug));
  if (others.length) specialtyGroups.push({ title: m.groupOther, items: others.map((s) => navSpecialty(s, href(routes.specialty(s.slug)))) });

  const shortName = (name: string) => {
    const slug = specialties.data.find((s) => s.name === name)?.slug;
    return (slug && MENU_LABELS[slug]) || name;
  };

  const doctorCount = new Map<string, number>();
  for (const d of doctors.data) if (d.specialty) doctorCount.set(d.specialty.slug, (doctorCount.get(d.specialty.slug) ?? 0) + 1);

  const specialtyNames = new Map<string, number>();
  for (const h of hospitals.data) for (const s of h.specialties) specialtyNames.set(s, (specialtyNames.get(s) ?? 0) + 1);

  const accCount = (acc: string) => hospitals.data.filter((h) => h.accreditations.some((a) => a.toLowerCase() === acc)).length;
  const accLabel = (a: string) => t.common.accreditations[a.toLowerCase() as keyof Dictionary['common']['accreditations']] ?? a.toUpperCase();

  const guide = (slug: string, icon: NavStep['icon'], i: number): NavStep => {
    const item = (t.guides.items as Record<string, { title: string; description: string }>)[slug];
    return { href: href(routes.guide(slug)), label: item?.title ?? slug, meta: m.stepBlurbs[icon], icon, step: fmt(m.step, { n: i }) };
  };

  const topDoctors = [...doctors.data]
    .sort((a, b) => b.rating_count * (toNumber(b.rating_avg) ?? 0) - a.rating_count * (toNumber(a.rating_avg) ?? 0))
    .filter((d, i, all) => all.findIndex((x) => x.specialty?.slug === d.specialty?.slug) === i)
    .slice(0, 2);

  const partner = (id: NavPartner['id']): NavPartner => {
    const copy = id === 'hospitals' ? t.forHospitals : t.forAgents;
    return {
      id,
      title: id === 'hospitals' ? n.forHospitals : n.forAgents,
      body: id === 'hospitals' ? m.hospitalsCardBody : m.agentsCardBody,
      benefits: copy.benefits.slice(0, 3).map((b) => b.title),
      href: href(id === 'hospitals' ? routes.forHospitals : routes.forAgents),
      cta: { href: `${href(routes.register)}?role=${id === 'hospitals' ? 'hospital' : 'agent'}`, label: copy.cta },
    };
  };

  return {
    labels: {
      ...m,
      treatments: n.treatments,
      hospitals: n.hospitals,
      doctors: n.doctors,
      trip: n.planTrip,
      partners: n.partners,
      company: n.company,
      allTreatments: n.allTreatments,
      allHospitals: n.allHospitals,
      allDoctors: n.allDoctors,
      allDestinations: n.allDestinations,
      destinations: n.destinations,
      login: n.login,
      assessment: t.common.getAssessment,
      assessmentTitle: n.ctaTitle,
      assessmentBody: n.ctaBody,
      assessmentNote: n.ctaNote,
      ctaEyebrow: n.ctaEyebrow,
      assessmentPoints: [...t.home.heroPoints],
      exploreSpecialties: fmt(m.exploreSpecialties, { count: specialties.data.length }),
      doctorsLead: fmt(m.doctorsLead, { count: doctors.data.length, specialties: doctorCount.size }),
      hospitalsLead: fmt(m.hospitalsLead, { count: hospitals.data.length, cities: cities.data.length }),
      main: n.main,
      openMenu: n.openMenu,
      closeMenu: n.closeMenu,
      menuTitle: t.common.menu,
    },
    links: {
      treatments: href(routes.treatments),
      costs: href(routes.costs),
      hospitals: href(routes.hospitals),
      doctors: href(routes.doctors),
      destinations: href(routes.destinations),
      assessment: assessmentUrl(),
    },
    specialties: specialties.data.map((s) =>
      navSpecialty(
        s,
        href(routes.specialty(s.slug)),
        s.savings_min_pct !== null && s.savings_max_pct !== null
          ? fmt(t.common.savingsRange, { min: s.savings_min_pct, max: s.savings_max_pct })
          : plural(t.common.proceduresCount, s.procedures_count),
      ),
    ),
    specialtyGroups,
    savingsLine: site.marketing.showMaxSavings ? fmt(m.savingsLine, { pct: site.marketing.maxSavingsPct }) : '',
    popular: popularList.map((p) => ({
      href: href(routes.procedure(p.specialty.slug, p.slug)),
      label: PROCEDURE_LABELS[p.slug] ?? p.name.replace(/\s*\((?:per [^)]*|[A-Z]{2,6})\)\s*$/, ''),
      meta: [
        p.india_price_min_minor !== null ? fmt(t.common.from, { amount: formatMoneyCompact(p.india_price_min_minor, p.currency, intl) }).replace(/^From/, 'from') : null,
        p.total_stay_days ? fmt(m.daysInIndia, { days: plural(t.common.days, p.total_stay_days) }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })),
    cities: cities.data.map((c) => ({
      href: `${href(routes.hospitals)}?city=${encodeURIComponent(c.name)}`,
      label: c.name,
      meta: String(c.hospitals.length),
    })),
    featuredHospitals: featuredOrder(hospitals.data, hospitals.source)
      .slice(0, 2)
      .map((h) => {
        const rating = toNumber(h.rating_avg);
        return {
          href: href(routes.hospital(h.slug)),
          label: h.name,
          initials: initials(h.name),
          city: [h.city, h.state].filter(Boolean).join(', '),
          accreditations: h.accreditations.map(accLabel).slice(0, 3),
          rating: rating && h.rating_count > 0 ? rating.toFixed(1) : null,
          reviews: h.rating_count > 0 ? plural(t.common.reviews, h.rating_count) : null,
        };
      }),
    hospitalFilters: [
      { href: `${href(routes.hospitals)}?accreditation=jci`, label: m.jciAccredited, meta: String(accCount('jci')) },
      { href: `${href(routes.hospitals)}?accreditation=nabh`, label: m.nabhAccredited, meta: String(accCount('nabh')) },
    ].filter((f) => f.meta !== '0'),
    hospitalSpecialties: [...specialtyNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ href: `${href(routes.hospitals)}?specialty=${encodeURIComponent(name)}`, label: shortName(name), meta: String(count) })),
    doctorSpecialties: specialties.data
      .filter((s) => doctorCount.has(s.slug))
      .map((s) => navSpecialty(s, `${href(routes.doctors)}?specialty=${encodeURIComponent(s.slug)}`, String(doctorCount.get(s.slug)))),
    featuredDoctors: topDoctors.map((d) => {
      const acc = d.hospital?.accreditations.find((a) => ['jci', 'nabh'].includes(a.toLowerCase()));
      return {
        href: href(routes.doctor(d.slug)),
        label: d.full_name,
        initials: initials(d.full_name),
        specialty: d.specialty ? MENU_LABELS[d.specialty.slug] ?? d.specialty.name : '',
        years: d.experience_years ? fmt(m.yearsShort, { count: d.experience_years }) : null,
        hospital: d.hospital ? d.hospital.name : null,
        badge: acc ? fmt(m.accreditedHospital, { acc: accLabel(acc) }) : null,
      };
    }),
    steps: [guide('pre-arrival', 'pre', 1), guide('visa', 'visa', 2), guide('in-country', 'india', 3), guide('post-treatment-care', 'after', 4)],
    destinations: destinations.data.map((d) => ({
      href: href(routes.city(d.slug)),
      label: d.name,
      meta: d.hospitals.length ? plural(t.common.hospitalsCount, d.hospitals.length) : undefined,
    })),
    tripLinks: [
      { href: href(routes.costs), label: n.costGuides },
      { href: href(routes.stories), label: n.stories },
      { href: href(routes.guide('payments-and-refunds')), label: m.payments },
      { href: href(routes.guides), label: n.guides },
    ],
    contact: {
      whatsapp: site.contact.whatsapp,
      whatsappDisplay: site.contact.whatsappDisplay,
      phone: site.contact.phone,
      phoneDisplay: site.contact.phoneDisplay,
      message: site.contact.whatsappMessage || t.footer.fabMessage,
    },
    partners: [partner('hospitals'), partner('agents')],
    company: [
      { href: href(routes.about), label: n.about },
      { href: href(routes.faq), label: n.faq },
      { href: href(routes.contact), label: n.contact },
      { href: href(routes.login), label: n.login },
    ],
  };
});

export interface ContactNumbers {
  /** Digits only, for wa.me links (empty when not configured). */
  whatsapp: string;
  whatsappDisplay: string;
  /** tel: target (+ and digits; empty when not configured). */
  phone: string;
  phoneDisplay: string;
}

/**
 * Helpline numbers: the site settings (System -> Website & contact, via GET /site-config), else
 * NEXT_PUBLIC_WHATSAPP_NUMBER / NEXT_PUBLIC_PHONE_NUMBER. Unset or placeholder numbers come back empty.
 */
export const getContactNumbers = cache(async (): Promise<ContactNumbers> => {
  const { contact } = await getSiteConfig();
  return {
    whatsapp: contact.whatsapp,
    whatsappDisplay: contact.whatsappDisplay,
    phone: contact.phone,
    phoneDisplay: contact.phoneDisplay,
  };
});
