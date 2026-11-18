import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/payment_repository.dart';
import '../../../core/utils/dates.dart';

/// The patient's consultations (standard tele-consultations and aftercare follow-ups).
final myConsultationsProvider = FutureProvider.autoDispose<List<Consultation>>(
  (ref) => ref.watch(caseRepositoryProvider).consultations(),
);

final consultationProvider = FutureProvider.autoDispose.family<Consultation, String>(
  (ref, id) => ref.watch(caseRepositoryProvider).consultation(id),
);

/// Whether a consultation's fee still has to be paid.
enum ConsultationFeeState { free, due, pending, paid }

/// Fee state from the patient's `consultation_fee` orders (`GET /payments/orders?purpose=consultation_fee`).
/// The consultation itself does not say whether it was paid.
final consultationFeeStateProvider = FutureProvider.autoDispose.family<ConsultationFeeState, String>((ref, id) async {
  final consultation = await ref.watch(consultationProvider(id).future);
  if ((consultation.feeMinor ?? 0) <= 0) return ConsultationFeeState.free;
  final orders =
      (await ref.watch(paymentRepositoryProvider).orders(purpose: PaymentPurpose.consultationFee, pageSize: 100)).items
          .where((o) => o.consultationId == id)
          .toList();
  if (orders.any((o) => o.isPaid)) return ConsultationFeeState.paid;
  if (orders.any((o) => o.status == OrderStatus.pending)) return ConsultationFeeState.pending;
  return ConsultationFeeState.due;
});

/// Doctors of [hospitalId] who offer video consultations (`GET /doctors?hospital_id=`).
final teleconsultDoctorsProvider = FutureProvider.autoDispose.family<List<DoctorCard>, String>((ref, hospitalId) async {
  final page = await ref.watch(catalogRepositoryProvider).doctors(hospitalId: hospitalId, pageSize: 50);
  return page.items.where((d) => d.teleconsultAvailable).toList();
});

/// The patient's open case at [hospitalId] (a consultation must belong to a case at the doctor's hospital), or
/// null when a new case has to be created.
final openCaseAtHospitalProvider = FutureProvider.autoDispose.family<MedicalCase?, String>((ref, hospitalId) async {
  const closed = {CaseStatus.completed, CaseStatus.cancelled, CaseStatus.declined};
  final cases = await ref.watch(caseRepositoryProvider).list(pageSize: 50);
  return cases.items.where((c) => c.hospital.id == hospitalId && !closed.contains(c.status)).firstOrNull;
});

/// Key of [consultationAvailabilityProvider]: a doctor and the first day of a month.
typedef ConsultationAvailabilityQuery = ({String doctorId, DateTime month});

/// Which days a doctor takes consultations, from `GET /doctors/{id}/availability`. When the doctor publishes
/// no `consultation` slots, every future day can be requested (the hospital confirms the time).
class ConsultationAvailability {
  ConsultationAvailability._(this._free, this.restricted);

  factory ConsultationAvailability.fromSlots(List<AvailabilitySlot> slots) {
    final consult = slots.where((s) => s.slotKind == SlotKind.consultation.json).toList();
    return ConsultationAvailability._({
      for (final s in consult)
        if (s.available > 0) Dates.dateOnly(s.date),
    }, consult.isNotEmpty);
  }

  factory ConsultationAvailability.unrestricted() => ConsultationAvailability._(const {}, false);

  final Set<DateTime> _free;
  final bool restricted;

  /// From tomorrow on: the hospital needs time to confirm and send the link.
  bool isAvailable(DateTime day, {DateTime? now}) {
    final d = Dates.dateOnly(day);
    if (!d.isAfter(Dates.dateOnly(now ?? DateTime.now()))) return false;
    return !restricted || _free.contains(d);
  }
}

final consultationAvailabilityProvider = FutureProvider.autoDispose
    .family<ConsultationAvailability, ConsultationAvailabilityQuery>((ref, q) async {
      final from = DateTime(q.month.year, q.month.month);
      final to = DateTime(q.month.year, q.month.month + 1, 0);
      final slots = await ref.watch(catalogRepositoryProvider).doctorAvailability(q.doctorId, from: from, to: to);
      return ConsultationAvailability.fromSlots(slots);
    });

/// Preferred call times offered to the patient, in India Standard Time (the hospital's clock): 10:00, 12:00,
/// 15:00 and 17:00 IST. Shown converted to the device's time zone.
const consultationSlotHoursIst = [10, 12, 15, 17];

/// [hourIst]:00 IST on [day] (a calendar date) as a UTC instant.
DateTime consultationSlotUtc(DateTime day, int hourIst) =>
    DateTime.utc(day.year, day.month, day.day, hourIst).subtract(const Duration(hours: 5, minutes: 30));
