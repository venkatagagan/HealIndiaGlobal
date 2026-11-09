import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/services/biometric_service.dart';
import '../logic/admission_availability.dart';
import '../services/razorpay_launcher.dart';

/// Key of [admissionAvailabilityProvider]: hospital, optional doctor, and the first day of the month shown.
typedef AvailabilityQuery = ({String hospitalId, String? doctorId, DateTime month});

/// Admission availability for one calendar month.
///
/// With a doctor the doctor's own slots are used; when the doctor publishes no admission slots the
/// hospital-wide availability is used instead (the server reserves a doctor row first, then a
/// hospital-wide row).
final admissionAvailabilityProvider = FutureProvider.autoDispose.family<AdmissionAvailability, AvailabilityQuery>((
  ref,
  q,
) async {
  final repo = ref.watch(catalogRepositoryProvider);
  final from = DateTime(q.month.year, q.month.month, 1);
  final to = DateTime(q.month.year, q.month.month + 1, 0);
  if (q.doctorId != null) {
    final doctorSlots = await repo.hospitalAvailability(q.hospitalId, from: from, to: to, doctorId: q.doctorId);
    if (doctorSlots.any((s) => s.slotKind == 'admission')) return AdmissionAvailability.fromSlots(doctorSlots);
  }
  final slots = await repo.hospitalAvailability(q.hospitalId, from: from, to: to);
  return AdmissionAvailability.fromSlots(slots);
});

/// "Pay with Face ID" / "Pay with fingerprint" / "Pay".
final payButtonLabelProvider = FutureProvider.autoDispose<String>(
  (ref) => ref.watch(biometricServiceProvider).payLabel(),
);

/// Razorpay native checkout (Android / iOS). Overridden in tests.
final razorpayLauncherProvider = Provider<RazorpayLauncher>((ref) => NativeRazorpayLauncher());

/// Packages the patient may book for a case at [hospital]: those of the case's procedure, or of
/// every procedure the hospital offers when the case has none.
List<({TreatmentPackage package, String procedureName, HospitalProcedure hospitalProcedure})> packagesForCase(
  HospitalDetail hospital,
  MedicalCase medicalCase,
) {
  final procId = medicalCase.procedure?.id;
  final procedures = procId == null
      ? hospital.procedures
      : hospital.procedures.where((p) => p.procedure.id == procId).toList();
  final out = [
    for (final hp in procedures)
      for (final pkg in hp.packages) (package: pkg, procedureName: hp.procedure.name, hospitalProcedure: hp),
  ];
  int tierOrder(PackageTier t) => PackageTier.values.indexOf(t);
  out.sort((a, b) {
    final byTier = tierOrder(a.package.tier).compareTo(tierOrder(b.package.tier));
    return byTier != 0 ? byTier : a.package.priceMinor.compareTo(b.package.priceMinor);
  });
  return out;
}
