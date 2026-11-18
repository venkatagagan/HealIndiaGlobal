import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage, travelApi, type Uuid } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { invalidateTravel, useAccommodations } from '../../api/queries';
import { formatMoney, formatNumber } from '../../lib/shared';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui/primitives';

export type RequestKind = 'visa' | 'flight' | 'airport_pickup' | 'airport_drop' | 'accommodation' | 'translator' | 'local_guide';

type TFn = ReturnType<typeof useAppTranslation>['t'];

/** Catalog key of each dialog: `trip.request.<key>.title` / `.description`. */
const TITLE_KEYS: Record<RequestKind, string> = {
  visa: 'visa',
  flight: 'flight',
  airport_pickup: 'airportPickup',
  airport_drop: 'airportDrop',
  accommodation: 'accommodation',
  translator: 'translator',
  local_guide: 'localGuide',
};

function buildSchema(t: TFn) {
  return z
    .object({
      visa_type: z.enum(['e_medical', 'e_medical_attendant']),
      from_location: z.string().max(200),
      to_location: z.string().max(200),
      depart_at: z.string(),
      arrive_at: z.string(),
      flight_number: z.string().max(20),
      passengers: z.string().regex(/^\d{0,2}$/, t('trip.request.errors.number')),
      provider_id: z.string(),
      check_in: z.string(),
      check_out: z.string(),
      guests: z.string().regex(/^\d{0,2}$/, t('trip.request.errors.number')),
      room_type: z.string().max(100),
      starts_at: z.string(),
      ends_at: z.string(),
      notes: z.string().max(2000),
    })
    .refine((v) => !v.check_in || !v.check_out || v.check_in < v.check_out, {
      path: ['check_out'],
      message: t('trip.request.errors.checkOutAfterCheckIn'),
    })
    .refine((v) => !v.starts_at || !v.ends_at || v.starts_at < v.ends_at, {
      path: ['ends_at'],
      message: t('trip.request.errors.endAfterStart'),
    });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

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
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const schema = useMemo(() => buildSchema(t), [t]);
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
            form.setError('from_location', { message: t('trip.request.errors.departureRequired') });
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
            form.setError(kind === 'airport_pickup' ? 'arrive_at' : 'depart_at', {
              message: t('trip.request.errors.dateTimeRequired'),
            });
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
            form.setError('provider_id', { message: t('trip.request.errors.stayRequired') });
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
      toast.success(t('trip.request.sent'));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, t('trip.request.sendFailed')));
    }
  });

  const titleKey = kind ? TITLE_KEYS[kind] : null;
  const reg = form.register;

  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={titleKey ? t(`trip.request.${titleKey}.title`) : ''}
      description={titleKey ? t(`trip.request.${titleKey}.description`) : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('trip.request.cancel')}
          </Button>
          <Button type="submit" form="travel-request-form" loading={isSubmitting}>
            {t('trip.request.send')}
          </Button>
        </>
      }
    >
      <form id="travel-request-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {kind === 'visa' ? (
          <Field label={t('trip.request.fields.visaType')} htmlFor="tr-visa">
            <Select id="tr-visa" {...reg('visa_type')}>
              <option value="e_medical">{t('trip.request.fields.visaPatient')}</option>
              <option value="e_medical_attendant">{t('trip.request.fields.visaCompanion')}</option>
            </Select>
          </Field>
        ) : null}

        {kind === 'flight' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('trip.request.fields.flyingFrom')} htmlFor="tr-from" error={errors.from_location?.message} required>
              <Input id="tr-from" placeholder={t('trip.request.fields.cityOrAirport')} {...reg('from_location')} />
            </Field>
            <Field label={t('trip.request.fields.flyingTo')} htmlFor="tr-to">
              <Input id="tr-to" {...reg('to_location')} />
            </Field>
            <Field label={t('trip.request.fields.preferredDeparture')} htmlFor="tr-depart" required>
              <Input id="tr-depart" type="datetime-local" {...reg('depart_at')} />
            </Field>
            <Field label={t('trip.request.fields.passengers')} htmlFor="tr-pax" error={errors.passengers?.message}>
              <Input id="tr-pax" inputMode="numeric" {...reg('passengers')} />
            </Field>
          </div>
        ) : null}

        {kind === 'airport_pickup' || kind === 'airport_drop' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === 'airport_pickup' ? (
              <Field label={t('trip.request.fields.arrival')} htmlFor="tr-arrive" error={errors.arrive_at?.message} required>
                <Input id="tr-arrive" type="datetime-local" {...reg('arrive_at')} />
              </Field>
            ) : (
              <Field label={t('trip.request.fields.flightDeparture')} htmlFor="tr-depart2" error={errors.depart_at?.message} required>
                <Input id="tr-depart2" type="datetime-local" {...reg('depart_at')} />
              </Field>
            )}
            <Field label={t('trip.request.fields.flightNumber')} htmlFor="tr-flight">
              <Input id="tr-flight" placeholder={t('trip.request.fields.flightNumberPlaceholder')} {...reg('flight_number')} />
            </Field>
            <Field
              label={kind === 'airport_pickup' ? t('trip.request.fields.airport') : t('trip.request.fields.pickupAddress')}
              htmlFor="tr-from2"
            >
              <Input id="tr-from2" {...reg('from_location')} />
            </Field>
            <Field
              label={kind === 'airport_pickup' ? t('trip.request.fields.dropOff') : t('trip.request.fields.airport')}
              htmlFor="tr-to2"
            >
              <Input id="tr-to2" {...reg('to_location')} />
            </Field>
            <Field label={t('trip.request.fields.passengers')} htmlFor="tr-pax2" error={errors.passengers?.message}>
              <Input id="tr-pax2" inputMode="numeric" {...reg('passengers')} />
            </Field>
          </div>
        ) : null}

        {kind === 'accommodation' ? (
          <div className="space-y-4">
            <Field label={t('trip.request.fields.placeToStay')} htmlFor="tr-provider" error={errors.provider_id?.message} required>
              <Select id="tr-provider" {...reg('provider_id')} disabled={accommodations.isPending}>
                <option value="">
                  {accommodations.isPending ? t('trip.request.fields.loadingOptions') : t('trip.request.fields.selectAccommodation')}
                </option>
                {(accommodations.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.distance_km != null ? ` · ${t('trip.request.fields.distanceKm', { km: formatNumber(a.distance_km) })}` : ''}
                    {a.star_rating ? ` · ${formatNumber(a.star_rating)}★` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {chosenProvider ? (
              <p className="text-sm text-slate-500">
                <Trans
                  t={t}
                  i18nKey="trip.request.fields.nightlyRate"
                  values={{ amount: formatMoney(chosenProvider.nightly_rate_minor, chosenProvider.currency, undefined, { trimZeros: true }) }}
                  components={{ 0: <span className="tabular-nums" /> }}
                />
                {chosenProvider.amenities.length ? ` · ${chosenProvider.amenities.slice(0, 4).join(', ')}` : ''}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('trip.request.fields.checkIn')} htmlFor="tr-in" required>
                <Input id="tr-in" type="date" {...reg('check_in')} />
              </Field>
              <Field label={t('trip.request.fields.checkOut')} htmlFor="tr-out" error={errors.check_out?.message} required>
                <Input id="tr-out" type="date" {...reg('check_out')} />
              </Field>
              <Field label={t('trip.request.fields.guests')} htmlFor="tr-guests" error={errors.guests?.message}>
                <Input id="tr-guests" inputMode="numeric" {...reg('guests')} />
              </Field>
              <Field label={t('trip.request.fields.roomType')} htmlFor="tr-room">
                <Input id="tr-room" placeholder={t('trip.request.fields.roomTypePlaceholder')} {...reg('room_type')} />
              </Field>
            </div>
          </div>
        ) : null}

        {kind === 'translator' || kind === 'local_guide' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('trip.request.fields.from')} htmlFor="tr-start">
              <Input id="tr-start" type="datetime-local" {...reg('starts_at')} />
            </Field>
            <Field label={t('trip.request.fields.until')} htmlFor="tr-end" error={errors.ends_at?.message}>
              <Input id="tr-end" type="datetime-local" {...reg('ends_at')} />
            </Field>
          </div>
        ) : null}

        <Field
          label={kind === 'translator' ? t('trip.request.fields.languageNotes') : t('trip.request.fields.notes')}
          htmlFor="tr-notes"
          error={errors.notes?.message}
        >
          <Textarea id="tr-notes" rows={3} maxLength={2000} {...reg('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
