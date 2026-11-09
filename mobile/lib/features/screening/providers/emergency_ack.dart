import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/emergency_guidance.dart';

/// Preference key holding the ids of screenings whose emergency guidance was acknowledged.
const kEmergencyAckPrefKey = 'hig.emergency_ack';

/// Emergency gating (INTEGRATION_BACKLOG #13): a screening with `urgency = emergency` blocks the
/// booking flow until the patient has seen the emergency guidance and explicitly acknowledged it.
///
/// State = acknowledged screening ids (persisted on the device).
final emergencyAckProvider = NotifierProvider<EmergencyAckController, Set<String>>(EmergencyAckController.new);

class EmergencyAckController extends Notifier<Set<String>> {
  @override
  Set<String> build() => {...?ref.watch(sharedPreferencesProvider).getStringList(kEmergencyAckPrefKey)};

  bool isAcknowledged(String screeningId) => state.contains(screeningId);

  Future<void> acknowledge(String screeningId) async {
    if (state.contains(screeningId)) return;
    final next = {...state, screeningId};
    state = next;
    await ref.read(sharedPreferencesProvider).setStringList(kEmergencyAckPrefKey, next.toList());
  }
}

/// Urgency of [s] (screening level, falling back to the AI result).
Urgency? screeningUrgency(Screening s) => s.urgency ?? s.aiResult?.urgency;

/// True when [s] is an emergency the patient has not acknowledged yet.
bool needsEmergencyAck(Screening s, Set<String> acknowledged) =>
    screeningUrgency(s) == Urgency.emergency && !acknowledged.contains(s.id);

/// Shows the full-screen emergency guidance for [s]; returns true when the patient acknowledged it.
Future<bool> showEmergencyGuidance(
  BuildContext context,
  Screening s, {
  String acknowledgeLabel = 'I understand the risk - continue',
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final ok = await Navigator.of(context, rootNavigator: true).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (ctx) => Scaffold(
        body: EmergencyGuidanceView(
          redFlags: s.redFlags.isNotEmpty ? s.redFlags : (s.aiResult?.redFlags ?? const []),
          homeCountry: s.homeCountry,
          advice: s.aiResult?.travelAdvice,
          acknowledgeLabel: acknowledgeLabel,
          onViewResults: () => Navigator.of(ctx).pop(true),
          onClose: () => Navigator.of(ctx).pop(false),
        ),
      ),
    ),
  );
  if (ok == true) {
    await container.read(emergencyAckProvider.notifier).acknowledge(s.id);
    return true;
  }
  return false;
}

/// Outcome of [ensureEmergencyAcknowledged].
enum EmergencyGate {
  /// Not an emergency: continue.
  clear,

  /// Emergency, and the patient acknowledged the guidance: continue, and acknowledge the case
  /// server-side (`POST /cases/{id}/emergency-ack`) once it exists.
  acknowledged,

  /// Not acknowledged (or the screening could not be loaded): stop.
  blocked;

  bool get allowed => this != blocked;
}

/// Gate for every "continue to booking" action of a screening.
///
/// Loads the screening; when its urgency is `emergency` and the guidance has not been acknowledged
/// on this device, shows the guidance first. Fails closed ([EmergencyGate.blocked] with an error
/// message) when the screening cannot be loaded.
Future<EmergencyGate> ensureEmergencyAcknowledged(BuildContext context, {required String screeningId}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final Screening s;
  try {
    s = await container.read(screeningRepositoryProvider).get(screeningId);
  } catch (e) {
    if (context.mounted) showErrorSnack(context, e);
    return EmergencyGate.blocked;
  }
  if (screeningUrgency(s) != Urgency.emergency) return EmergencyGate.clear;
  if (container.read(emergencyAckProvider).contains(s.id)) return EmergencyGate.acknowledged;
  if (!context.mounted) return EmergencyGate.blocked;
  return await showEmergencyGuidance(context, s) ? EmergencyGate.acknowledged : EmergencyGate.blocked;
}

