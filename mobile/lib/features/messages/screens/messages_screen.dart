import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/messaging_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/journey_actions.dart';
import '../widgets/notification_bell.dart';

/// Conversations list with unread badges; refreshes live on `message.created`.
///
/// Route: `/messages` (tab) · Owner: fl-journey.
class MessagesScreen extends ConsumerWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final async = ref.watch(conversationsProvider);
    final myId = ref.watch(currentUserProvider)?.id;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.messagesTitle),
        centerTitle: true,
        automaticallyImplyLeading: false,
        actions: const [NotificationBell()],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('new-support-chat'),
        backgroundColor: AppColors.violet,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.support_agent_rounded),
        label: Text(l10n.messagesContactSupport),
        onPressed: () => openCoordinatorChat(context, ref, subject: 'Support request'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(conversationsProvider.future),
        child: AsyncValueView<List<Conversation>>(
          value: async,
          onRetry: () => ref.invalidate(conversationsProvider),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 60),
                  EmptyView(
                    icon: Icons.forum_outlined,
                    title: l10n.messagesEmptyTitle,
                    message: l10n.messagesEmptyMessage,
                  ),
                ],
              );
            }
            final sorted = [...list]
              ..sort((a, b) {
                final at = a.lastMessageAt ?? a.lastMessage?.createdAt ?? DateTime(0);
                final bt = b.lastMessageAt ?? b.lastMessage?.createdAt ?? DateTime(0);
                return bt.compareTo(at);
              });
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
              itemCount: sorted.length,
              separatorBuilder: (_, _) => const SizedBox(height: 6),
              itemBuilder: (_, i) => _ConversationTile(conversation: sorted[i], myId: myId),
            );
          },
        ),
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.myId});

  final Conversation conversation;
  final String? myId;

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final unread = c.unreadCount > 0;
    final last = c.lastMessage;
    final (icon, color) = switch (c.kind) {
      ConversationKind.caseThread => (Icons.local_hospital_rounded, AppColors.violet),
      ConversationKind.support => (Icons.support_agent_rounded, AppColors.primary),
      ConversationKind.direct => (Icons.person_rounded, AppColors.info),
    };
    final l10n = context.l10n;
    final String preview;
    if (last == null) {
      preview = l10n.messagesNoMessagesYet;
    } else {
      final text = last.body.isEmpty && last.attachmentDocumentIds.isNotEmpty ? l10n.messagesAttachment : last.body;
      preview = last.isMine(myId)
          ? l10n.messagesPreviewMine(text)
          : (c.participants.length > 2
                ? l10n.messagesPreviewSender(last.sender.fullName.split(' ').first, text)
                : text);
    }
    return AppCard(
      key: ValueKey('conversation-${c.id}'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      onTap: () => context.push(Routes.chat(c.id)),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: color.withValues(alpha: 0.15),
            child: Icon(icon, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.titleFor(myId),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall?.copyWith(fontWeight: unread ? FontWeight.w800 : FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  preview,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall?.copyWith(
                    color: unread ? context.colors.onSurface : context.palette.textSecondary,
                    fontWeight: unread ? FontWeight.w600 : null,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                Dates.chatStamp(c.lastMessageAt ?? last?.createdAt),
                style: context.text.labelSmall?.copyWith(
                  color: unread ? AppColors.primary : context.palette.textSecondary,
                ),
              ),
              const SizedBox(height: 6),
              if (unread)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  constraints: const BoxConstraints(minWidth: 20),
                  decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    c.unreadCount > 99 ? '99+' : '${c.unreadCount}',
                    textAlign: TextAlign.center,
                    style: context.text.labelSmall?.copyWith(
                      color: const Color(0xFF052E16),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                )
              else
                const SizedBox(height: 18),
            ],
          ),
        ],
      ),
    );
  }
}
