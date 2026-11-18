/** Doctor profile: experience, qualifications, "Registration verified", earliest dates, fee, treatments and reviews. */
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck, GraduationCap, Languages, MapPin, Video } from 'lucide-react';
import { errorMessage } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useDoctorDetail, useDoctorReviews } from '../../api/phase1';
import { useSavedItems, useToggleSaved } from '../../api/queries';
import { Avatar, BackLink, Rating } from '../../components/common';
import { ApproxMoney, ApproxRange, EarliestChips, RegistrationVerified, ReviewCard } from '../../components/phase1';
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

export function DoctorPage() {
  const { id = '' } = useParams();
  const { t } = useAppTranslation();
  const me = useMe();
  const currency = useViewerCurrency();
  const doctor = useDoctorDetail(id, currency);
  const [page, setPage] = useState(1);
  const reviews = useDoctorReviews(doctor.data?.id, { page, page_size: 5 });
  const saved = useSavedItems();
  const toggleSaved = useToggleSaved();
  useDocumentTitle(doctor.data?.full_name ?? t('doctor.title'));

  if (doctor.isError) return <ErrorState error={doctor.error} onRetry={() => void doctor.refetch()} />;
  const d = doctor.data;
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const isSaved = (saved.data ?? []).some((s) => s.entity_type === 'doctor' && s.entity_id === d.id);
  const canSave = !!me.data && !me.data.is_guest;

  return (
    <div className="space-y-6">
      <BackLink to={paths.hospital(d.hospital.slug)}>{d.hospital.name}</BackLink>

      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <Avatar name={d.full_name} src={d.photo_url} size={88} />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-fg">{d.full_name}</h1>
            <p className="text-sm text-muted">
              {d.specialty.name}
              {d.experience_years ? ` · ${t('doctor.experience', { count: d.experience_years, years: formatNumber(d.experience_years) })}` : ''}
            </p>
            <p className="flex items-center gap-1 text-sm">
              <MapPin className="size-4 text-muted" aria-hidden />
              <Link to={paths.hospital(d.hospital.slug)} className="font-medium text-primary-ink hover:underline">
                {d.hospital.name}
              </Link>
              <span className="text-muted">· {d.hospital.city}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {d.registration_verified ? <RegistrationVerified /> : null}
              <Rating value={d.rating_avg} count={d.rating_count} />
              {d.teleconsult_available ? (
                <Badge tone="blue">
                  <Video className="size-3.5" aria-hidden />
                  {t('doctor.teleconsult')}
                </Badge>
              ) : null}
            </div>
            <EarliestChips consultation={d.next_available_consultation} admission={d.next_available_admission} />
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col">
            <ButtonLink to={paths.quickQuote({ hospitals: [d.hospital.id] })}>{t('doctor.requestQuote')}</ButtonLink>
            {canSave ? (
              <Button
                variant="outline"
                loading={toggleSaved.isPending}
                aria-pressed={isSaved}
                icon={isSaved ? <BookmarkCheck className="size-4 text-success-ink" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
                onClick={() =>
                  toggleSaved.mutate(
                    { item: { entity_type: 'doctor', entity_id: d.id }, saved: isSaved },
                    { onError: (err) => toast.error(errorMessage(err)) },
                  )
                }
              >
                {isSaved ? t('hospital.saved') : t('hospital.save')}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {d.bio ? (
            <Card>
              <CardHeader title={t('doctor.about')} />
              <CardBody>
                <p className="whitespace-pre-line text-sm text-fg/80">{d.bio}</p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t('hospital.treatments')} />
            <CardBody>
              {d.procedures.length ? (
                <ul className="divide-y divide-border">
                  {d.procedures.map((hp) => (
                    <li key={hp.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link to={paths.procedure(hp.procedure.slug)} className="font-medium text-fg hover:underline">
                          {hp.procedure.name}
                        </Link>
                        <EarliestChips className="mt-1" admission={hp.next_available_admission} showConsultation={false} />
                      </div>
                      <span className="font-semibold">
                        <ApproxRange
                          min={hp.price_min_minor}
                          max={hp.price_max_minor}
                          currency={hp.currency}
                          displayMin={hp.display_price_min}
                          displayMax={hp.display_price_max}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t('hospital.noTreatments')}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('hospital.reviews')} />
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
                    <ReviewCard key={r.id} review={r} />
                  ))}
                  {reviews.data.pages > 1 ? <Pagination page={page} pages={reviews.data.pages} onChange={setPage} /> : null}
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title={t('doctor.details')} />
          <CardBody className="space-y-4 text-sm">
            {d.consultation_fee_minor != null ? (
              <KeyValue label={t('doctor.fee')}>
                <span className="font-semibold">
                  <ApproxMoney minor={d.consultation_fee_minor} currency={d.currency} display={d.display_consultation_fee} />
                </span>
              </KeyValue>
            ) : null}
            {d.qualifications.length ? (
              <div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <GraduationCap className="size-4" aria-hidden />
                  {t('doctor.qualifications')}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.qualifications.map((q) => (
                    <Badge key={q}>{q}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {d.sub_specialties.length ? (
              <KeyValue label={t('doctor.subSpecialties')}>{d.sub_specialties.join(', ')}</KeyValue>
            ) : null}
            {d.languages.length ? (
              <p className="flex items-start gap-2 text-muted">
                <Languages className="mt-0.5 size-4 shrink-0" aria-hidden />
                {d.languages.join(', ')}
              </p>
            ) : null}
            {d.registration_verified ? (
              <div className="rounded-xl bg-success-soft p-3 text-success-ink">
                <p className="font-semibold">{t('trust.registrationVerified')}</p>
                <p className="mt-0.5 text-xs">
                  {d.registration_council_name || d.registration_number
                    ? t('doctor.registrationDetail', {
                        council: d.registration_council_name ?? d.registration_council ?? '',
                        number: d.registration_number ?? '',
                      })
                    : t('doctor.registrationHint')}
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
