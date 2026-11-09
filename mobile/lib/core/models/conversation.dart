import 'enums.dart';
import 'json.dart';
import 'refs.dart';

/// `MessageOut` (PLAN §8.9). Named `ChatMessage` to avoid clashing with other `Message` types.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.sender,
    required this.body,
    this.attachmentDocumentIds = const [],
    this.createdAt,
  });

  factory ChatMessage.fromJson(JsonMap j) => ChatMessage(
    id: jStr(j, 'id'),
    conversationId: jStr(j, 'conversation_id'),
    sender: PersonRef.fromJson(jMap(j, 'sender')),
    body: jStr(j, 'body'),
    attachmentDocumentIds: jStrList(j, 'attachment_document_ids'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String conversationId;

  /// `sender{id, full_name, role}`
  final PersonRef sender;
  final String body;
  final List<String> attachmentDocumentIds;
  final DateTime? createdAt;

  bool isMine(String? userId) => userId != null && sender.id == userId;

  Map<String, dynamic> toJson() => {
    'id': id,
    'conversation_id': conversationId,
    'sender': sender.toJson(),
    'body': body,
    'attachment_document_ids': attachmentDocumentIds,
    'created_at': createdAt?.toUtc().toIso8601String(),
  };
}

/// `participants[]` entry: `{user_id, full_name, role}`.
class ConversationParticipant {
  const ConversationParticipant({required this.userId, required this.fullName, this.role});

  factory ConversationParticipant.fromJson(JsonMap j) => ConversationParticipant(
    userId: jStr(j, 'user_id', jStr(j, 'id')),
    fullName: jStr(j, 'full_name'),
    role: jStrOrNull(j, 'role'),
  );

  final String userId;
  final String fullName;
  final String? role;

  Map<String, dynamic> toJson() => {'user_id': userId, 'full_name': fullName, 'role': role};
}

/// `ConversationOut` (PLAN §8.9).
class Conversation {
  const Conversation({
    required this.id,
    required this.kind,
    this.caseId,
    this.subject,
    this.participants = const [],
    this.lastMessage,
    this.unreadCount = 0,
    this.lastMessageAt,
  });

  factory Conversation.fromJson(JsonMap j) => Conversation(
    id: jStr(j, 'id'),
    kind: ConversationKind.fromJson(j['kind']),
    caseId: jStrOrNull(j, 'case_id'),
    subject: jStrOrNull(j, 'subject'),
    participants: jList(j, 'participants', ConversationParticipant.fromJson),
    lastMessage: jObj(j, 'last_message', ChatMessage.fromJson),
    unreadCount: jInt(j, 'unread_count'),
    lastMessageAt: jDate(j, 'last_message_at'),
  );

  final String id;
  final ConversationKind kind;
  final String? caseId;
  final String? subject;
  final List<ConversationParticipant> participants;
  final ChatMessage? lastMessage;
  final int unreadCount;
  final DateTime? lastMessageAt;

  /// Subject, or the names of the other participants.
  String titleFor(String? myUserId) {
    final s = subject;
    if (s != null && s.isNotEmpty) return s;
    final others = participants.where((p) => p.userId != myUserId).map((p) => p.fullName).toList();
    return others.isEmpty ? 'Conversation' : others.join(', ');
  }

  Conversation copyWith({ChatMessage? lastMessage, int? unreadCount, DateTime? lastMessageAt}) => Conversation(
    id: id,
    kind: kind,
    caseId: caseId,
    subject: subject,
    participants: participants,
    lastMessage: lastMessage ?? this.lastMessage,
    unreadCount: unreadCount ?? this.unreadCount,
    lastMessageAt: lastMessageAt ?? this.lastMessageAt,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind.json,
    'case_id': caseId,
    'subject': subject,
    'participants': participants.map((p) => p.toJson()).toList(),
    'last_message': lastMessage?.toJson(),
    'unread_count': unreadCount,
    'last_message_at': lastMessageAt?.toUtc().toIso8601String(),
  };
}
