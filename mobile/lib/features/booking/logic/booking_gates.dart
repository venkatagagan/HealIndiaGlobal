import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../screening/providers/emergency_ack.dart';

/// Server-side gates on quote accept and `POST /bookings` (be-cases contract):
/// * 409 `emergency_ack_required` -> show the emergency guidance and `POST /cases/{id}/emergency-ack`
///   (reusable flow from fl-screening); returns [BookingGate.retry] when acknowledged.
/// * 403 `guest_upgrade_required` -> opens the account-upgrade flow (register with `from`); returns
///   [BookingGate.handled].
/// Anything else returns [BookingGate.none] and the caller shows the error as usual.
enum BookingGate { none, retry, handled }

Future<BookingGate> handleBookingGate(BuildContext context, Object error, {required String caseId}) async {
  if (isGuestUpgradeRequired(error)) {
    final here = GoRouterState.of(context).uri.toString();
    await context.push(Routes.registerFrom(here));
    return BookingGate.handled;
  }
  if (isEmergencyAckRequired(error)) {
    final acknowledged = await handleEmergencyAckRequired(context, error, caseId: caseId);
    return acknowledged ? BookingGate.retry : BookingGate.handled;
  }
  return BookingGate.none;
}
