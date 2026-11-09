import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../auth/validators.dart';
import '../../auth/widgets/auth_widgets.dart';

/// `POST /auth/change-password`. Returns true when the password was changed.
Future<bool> showChangePasswordSheet(BuildContext context) async {
  final changed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const ChangePasswordSheet(),
  );
  return changed ?? false;
}

class ChangePasswordSheet extends ConsumerStatefulWidget {
  const ChangePasswordSheet({super.key});

  @override
  ConsumerState<ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends ConsumerState<ChangePasswordSheet> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!(_formKey.currentState?.validate() ?? false) || _loading) return;
    setState(() => _loading = true);
    try {
      await ref.read(authRepositoryProvider).changePassword(currentPassword: _current.text, newPassword: _next.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _fieldErrors = e.fieldErrors;
          _error = e.message;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.passwordChangeTitle, style: context.text.titleLarge),
              const SizedBox(height: 16),
              if (_error != null) ...[FormErrorBanner(message: _error!), const SizedBox(height: 12)],
              PasswordField(
                controller: _current,
                label: l10n.passwordCurrent,
                helperText: l10n.passwordCurrentHelper,
                errorText: _fieldErrors['current_password'],
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              PasswordField(
                controller: _next,
                label: l10n.passwordNew,
                validator: (v) {
                  final base = AuthValidators.newPassword(v);
                  if (base != null) return base;
                  return v == _current.text ? l10n.passwordMustDiffer : null;
                },
                errorText: _fieldErrors['new_password'],
                autofillHints: const [AutofillHints.newPassword],
                textInputAction: TextInputAction.next,
                helperText: l10n.passwordPolicyHelper(AuthValidators.passwordMinLength),
              ),
              const SizedBox(height: 12),
              PasswordField(
                controller: _confirm,
                label: l10n.passwordConfirmNew,
                validator: (v) => v != _next.text ? l10n.passwordMismatch : null,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 20),
              PrimaryButton(label: l10n.passwordUpdateButton, loading: _loading, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}
