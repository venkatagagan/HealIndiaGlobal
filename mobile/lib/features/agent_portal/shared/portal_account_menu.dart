import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../profile/widgets/delete_account_sheet.dart';
import 'portal_api.dart';

/// App-bar avatar menu of the partner shells: who is signed in, hospital switcher (hospital
/// members of several hospitals), sign out and in-app account deletion (store requirement; reuses the
/// profile feature's [showDeleteAccountSheet]). The router sends signed-out users to the public door.
class PortalAccountMenu extends ConsumerWidget {
  const PortalAccountMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final hospitals = user?.hospitals ?? const <UserHospital>[];
    final active = ref.watch(activeHospitalProvider);
    return PopupMenuButton<String>(
      key: const ValueKey('portal-account-menu'),
      tooltip: 'Account',
      icon: Avatar(name: user?.fullName ?? '', imageUrl: user?.avatarUrl, size: 32),
      onSelected: (v) async {
        if (v == '_logout') {
          await ref.read(authControllerProvider.notifier).logout();
        } else if (v == '_delete') {
          if (context.mounted) await confirmDeletePortalAccount(context);
        } else if (v.startsWith('h:')) {
          ref.read(selectedHospitalIdProvider.notifier).select(v.substring(2));
        }
      },
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(user?.fullName ?? ''),
            subtitle: Text([user?.email ?? '', user?.role.label ?? ''].where((s) => s.isNotEmpty).join(' · ')),
          ),
        ),
        if (user?.role == UserRole.hospital && hospitals.length > 1) ...[
          const PopupMenuDivider(),
          for (final h in hospitals)
            CheckedPopupMenuItem<String>(value: 'h:${h.id}', checked: h.id == active?.id, child: Text(h.name)),
        ],
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: '_logout',
          child: ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.logout_rounded), title: Text('Log out')),
        ),
        const PopupMenuItem<String>(
          key: ValueKey('portal-delete-account'),
          value: '_delete',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.delete_forever_outlined, color: AppColors.danger),
            title: Text('Delete account', style: TextStyle(color: AppColors.danger)),
          ),
        ),
      ],
    );
  }
}

/// Opens the shared delete-account sheet for an agent / hospital user. After deletion the session is
/// cleared and the router returns to the public door.
Future<void> confirmDeletePortalAccount(BuildContext context) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final deleted = await showDeleteAccountSheet(context, isGuest: false);
  if (deleted) messenger?.showSnackBar(const SnackBar(content: Text('Your account has been deleted.')));
}
