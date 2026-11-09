import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/messaging_repository.dart';
import '../../../core/widgets/widgets.dart';
import '../logic/notification_routes.dart';
import '../widgets/notification_tile.dart';

/// Notifications list (mark read on open, mark all read). Updates live on `notification.created`.
///
/// Route: `/notifications` · Owner: fl-journey.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  /// Locally marked as read (optimistic) until the list reloads.
  final Set<String> _readIds = {};
  bool _markingAll = false;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notificationsProvider);
    final hasUnread = async.value?.any((n) => !n.isRead && !_readIds.contains(n.id)) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        centerTitle: true,
        actions: [
          if (hasUnread)
            TextButton(onPressed: _markingAll ? null : _markAll, child: const Text('Mark all read')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: AsyncValueView<List<AppNotification>>(
          value: async,
          onRetry: () => ref.invalidate(notificationsProvider),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 60),
                  EmptyView(
                    icon: Icons.notifications_off_outlined,
                    title: 'You are all caught up',
                    message: 'Quotes, booking updates, reminders and messages will show up here.',
                  ),
                ],
              );
            }
            final sorted = [...list]
              ..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: sorted.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final n = _readIds.contains(sorted[i].id) ? sorted[i].markRead() : sorted[i];
                return NotificationTile(notification: n, onTap: () => _open(n));
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _open(AppNotification n) async {
    if (!n.isRead) {
      setState(() => _readIds.add(n.id));
      unawaited(_markRead(n.id));
    }
    final target = notificationTarget(n);
    if (target != null && mounted) await context.push(target);
  }

  Future<void> _markRead(String id) async {
    try {
      await ref.read(messagingRepositoryProvider).markNotificationRead(id);
      ref.invalidate(unreadNotificationsCountProvider);
    } catch (_) {
      if (mounted) setState(() => _readIds.remove(id));
    }
  }

  Future<void> _markAll() async {
    setState(() => _markingAll = true);
    try {
      await ref.read(messagingRepositoryProvider).markAllNotificationsRead();
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadNotificationsCountProvider);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }
}
