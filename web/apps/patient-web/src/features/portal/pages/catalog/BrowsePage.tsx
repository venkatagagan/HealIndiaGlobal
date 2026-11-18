/** Search / browse hospitals and doctors with "Soonest available" sort and earliest-date chips. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MapPin, Search } from 'lucide-react';
import type { DoctorCard, HospitalCard, HospitalSort } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useDoctorList, useHospitalList } from '../../api/phase1';
import { useSpecialties } from '../../api/queries';
import { Avatar, Rating } from '../../components/common';
import { ApproxMoney, EarliestChips, RegistrationVerified, VerifiedAccreditations } from '../../components/phase1';
import { paths } from '../../lib/paths';
import { formatNumber, useDebouncedValue, useDocumentTitle } from '../../lib/shared';
import { useViewerCurrency } from '../../lib/viewer';
import {
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Select,
  SkeletonList,
  Tabs,
} from '../../ui/primitives';

type Tab = 'hospitals' | 'doctors';
const HOSPITAL_SORTS: HospitalSort[] = ['soonest', 'rating', 'price', 'name'];
const DOCTOR_SORTS = ['soonest', 'experience'] as const;

function HospitalResult({ h }: { h: HospitalCard }) {
  const { t } = useAppTranslation();
  return (
    <Card className="relative flex h-full flex-col p-4 transition hover:shadow-raised focus-within:ring-2 focus-within:ring-ring">
      <div className="flex gap-3">
        <Avatar name={h.name} src={h.logo_url} size={52} />
        <div className="min-w-0 flex-1">
          <Link to={paths.hospital(h.slug)} className="font-semibold text-fg after:absolute after:inset-0 focus-visible:outline-none">
            {h.name}
          </Link>
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden />
            {[h.city, h.state].filter(Boolean).join(', ')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <VerifiedAccreditations items={h.accreditations_verified} />
            <Rating value={h.rating_avg} count={h.rating_count} />
          </div>
        </div>
      </div>
      {h.specialties.length ? <p className="mt-2 truncate text-xs text-muted">{h.specialties.slice(0, 4).join(' · ')}</p> : null}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
        <EarliestChips consultation={h.next_available_consultation} admission={h.next_available_admission} />
        {h.starting_price_minor != null ? (
          <span className="text-end text-sm">
            <span className="block text-xs text-muted">{t('browse.from')}</span>
            <span className="font-semibold">
              <ApproxMoney minor={h.starting_price_minor} currency={h.currency} display={h.display_starting_price} />
            </span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function DoctorResult({ d }: { d: DoctorCard }) {
  const { t } = useAppTranslation();
  return (
    <Card className="relative flex h-full flex-col p-4 transition hover:shadow-raised focus-within:ring-2 focus-within:ring-ring">
      <div className="flex gap-3">
        <Avatar name={d.full_name} src={d.photo_url} size={52} />
        <div className="min-w-0 flex-1">
          <Link to={paths.doctor(d.id)} className="font-semibold text-fg after:absolute after:inset-0 focus-visible:outline-none">
            {d.full_name}
          </Link>
          <p className="text-sm text-muted">
            {d.specialty.name}
            {d.experience_years ? ` · ${t('doctor.experience', { count: d.experience_years, years: formatNumber(d.experience_years) })}` : ''}
          </p>
          <p className="truncate text-xs text-muted">
            {d.hospital.name}, {d.hospital.city}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {d.registration_verified ? <RegistrationVerified /> : null}
            <Rating value={d.rating_avg} count={d.rating_count} />
          </div>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
        <EarliestChips consultation={d.next_available_consultation} admission={d.next_available_admission} />
        {d.consultation_fee_minor != null ? (
          <span className="text-end text-sm">
            <span className="block text-xs text-muted">{t('doctor.fee')}</span>
            <span className="font-semibold">
              <ApproxMoney minor={d.consultation_fee_minor} currency={d.currency} display={d.display_consultation_fee} />
            </span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function BrowsePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('browse.title'));
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'doctors' ? 'doctors' : 'hospitals';
  const specialty = params.get('specialty') ?? '';
  const procedure = params.get('procedure') ?? '';
  const sort = params.get('sort') ?? 'soonest';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const debouncedQ = useDebouncedValue(q.trim(), 350);
  const currency = useViewerCurrency();
  const specialties = useSpecialties();

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedQ) update({ q: debouncedQ || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedQ]);

  const hospitalSort = (HOSPITAL_SORTS as string[]).includes(sort) ? (sort as HospitalSort) : 'soonest';
  const doctorSort = (DOCTOR_SORTS as readonly string[]).includes(sort) ? (sort as (typeof DOCTOR_SORTS)[number]) : 'soonest';
  const common = { q: debouncedQ || undefined, specialty: specialty || undefined, procedure: procedure || undefined, page, page_size: 12, currency };
  const hospitals = useHospitalList({ ...common, sort: hospitalSort }, tab === 'hospitals');
  const doctors = useDoctorList({ ...common, sort: doctorSort }, tab === 'doctors');
  const active = tab === 'hospitals' ? hospitals : doctors;

  const sortOptions =
    tab === 'hospitals'
      ? HOSPITAL_SORTS.map((s) => ({ value: s, label: t(`browse.sort.${s}`) }))
      : DOCTOR_SORTS.map((s) => ({ value: s, label: t(`browse.sort.${s}`) }));

  return (
    <div className="space-y-5">
      <PageHeader title={t('browse.title')} description={t('browse.description')} />

      <Tabs
        value={tab}
        onChange={(v) => update({ tab: v === 'hospitals' ? null : v, sort: null })}
        tabs={[
          { value: 'hospitals', label: t('browse.tabs.hospitals') },
          { value: 'doctors', label: t('browse.tabs.doctors') },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">{t('browse.search')}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'hospitals' ? t('browse.searchHospitals') : t('browse.searchDoctors')}
            className="ps-9"
          />
        </label>
        <Select aria-label={t('browse.specialty')} value={specialty} onChange={(e) => update({ specialty: e.target.value || null })}>
          <option value="">{t('browse.allSpecialties')}</option>
          {(specialties.data ?? []).map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label={t('browse.sortLabel')} value={tab === 'hospitals' ? hospitalSort : doctorSort} onChange={(e) => update({ sort: e.target.value })}>
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {procedure ? (
        <p className="text-sm text-muted">
          {t('browse.forProcedure')}{' '}
          <Link to={paths.procedure(procedure)} className="font-medium text-primary-ink hover:underline">
            {procedure}
          </Link>{' '}
          <button type="button" className="text-xs underline" onClick={() => update({ procedure: null })}>
            {t('browse.clear')}
          </button>
        </p>
      ) : null}

      {active.isPending ? (
        <SkeletonList rows={4} />
      ) : active.isError ? (
        <ErrorState error={active.error} onRetry={() => void active.refetch()} />
      ) : active.data.items.length === 0 ? (
        <EmptyState
          title={t('browse.emptyTitle')}
          description={t('browse.emptyMessage')}
          action={<ButtonLink to={paths.messages}>{t('procedure.askCoordinator')}</ButtonLink>}
        />
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {t('browse.results', { count: active.data.total, formatted: formatNumber(active.data.total) })}
          </p>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tab === 'hospitals'
              ? hospitals.data?.items.map((h) => (
                  <li key={h.id}>
                    <HospitalResult h={h} />
                  </li>
                ))
              : doctors.data?.items.map((d) => (
                  <li key={d.id}>
                    <DoctorResult d={d} />
                  </li>
                ))}
          </ul>
          {active.data.pages > 1 ? (
            <Pagination page={page} pages={active.data.pages} onChange={(p) => update({ page: String(p) })} />
          ) : null}
        </>
      )}
    </div>
  );
}
