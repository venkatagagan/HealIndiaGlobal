import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../validators.dart';
import '../widgets/auth_widgets.dart';

/// Forgot password: request a reset link (`POST /auth/forgot-password`, always 202) and, for users
/// who received the reset code by email, set a new password (`POST /auth/reset-password`).
///
/// Route: `/auth/forgot` · Owner: fl-onboarding.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

enum _Stage { request, sent, reset, done }

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _requestKey = GlobalKey<FormState>();
  final _resetKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _token = TextEditingController();
  final _password = TextEditingController();
  _Stage _stage = _Stage.request;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _token.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _guard(Future<void> Function() action) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await action();
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _request() async {
    if (!(_requestKey.currentState?.validate() ?? false)) return;
    await _guard(() async {
      await ref.read(authRepositoryProvider).forgotPassword(_email.text);
      if (mounted) setState(() => _stage = _Stage.sent);
    });
  }

  Future<void> _reset() async {
    if (!(_resetKey.currentState?.validate() ?? false)) return;
    await _guard(() async {
      try {
        await ref.read(authRepositoryProvider).resetPassword(token: _token.text.trim(), newPassword: _password.text);
      } on ApiException catch (e) {
        if (e.isValidation || e.statusCode == 400) {
          throw ApiException(
            statusCode: e.statusCode,
            code: e.code,
            message: e.fieldErrors['new_password'] ?? 'This reset code is invalid or has expired. Request a new one.',
          );
        }
        rethrow;
      }
      if (mounted) setState(() => _stage = _Stage.done);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_stage == _Stage.reset ? 'Set a new password' : 'Reset password', style: context.text.headlineSmall),
            const SizedBox(height: 16),
            if (_error != null) ...[FormErrorBanner(message: _error!), const SizedBox(height: 12)],
            ...switch (_stage) {
              _Stage.request => _requestForm(context),
              _Stage.sent => _sent(context),
              _Stage.reset => _resetForm(context),
              _Stage.done => _done(context),
            },
          ],
        ),
      ),
    );
  }

  List<Widget> _requestForm(BuildContext context) => [
    Text(
      "Enter the email you registered with and we'll send you a link to reset your password.",
      style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
    ),
    const SizedBox(height: 16),
    Form(
      key: _requestKey,
      child: TextFormField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        autocorrect: false,
        validator: AuthValidators.email,
        onFieldSubmitted: (_) => _request(),
        decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded)),
      ),
    ),
    const SizedBox(height: 16),
    PrimaryButton(label: 'Send reset link', loading: _loading, onPressed: _request),
    TextButton(
      onPressed: () => setState(() => _stage = _Stage.reset),
      child: const Text('I already have a reset code'),
    ),
  ];

  List<Widget> _sent(BuildContext context) => [
    const Icon(Icons.mark_email_read_outlined, size: 56, color: AppColors.primary),
    const SizedBox(height: 12),
    Text('Check your inbox', textAlign: TextAlign.center, style: context.text.titleLarge),
    const SizedBox(height: 6),
    Text(
      'If an account exists for ${_email.text.trim()}, we have sent a password reset link. '
      'It may take a few minutes to arrive - check your spam folder too.',
      textAlign: TextAlign.center,
      style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
    ),
    const SizedBox(height: 20),
    PrimaryButton(label: 'Enter reset code', onPressed: () => setState(() => _stage = _Stage.reset)),
    const SizedBox(height: 8),
    TextButton(onPressed: () => context.go(Routes.login), child: const Text('Back to log in')),
  ];

  List<Widget> _resetForm(BuildContext context) => [
    Text(
      'Paste the reset code from the email we sent you, then choose a new password.',
      style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
    ),
    const SizedBox(height: 16),
    Form(
      key: _resetKey,
      child: Column(
        children: [
          TextFormField(
            controller: _token,
            autocorrect: false,
            maxLength: 512,
            validator: (v) => (v ?? '').trim().length < 10 ? 'Paste the full reset code' : null,
            decoration: const InputDecoration(
              labelText: 'Reset code',
              prefixIcon: Icon(Icons.key_outlined),
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          PasswordField(
            controller: _password,
            label: 'New password',
            validator: AuthValidators.newPassword,
            autofillHints: const [AutofillHints.newPassword],
            onSubmitted: (_) => _reset(),
            helperText: 'At least ${AuthValidators.passwordMinLength} characters with a letter and a number',
          ),
        ],
      ),
    ),
    const SizedBox(height: 16),
    PrimaryButton(label: 'Update password', loading: _loading, onPressed: _reset),
    TextButton(onPressed: () => setState(() => _stage = _Stage.request), child: const Text('Request a new link')),
  ];

  List<Widget> _done(BuildContext context) => [
    const Icon(Icons.check_circle_outline_rounded, size: 56, color: AppColors.primary),
    const SizedBox(height: 12),
    Text('Password updated', textAlign: TextAlign.center, style: context.text.titleLarge),
    const SizedBox(height: 6),
    Text(
      'You can now log in with your new password.',
      textAlign: TextAlign.center,
      style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
    ),
    const SizedBox(height: 20),
    PrimaryButton(label: 'Log in', onPressed: () => context.go(Routes.login)),
  ];
}
