import Link from '@/components/link';
import { ArrowRight, BadgeCheck, Building2, CalendarCheck, Clock, Languages, MapPin, ShieldCheck, Star, Video } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { fmt, formatDate, plural } from '@/i18n/format';
import { href, routes } from '@/lib/routes';
import { toNumber } from '@/lib/money';
import type { AccreditationBadge, DoctorCard as Doctor, FxTable, HospitalCard as Hospital, Procedure, Review, Specialty } from '@/lib/data/types';
import { PriceRange } from './price';
import { SpecialtyIcon, specialtyTint, specialtyTone } from './specialty-icon';
import { Badge } from './ui';

// ------------------------------------------------------------------------------------------- specialty
export function SpecialtyTile({
  t,
  specialty,
  index,
  dark = true,
  topProcedures,
  fromPrice,
}: {
  t: Dictionary;
  specialty: Specialty;
  index: number;
  dark?: boolean;
  /** Light variant: up to three procedure names shown as chips. */
  topProcedures?: string[];
  /** Light variant: "From ₹…" text. */
  fromPrice?: string | null;
}) {
  const hasSavings = specialty.savings_min_pct !== null && specialty.savings_max_pct !== null;
  const savings = hasSavings ? fmt(t.common.savingsRange, { min: specialty.savings_min_pct!, max: specialty.savings_max_pct! }) : null;
  if (dark) {
    return (
      <Link
        href={href(routes.specialty(specialty.slug))}
        className="group flex h-full flex-col rounded-2xl border border-night-line bg-night-card p-5 transition hover:border-health-500/60 hover:bg-[#24476a]"
      >
        <span className={specialtyTone(index)}>
          <SpecialtyIcon slug={specialty.slug} icon={specialty.icon} className="h-8 w-8" />
        </span>
        <span className="mt-4 text-base leading-snug font-semibold text-white">{specialty.name}</span>
        <span className="mt-1 text-sm text-slate-400">{plural(t.common.proceduresCount, specialty.procedures_count)}</span>
        {savings ? <span className="mt-auto pt-3 text-sm font-semibold text-health-400">{savings}</span> : null}
      </Link>
    );
  }
  const tint = specialtyTint(index);
  return (
    <article
      className={`group card-hover relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5 ${tint.hover}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tint.tile}`}>
          <SpecialtyIcon slug={specialty.slug} icon={specialty.icon} className="h-6 w-6" />
        </span>
        {savings ? (
          <span className="rounded-full bg-health-50 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-health-800 ring-1 ring-health-600/20">
            {savings}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base leading-snug font-semibold text-slate-900">
        <Link
          href={href(routes.specialty(specialty.slug))}
          className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-primary-800"
        >
          {specialty.name}
        </Link>
      </h3>
      {specialty.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-600 max-sm:hidden">{specialty.description}</p> : null}
      {topProcedures?.length ? (
        <ul className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
          {topProcedures.slice(0, 2).map((name) => (
            <li key={name} className="max-w-full truncate rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
        <span className="min-w-0 text-slate-600">
          <span className="font-semibold text-slate-800">{plural(t.common.proceduresCount, specialty.procedures_count)}</span>
          {fromPrice ? <span className="hidden sm:inline"> · {fromPrice}</span> : null}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary-600 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
      </div>
    </article>
  );
}

// ------------------------------------------------------------------------------------------- procedure
export function ProcedureCard({
  t,
  procedure,
  fx,
}: {
  t: Dictionary;
  procedure: Procedure;
  fx: FxTable;
}) {
  const days = procedure.total_stay_days;
  return (
    <article className="card-hover relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card hover:border-primary-200">
      <p className="text-xs font-semibold tracking-wide text-primary-700 uppercase">{procedure.specialty.name}</p>
      <h3 className="mt-1.5 text-base leading-snug font-semibold text-slate-900">
        <Link
          href={href(routes.procedure(procedure.specialty.slug, procedure.slug))}
          className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800"
        >
          {procedure.name}
        </Link>
      </h3>
      <dl className="mt-auto space-y-1.5 pt-4 text-sm">
        {procedure.india_price_min_minor !== null ? (
          <div>
            <dt className="sr-only">{t.procedure.priceRange}</dt>
            <dd className="text-slate-900">
              <PriceRange
               
                min={procedure.india_price_min_minor}
                max={procedure.india_price_max_minor}
                currency={procedure.currency}
                fx={fx}
                approxLabel={t.common.approx}
                stacked
              />
            </dd>
          </div>
        ) : null}
        {days ? (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <dt>{t.treatments.timeInIndia}:</dt>
            <dd className="font-medium text-slate-800">{plural(t.common.days, days)}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

// -------------------------------------------------------------------------------------------- rating
export function Rating({ t, value, count }: { t: Dictionary; value: number | string | null; count: number }) {
  const rating = toNumber(value);
  if (!rating || count <= 0) return <span className="text-sm text-slate-500">{t.common.noReviewsYet}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
      <span className="font-semibold text-slate-900">
        <span className="sr-only">{fmt(t.common.rating, { rating: rating.toFixed(1) })}</span>
        <span aria-hidden="true">{rating.toFixed(1)}</span>
      </span>
      <span className="text-slate-600">({plural(t.common.reviews, count)})</span>
    </span>
  );
}

/** Lower-case accreditation keys that a platform admin has verified (certificate seen, still valid). */
function verifiedKeys(verified: AccreditationBadge[] | undefined): Map<string, AccreditationBadge> {
  return new Map((verified ?? []).map((v) => [v.body.trim().toLowerCase(), v]));
}

/**
 * Accreditation chips. Admin-verified accreditations carry a check mark (and are listed first); accreditations the
 * hospital only declared are plain chips labelled "Declared by the hospital".
 */
export function AccreditationBadges({
  t,
  items,
  verified,
  dark = false,
}: {
  t: Dictionary;
  items: string[];
  verified?: AccreditationBadge[];
  dark?: boolean;
}) {
  const checked = verifiedKeys(verified);
  const keys = [...new Set([...checked.keys(), ...items.map((a) => a.trim().toLowerCase())])].filter(Boolean);
  if (!keys.length) return null;
  keys.sort((a, b) => Number(checked.has(b)) - Number(checked.has(a)));
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t.hospitals.accreditationsTitle}>
      {keys.map((key) => {
        const k = key as keyof Dictionary['common']['accreditations'];
        const label = t.common.accreditations[k] ?? key.toUpperCase();
        const name = t.common.accreditationNames[k] ?? label;
        const isVerified = checked.has(key);
        return (
          <li key={key}>
            <Badge tone={dark ? 'onDark' : isVerified ? (key === 'jci' ? 'primary' : 'green') : 'slate'} className="uppercase">
              {isVerified ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              <abbr title={`${name} - ${isVerified ? t.trust.verifiedBadge : t.trust.selfDeclared}`} className="no-underline">
                {label}
              </abbr>
              <span className="sr-only"> ({isVerified ? t.trust.verifiedBadge : t.trust.selfDeclared})</span>
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Hospital page: verified accreditations (body + valid until) shown apart from self-declared ones. */
export function HospitalAccreditations({ t, items, verified }: { t: Dictionary; items: string[]; verified?: AccreditationBadge[] }) {
  const checked = verifiedKeys(verified);
  const declared = [...new Set(items.map((a) => a.trim().toLowerCase()))].filter((a) => a && !checked.has(a));
  const nameOf = (key: string) => {
    const k = key as keyof Dictionary['common']['accreditations'];
    return { label: t.common.accreditations[k] ?? key.toUpperCase(), name: t.common.accreditationNames[k] ?? key.toUpperCase() };
  };
  if (!checked.size && !declared.length) return <p className="text-sm text-slate-600">{t.hospitals.noAccreditations}</p>;
  return (
    <div className="space-y-3">
      {checked.size ? (
        <div>
          <p className="text-xs font-semibold tracking-wide text-health-800 uppercase">{t.trust.verifiedAccreditations}</p>
          <ul className="mt-1.5 space-y-1.5">
            {[...checked.entries()].map(([key, v]) => {
              const { label, name } = nameOf(key);
              return (
                <li key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Badge tone={key === 'jci' ? 'primary' : 'green'} className="uppercase">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <abbr title={name} className="no-underline">
                      {label}
                    </abbr>
                  </Badge>
                  {v.valid_until ? <span className="text-slate-600">{fmt(t.trust.validUntil, { date: formatDate(v.valid_until) })}</span> : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-xs text-slate-600">{t.trust.verifiedAccreditationsNote}</p>
        </div>
      ) : null}
      {declared.length ? (
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-700 uppercase">{t.trust.selfDeclared}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {declared.map((key) => {
              const { label, name } = nameOf(key);
              return (
                <li key={key}>
                  <Badge tone="slate" className="uppercase">
                    <abbr title={name} className="no-underline">
                      {label}
                    </abbr>
                  </Badge>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-xs text-slate-600">{t.trust.selfDeclaredNote}</p>
        </div>
      ) : null}
    </div>
  );
}

/** "Registration verified" (medical registration checked by a platform admin against the official register). */
export function RegistrationVerified({ t, verified }: { t: Dictionary; verified?: boolean }) {
  if (!verified) return null;
  return (
    <Badge tone="green">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {t.trust.registrationVerified}
    </Badge>
  );
}

/** One published review: stars, text, author, date and "Verified patient · <treatment>" when applicable. */
export function ReviewItem({ t, review }: { t: Dictionary; review: Review }) {
  const stars = Math.max(0, Math.min(5, Math.round(review.rating)));
  const author = review.patient_name?.trim() || review.author_name?.trim() || null;
  const when = review.published_at ?? review.created_at;
  return (
    <article className="h-full rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-600">
          <span aria-hidden="true">{'★'.repeat(stars)}</span>
          <span className="sr-only">{fmt(t.common.rating, { rating: stars })}</span>
        </p>
        {review.verified_patient ? (
          <Badge tone="green">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {review.treatment_name ? fmt(t.trust.verifiedPatientTreatment, { treatment: review.treatment_name }) : t.trust.verifiedPatient}
          </Badge>
        ) : null}
      </div>
      {review.title ? <h3 className="mt-2 font-semibold">{review.title}</h3> : null}
      {review.body ? <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{review.body}</p> : null}
      {author || when ? (
        <p className="mt-3 text-xs text-slate-600">
          {[author, when ? formatDate(when) : null].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </article>
  );
}

/** An ISO date that is today or later (UTC), else null: cached pages never advertise a slot that has passed. */
export function upcoming(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= new Date().toISOString().slice(0, 10) ? day : null;
}

/** "Earliest consultation: 3 December 2026" / "Earliest admission: …" (free slots published by the hospital). */
export function EarliestAvailability({
  t,
  consultation,
  admission,
  className = '',
}: {
  t: Dictionary;
  consultation?: string | null;
  admission?: string | null;
  className?: string;
}) {
  const c = upcoming(consultation);
  const a = upcoming(admission);
  if (!c && !a) return null;
  return (
    <ul className={`space-y-0.5 text-sm text-health-800 ${className}`} aria-label={t.prices.availabilityTitle}>
      {c ? (
        <li className="flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {fmt(t.prices.earliestConsultation, { date: formatDate(c) })}
        </li>
      ) : null}
      {a ? (
        <li className="flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {fmt(t.prices.earliestAdmission, { date: formatDate(a) })}
        </li>
      ) : null}
    </ul>
  );
}

function Initials({ name, className }: { name: string; className: string }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span aria-hidden="true" className={`flex items-center justify-center font-bold text-white ${className}`}>
      {initials}
    </span>
  );
}

// -------------------------------------------------------------------------------------------- hospital
export function HospitalCard({
  t,
  hospital,
  fx,
  priceOverride,
}: {
  t: Dictionary;
  hospital: Hospital;
  fx: FxTable;
  priceOverride?: { min: number | null; max: number | null; currency: string; label: string } | null;
}) {
  return (
    <article className="card-hover relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card hover:border-primary-200">
      <div className="relative flex items-center border-b border-slate-200 bg-cloud px-5 py-4">
        <span aria-hidden="true" className="absolute inset-x-5 top-0 h-px bg-gradient-to-r rtl:bg-gradient-to-l from-champagne/70 via-champagne/20 to-transparent" />
        <Initials name={hospital.name} className="h-11 w-11 rounded-xl bg-navy text-base" />
        <span className="ms-3 inline-flex items-center gap-1 text-sm font-medium text-slate-700">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {hospital.city}
          {hospital.state && hospital.state !== hospital.city ? `, ${hospital.state}` : ''}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-lg leading-snug font-semibold text-slate-900">
          <Link href={href(routes.hospital(hospital.slug))} className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800">
            {hospital.name}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Rating t={t} value={hospital.rating_avg} count={hospital.rating_count} />
          <AccreditationBadges t={t} items={hospital.accreditations} verified={hospital.accreditations_verified} />
        </div>
        {hospital.specialties.length ? (
          <p className="text-sm text-slate-600">
            <span className="sr-only">{t.hospitals.specialties}: </span>
            {hospital.specialties.slice(0, 4).join(' · ')}
            {hospital.specialties.length > 4 ? ` +${hospital.specialties.length - 4}` : ''}
          </p>
        ) : null}
        {hospital.languages.length ? (
          <p className="flex items-start gap-1.5 text-sm text-slate-600">
            <Languages className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="sr-only">{t.hospitals.languages}: </span>
              {hospital.languages.slice(0, 5).join(', ')}
            </span>
          </p>
        ) : null}
        <EarliestAvailability t={t} consultation={hospital.next_available_consultation} admission={hospital.next_available_admission} />
        <div className="mt-auto border-t border-slate-100 pt-3 text-sm">
          {priceOverride ? (
            <>
              <span className="block text-slate-600">{priceOverride.label}</span>
              <PriceRange min={priceOverride.min} max={priceOverride.max} currency={priceOverride.currency} fx={fx} approxLabel={t.common.approx} stacked className="text-slate-900" />
            </>
          ) : hospital.starting_price_minor !== null ? (
            <>
              <span className="block text-slate-600">{t.hospitals.startingPrice}</span>
              <PriceRange min={hospital.starting_price_minor} max={hospital.starting_price_minor} currency={hospital.currency} fx={fx} approxLabel={t.common.approx} className="text-slate-900" />
            </>
          ) : hospital.international_desk ? (
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {t.common.internationalDesk}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------- doctor
export function DoctorCard({ t, doctor }: { t: Dictionary; doctor: Doctor }) {
  const success = toNumber(doctor.success_rate_pct);
  return (
    <article className="card-hover relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card hover:border-primary-200">
      <div className="flex items-start gap-4">
        <Initials name={doctor.full_name} className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-navy to-primary-600 text-lg" />
        <div className="min-w-0">
          <h3 className="text-base leading-snug font-semibold text-slate-900">
            <Link href={href(routes.doctor(doctor.slug))} className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800">
              {doctor.full_name}
            </Link>
          </h3>
          {doctor.specialty ? <p className="text-sm text-primary-700">{doctor.specialty.name}</p> : null}
          {doctor.registration_verified ? (
            <p className="mt-1">
              <RegistrationVerified t={t} verified />
            </p>
          ) : null}
          {doctor.hospital ? (
            <p className="mt-0.5 text-sm text-slate-600">
              {doctor.hospital.name}, {doctor.hospital.city}
            </p>
          ) : null}
        </div>
      </div>
      {doctor.qualifications.length ? (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed font-medium text-slate-600">
          <span className="sr-only">{t.doctors.qualifications}: </span>
          {doctor.qualifications.join(' · ')}
        </p>
      ) : null}
      <div className="mt-auto space-y-1 pt-3 text-sm text-slate-700">
        {doctor.experience_years ? <p>{plural(t.common.yearsExperience, doctor.experience_years)}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Rating t={t} value={doctor.rating_avg} count={doctor.rating_count} />
          {success ? <span className="text-slate-600">{fmt(t.doctors.successRate, { pct: success.toFixed(1) })}</span> : null}
        </div>
        {doctor.teleconsult_available ? (
          <p className="inline-flex items-center gap-1.5 text-brand-ink">
            <Video className="h-4 w-4" aria-hidden="true" />
            {t.doctors.teleconsult}
          </p>
        ) : null}
        <EarliestAvailability t={t} consultation={doctor.next_available_consultation} admission={doctor.next_available_admission} />
      </div>
    </article>
  );
}
