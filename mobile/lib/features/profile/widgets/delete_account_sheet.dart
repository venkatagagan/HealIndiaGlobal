import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/widgets/auth_widgets.dart';

/// In-app account deletion (App Store 5.1.1(v), Google Play account-deletion policy; BACKLOG #15):
/// `DELETE /auth/me` via [AuthController.deleteAccount]. Returns true when the account was deleted
/// (the session is already cleared; the router then shows the auth screen).
///
/// Used by every account type (patient profile, agent and hospital shells). MFA users also enter an
/// authenticator code. When the server refuses with 409 `account_deletion_blocked` (open bookings,
/// pending payments, ...) the blockers are listed and the user can ask support to close the account
/// (`POST /auth/me/deletion-request`).
Future<bool> showDeleteAccountSheet(BuildContext context, {required bool isGuest}) async {
  final deleted = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => DeleteAccountSheet(isGuest: isGuest),
  );
  return deleted ?? false;
}

class DeleteAccountSheet extends ConsumerStatefulWidget {
  const DeleteAccountSheet({super.key, required this.isGuest});

  final bool isGuest;

  /// Word the user types to confirm.
  static const confirmWord = 'DELETE';

  @override
  ConsumerState<DeleteAccountSheet> createState() => _DeleteAccountSheetState();
}

class _DeleteAccountSheetState extends ConsumerState<DeleteAccountSheet> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _reason = TextEditingController();
  final _otp = TextEditingController();
  bool _loading = false;
  bool _requesting = false;
  bool _requestSent = false;

  /// Blockers returned with a 409 (`{"active_bookings": 1, ...}`); null until the server refused.
  Map<String, int>? _blockers;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  bool get _confirmed => _confirm.text.trim().toUpperCase() == DeleteAccountSheet.confirmWord;

  @override
  void initState() {
    super.initState();
    _confirm.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    _reason.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_confirmed || _loading) return;
    final navigator = Navigator.of(context);
    setState(() {
      _loading = true;
      _error = null;
      _fieldErrors = const {};
      _blockers = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .deleteAccount(
            password: widget.isGuest ? null : _password.text,
            reason: _reason.text.trim(),
            otpCode: _otp.text.trim().isEmpty ? null : _otp.text.trim(),
          );
      navigator.pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _fieldErrors = e.fieldErrors;
          _error = e.message;
          if (e.statusCode == 409 || e.code == 'account_deletion_blocked') _blockers = deletionBlockers(e.details);
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _requestDeletion() async {
    if (_requesting) return;
    setState(() => _requesting = true);
    try {
      await ref.read(authControllerProvider.notifier).requestAccountDeletion(reason: _reason.text.trim());
      if (mounted) setState(() => _requestSent = true);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mfa = !widget.isGuest && (ref.watch(currentUserProvider)?.mfaEnabled ?? false);
    final blockers = _blockers;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final muted = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Delete account', style: context.text.titleLarge),
            const SizedBox(height: 8),
            Text(
              widget.isGuest
                  ? 'This permanently deletes your guest account, screenings and saved items.'
                  : 'This permanently deletes your account, profile, companions, saved items and uploaded '
                        'documents, and signs you out on every device. It cannot be undone.',
              style: context.text.bodyMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Records we must keep by law (invoices, payments, refunds and hospital treatment records) are '
              'retained for the legal retention period with access restricted, then erased. Open bookings '
              'or pending payments may need to be settled or cancelled first.',
              style: muted,
            ),
            const SizedBox(height: 16),
            if (_error != null) ...[FormErrorBanner(message: _error!), const SizedBox(height: 12)],
            if (blockers != null) ...[
              _BlockersCard(
                blockers: blockers,
                requestSent: _requestSent,
                requesting: _requesting,
                onRequest: _requestDeletion,
              ),
              const SizedBox(height: 12),
            ],
            if (!widget.isGuest) ...[
              PasswordField(
                controller: _password,
                label: 'Password',
                helperText: 'Leave blank if you signed in with Google or Apple and never set one',
                errorText: _fieldErrors['password'],
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
            ],
            if (mfa) ...[
              TextField(
                key: const Key('delete-account-otp'),
                controller: _otp,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: 10,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'Authenticator code',
                  helperText: 'The 6-digit code from your authenticator app',
                  counterText: '',
                  errorText: _fieldErrors['otp_code'],
                ),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _reason,
              maxLength: 500,
              maxLines: 2,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Why are you leaving? (optional)', counterText: ''),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('delete-account-confirm'),
              controller: _confirm,
              autocorrect: false,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Type ${DeleteAccountSheet.confirmWord} to confirm'),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 20),
            PrimaryButton(
              label: 'Delete my account permanently',
              tone: ButtonTone.red,
              loading: _loading,
              onPressed: _confirmed ? _submit : null,
            ),
          ],
        ),
      ),
    );
  }
}

/// Parses the 409 `details` (`{"active_bookings": 1, ...}`) into non-zero blocker counts.
Map<String, int> deletionBlockers(Object? details) {
  final out = <String, int>{};
  if (details is Map) {
    details.forEach((k, v) {
      final n = v is num ? v.toInt() : int.tryParse('$v') ?? 0;
      if (n > 0) out['$k'] = n;
    });
  }
  return out;
}

/// Human label of a deletion blocker key.
String deletionBlockerLabel(String key) => switch (key) {
  'active_cases' => 'Cases in progress',
  'active_bookings' => 'Upcoming or active bookings',
  'pending_payments' => 'Payments in progress',
  'listed_hospitals_owned' => 'Listed hospitals you own',
  _ => key.isEmpty ? key : (key[0].toUpperCase() + key.substring(1)).replaceAll('_', ' '),
};

class _BlockersCard extends StatelessWidget {
  const _BlockersCard({
    required this.blockers,
    required this.requestSent,
    required this.requesting,
    required this.onRequest,
  });

  final Map<String, int> blockers;
  final bool requestSent;
  final bool requesting;
  final VoidCallback onRequest;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      key: const Key('delete-account-blockers'),
      borderColor: AppColors.warning,
      color: AppColors.warningSoft,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('These need to be closed first', style: context.text.titleSmall),
          const SizedBox(height: 6),
          for (final e in blockers.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  const Icon(Icons.pending_actions_outlined, size: 18, color: AppColors.warning),
                  const SizedBox(width: 8),
                  Expanded(child: Text(deletionBlockerLabel(e.key))),
                  Text('${e.value}', style: context.text.titleSmall),
                ],
              ),
            ),
          const SizedBox(height: 10),
          if (requestSent)
            Text(
              'Deletion request sent. Our support team will close your account once these are settled and '
              'confirm by e-mail.',
              key: const Key('delete-account-request-sent'),
              style: context.text.bodySmall,
            )
          else
            SecondaryButton(
              key: const Key('delete-account-request'),
              label: 'Request deletion',
              icon: Icons.support_agent_rounded,
              loading: requesting,
              onPressed: requesting ? null : onRequest,
            ),
        ],
      ),
    );
  }
}
