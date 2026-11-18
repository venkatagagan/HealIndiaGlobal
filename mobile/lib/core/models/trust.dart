import 'hospital.dart';
import 'json.dart';
import 'refs.dart';

/// The signed-in patient's own review (`PatientReviewOut`): a [Review] plus moderation state.
class PatientReview {
  const PatientReview({
    required this.review,
    this.bookingId,
    this.moderationReason,
    this.updatedAt,
    this.editable = false,
  });

  factory PatientReview.fromJson(JsonMap j) => PatientReview(
    review: Review.fromJson(j),
    bookingId: jStrOrNull(j, 'booking_id'),
    moderationReason: jStrOrNull(j, 'moderation_reason'),
    updatedAt: jDate(j, 'updated_at'),
    editable: jBool(j, 'editable'),
  );

  final Review review;
  final String? bookingId;

  /// Why staff hid the review (shown to its author only).
  final String? moderationReason;
  final DateTime? updatedAt;

  /// Still pending: the author may edit or delete it.
  final bool editable;

  String get id => review.id;

  /// `pending | published | hidden`
  String get status => review.status ?? 'pending';
}

/// A completed booking of the patient that has no review yet (`GET /me/reviews/eligible`).
class ReviewableBooking {
  const ReviewableBooking({
    required this.bookingId,
    required this.bookingNumber,
    required this.hospital,
    this.doctor,
    this.procedure,
    this.admissionDate,
    this.dischargeDate,
    this.completedAt,
  });

  factory ReviewableBooking.fromJson(JsonMap j) => ReviewableBooking(
    bookingId: jStr(j, 'booking_id'),
    bookingNumber: jStr(j, 'booking_number'),
    hospital: EntityRef.fromJson(jMap(j, 'hospital')),
    doctor: jObj(j, 'doctor', EntityRef.fromJson),
    procedure: jObj(j, 'procedure', EntityRef.fromJson),
    admissionDate: jDay(j, 'admission_date'),
    dischargeDate: jDay(j, 'discharge_date'),
    completedAt: jDate(j, 'completed_at'),
  );

  final String bookingId;
  final String bookingNumber;
  final EntityRef hospital;
  final EntityRef? doctor;
  final EntityRef? procedure;
  final DateTime? admissionDate;
  final DateTime? dischargeDate;
  final DateTime? completedAt;
}
