import { useId, useState } from 'react';
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

const schema = z
  .object({
    kind: z.enum(ITINERARY_KINDS),
    title: z.string().trim().min(2, 'Enter a title').max(200),
    description: z.string().trim().max(2000),
    starts_at: z.string().min(1, 'Pick a start time'),
    ends_at: z.string(),
    location: z.string().trim().max(300),
    status: z.enum(ITINERARY_STATUSES),
  })
  .refine((v) => !v.ends_at || v.ends_at >= v.starts_at, { path: ['ends_at'], message: 'Must be after the start' });
type FormValues = z.infer<typeof schema>;

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
      toast.success(item ? 'Itinerary updated' : 'Added to itinerary');
      void queryClient.invalidateQueries({ queryKey: qk.itinerary(bookingId) });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit itinerary item' : 'Add itinerary item'}
      description="Visible to the patient, their agent and the care coordinator."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormField label="Type" htmlFor={`${ids}-kind`} required>
          <Select
            id={`${ids}-kind`}
            options={ITINERARY_KINDS.map((k) => ({ value: k, label: ITINERARY_KIND_LABELS[k] }))}
            {...register('kind')}
          />
        </FormField>
        <FormField label="Status" htmlFor={`${ids}-status`}>
          <Select
            id={`${ids}-status`}
            options={ITINERARY_STATUSES.map((s) => ({ value: s, label: ITINERARY_STATUS_LABELS[s] }))}
            {...register('status')}
          />
        </FormField>
        <FormField label="Title" htmlFor={`${ids}-title`} required error={errors.title?.message} className="sm:col-span-2">
          <Input id={`${ids}-title`} placeholder="e.g. Pre-operative assessment" {...register('title')} aria-invalid={!!errors.title} />
        </FormField>
        <FormField label="Starts" htmlFor={`${ids}-start`} required error={errors.starts_at?.message}>
          <Input id={`${ids}-start`} type="datetime-local" {...register('starts_at')} aria-invalid={!!errors.starts_at} />
        </FormField>
        <FormField label="Ends" htmlFor={`${ids}-end`} error={errors.ends_at?.message}>
          <Input id={`${ids}-end`} type="datetime-local" {...register('ends_at')} aria-invalid={!!errors.ends_at} />
        </FormField>
        <FormField label="Location" htmlFor={`${ids}-loc`} className="sm:col-span-2">
          <Input id={`${ids}-loc`} placeholder="e.g. Block B, 3rd floor, Cardiology OPD" {...register('location')} />
        </FormField>
        <FormField label="Details for the patient" htmlFor={`${ids}-desc`} className="sm:col-span-2">
          <Textarea id={`${ids}-desc`} placeholder="Fasting from midnight, bring passport…" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}

/** Booking itinerary (GET/POST /bookings/{id}/itinerary, PATCH/DELETE /bookings/{id}/itinerary/{item_id}). */
export function ItineraryCard({ bookingId, editable }: { bookingId: string; editable: boolean }) {
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: qk.itinerary(bookingId), queryFn: () => bookingsApi.itinerary(bookingId) });
  const [editing, setEditing] = useState<ItineraryItemOut | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ItineraryItemOut | null>(null);

  const remove = useMutation({
    mutationFn: (item: ItineraryItemOut) => bookingsApi.deleteItineraryItem(bookingId, item.id),
    onSuccess: () => {
      toast.success('Removed from itinerary');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: qk.itinerary(bookingId) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns: DataTableColumn<ItineraryItemOut>[] = [
    {
      key: 'when',
      header: 'When',
      sortable: true,
      mobile: 'secondary',
      sortValue: (item) => item.starts_at,
      cell: (item) => (
        <DateCell value={item.starts_at} display="datetime" secondary={item.ends_at ? `until ${formatDateTime(item.ends_at)}` : undefined} />
      ),
    },
    {
      key: 'item',
      header: 'Item',
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
      header: 'Type',
      sortable: true,
      sortValue: (item) => ITINERARY_KIND_LABELS[item.kind] ?? item.kind,
      cell: (item) => ITINERARY_KIND_LABELS[item.kind] ?? item.kind,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'badge',
      cell: (item) => <StatusBadgeCell status={item.status} kind="itinerary" />,
    },
    ...(editable
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            title: 'Actions',
            align: 'end' as const,
            cell: (item: ItineraryItemOut) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.title}`} onClick={() => setEditing(item)}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.title}`} onClick={() => setDeleting(item)}>
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
        caption="Itinerary"
        columns={columns}
        rows={items.data}
        loading={items.isPending}
        error={items.error}
        onRetry={() => void items.refetch()}
        defaultSort={{ key: 'when', direction: 'asc' }}
        responsive="cards"
        emptyTitle="No itinerary yet"
        emptyDescription="Add the admission, surgery and follow-up schedule."
        header={
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg">Itinerary</h2>
              <p className="text-sm text-muted">Appointments, admission, surgery and follow-ups for the patient&apos;s stay.</p>
            </div>
            {editable && (
              <Button size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
                Add item
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
        title="Delete itinerary item?"
        description={deleting ? `"${deleting.title}" will be removed from the patient's schedule.` : undefined}
        confirmLabel="Delete"
      />
    </>
  );
}
