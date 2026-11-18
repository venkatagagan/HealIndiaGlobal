import { useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ITINERARY_KINDS,
  ITINERARY_KIND_LABELS,
  ITINERARY_STATUSES,
  ITINERARY_STATUS_LABELS,
  bookingsApi,
  errorMessage,
  type ItineraryItemIn,
  type ItineraryItemOut,
} from '@hig/shared/api';
import {
  Button,
  DataTable,
  DateCell,
  FormField,
  Input,
  Modal,
  Select,
  StatusBadgeCell,
  Textarea,
  type DataTableColumn,
} from '@hig/shared/ui';
import { ConfirmDialog } from '../../components/ui';
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useAppTranslation } from '../../i18n';

type TFn = ReturnType<typeof useAppTranslation>['t'];

const makeSchema = (t: TFn) =>
  z
    .object({
      kind: z.enum(ITINERARY_KINDS),
      title: z.string().trim().min(2, t('bookings.itinerary.errTitle')).max(200),
      description: z.string().trim().max(2000),
      starts_at: z.string().min(1, t('bookings.itinerary.errStart')),
      ends_at: z.string(),
      location: z.string().trim().max(300),
      status: z.enum(ITINERARY_STATUSES),
    })
    .refine((v) => !v.ends_at || v.ends_at >= v.starts_at, { path: ['ends_at'], message: t('bookings.itinerary.errEnd') });
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function ItineraryForm({
  bookingId,
  item,
  onClose,
}: {
  bookingId: string;
  item: ItineraryItemOut | null;
  onClose: () => void;
}) {
  const ids = useId();
  const { t } = useAppTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: item?.kind ?? 'appointment',
      title: item?.title ?? '',
      description: item?.description ?? '',
      starts_at: toDateTimeLocal(item?.starts_at),
      ends_at: toDateTimeLocal(item?.ends_at),
      location: item?.location ?? '',
      status: item?.status ?? 'scheduled',
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: ItineraryItemIn = {
        kind: v.kind,
        title: v.title,
        description: v.description || null,
        starts_at: fromDateTimeLocal(v.starts_at) ?? v.starts_at,
        ends_at: fromDateTimeLocal(v.ends_at),
        location: v.location || null,
        status: v.status,
      };
      return item ? bookingsApi.updateItineraryItem(bookingId, item.id, body) : bookingsApi.addItineraryItem(bookingId, body);
    },
    onSuccess: () => {
      toast.success(item ? t('bookings.itinerary.updated') : t('bookings.itinerary.added'));
      void queryClient.invalidateQueries({ queryKey: qk.itinerary(bookingId) });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? t('bookings.itinerary.editTitle') : t('bookings.itinerary.addTitle')}
      description={t('bookings.itinerary.formDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormField label={t('common.type')} htmlFor={`${ids}-kind`} required>
          <Select
            id={`${ids}-kind`}
            options={ITINERARY_KINDS.map((k) => ({ value: k, label: ITINERARY_KIND_LABELS[k] }))}
            {...register('kind')}
          />
        </FormField>
        <FormField label={t('common.status')} htmlFor={`${ids}-status`}>
          <Select
            id={`${ids}-status`}
            options={ITINERARY_STATUSES.map((s) => ({ value: s, label: ITINERARY_STATUS_LABELS[s] }))}
            {...register('status')}
          />
        </FormField>
        <FormField label={t('bookings.itinerary.fieldTitle')} htmlFor={`${ids}-title`} required error={errors.title?.message} className="sm:col-span-2">
          <Input id={`${ids}-title`} placeholder={t('bookings.itinerary.titlePlaceholder')} {...register('title')} aria-invalid={!!errors.title} />
        </FormField>
        <FormField label={t('bookings.itinerary.starts')} htmlFor={`${ids}-start`} required error={errors.starts_at?.message}>
          <Input id={`${ids}-start`} type="datetime-local" {...register('starts_at')} aria-invalid={!!errors.starts_at} />
        </FormField>
        <FormField label={t('bookings.itinerary.ends')} htmlFor={`${ids}-end`} error={errors.ends_at?.message}>
          <Input id={`${ids}-end`} type="datetime-local" {...register('ends_at')} aria-invalid={!!errors.ends_at} />
        </FormField>
        <FormField label={t('bookings.itinerary.location')} htmlFor={`${ids}-loc`} className="sm:col-span-2">
          <Input id={`${ids}-loc`} placeholder={t('bookings.itinerary.locationPlaceholder')} {...register('location')} />
        </FormField>
        <FormField label={t('bookings.itinerary.details')} htmlFor={`${ids}-desc`} className="sm:col-span-2">
          <Textarea id={`${ids}-desc`} placeholder={t('bookings.itinerary.detailsPlaceholder')} {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}

/** Booking itinerary (GET/POST /bookings/{id}/itinerary, PATCH/DELETE /bookings/{id}/itinerary/{item_id}). */
export function ItineraryCard({ bookingId, editable }: { bookingId: string; editable: boolean }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: qk.itinerary(bookingId), queryFn: () => bookingsApi.itinerary(bookingId) });
  const [editing, setEditing] = useState<ItineraryItemOut | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ItineraryItemOut | null>(null);

  const remove = useMutation({
    mutationFn: (item: ItineraryItemOut) => bookingsApi.deleteItineraryItem(bookingId, item.id),
    onSuccess: () => {
      toast.success(t('bookings.itinerary.removed'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: qk.itinerary(bookingId) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns: DataTableColumn<ItineraryItemOut>[] = [
    {
      key: 'when',
      header: t('bookings.itinerary.colWhen'),
      sortable: true,
      mobile: 'secondary',
      sortValue: (item) => item.starts_at,
      cell: (item) => (
        <DateCell value={item.starts_at} display="datetime" secondary={item.ends_at ? t('bookings.itinerary.until', { date: formatDateTime(item.ends_at) }) : undefined} />
      ),
    },
    {
      key: 'item',
      header: t('bookings.itinerary.colItem'),
      mobile: 'primary',
      className: 'max-w-80',
      sortable: true,
      sortValue: (item) => item.title.toLowerCase(),
      cell: (item) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{item.title}</span>
          {item.location && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {item.location}
            </span>
          )}
          {item.description && <span className="mt-0.5 block truncate text-xs text-muted">{item.description}</span>}
        </span>
      ),
    },
    {
      key: 'kind',
      header: t('common.type'),
      sortable: true,
      sortValue: (item) => ITINERARY_KIND_LABELS[item.kind] ?? item.kind,
      cell: (item) => ITINERARY_KIND_LABELS[item.kind] ?? item.kind,
    },
    {
      key: 'status',
      header: t('common.status'),
      sortable: true,
      mobile: 'badge',
      cell: (item) => <StatusBadgeCell status={item.status} kind="itinerary" />,
    },
    ...(editable
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">{t('common.actions')}</span>,
            title: t('common.actions'),
            align: 'end' as const,
            cell: (item: ItineraryItemOut) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={t('bookings.itinerary.editItem', { title: item.title })} onClick={() => setEditing(item)}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t('bookings.itinerary.deleteItem', { title: item.title })} onClick={() => setDeleting(item)}>
                  <Trash2 className="size-4 text-danger-ink" aria-hidden />
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        caption={t('bookings.itinerary.title')}
        columns={columns}
        rows={items.data}
        loading={items.isPending}
        error={items.error}
        onRetry={() => void items.refetch()}
        defaultSort={{ key: 'when', direction: 'asc' }}
        responsive="cards"
        emptyTitle={t('bookings.itinerary.emptyTitle')}
        emptyDescription={t('bookings.itinerary.emptyDescription')}
        header={
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg">{t('bookings.itinerary.title')}</h2>
              <p className="text-sm text-muted">{t('bookings.itinerary.subtitle')}</p>
            </div>
            {editable && (
              <Button size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
                {t('bookings.itinerary.addItem')}
              </Button>
            )}
          </div>
        }
      />
      {editing && <ItineraryForm bookingId={bookingId} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        tone="danger"
        title={t('bookings.itinerary.deleteTitle')}
        description={deleting ? t('bookings.itinerary.deleteDescription', { title: deleting.title }) : undefined}
        confirmLabel={t('common.delete')}
      />
    </>
  );
}
