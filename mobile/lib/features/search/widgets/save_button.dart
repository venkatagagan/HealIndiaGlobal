import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../providers/search_providers.dart';

/// Bookmark toggle for hospitals / doctors / procedures (`POST|DELETE /patient/saved`).
/// Guests and signed-out users are invited to create an account instead.
class SaveButton extends ConsumerStatefulWidget {
  const SaveButton({super.key, required this.entityType, required this.entityId, this.color, this.size = 24});

  final SavedEntityType entityType;
  final String entityId;
  final Color? color;
  final double size;

  @override
  ConsumerState<SaveButton> createState() => _SaveButtonState();
}

class _SaveButtonState extends ConsumerState<SaveButton> {
  bool? _optimistic;
  bool _busy = false;

  Future<void> _toggle(bool saved) async {
    final auth = ref.read(authStateProvider);
    if (!auth.isAuthenticated) {
      _promptAccount();
      return;
    }
    if (_busy) return;
    final repo = ref.read(patientRepositoryProvider);
    setState(() {
      _busy = true;
      _optimistic = !saved;
    });
    try {
      if (saved) {
        await repo.unsave(widget.entityType, widget.entityId);
      } else {
        await repo.save(widget.entityType, widget.entityId);
      }
      ref.invalidate(savedItemsProvider);
      if (mounted) showInfoSnack(context, saved ? 'Removed from saved' : 'Saved to your list');
    } on Object catch (e) {
      if (mounted) {
        setState(() => _optimistic = null);
        showErrorSnack(context, e);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _promptAccount() {
    String here;
    try {
      here = GoRouterState.of(context).uri.toString();
    } on Object {
      here = Routes.home;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: const Text('Create a free account to save hospitals and doctors.'),
          action: SnackBarAction(label: 'Sign up', onPressed: () => context.push(Routes.registerFrom(here))),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final keys = ref.watch(savedKeysProvider).value ?? const <String>{};
    final saved = _optimistic ?? keys.contains(savedKey(widget.entityType, widget.entityId));
    return IconButton(
      tooltip: saved ? 'Remove from saved' : 'Save',
      isSelected: saved,
      onPressed: () => _toggle(saved),
      icon: Icon(
        saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
        size: widget.size,
        color: saved ? AppColors.primary : (widget.color ?? context.palette.textSecondary),
      ),
    );
  }
}
