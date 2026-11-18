/** My reviews: completed treatments waiting for a review, and written reviews with their moderation status. */
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { errorMessage, type PatientReviewOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useDeleteReview, useEligibleReviews, useMyReviews } from '../../api/phase1';
import { Stars } from '../../components/phase1';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { formatDate, useDocumentTitle } from '../../lib/shared';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonList,
  type Tone,
} from '../../ui/primitives';

const STATUS_TONE: Record<string, Tone> = { pending: 'amber', published: 'green', hidden: 'neutral' };

export function MyReviewsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('reviews.my.title'));
  const me = useMe();
  const enabled = !!me.data && !me.data.is_guest;
  const eligible = useEligibleReviews(enabled);
  const mine = useMyReviews(enabled);
  const remove = useDeleteReview();
  const [deleting, setDeleting] = useState<PatientReviewOut | null>(null);

  if (me.data?.is_guest) {
    return (
      <div>
        <PageHeader title={t('reviews.my.title')} description={t('reviews.my.subtitle')} />
        <EmptyState title={t('reviews.my.empty')} description={t('reviews.form.notEligibleMessage')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('reviews.my.title')} description={t('reviews.my.subtitle')} />

      {eligible.data?.length ? (
        <Card>
          <CardHeader title={t('reviews.my.toWrite')} />
          <CardBody>
            <ul className="divide-y divide-border">
              {eligible.data.map((b) => (
                <li key={b.booking_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{b.hospital.name}</p>
                    <p className="text-sm text-muted">
                      {[b.procedure?.name, b.discharge_date ? formatDate(b.discharge_date) : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ButtonLink to={paths.writeReview(b.booking_id)} size="sm" icon={<Star className="size-4" aria-hidden />}>
                    {t('reviews.my.rate')}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t('reviews.my.written')} />
        <CardBody>
          {mine.isPending ? (
            <SkeletonList rows={2} />
          ) : mine.isError ? (
            <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
          ) : mine.data.length === 0 ? (
            <EmptyState title={t('reviews.my.empty')} description={t('reviews.form.notEligibleMessage')} />
          ) : (
            <ul className="space-y-3">
              {mine.data.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{r.hospital_name ?? t('reviews.my.hospital')}</p>
                      <p className="text-xs text-muted">
                        {[r.treatment_name, r.doctor_name, formatDate(r.created_at)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[r.status ?? 'pending'] ?? 'neutral'}>
                      {t(`reviews.status.${r.status ?? 'pending'}`)}
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <Stars value={r.rating} />
                  </div>
                  {r.title ? <p className="mt-2 font-medium text-fg">{r.title}</p> : null}
                  {r.body ? <p className="mt-1 whitespace-pre-line text-sm text-fg/80">{r.body}</p> : null}
                  {r.status === 'hidden' && r.moderation_reason ? (
                    <p className="mt-2 text-sm text-danger-ink">{t('reviews.my.hiddenReason', { reason: r.moderation_reason })}</p>
                  ) : null}
                  {r.editable ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ButtonLink to={paths.editReview(r.id)} size="sm" variant="outline" icon={<Pencil className="size-4" aria-hidden />}>
                        {t('reviews.my.edit')}
                      </ButtonLink>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDeleting(r)}>
                        {t('reviews.my.delete')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-muted">
        <Link to={paths.browse({ tab: 'hospitals' })} className="underline">
          {t('reviews.my.browse')}
        </Link>
      </p>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title={t('reviews.my.deleteTitle')}
        confirmLabel={t('reviews.my.delete')}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('reviews.my.deleted'));
              setDeleting(null);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {t('reviews.my.deleteBody')}
      </ConfirmDialog>
    </div>
  );
}
