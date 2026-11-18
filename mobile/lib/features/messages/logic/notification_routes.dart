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
  final discharge = id('discharge_summary_id');

  // Discharge summary ready / daily medicine reminder: open the summary.
  if ((kind.startsWith('discharge_summary.') || kind == 'aftercare.medication_reminder') && discharge != null) {
    return Routes.dischargeSummary(discharge);
  }
  if (kind.startsWith('message.') && conversation != null) return Routes.chat(conversation);
  // Referral programme (friend signed up / rewarded, welcome credit).
  if (kind.startsWith('referral.')) return Routes.referrals;
  // Agent CRM follow-up reminder (`data.link` = /leads?follow_up=due or /leads/<id>).
  if (kind.startsWith('crm.')) return agentLeadsLinkRoute(id('link')) ?? AgentRoutes.leadsFor(followUp: 'due');
  // Treatment completed: invite the patient to rate the hospital.
  if (kind == 'booking.completed' && booking != null) return Routes.writeReview(booking);
  if (kind.startsWith('aftercare.')) return Routes.aftercare;
  if (kind.startsWith('intro_consultation.')) return Routes.freeConsultationStatus;
  if (kind.startsWith('review.')) return Routes.myReviews;
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
String pushLinkRoute(String? link, UserRole role, {String? kind}) {
  // Patients: a completed treatment opens the review form for that booking.
  if (role == UserRole.patient && kind == 'booking.completed') {
    final seg = Uri.tryParse(link ?? '')?.pathSegments.where((s) => s.isNotEmpty).toList() ?? const [];
    if (seg.length >= 2 && seg[0] == 'bookings') return Routes.writeReview(seg[1]);
  }
  final uri = Uri.tryParse(link ?? '');
  final seg = uri == null ? const <String>[] : uri.pathSegments.where((s) => s.isNotEmpty).toList();
  String? idAfter(String head) => seg.length >= 2 && seg[0] == head ? seg[1] : null;

  switch (role) {
    case UserRole.agent:
      if (idAfter('discharge-summaries') case final id?) return AgentRoutes.dischargeSummary(id);
      if (agentLeadsLinkRoute(link) case final route?) return route;
      if (idAfter('cases') case final id?) return AgentRoutes.caseDetail(id);
      if (idAfter('bookings') case final id?) return AgentRoutes.booking(id);
      if (idAfter('screening') case final id?) return AgentRoutes.screening(id);
      return AgentRoutes.home;
    case UserRole.hospital:
      if (idAfter('discharge-summaries') case final id?) return HospitalRoutes.dischargeSummary(id);
      if (idAfter('cases') case final id?) return HospitalRoutes.caseDetail(id);
      if (idAfter('bookings') case final id?) return HospitalRoutes.booking(id);
      return HospitalRoutes.home;
    default:
      if (idAfter('discharge-summaries') case final id?) return Routes.dischargeSummary(id);
      if (idAfter('cases') case final id?) return Routes.caseDetail(id);
      if (idAfter('messages') case final id?) return Routes.chat(id);
      if (idAfter('screening') case final id?) return Routes.matches(id);
      if (idAfter('pay') case final id?) return Routes.pay(id);
      if (seg.isNotEmpty && (seg[0] == 'bookings' || seg[0] == 'payments' || seg[0] == 'trips')) return Routes.trips;
      if (seg.length == 1 && seg[0] == 'cases') return Routes.cases;
      if (seg.length == 1 && seg[0] == 'messages') return Routes.messages;
      if (seg.isNotEmpty && seg[0] == 'support') return Routes.support;
      if (seg.isNotEmpty && seg[0] == 'referrals') return Routes.referrals;
      return Routes.notifications;
  }
}

/// Agent lead screen for a server link `/leads`, `/leads?follow_up=due` or `/leads/<id>`; null for other links.
String? agentLeadsLinkRoute(String? link) {
  final uri = Uri.tryParse(link ?? '');
  if (uri == null) return null;
  final seg = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (seg.isEmpty || seg[0] != 'leads') return null;
  if (seg.length >= 2) return AgentRoutes.lead(seg[1]);
  return AgentRoutes.leadsFor(followUp: uri.queryParameters['follow_up']);
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
    'discharge_summary' => (Icons.summarize_outlined, AppColors.violet),
    'screening' => (Icons.psychology_alt_outlined, AppColors.cyan),
    'sos' => (Icons.sos_rounded, AppColors.danger),
    'visa' || 'travel' => (Icons.flight_rounded, AppColors.info),
    'appointment' || 'itinerary' => (Icons.alarm_rounded, AppColors.warning),
    'referral' => (Icons.card_giftcard_rounded, AppColors.primary),
    'crm' => (Icons.contact_phone_outlined, AppColors.warning),
    _ => (Icons.notifications_none_rounded, AppColors.violet),
  };
}
