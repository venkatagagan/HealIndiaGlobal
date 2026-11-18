/**
 * Review form: new review for a completed booking (/app/reviews/new?booking=<id>, from GET /me/reviews/eligible)
 * or edit a pending review (/app/reviews/<id>/edit).
 */
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { errorMessage, type PatientReviewOut, type ReviewableBookingOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useCreateReview, useEligibleReviews, useMyReviews, useUpdateReview } from '../../api/phase1';
import { BackLink } from '../../components/common';
import { paths } from '../../lib/paths';
import { cn, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../ui/primitives';

function StarPicker({ value, onChange, error }: { value: number; onChange: (v: number) => void; error?: string }) {
  const { t } = useAppTranslation();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg">
        {t('reviews.form.rating')}
        <span className="ms-0.5 text-danger">*</span>
      </legend>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label={t('reviews.form.rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t('reviews.stars', { count: n })}
            onClick={() => onChange(n)}
            className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star className={cn('size-8', n <= value ? 'fill-amber-400 text-amber-400' : 'text-border-strong')} aria-hidden />
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-danger-ink" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function ReviewForm({ booking, review }: { booking?: ReviewableBookingOut; review?: PatientReviewOut }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const create = useCreateReview();
  const update = useUpdateReview();
  const doctor = booking?.doctor ?? (review?.doctor_id ? { id: review.doctor_id, name: review.doctor_name ?? '' } : null);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [aboutDoctor, setAboutDoctor] = useState(review ? !!review.doctor_id : !!booking?.doctor);
  const [title, setTitle] = useState(review?.title ?? '');
  const [body, setBody] = useState(review?.body ?? '');
  const [ratingError, setRatingError] = useState<string | undefined>();
  const busy = create.isPending || update.isPending;

  async function submit() {
    if (rating < 1) {
      setRatingError(t('reviews.form.ratingRequired'));
      return;
    }
    setRatingError(undefined);
    const doctor_id = aboutDoctor && doctor ? doctor.id : null;
    try {
      if (review) {
        await update.mutateAsync({ id: review.id, body: { rating, title: title.trim() || null, body: body.trim() || null, doctor_id } });
        toast.success(t('reviews.form.updated'));
      } else if (booking) {
        await create.mutateAsync({
          hospital_id: booking.hospital.id,
          booking_id: booking.booking_id,
          doctor_id,
          rating,
          title: title.trim() || null,
          body: body.trim() || null,
        });
        toast.success(t('reviews.form.thanks'));
      }
      navigate(paths.reviews);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const hospitalName = booking?.hospital.name ?? review?.hospital_name ?? '';
  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <p className="text-lg font-semibold text-fg">{hospitalName}</p>
          {booking?.procedure ? <p className="text-sm text-muted">{booking.procedure.name}</p> : null}
        </div>
        <StarPicker value={rating} onChange={setRating} error={ratingError} />
        {doctor ? (
          <Checkbox
            checked={aboutDoctor}
            onChange={(e) => setAboutDoctor(e.target.checked)}
            label={t('reviews.form.aboutDoctor', { doctor: doctor.name })}
          />
        ) : null}
        <Field label={t('reviews.form.titleLabel')} htmlFor="rv-title">
          <Input id="rv-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('reviews.form.bodyLabel')} htmlFor="rv-body" hint={t('reviews.form.bodyHint')}>
          <Textarea id="rv-body" rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Alert tone="blue">{t('reviews.form.moderationNote')}</Alert>
        <div className="flex justify-end gap-2">
          <ButtonLink to={paths.reviews} variant="outline">
            {t('reviews.form.cancel')}
          </ButtonLink>
          <Button loading={busy} onClick={() => void submit()}>
            {t('reviews.form.submit')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ReviewFormPage() {
  const { t } = useAppTranslation();
  const { reviewId } = useParams();
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const editing = !!reviewId;
  useDocumentTitle(editing ? t('reviews.form.editTitle') : t('reviews.form.title'));
  const eligible = useEligibleReviews(!editing);
  const mine = useMyReviews(editing);

  const query = editing ? mine : eligible;
  const booking = !editing ? eligible.data?.find((b) => b.booking_id === bookingId) ?? (bookingId ? undefined : eligible.data?.[0]) : undefined;
  const review = editing ? mine.data?.find((r) => r.id === reviewId) : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        back={<BackLink to={paths.reviews}>{t('reviews.my.title')}</BackLink>}
        title={editing ? t('reviews.form.editTitle') : t('reviews.form.title')}
      />
      {query.isPending ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (editing && (!review || !review.editable)) || (!editing && !booking) ? (
        <EmptyState
          title={t('reviews.form.notEligibleTitle')}
          description={t('reviews.form.notEligibleMessage')}
          action={<ButtonLink to={paths.reviews}>{t('reviews.my.title')}</ButtonLink>}
        />
      ) : (
        <ReviewForm booking={booking} review={review} />
      )}
    </div>
  );
}
