import 'json.dart';

/// `POST /guest/verify/start` / `confirm`: a one-time code sent to an email or phone.
class GuestVerification {
  const GuestVerification({
    required this.id,
    required this.channel,
    required this.contactMasked,
    this.expiresAt,
    this.verified = false,
    this.validUntil,
  });

  factory GuestVerification.fromJson(JsonMap j) => GuestVerification(
    id: jStr(j, 'verification_id'),
    channel: jStr(j, 'channel', 'email'),
    contactMasked: jStr(j, 'contact_masked'),
    expiresAt: jDate(j, 'expires_at'),
    verified: jBool(j, 'verified'),
    validUntil: jDate(j, 'valid_until'),
  );

  final String id;

  /// `email | phone`
  final String channel;
  final String contactMasked;
  final DateTime? expiresAt;
  final bool verified;

  /// Use [id] in the consultation request before this time.
  final DateTime? validUntil;
}

/// The free 15-minute video call with a medical coordinator (`IntroConsultationOut`).
class IntroConsultation {
  const IntroConsultation({
    required this.id,
    required this.status,
    required this.fullName,
    this.contactChannel,
    this.contactMasked,
    this.preferredFrom,
    this.preferredTo,
    this.timezone,
    this.scheduledAt,
    this.durationMin = 15,
    this.meetingUrl,
    this.coordinatorName,
    this.createdAt,
  });

  factory IntroConsultation.fromJson(JsonMap j) => IntroConsultation(
    id: jStr(j, 'id'),
    status: jStr(j, 'status', 'requested'),
    fullName: jStr(j, 'full_name'),
    contactChannel: jStrOrNull(j, 'contact_channel'),
    contactMasked: jStrOrNull(j, 'contact_masked'),
    preferredFrom: jDate(j, 'preferred_from'),
    preferredTo: jDate(j, 'preferred_to'),
    timezone: jStrOrNull(j, 'timezone'),
    scheduledAt: jDate(j, 'scheduled_at'),
    durationMin: jInt(j, 'duration_min', 15),
    meetingUrl: jStrOrNull(j, 'meeting_url'),
    coordinatorName: jStrOrNull(j, 'coordinator_name'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;

  /// `ConsultationStatus`: `requested | scheduled | completed | cancelled | no_show`
  final String status;
  final String fullName;
  final String? contactChannel;
  final String? contactMasked;
  final DateTime? preferredFrom;
  final DateTime? preferredTo;
  final String? timezone;
  final DateTime? scheduledAt;
  final int durationMin;
  final String? meetingUrl;
  final String? coordinatorName;
  final DateTime? createdAt;

  bool get isScheduled => status == 'scheduled' && scheduledAt != null;
}
