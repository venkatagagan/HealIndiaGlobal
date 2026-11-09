import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../network/api_client.dart';
import '../network/realtime_service.dart';

/// Conversations, messages and notifications (PLAN §8.9). Live updates arrive through
/// [realtimeEventsProvider] (`message.created`, `notification.created`).
class MessagingRepository {
  MessagingRepository(this._api);

  final ApiClient _api;

  /// `GET /conversations`
  Future<List<Conversation>> conversations() async =>
      parseList(await _api.get('/conversations'), Conversation.fromJson);

  /// `POST /conversations {case_id?, subject?, participant_user_ids?}` (e.g. a support chat).
  Future<Conversation> createConversation({String? caseId, String? subject, List<String>? participantUserIds}) async =>
      Conversation.fromJson(
        asJsonMap(
          await _api.post(
            '/conversations',
            data: compactJson({
              'case_id': caseId,
              'subject': subject,
              'participant_user_ids': participantUserIds,
            }, dropEmptyStrings: true),
          ),
        ),
      );

  /// `GET /conversations/{id}/messages?before=&limit=` — newest page; pass the oldest message's
  /// `created_at` (ISO) or id as [before] to page back.
  Future<List<ChatMessage>> messages(String conversationId, {String? before, int limit = 50}) async => parseList(
    await _api.get('/conversations/$conversationId/messages', query: {'before': before, 'limit': limit}),
    ChatMessage.fromJson,
  );

  /// `POST /conversations/{id}/messages {body, attachment_document_ids?}`
  Future<ChatMessage> sendMessage(String conversationId, String body, {List<String>? attachmentDocumentIds}) async =>
      ChatMessage.fromJson(
        asJsonMap(
          await _api.post(
            '/conversations/$conversationId/messages',
            data: compactJson({'body': body, 'attachment_document_ids': attachmentDocumentIds}),
          ),
        ),
      );

  /// `POST /conversations/{id}/read`
  Future<void> markConversationRead(String conversationId) => _api.post('/conversations/$conversationId/read');

  /// `GET /notifications?unread=`
  Future<List<AppNotification>> notifications({bool? unreadOnly}) async =>
      parseList(await _api.get('/notifications', query: {'unread': unreadOnly}), AppNotification.fromJson);

  /// `GET /notifications/unread-count` (accepts `{"count": n}`, `{"unread": n}`,
  /// `{"unread_count": n}` or a bare number).
  Future<int> unreadNotificationCount() async {
    final data = await _api.get('/notifications/unread-count');
    if (data is num) return data.toInt();
    final m = asJsonMap(data);
    return jInt(m, 'count', jInt(m, 'unread_count', jInt(m, 'unread')));
  }

  /// `POST /notifications/{id}/read`
  Future<void> markNotificationRead(String id) => _api.post('/notifications/$id/read');

  /// `POST /notifications/read-all`
  Future<void> markAllNotificationsRead() => _api.post('/notifications/read-all');
}

final messagingRepositoryProvider = Provider<MessagingRepository>(
  (ref) => MessagingRepository(ref.watch(apiClientProvider)),
);

/// My conversations; refreshes automatically on `message.created`.
final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>((ref) {
  ref.listen(realtimeEventsProvider, (_, next) {
    final e = next.value;
    if (e != null && e.type == RealtimeEvents.messageCreated) ref.invalidateSelf();
  });
  return ref.watch(messagingRepositoryProvider).conversations();
});

/// Latest messages of a conversation (oldest first as returned by the API).
final conversationMessagesProvider = FutureProvider.autoDispose.family<List<ChatMessage>, String>(
  (ref, conversationId) => ref.watch(messagingRepositoryProvider).messages(conversationId),
);

/// Notifications list; refreshes on `notification.created`.
final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) {
  ref.listen(realtimeEventsProvider, (_, next) {
    final e = next.value;
    if (e != null && e.type == RealtimeEvents.notificationCreated) ref.invalidateSelf();
  });
  return ref.watch(messagingRepositoryProvider).notifications();
});

/// Unread notification count (0 without a session); refreshes on realtime events.
final unreadNotificationsCountProvider = FutureProvider<int>((ref) async {
  final auth = ref.watch(authStateProvider);
  if (!auth.hasSession) return 0;
  ref.listen(realtimeEventsProvider, (_, next) {
    final e = next.value;
    if (e != null && (e.type == RealtimeEvents.notificationCreated || e.type == RealtimeEvents.messageCreated)) {
      ref.invalidateSelf();
    }
  });
  try {
    return await ref.watch(messagingRepositoryProvider).unreadNotificationCount();
  } on ApiException {
    return 0;
  }
});
