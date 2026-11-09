import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../profile/widgets/delete_account_sheet.dart';
import 'portal_api.dart';

/// App-bar avatar menu of the partner shells: who is signed in, hospital switcher (hospital
/// members of several hospitals), app language, sign out and in-app account deletion (store requirement;
/// reuses the profile feature's [showDeleteAccountSheet]). The router sends signed-out users to the public door.
class PortalAccountMenu extends ConsumerWidget {
  const PortalAccountMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final hospitals = user?.hospitals ?? const <UserHospital>[];
    final active = ref.watch(activeHospitalProvider);
    final languageName = currentLanguageName(ref);
    final l10n = context.l10n;
    return PopupMenuButton<String>(
      key: const ValueKey('portal-account-menu'),
      tooltip: l10n.commonAccount,
      icon: Avatar(name: user?.fullName ?? '', imageUrl: user?.avatarUrl, size: 32),
      onSelected: (v) async {
        if (v == '_language') {
          if (context.mounted) await showLanguagePicker(context, ref);
        } else if (v == '_logout') {
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
        PopupMenuItem<String>(
          key: const ValueKey('portal-language'),
          value: '_language',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.language_rounded),
            title: Text(l10n.languageSettingTitle),
            subtitle: Text(languageName),
          ),
        ),
        PopupMenuItem<String>(
          value: '_logout',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.logout_rounded),
            title: Text(l10n.commonLogOut),
          ),
        ),
        PopupMenuItem<String>(
          key: const ValueKey('portal-delete-account'),
          value: '_delete',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.delete_forever_outlined, color: AppColors.danger),
            title: Text(l10n.commonDeleteAccount, style: const TextStyle(color: AppColors.danger)),
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
  final deletedMessage = context.l10n.portalAccountDeleted;
  final deleted = await showDeleteAccountSheet(context, isGuest: false);
  if (deleted) messenger?.showSnackBar(SnackBar(content: Text(deletedMessage)));
}
