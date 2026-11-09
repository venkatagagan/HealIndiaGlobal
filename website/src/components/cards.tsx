import Link from 'next/link';
import { ArrowRight, BadgeCheck, Building2, Clock, Languages, MapPin, Star, Video } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { href, routes } from '@/lib/routes';
import { toNumber } from '@/lib/money';
import type { DoctorCard as Doctor, FxTable, HospitalCard as Hospital, Procedure, Specialty } from '@/lib/data/types';
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
        <ArrowRight className="h-4 w-4 shrink-0 text-primary-600 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
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

export function AccreditationBadges({ t, items, dark = false }: { t: Dictionary; items: string[]; dark?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t.hospitals.accreditationsTitle}>
      {items.map((a) => {
        const key = a.toLowerCase() as keyof Dictionary['common']['accreditations'];
        const label = t.common.accreditations[key] ?? a.toUpperCase();
        const title = t.common.accreditationNames[key] ?? label;
        return (
          <li key={a}>
            <Badge tone={dark ? 'onDark' : a.toLowerCase() === 'jci' ? 'primary' : 'green'} className="uppercase">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <abbr title={title} className="no-underline">
                {label}
              </abbr>
            </Badge>
          </li>
        );
      })}
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
        <span aria-hidden="true" className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-champagne/70 via-champagne/20 to-transparent" />
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
          <AccreditationBadges t={t} items={hospital.accreditations} />
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
      </div>
    </article>
  );
}
