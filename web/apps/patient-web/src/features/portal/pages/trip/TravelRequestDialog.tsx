import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, travelApi, type Uuid } from '@hig/shared/api';
import { invalidateTravel, useAccommodations } from '../../api/queries';
import { Money } from '../../components/common';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui/primitives';

export type RequestKind = 'visa' | 'flight' | 'airport_pickup' | 'airport_drop' | 'accommodation' | 'translator' | 'local_guide';

const TITLES: Record<RequestKind, { title: string; description: string }> = {
  visa: { title: 'Request e-Medical visa support', description: 'We arrange the hospital invitation letter and guide your application.' },
  flight: { title: 'Request flight booking', description: 'Our travel desk sends you flight options and prices.' },
  airport_pickup: { title: 'Request airport pickup', description: 'A driver meets you at arrivals and takes you to your hotel or hospital.' },
  airport_drop: { title: 'Request airport drop', description: 'Transport from your hotel or hospital to the airport.' },
  accommodation: { title: 'Request accommodation', description: 'Hotels and guest houses close to your hospital.' },
  translator: { title: 'Request a translator', description: 'A medical interpreter for consultations and admission.' },
  local_guide: { title: 'Request a local guide', description: 'Help with shopping, sightseeing and getting around.' },
};

const schema = z
  .object({
    visa_type: z.enum(['e_medical', 'e_medical_attendant']),
    from_location: z.string().max(200),
    to_location: z.string().max(200),
    depart_at: z.string(),
    arrive_at: z.string(),
    flight_number: z.string().max(20),
    passengers: z.string().regex(/^\d{0,2}$/, 'Enter a number'),
    provider_id: z.string(),
    check_in: z.string(),
    check_out: z.string(),
    guests: z.string().regex(/^\d{0,2}$/, 'Enter a number'),
    room_type: z.string().max(100),
    starts_at: z.string(),
    ends_at: z.string(),
    notes: z.string().max(2000),
  })
  .refine((v) => !v.check_in || !v.check_out || v.check_in < v.check_out, {
    path: ['check_out'],
    message: 'Check-out must be after check-in',
  })
  .refine((v) => !v.starts_at || !v.ends_at || v.starts_at < v.ends_at, { path: ['ends_at'], message: 'Must be after the start' });

type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  visa_type: 'e_medical',
  from_location: '',
  to_location: '',
  depart_at: '',
  arrive_at: '',
  flight_number: '',
  passengers: '1',
  provider_id: '',
  check_in: '',
  check_out: '',
  guests: '1',
  room_type: '',
  starts_at: '',
  ends_at: '',
  notes: '',
};

