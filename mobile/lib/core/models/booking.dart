import 'enums.dart';
import 'json.dart';
import 'package.dart';
import 'refs.dart';

/// One cancellation-refund tier of a booking's `refund_policy`: cancelling at least [daysBefore]
/// days before admission refunds [refundPct] % of what was paid.
class RefundTier {
  const RefundTier({required this.daysBefore, required this.refundPct});

  factory RefundTier.fromJson(JsonMap j) =>
      RefundTier(daysBefore: jInt(j, 'days_before'), refundPct: jInt(j, 'refund_pct'));

  final int daysBefore;
  final int refundPct;

  Map<String, dynamic> toJson() => {'days_before': daysBefore, 'refund_pct': refundPct};
}

/// `BookingOut` (PLAN §8.7). Amounts are in the booking (pricing) [currency], usually INR.
class Booking {
  const Booking({
    required this.id,
    required this.bookingNumber,
    required this.caseId,
    required this.status,
    required this.hospital,
    required this.paymentOption,
    required this.currency,
    this.patient,
    this.doctor,
    this.procedure,
    this.package,
    this.quoteId,
    this.admissionDate,
    this.dischargeDate,
    this.durationDays,
    this.installmentMonths,
    this.insuranceClaimRequested = false,
    this.subtotalMinor = 0,
    this.discountMinor = 0,
    this.serviceFeeMinor = 0,
    this.taxMinor = 0,
    this.totalMinor = 0,
    this.depositMinor = 0,
    this.amountPaidMinor = 0,
    this.amountRefundedMinor = 0,
    this.balanceDueMinor = 0,
    this.createdAt,
    this.confirmedAt,
    this.admittedAt,
    this.completedAt,
    this.cancelledAt,
    this.cancelReason,
    this.refundPolicy = const [],
  });

  factory Booking.fromJson(JsonMap j) => Booking(
    id: jStr(j, 'id'),
    bookingNumber: jStr(j, 'booking_number'),
    caseId: jStr(j, 'case_id'),
    status: BookingStatus.fromJson(j['status']),
    patient: jObj(j, 'patient', PersonRef.fromJson),
    hospital: HospitalRef.fromJson(jMap(j, 'hospital')),
    doctor: jObj(j, 'doctor', DoctorRef.fromJson),
    procedure: jObj(j, 'procedure', EntityRef.fromJson),
    package: jObj(j, 'package', TreatmentPackage.fromJson),
    quoteId: jStrOrNull(j, 'quote_id'),
    admissionDate: jDay(j, 'admission_date'),
    dischargeDate: jDay(j, 'discharge_date'),
    durationDays: jIntOrNull(j, 'duration_days'),
    paymentOption: PaymentOption.fromJson(j['payment_option']),
    installmentMonths: jIntOrNull(j, 'installment_months'),
    insuranceClaimRequested: jBool(j, 'insurance_claim_requested'),
    currency: jStr(j, 'currency', 'INR'),
    subtotalMinor: jInt(j, 'subtotal_minor'),
    discountMinor: jInt(j, 'discount_minor'),
    serviceFeeMinor: jInt(j, 'service_fee_minor'),
    taxMinor: jInt(j, 'tax_minor'),
    totalMinor: jInt(j, 'total_minor'),
    depositMinor: jInt(j, 'deposit_minor'),
    amountPaidMinor: jInt(j, 'amount_paid_minor'),
    amountRefundedMinor: jInt(j, 'amount_refunded_minor'),
    balanceDueMinor: jInt(
      j,
      'balance_due_minor',
      jInt(j, 'total_minor') - jInt(j, 'amount_paid_minor') + jInt(j, 'amount_refunded_minor'),
    ),
    createdAt: jDate(j, 'created_at'),
    confirmedAt: jDate(j, 'confirmed_at'),
    admittedAt: jDate(j, 'admitted_at'),
    completedAt: jDate(j, 'completed_at'),
    cancelledAt: jDate(j, 'cancelled_at'),
    cancelReason: jStrOrNull(j, 'cancel_reason'),
    refundPolicy: jList(j, 'refund_policy', RefundTier.fromJson)..sort((a, b) => b.daysBefore.compareTo(a.daysBefore)),
  );

  final String id;
  final String bookingNumber;
  final String caseId;
  final BookingStatus status;

  /// `patient{id, full_name}`
  final PersonRef? patient;
  final HospitalRef hospital;
  final DoctorRef? doctor;
  final EntityRef? procedure;
  final TreatmentPackage? package;
  final String? quoteId;
  final DateTime? admissionDate;
  final DateTime? dischargeDate;
  final int? durationDays;
  final PaymentOption paymentOption;
  final int? installmentMonths;
  final bool insuranceClaimRequested;
  final String currency;
  final int subtotalMinor;
  final int discountMinor;
  final int serviceFeeMinor;
  final int taxMinor;
  final int totalMinor;
  final int depositMinor;
  final int amountPaidMinor;
  final int amountRefundedMinor;
  final int balanceDueMinor;
  final DateTime? createdAt;
  final DateTime? confirmedAt;
  final DateTime? admittedAt;
  final DateTime? completedAt;
  final DateTime? cancelledAt;
  final String? cancelReason;

