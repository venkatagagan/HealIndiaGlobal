import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';

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
