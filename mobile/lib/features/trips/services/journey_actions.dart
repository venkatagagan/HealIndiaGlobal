import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/messaging_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/widgets/widgets.dart';

/// Digits and a leading `+` only (for `tel:` / WhatsApp links).
String dialable(String number) {
  final trimmed = number.trim();
  final digits = trimmed.replaceAll(RegExp(r'[^0-9]'), '');
  return trimmed.startsWith('+') ? '+$digits' : digits;
}

/// Opens the dialer for [number]. Shows a snackbar when the device cannot place calls.
Future<void> callNumber(BuildContext context, String number) async {
  final uri = Uri(scheme: 'tel', path: dialable(number));
  final ok = await launchUrl(uri).catchError((_) => false);
  if (!ok && context.mounted) showInfoSnack(context, 'Call $number from your phone.');
}

/// Opens a WhatsApp chat with [number].
Future<void> openWhatsApp(BuildContext context, String number) async {
  final digits = dialable(number).replaceAll('+', '');
  final uri = Uri.parse('https://wa.me/$digits');
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) showInfoSnack(context, 'WhatsApp $number from your phone.');
}

/// Finds the case conversation (or a support conversation when [caseId] is null) and opens it,
/// creating one when none exists yet.
Future<void> openCoordinatorChat(
  BuildContext context,
  WidgetRef ref, {
  String? caseId,
  String subject = 'My care coordinator',
}) async {
  try {
    final repo = ref.read(messagingRepositoryProvider);
    final conversations = await repo.conversations();
    Conversation? match;
    if (caseId != null) {
      match =
          conversations.where((c) => c.caseId == caseId && c.kind == ConversationKind.caseThread).firstOrNull ??
          conversations.where((c) => c.caseId == caseId).firstOrNull;
    } else {
      match = conversations.where((c) => c.kind == ConversationKind.support).firstOrNull;
    }
    match ??= await repo.createConversation(caseId: caseId, subject: subject);
    ref.invalidate(conversationsProvider);
    if (context.mounted) await context.push(Routes.chat(match.id));
  } catch (e) {
    if (context.mounted) showErrorSnack(context, e);
  }
}