// ----------------------------------------------------------------------------------------------
// Case-level acknowledgement (backend contract): `CaseOut.urgency`, `emergency_ack_required`,
// `emergency_acknowledged_at`; `POST /cases/{id}/emergency-ack {"acknowledged": true}`. Quote
// accept and `POST /bookings` answer 409 `emergency_ack_required` until acknowledged.
// ----------------------------------------------------------------------------------------------

/// Error code returned by quote-accept / `POST /bookings` while the case's emergency is unacknowledged.
const kEmergencyAckRequiredCode = 'emergency_ack_required';

/// Error code returned to guests by `POST /cases`, quote accept and `POST /bookings` (403).
const kGuestUpgradeRequiredCode = 'guest_upgrade_required';

/// Emergency fields of `CaseOut`.
class CaseEmergencyStatus {
  const CaseEmergencyStatus({this.urgency, this.ackRequired = false, this.acknowledgedAt});

  factory CaseEmergencyStatus.fromJson(JsonMap j) => CaseEmergencyStatus(
    urgency: Urgency.fromJsonOrNull(j['urgency']),
    ackRequired: jBool(j, 'emergency_ack_required'),
    acknowledgedAt: jDate(j, 'emergency_acknowledged_at'),
  );

  final Urgency? urgency;
  final bool ackRequired;
  final DateTime? acknowledgedAt;

  bool get needsAck => ackRequired && acknowledgedAt == null;
}

/// Case emergency endpoints (kept here so booking screens can reuse them without core changes).
class CaseEmergencyApi {
  CaseEmergencyApi(this._api);

  final ApiClient _api;

  /// `GET /cases/{id}` → emergency fields.
  Future<CaseEmergencyStatus> status(String caseId) async =>
      CaseEmergencyStatus.fromJson(asJsonMap(await _api.get('/cases/$caseId')));

  /// `POST /cases/{id}/emergency-ack {"acknowledged": true}`.
  Future<void> acknowledge(String caseId) async {
    await _api.post('/cases/$caseId/emergency-ack', data: {'acknowledged': true});
  }
}

final caseEmergencyApiProvider = Provider<CaseEmergencyApi>((ref) => CaseEmergencyApi(ref.watch(apiClientProvider)));

/// True when [error] is the 409 `emergency_ack_required` answer.
bool isEmergencyAckRequired(Object error) => error is ApiException && error.code == kEmergencyAckRequiredCode;

/// True when [error] is the 403 `guest_upgrade_required` answer.
bool isGuestUpgradeRequired(Object error) => error is ApiException && error.code == kGuestUpgradeRequiredCode;

/// Shows the emergency guidance for case [caseId] and, when the patient explicitly acknowledges it,
/// calls `POST /cases/{caseId}/emergency-ack`. Pass [screening] for its red flags / home country;
/// set [showGuidance] to false when the patient has just acknowledged the screening's guidance.
///
/// Returns true when the case is acknowledged (the caller may retry the blocked request).
Future<bool> acknowledgeCaseEmergency(
  BuildContext context, {
  required String caseId,
  Screening? screening,
  bool showGuidance = true,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  if (showGuidance) {
    final s = screening ?? Screening(id: 'case-$caseId', status: ScreeningStatus.completed, urgency: Urgency.emergency);
    final ok = await showEmergencyGuidance(context, s);
    if (!ok) return false;
  }
  try {
    await container.read(caseEmergencyApiProvider).acknowledge(caseId);
    return true;
  } catch (e) {
    if (context.mounted) showErrorSnack(context, e);
    return false;
  }
}

/// For booking / quote screens: if [error] is 409 `emergency_ack_required`, runs
/// [acknowledgeCaseEmergency] and returns true when the caller should retry; false otherwise
/// (the caller then shows the error as usual).
///
/// ```dart
/// try { await createBooking(); } catch (e) {
///   if (await handleEmergencyAckRequired(context, e, caseId: caseId)) return createBooking();
///   showErrorSnack(context, e);
/// }
/// ```
Future<bool> handleEmergencyAckRequired(BuildContext context, Object error, {required String caseId}) async {
  if (!isEmergencyAckRequired(error)) return false;
  return acknowledgeCaseEmergency(context, caseId: caseId);
}
