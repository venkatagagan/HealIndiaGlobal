/**
 * Hospital profile: verified accreditations, earliest dates, treatments with prices and packages (viewer
 * currency), doctors and paginated verified reviews.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck, Building2, Globe, Languages, MapPin, Plane, Stethoscope, Video } from 'lucide-react';
import { errorMessage, PACKAGE_TIER_LABELS, type HospitalProcedureOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useHospitalDetail, useHospitalReviews } from '../../api/phase1';
import { useSavedItems, useToggleSaved } from '../../api/queries';
import { Avatar, BackLink, Rating } from '../../components/common';
import {
  ApproxMoney,
  ApproxRange,
  EarliestChips,
  RegistrationVerified,
  ReviewCard,
  VerifiedAccreditations,
} from '../../components/phase1';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { formatNumber, useDocumentTitle } from '../../lib/shared';
import { useViewerCurrency } from '../../lib/viewer';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValue,
  Pagination,
  Skeleton,
  SkeletonList,
} from '../../ui/primitives';

function TreatmentRow({ hp }: { hp: HospitalProcedureOut }) {
  const { t } = useAppTranslation();
  const packages = hp.packages.filter((p) => p.is_active !== false);
  return (
    <li className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={paths.procedure(hp.procedure.slug)} className="font-semibold text-fg hover:underline">
            {hp.procedure.name}
          </Link>
          <p className="text-sm text-muted">
            {[
              hp.hospital_stay_days != null
                ? t('procedure.days', { count: hp.hospital_stay_days, days: formatNumber(hp.hospital_stay_days) })
                : null,
              hp.success_rate_pct != null
                ? t('hospital.successRate', { pct: formatNumber(Number(hp.success_rate_pct), { maximumFractionDigits: 0 }) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <p className="text-end font-bold text-fg">
          <ApproxRange
            min={hp.price_min_minor}
            max={hp.price_max_minor}
            currency={hp.currency}
            displayMin={hp.display_price_min}
            displayMax={hp.display_price_max}
          />
        </p>
      </div>
      <EarliestChips className="mt-2" consultation={hp.next_available_consultation} admission={hp.next_available_admission} />
      {packages.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {packages.map((pkg) => (
            <li key={pkg.id} className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-fg">{pkg.name}</span>
                <Badge tone="violet">{PACKAGE_TIER_LABELS[pkg.tier] ?? pkg.tier}</Badge>
              </div>
              <p className="mt-1 font-semibold">
                <ApproxMoney minor={pkg.price_minor} currency={pkg.currency} display={pkg.display_price} inline />
              </p>
              {pkg.original_price_minor != null && pkg.original_price_minor > pkg.price_minor ? (
                <p className="text-xs text-muted">
                  {t('hospital.wasPrice')}{' '}
                  <span className="line-through">
                    <ApproxMoney minor={pkg.original_price_minor} currency={pkg.currency} display={pkg.display_original_price} inline />
                  </span>
                </p>
              ) : null}
              {pkg.description ? <p className="mt-1 text-xs text-muted">{pkg.description}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink to={paths.quickQuote({ hospitals: [hp.hospital_id], procedure: hp.procedure.slug })} size="sm">
          {t('procedure.requestQuote')}
        </ButtonLink>
      </div>
    </li>
  );
}

export function HospitalPage() {
  const { slug = '' } = useParams();
  const { t } = useAppTranslation();
  const me = useMe();
  const currency = useViewerCurrency();
  const hospital = useHospitalDetail(slug, currency);
  const [page, setPage] = useState(1);
  const reviews = useHospitalReviews(hospital.data?.id, { page, page_size: 5 });
  const saved = useSavedItems();
  const toggleSaved = useToggleSaved();
  useDocumentTitle(hospital.data?.name ?? t('hospital.title'));

  if (hospital.isError) return <ErrorState error={hospital.error} onRetry={() => void hospital.refetch()} />;
  const h = hospital.data;
  if (!h) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <SkeletonList rows={3} />
      </div>
    );
  }
  const isSaved = (saved.data ?? []).some((s) => s.entity_type === 'hospital' && s.entity_id === h.id);
  const canSave = !!me.data && !me.data.is_guest;
  const procedures = h.procedures.filter((p) => p.is_active !== false);

  return (
    <div className="space-y-6">
      <BackLink to={paths.browse({ tab: 'hospitals' })}>{t('hospital.back')}</BackLink>

      <Card className="overflow-hidden">
        {h.cover_image_url ? (
          <img src={h.cover_image_url} alt="" className="h-40 w-full object-cover sm:h-56" loading="lazy" />
        ) : null}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <Avatar name={h.name} src={h.logo_url} size={72} />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-fg">{h.name}</h1>
            <p className="flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-4" aria-hidden />
              {[h.address, h.city, h.state].filter(Boolean).join(', ')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <VerifiedAccreditations items={h.accreditations_verified} />
              <Rating value={h.rating_avg} count={h.rating_count} />
              {h.international_desk ? (
                <Badge tone="violet">
                  <Globe className="size-3.5" aria-hidden />
                  {t('hospital.internationalDesk')}
                </Badge>
              ) : null}
            </div>
            <EarliestChips consultation={h.next_available_consultation} admission={h.next_available_admission} />
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col">
            <ButtonLink to={paths.quickQuote({ hospitals: [h.id] })}>{t('hospital.requestQuote')}</ButtonLink>
            {canSave ? (
              <Button
                variant="outline"
                loading={toggleSaved.isPending}
                aria-pressed={isSaved}
                icon={isSaved ? <BookmarkCheck className="size-4 text-success-ink" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
                onClick={() =>
                  toggleSaved.mutate(
                    { item: { entity_type: 'hospital', entity_id: h.id }, saved: isSaved },
                    { onError: (err) => toast.error(errorMessage(err)) },
                  )
                }
              >
                {isSaved ? t('hospital.saved') : t('hospital.save')}
              </Button>
            ) : null}
          </div>
        </div>
        {h.accreditations.length && !h.accreditations_verified?.length ? (
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            {t('hospital.selfDeclared', { list: h.accreditations.join(', ') })}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={t('hospital.treatments')} description={t('hospital.treatmentsHint')} />
            <CardBody>
              {procedures.length ? (
                <ul className="space-y-3">
                  {procedures.map((hp) => (
                    <TreatmentRow key={hp.id} hp={hp} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t('hospital.noTreatments')}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t('hospital.reviews')}
              description={h.rating_count ? t('hospital.reviewsCount', { count: h.rating_count, formatted: formatNumber(h.rating_count) }) : undefined}
            />
            <CardBody className="space-y-3">
              {reviews.isPending ? (
                <SkeletonList rows={2} />
              ) : reviews.isError ? (
                <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
              ) : reviews.data.items.length === 0 ? (
                <EmptyState title={t('hospital.noReviews')} />
              ) : (
                <>
                  {reviews.data.items.map((r) => (
                    <ReviewCard key={r.id} review={r} reportable={!!me.data} />
                  ))}
                  {reviews.data.pages > 1 ? <Pagination page={page} pages={reviews.data.pages} onChange={setPage} /> : null}
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t('hospital.about')} />
            <CardBody className="space-y-3 text-sm">
              {h.description ? <p className="text-muted">{h.description}</p> : null}
              <dl className="grid grid-cols-2 gap-3">
                {h.established_year ? <KeyValue label={t('hospital.established')}>{h.established_year}</KeyValue> : null}
                {h.bed_count ? (
                  <KeyValue label={t('hospital.beds')}>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="size-4 text-muted" aria-hidden />
                      {formatNumber(h.bed_count)}
                    </span>
                  </KeyValue>
                ) : null}
                {h.airport_distance_km != null ? (
                  <KeyValue label={t('hospital.airport')}>
                    <span className="inline-flex items-center gap-1">
                      <Plane className="size-4 text-muted" aria-hidden />
                      {t('hospital.km', { km: formatNumber(Number(h.airport_distance_km), { maximumFractionDigits: 0 }) })}
                    </span>
                  </KeyValue>
                ) : null}
              </dl>
              {h.languages.length ? (
                <p className="flex items-start gap-2 text-muted">
                  <Languages className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {h.languages.join(', ')}
                </p>
              ) : null}
              {h.specialties.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {h.specialties.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('hospital.doctors')} />
            <CardBody>
              {h.doctors.length ? (
                <ul className="space-y-3">
                  {h.doctors.map((d) => (
                    <li key={d.id} className="flex gap-3">
                      <Avatar name={d.full_name} src={d.photo_url} size={44} />
                      <div className="min-w-0 flex-1">
                        <Link to={paths.doctor(d.id)} className="font-medium text-fg hover:underline">
                          {d.full_name}
                        </Link>
                        <p className="text-xs text-muted">
                          {d.specialty.name}
                          {d.experience_years ? ` · ${t('doctor.experience', { count: d.experience_years, years: formatNumber(d.experience_years) })}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {d.registration_verified ? <RegistrationVerified /> : null}
                          <EarliestChips consultation={d.next_available_consultation} showConsultation />
                        </div>
                        {d.teleconsult_available ? (
                          <Link
                            to={paths.bookConsultation({ doctor: d.id })}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline"
                          >
                            <Video className="size-3.5" aria-hidden />
                            {t('consult.bookVideo')}
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Stethoscope className="size-4" aria-hidden />
                  {t('hospital.noDoctors')}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
