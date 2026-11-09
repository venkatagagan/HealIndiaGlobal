import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../agent_portal/agent_routes.dart';
import '../../hospital_portal/hospital_routes.dart';

/// In-app location a notification should open, derived from its `kind` and `data`
/// (`conversation_id`, `screening_id`, `booking_id`, `case_id`...). Null when it has no target.
String? notificationTarget(AppNotification n) {
  String? id(String key) {
    final v = n.data[key];
    return v == null || v.toString().isEmpty ? null : v.toString();
  }

  final kind = n.kind;
  final conversation = id('conversation_id');
  final screening = id('screening_id');
  final booking = id('booking_id');
  final caseId = id('case_id');
  final order = id('order_id');
  final installment = id('installment_id');

  if (kind.startsWith('message.') && conversation != null) return Routes.chat(conversation);
  if (kind.startsWith('screening.') && screening != null) return Routes.matches(screening);
  if ((kind == 'installment.due' || kind == 'installment.overdue' || kind == 'payment.due') && booking != null) {
    return Routes.pay(booking, installmentId: installment);
  }
  if (kind.startsWith('sos.') || kind.startsWith('travel.') || kind.startsWith('visa.')) {
    return caseId != null ? Routes.caseDetail(caseId) : Routes.trips;
  }
  if (caseId != null) return Routes.caseDetail(caseId);
  if (conversation != null) return Routes.chat(conversation);
  if (screening != null) return Routes.matches(screening);
  if (booking != null || order != null) return Routes.trips;
  return null;
}

/// In-app location for a tapped push notification (CG-15). The server sends a portal-style `link`
/// (`/cases/<id>`, `/messages/<id>`, `/bookings/<id>`, ...); known links map to the matching screen of
/// the user's role, anything else opens the notifications list (patients) or the role's home.
String pushLinkRoute(String? link, UserRole role) {
  final uri = Uri.tryParse(link ?? '');
  final seg = uri == null ? const <String>[] : uri.pathSegments.where((s) => s.isNotEmpty).toList();
  String? idAfter(String head) => seg.length >= 2 && seg[0] == head ? seg[1] : null;

  switch (role) {
    case UserRole.agent:
      if (idAfter('cases') case final id?) return AgentRoutes.caseDetail(id);
      if (idAfter('bookings') case final id?) return AgentRoutes.booking(id);
      if (idAfter('screening') case final id?) return AgentRoutes.screening(id);
      return AgentRoutes.home;
    case UserRole.hospital:
      if (idAfter('cases') case final id?) return HospitalRoutes.caseDetail(id);
      if (idAfter('bookings') case final id?) return HospitalRoutes.booking(id);
      return HospitalRoutes.home;
    default:
      if (idAfter('cases') case final id?) return Routes.caseDetail(id);
      if (idAfter('messages') case final id?) return Routes.chat(id);
      if (idAfter('screening') case final id?) return Routes.matches(id);
      if (idAfter('pay') case final id?) return Routes.pay(id);
      if (seg.isNotEmpty && (seg[0] == 'bookings' || seg[0] == 'payments' || seg[0] == 'trips')) return Routes.trips;
      if (seg.length == 1 && seg[0] == 'cases') return Routes.cases;
      if (seg.length == 1 && seg[0] == 'messages') return Routes.messages;
      if (seg.isNotEmpty && seg[0] == 'support') return Routes.support;
      return Routes.notifications;
  }
}

/// Icon and accent for a notification kind.
(IconData, Color) notificationVisual(String kind) {
  final prefix = kind.split('.').first;
  return switch (prefix) {
    'message' => (Icons.chat_bubble_outline_rounded, AppColors.info),
    'payment' || 'refund' || 'installment' => (Icons.payments_outlined, AppColors.primary),
    'booking' => (Icons.event_available_rounded, AppColors.violet),
    'quote' => (Icons.request_quote_outlined, AppColors.violet),
    'case' => (Icons.folder_shared_outlined, AppColors.violet),
    'screening' => (Icons.psychology_alt_outlined, AppColors.cyan),
    'sos' => (Icons.sos_rounded, AppColors.danger),
    'visa' || 'travel' => (Icons.flight_rounded, AppColors.info),
    'appointment' || 'itinerary' => (Icons.alarm_rounded, AppColors.warning),
    _ => (Icons.notifications_none_rounded, AppColors.violet),
  };
}