/** datetime-local value -> ISO-8601 UTC */
function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function TravelRequestDialog({
  kind,
  onClose,
  caseId,
  hospitalId,
  hospitalCity,
  admissionDate,
}: {
  kind: RequestKind | null;
  onClose: () => void;
  caseId: Uuid;
  hospitalId: Uuid;
  hospitalCity: string;
  admissionDate: string | null;
}) {
  const qc = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors, isSubmitting } = form.formState;
  const accommodations = useAccommodations({ hospital_id: hospitalId }, kind === 'accommodation');
  const providerId = useWatch({ control: form.control, name: 'provider_id' });
  const chosenProvider = accommodations.data?.find((a) => a.id === providerId) ?? null;

  useEffect(() => {
    if (!kind) return;
    form.reset({
      ...EMPTY,
      to_location: kind === 'flight' ? hospitalCity : '',
      from_location: kind === 'airport_drop' ? hospitalCity : '',
      check_in: kind === 'accommodation' && admissionDate ? admissionDate : '',
    });
  }, [kind, hospitalCity, admissionDate, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!kind) return;
    const notes = v.notes.trim() || null;
    try {
      switch (kind) {
        case 'visa':
          await travelApi.createVisaRequest({ case_id: caseId, visa_type: v.visa_type, ...(notes ? { notes } : {}) });
          break;
        case 'flight':
          if (!v.from_location.trim() || !v.depart_at) {
            form.setError('from_location', { message: 'Departure city and date are required' });
            return;
          }
          await travelApi.createTravelBooking({
            case_id: caseId,
            kind: 'flight',
            from_location: v.from_location.trim(),
            to_location: v.to_location.trim() || hospitalCity,
            depart_at: toIso(v.depart_at),
            passengers: Number(v.passengers) || 1,
            notes,
          });
          break;
        case 'airport_pickup':
        case 'airport_drop':
          if (!(kind === 'airport_pickup' ? v.arrive_at : v.depart_at)) {
            form.setError(kind === 'airport_pickup' ? 'arrive_at' : 'depart_at', { message: 'Date and time are required' });
            return;
          }
          await travelApi.createTravelBooking({
            case_id: caseId,
            kind,
            from_location: v.from_location.trim() || null,
            to_location: v.to_location.trim() || null,
            ...(kind === 'airport_pickup' ? { arrive_at: toIso(v.arrive_at) } : { depart_at: toIso(v.depart_at) }),
            flight_number: v.flight_number.trim() || null,
            passengers: Number(v.passengers) || 1,
            notes,
          });
          break;
        case 'accommodation':
          if (!v.provider_id || !v.check_in || !v.check_out) {
            form.setError('provider_id', { message: 'Choose a place to stay and your dates' });
            return;
          }
          await travelApi.createAccommodationBooking({
            case_id: caseId,
            provider_id: v.provider_id,
            check_in: v.check_in,
            check_out: v.check_out,
            guests: Number(v.guests) || 1,
            room_type: v.room_type.trim() || null,
            notes,
          });
          break;
        case 'translator':
        case 'local_guide':
          await travelApi.createServiceBooking({
            case_id: caseId,
            kind,
            starts_at: toIso(v.starts_at),
            ends_at: toIso(v.ends_at),
            notes,
          });
          break;
      }
      invalidateTravel(qc);
      toast.success('Request sent. Your coordinator will confirm the details.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'The request could not be sent.'));
    }
  });

  const meta = kind ? TITLES[kind] : null;
  const reg = form.register;

  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={meta?.title ?? ''}
      description={meta?.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="travel-request-form" loading={isSubmitting}>
            Send request
          </Button>
        </>
      }
    >
      <form id="travel-request-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {kind === 'visa' ? (
          <Field label="Visa type" htmlFor="tr-visa">
            <Select id="tr-visa" {...reg('visa_type')}>
              <option value="e_medical">e-Medical visa (patient)</option>
              <option value="e_medical_attendant">e-Medical Attendant visa (companion)</option>
            </Select>
          </Field>
        ) : null}

        {kind === 'flight' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Flying from" htmlFor="tr-from" error={errors.from_location?.message} required>
              <Input id="tr-from" placeholder="City or airport" {...reg('from_location')} />
            </Field>
            <Field label="Flying to" htmlFor="tr-to">
              <Input id="tr-to" {...reg('to_location')} />
            </Field>
            <Field label="Preferred departure" htmlFor="tr-depart" required>
              <Input id="tr-depart" type="datetime-local" {...reg('depart_at')} />
            </Field>
            <Field label="Passengers" htmlFor="tr-pax" error={errors.passengers?.message}>
              <Input id="tr-pax" inputMode="numeric" {...reg('passengers')} />
            </Field>
          </div>
        ) : null}

        {kind === 'airport_pickup' || kind === 'airport_drop' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === 'airport_pickup' ? (
              <Field label="Arrival date & time" htmlFor="tr-arrive" error={errors.arrive_at?.message} required>
                <Input id="tr-arrive" type="datetime-local" {...reg('arrive_at')} />
              </Field>
            ) : (
              <Field label="Flight departure date & time" htmlFor="tr-depart2" error={errors.depart_at?.message} required>
                <Input id="tr-depart2" type="datetime-local" {...reg('depart_at')} />
              </Field>
            )}
            <Field label="Flight number" htmlFor="tr-flight">
              <Input id="tr-flight" placeholder="e.g. AI 102" {...reg('flight_number')} />
            </Field>
            <Field label={kind === 'airport_pickup' ? 'Airport' : 'Pickup address'} htmlFor="tr-from2">
              <Input id="tr-from2" {...reg('from_location')} />
            </Field>
            <Field label={kind === 'airport_pickup' ? 'Drop-off (hotel / hospital)' : 'Airport'} htmlFor="tr-to2">
              <Input id="tr-to2" {...reg('to_location')} />
            </Field>
            <Field label="Passengers" htmlFor="tr-pax2" error={errors.passengers?.message}>
              <Input id="tr-pax2" inputMode="numeric" {...reg('passengers')} />
            </Field>
          </div>
        ) : null}

        {kind === 'accommodation' ? (
          <div className="space-y-4">
            <Field label="Place to stay" htmlFor="tr-provider" error={errors.provider_id?.message} required>
              <Select id="tr-provider" {...reg('provider_id')} disabled={accommodations.isPending}>
                <option value="">{accommodations.isPending ? 'Loading options...' : 'Select accommodation'}</option>
                {(accommodations.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.distance_km != null ? ` · ${a.distance_km} km` : ''}
                    {a.star_rating ? ` · ${a.star_rating}★` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {(() => {
              const chosen = chosenProvider;
              return chosen ? (
                <p className="text-sm text-slate-500">
                  From <Money minor={chosen.nightly_rate_minor} currency={chosen.currency} trim /> per night
                  {chosen.amenities.length ? ` · ${chosen.amenities.slice(0, 4).join(', ')}` : ''}
                </p>
              ) : null;
            })()}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Check-in" htmlFor="tr-in" required>
                <Input id="tr-in" type="date" {...reg('check_in')} />
              </Field>
              <Field label="Check-out" htmlFor="tr-out" error={errors.check_out?.message} required>
                <Input id="tr-out" type="date" {...reg('check_out')} />
              </Field>
              <Field label="Guests" htmlFor="tr-guests" error={errors.guests?.message}>
                <Input id="tr-guests" inputMode="numeric" {...reg('guests')} />
              </Field>
              <Field label="Room type" htmlFor="tr-room">
                <Input id="tr-room" placeholder="e.g. twin room" {...reg('room_type')} />
              </Field>
            </div>
          </div>
        ) : null}

        {kind === 'translator' || kind === 'local_guide' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="tr-start">
              <Input id="tr-start" type="datetime-local" {...reg('starts_at')} />
            </Field>
            <Field label="Until" htmlFor="tr-end" error={errors.ends_at?.message}>
              <Input id="tr-end" type="datetime-local" {...reg('ends_at')} />
            </Field>
          </div>
        ) : null}

        <Field
          label={kind === 'translator' ? 'Language needed & notes' : 'Notes'}
          htmlFor="tr-notes"
          error={errors.notes?.message}
        >
          <Textarea id="tr-notes" rows={3} maxLength={2000} {...reg('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