  /// Cancellation refund tiers snapshotted at confirmation (highest `days_before` first); empty before
  /// confirmation, when the platform's current policy applies.
  final List<RefundTier> refundPolicy;

  bool get isPendingPayment => status == BookingStatus.pendingPayment;
  bool get isCancellable => status == BookingStatus.pendingPayment || status == BookingStatus.confirmed;
  bool get isActive => status != BookingStatus.cancelled && status != BookingStatus.completed;

  Map<String, dynamic> toJson() => {
    'id': id,
    'booking_number': bookingNumber,
    'case_id': caseId,
    'status': status.json,
    'patient': patient?.toJson(),
    'hospital': hospital.toJson(),
    'doctor': doctor?.toJson(),
    'procedure': procedure?.toJson(),
    'package': package?.toJson(),
    'quote_id': quoteId,
    'admission_date': admissionDate == null ? null : toApiDate(admissionDate!),
    'discharge_date': dischargeDate == null ? null : toApiDate(dischargeDate!),
    'duration_days': durationDays,
    'payment_option': paymentOption.json,
    'installment_months': installmentMonths,
    'insurance_claim_requested': insuranceClaimRequested,
    'currency': currency,
    'subtotal_minor': subtotalMinor,
    'discount_minor': discountMinor,
    'service_fee_minor': serviceFeeMinor,
    'tax_minor': taxMinor,
    'total_minor': totalMinor,
    'deposit_minor': depositMinor,
    'amount_paid_minor': amountPaidMinor,
    'amount_refunded_minor': amountRefundedMinor,
    'balance_due_minor': balanceDueMinor,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'confirmed_at': confirmedAt?.toUtc().toIso8601String(),
    'admitted_at': admittedAt?.toUtc().toIso8601String(),
    'completed_at': completedAt?.toUtc().toIso8601String(),
    'cancelled_at': cancelledAt?.toUtc().toIso8601String(),
    'cancel_reason': cancelReason,
    'refund_policy': [for (final t in refundPolicy) t.toJson()],
  };
}

/// `POST /consultations` tele-consult (PLAN §4.7 consultations).
class Consultation {
  const Consultation({
    required this.id,
    required this.caseId,
    required this.status,
    this.doctorId,
    this.doctorName,
    this.patientId,
    this.patientName,
    this.caseNumber,
    this.scheduledAt,
    this.durationMin,
    this.mode = ConsultationMode.video,
    this.meetingUrl,
    this.feeMinor,
    this.currency = 'INR',
    this.notes,
    this.createdAt,
  });

  factory Consultation.fromJson(JsonMap j) => Consultation(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    doctorId: jStrOrNull(jMap(j, 'doctor'), 'id'),
    doctorName: jStrOrNull(jMap(j, 'doctor'), 'full_name'),
    patientId: jStrOrNull(jMap(j, 'patient'), 'id'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    caseNumber: jStrOrNull(j, 'case_number'),
    scheduledAt: jDate(j, 'scheduled_at'),
    durationMin: jIntOrNull(j, 'duration_min'),
    mode: ConsultationMode.fromJson(j['mode']),
    meetingUrl: jStrOrNull(j, 'meeting_url'),
    status: ConsultationStatus.fromJson(j['status']),
    feeMinor: jIntOrNull(j, 'fee_minor'),
    currency: jStr(j, 'currency', 'INR'),
    notes: jStrOrNull(j, 'notes'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String caseId;
  final String? doctorId;
  final String? doctorName;
  final String? patientId;
  final String? patientName;
  final String? caseNumber;
  final DateTime? scheduledAt;
  final int? durationMin;
  final ConsultationMode mode;
  final String? meetingUrl;
  final ConsultationStatus status;
  final int? feeMinor;
  final String currency;
  final String? notes;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'case_number': caseNumber,
    'doctor': doctorId == null && doctorName == null ? null : {'id': doctorId, 'full_name': doctorName},
    'patient': patientId == null && patientName == null ? null : {'id': patientId, 'full_name': patientName},
    'scheduled_at': scheduledAt?.toUtc().toIso8601String(),
    'duration_min': durationMin,
    'mode': mode.json,
    'meeting_url': meetingUrl,
    'status': status.json,
    'fee_minor': feeMinor,
    'currency': currency,
    'notes': notes,
    'created_at': createdAt?.toUtc().toIso8601String(),
  };
}
