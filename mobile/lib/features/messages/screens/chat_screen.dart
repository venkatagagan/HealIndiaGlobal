import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/network/realtime_service.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/repositories/messaging_repository.dart';
import '../../../core/repositories/report_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/report_sheet.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';

/// Metadata of a message attachment (file name, type) for chips in chat bubbles.
final attachmentDocumentProvider = FutureProvider.autoDispose.family<AppDocument, String>(
  (ref, id) => ref.watch(documentRepositoryProvider).get(id),
);

/// Chat thread with live updates (`message.created` over the realtime socket), paging back,
/// and document attachments. Long-press a message from someone else to copy or report it (CG-16).
///
/// Route: `/messages/:id` · Owner: fl-journey.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversationId});

  final String conversationId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  static const _pageSize = 50;

  final _input = TextEditingController();
  final _scroll = ScrollController();

  /// Oldest first.
  List<ChatMessage> _messages = const [];
  bool _loading = true;
  Object? _error;
  bool _hasMore = false;
  bool _loadingMore = false;
  bool _sending = false;
  bool _uploading = false;
  final List<AppDocument> _attachments = [];
  Timer? _readDebounce;

  @override
  void initState() {
    super.initState();
    _input.addListener(() => setState(() {}));
    unawaited(_load());
  }

  @override
  void dispose() {
    _readDebounce?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  MessagingRepository get _repo => ref.read(messagingRepositoryProvider);

  static List<ChatMessage> _sorted(Iterable<ChatMessage> list) =>
      [...list]..sort((a, b) => (a.createdAt ?? DateTime(0)).compareTo(b.createdAt ?? DateTime(0)));

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _repo.messages(widget.conversationId, limit: _pageSize);
      if (!mounted) return;
      setState(() {
        _messages = _sorted(list);
        _hasMore = list.length >= _pageSize;
        _loading = false;
      });
      _scheduleMarkRead();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadEarlier() async {
    if (_loadingMore || _messages.isEmpty) return;
    setState(() => _loadingMore = true);
    try {
      final oldest = _messages.first;
      final before = oldest.createdAt?.toUtc().toIso8601String() ?? oldest.id;
      final older = await _repo.messages(widget.conversationId, before: before, limit: _pageSize);
      if (!mounted) return;
      final known = _messages.map((m) => m.id).toSet();
      setState(() {
        _messages = _sorted([...older.where((m) => !known.contains(m.id)), ..._messages]);
        _hasMore = older.length >= _pageSize;
      });
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _scheduleMarkRead() {
    _readDebounce?.cancel();
    _readDebounce = Timer(const Duration(milliseconds: 600), () async {
      try {
        await _repo.markConversationRead(widget.conversationId);
        if (mounted) {
          ref.invalidate(conversationsProvider);
          ref.invalidate(unreadNotificationsCountProvider);
        }
      } catch (_) {
        // Read receipts are best effort.
      }
    });
  }

  void _onRealtime(RealtimeEvent e) {
    if (e.type != RealtimeEvents.messageCreated) return;
    final data = e.data['message'] is Map ? asJsonMap(e.data['message']) : e.data;
    if (data['conversation_id']?.toString() != widget.conversationId) return;
    final msg = ChatMessage.fromJson(data);
    if (msg.id.isEmpty) {
      unawaited(_load());
      return;
    }
    if (_messages.any((m) => m.id == msg.id)) return;
    setState(() => _messages = _sorted([..._messages, msg]));
    _scheduleMarkRead();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        unawaited(_scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut));
      }
    });
  }

  Future<void> _attach() async {
    try {
      final file = await pickDocumentFile();
      if (file == null) return;
      setState(() => _uploading = true);
      final conv = _conversation();
      final doc = await ref
          .read(documentRepositoryProvider)
          .upload(fileName: file.name, kind: DocumentKind.other, bytes: file.bytes, caseId: conv?.caseId);
      if (mounted) setState(() => _attachments.add(doc));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if ((text.isEmpty && _attachments.isEmpty) || _sending) return;
    final ids = _attachments.map((d) => d.id).toList();
    final l10n = context.l10n;
    final body = text.isNotEmpty
        ? text
        : (_attachments.length == 1
              ? l10n.chatSharedFile(_attachments.first.fileName)
              : l10n.chatSharedFiles(_attachments.length));
    setState(() => _sending = true);
    try {
      final msg = await _repo.sendMessage(widget.conversationId, body, attachmentDocumentIds: ids.isEmpty ? null : ids);
      if (!mounted) return;
      _input.clear();
      setState(() {
        _attachments.clear();
        if (!_messages.any((m) => m.id == msg.id)) _messages = _sorted([..._messages, msg]);
      });
      ref.invalidate(conversationsProvider);
      _scrollToBottom();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Conversation? _conversation() =>
      ref.read(conversationsProvider).value?.where((c) => c.id == widget.conversationId).firstOrNull;

  @override
  Widget build(BuildContext context) {
    ref.listen(realtimeEventsProvider, (_, next) {
      final e = next.value;
      if (e != null) _onRealtime(e);
    });
    final myId = ref.watch(currentUserProvider)?.id;
    final conv = ref.watch(conversationsProvider).value?.where((c) => c.id == widget.conversationId).firstOrNull;
    final others = conv?.participants.where((p) => p.userId != myId).toList() ?? const [];
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(conv?.titleFor(myId) ?? l10n.chatTitleFallback, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (others.isNotEmpty)
              Text(
                others
                    .map(
                      (p) => p.role == null
                          ? p.fullName
                          : l10n.chatParticipantWithRole(p.fullName, _roleLabel(l10n, p.role!)),
                    )
                    .join(', '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(child: _messageList(myId, (conv?.participants.length ?? 0) > 2)),
          _composer(),
        ],
      ),
    );
  }

  static String _roleLabel(AppLocalizations l, String role) => switch (role) {
    'hospital' => l.chatRoleHospital,
    'support' || 'admin' || 'super_admin' => l.chatRoleCareTeam,
    'agent' => l.chatRoleAgent,
    'patient' => l.chatRolePatient,
    _ => role,
  };

  Widget _messageList(String? myId, bool group) {
    final l10n = context.l10n;
    if (_loading) return const LoadingView();
    if (_error != null) return ErrorView(error: _error, onRetry: _load);
    if (_messages.isEmpty) {
      return EmptyView(
        icon: Icons.chat_bubble_outline_rounded,
        title: l10n.chatEmptyTitle,
        message: l10n.chatEmptyMessage,
      );
    }
    final reversed = _messages.reversed.toList();
    return ListView.builder(
      controller: _scroll,
      reverse: true,
      padding: const EdgeInsets.all(12),
      itemCount: reversed.length + (_hasMore ? 1 : 0),
      itemBuilder: (_, i) {
        if (i == reversed.length) {
          return Center(
            child: TextButton(
              onPressed: _loadingMore ? null : _loadEarlier,
              child: Text(_loadingMore ? l10n.chatLoadingMore : l10n.chatLoadEarlier),
            ),
          );
        }
        final m = reversed[i];
        final older = i + 1 < reversed.length ? reversed[i + 1] : null;
        final showDay = older == null || !Dates.isSameDay(older.createdAt, m.createdAt);
        final mine = m.isMine(myId);
        final showSender = group && !mine && (older == null || older.sender.id != m.sender.id || showDay);
        return Column(
          children: [
            if (showDay && m.createdAt != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text(
                  Dates.isSameDay(m.createdAt, DateTime.now()) ? l10n.chatToday : Dates.weekday(m.createdAt),
                  style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                ),
              ),
            _Bubble(message: m, mine: mine, showSender: showSender),
          ],
        );
      },
    );
  }

  Widget _composer() {
    final canSend = (_input.text.trim().isNotEmpty || _attachments.isNotEmpty) && !_sending && !_uploading;
    final l10n = context.l10n;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: context.colors.surfaceContainer,
          border: Border(top: BorderSide(color: context.palette.border)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_attachments.isNotEmpty || _uploading)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final d in _attachments)
                      InputChip(
                        avatar: Icon(documentKindIcon(d.kind), size: 16),
                        label: Text(d.fileName, overflow: TextOverflow.ellipsis),
                        onDeleted: () => setState(() => _attachments.remove(d)),
                      ),
                    if (_uploading)
                      Chip(
                        avatar: const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                        label: Text(l10n.chatUploading),
                      ),
                  ],
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  tooltip: l10n.chatAttachTooltip,
                  onPressed: _uploading ? null : _attach,
                  icon: const Icon(Icons.attach_file_rounded),
                ),
                Expanded(
                  child: TextField(
                    key: const ValueKey('chat-input'),
                    controller: _input,
                    minLines: 1,
                    maxLines: 5,
                    maxLength: 5000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(hintText: l10n.chatInputHint, counterText: '', isDense: true),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 4),
                IconButton.filled(
                  key: const ValueKey('chat-send'),
                  tooltip: l10n.chatSendTooltip,
                  style: IconButton.styleFrom(backgroundColor: AppColors.violet, foregroundColor: Colors.white),
                  onPressed: canSend ? _send : null,
                  icon: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends ConsumerWidget {
  const _Bubble({required this.message, required this.mine, required this.showSender});

  final ChatMessage message;
  final bool mine;
  final bool showSender;

  /// Long-press menu on someone else's message: copy the text or report it. Never offered on your own.
  Future<void> _showActions(BuildContext context) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.body.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.copy_rounded),
                title: Text(ctx.l10n.chatCopyText),
                onTap: () => Navigator.pop(ctx, 'copy'),
              ),
            ListTile(
              key: const Key('message-action-report'),
              leading: const Icon(Icons.flag_outlined, color: AppColors.danger),
              title: Text(ctx.l10n.chatReportMessage),
              onTap: () => Navigator.pop(ctx, 'report'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted) return;
    switch (action) {
      case 'copy':
        await Clipboard.setData(ClipboardData(text: message.body));
        if (context.mounted) showInfoSnack(context, context.l10n.chatMessageCopied);
      case 'report':
        await showReportSheet(context, type: ReportTargetType.message, targetId: message.id);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bg = mine ? AppColors.violet : context.palette.surfaceAlt;
    final fg = mine ? Colors.white : context.colors.onSurface;
    const r = Radius.circular(16);
    final canReport = !mine && message.id.isNotEmpty;
    final bubble = ConstrainedBox(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 12, 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadiusDirectional.only(
            topStart: r,
            topEnd: r,
            bottomStart: mine ? r : const Radius.circular(4),
            bottomEnd: mine ? const Radius.circular(4) : r,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showSender)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  message.sender.fullName,
                  style: context.text.labelSmall?.copyWith(color: AppColors.violet, fontWeight: FontWeight.w700),
                ),
              ),
            // Other people's messages use plain text so a long-press opens the copy / report menu.
            if (message.body.isNotEmpty)
              mine
                  ? SelectableText(message.body, style: TextStyle(color: fg, height: 1.35))
                  : Text(message.body, style: TextStyle(color: fg, height: 1.35)),
            for (final id in message.attachmentDocumentIds) _AttachmentChip(documentId: id, foreground: fg),
            const SizedBox(height: 2),
            Align(
              alignment: AlignmentDirectional.bottomEnd,
              child: Text(
                Dates.time(message.createdAt),
                style: context.text.labelSmall?.copyWith(color: fg.withValues(alpha: 0.7), fontSize: 10),
              ),
            ),
          ],
        ),
      ),
    );
    return Align(
      alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Column(
        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (canReport)
            GestureDetector(
              key: ValueKey('message-${message.id}'),
              behavior: HitTestBehavior.opaque,
              onLongPress: () => _showActions(context),
              child: bubble,
            )
          else
            bubble,
          if (mine && message.hidden)
            Padding(
              padding: const EdgeInsetsDirectional.only(bottom: 4, end: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.visibility_off_outlined, size: 12, color: context.palette.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    context.l10n.chatHiddenByModerators,
                    style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AttachmentChip extends ConsumerWidget {
  const _AttachmentChip({required this.documentId, required this.foreground});

  final String documentId;
  final Color foreground;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doc = ref.watch(attachmentDocumentProvider(documentId));
    final name =
        doc.value?.fileName ?? (doc.hasError ? context.l10n.chatAttachmentUnavailable : context.l10n.chatAttachment);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: doc.value == null ? null : () => openDocument(context, ref.read(documentRepositoryProvider), doc.value!),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(color: foreground.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                doc.value == null ? Icons.attach_file_rounded : documentKindIcon(doc.value!.kind),
                size: 16,
                color: foreground,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: foreground, decoration: TextDecoration.underline),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
