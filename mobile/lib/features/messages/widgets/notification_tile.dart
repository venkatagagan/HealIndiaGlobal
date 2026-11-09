import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../logic/notification_routes.dart';

/// Notification row ("Appointment Reminder · Your appointment is in 1 hour · 10:00 AM").
class NotificationTile extends StatelessWidget {
  const NotificationTile({super.key, required this.notification, this.onTap, this.dense = false});

  final AppNotification notification;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final (icon, color) = notificationVisual(n.kind);
    final unread = !n.isRead;
    return Material(
      color: unread ? color.withValues(alpha: 0.07) : context.colors.surfaceContainer,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 12, vertical: dense ? 10 : 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: color.withValues(alpha: 0.15),
                child: Icon(icon, size: 18, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      n.title,
                      style: context.text.titleSmall?.copyWith(fontWeight: unread ? FontWeight.w800 : FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (n.body != null && n.body!.isNotEmpty)
                      Text(
                        n.body!,
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                        maxLines: dense ? 1 : 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    dense ? Dates.chatStamp(n.createdAt) : Dates.relative(n.createdAt),
                    style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                  ),
                  if (unread) ...[
                    const SizedBox(height: 6),
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
