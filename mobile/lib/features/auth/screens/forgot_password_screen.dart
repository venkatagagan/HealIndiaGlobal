import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
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
    final invalidCode = context.l10n.forgotPasswordInvalidCode;
    await _guard(() async {
      try {
        await ref.read(authRepositoryProvider).resetPassword(token: _token.text.trim(), newPassword: _password.text);
      } on ApiException catch (e) {
        if (e.isValidation || e.statusCode == 400) {
          throw ApiException(
            statusCode: e.statusCode,
            code: e.code,
            message: e.fieldErrors['new_password'] ?? invalidCode,
          );
        }
        rethrow;
      }
      if (mounted) setState(() => _stage = _Stage.done);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AuthScaffold(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _stage == _Stage.reset ? l10n.forgotPasswordSetNewTitle : l10n.forgotPasswordTitle,
              style: context.text.headlineSmall,
            ),
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
      context.l10n.forgotPasswordIntro,
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
        decoration: InputDecoration(
          labelText: context.l10n.forgotPasswordEmailLabel,
          prefixIcon: const Icon(Icons.mail_outline_rounded),
        ),
      ),
    ),
    const SizedBox(height: 16),
    PrimaryButton(label: context.l10n.forgotPasswordSendLink, loading: _loading, onPressed: _request),
    TextButton(
      onPressed: () => setState(() => _stage = _Stage.reset),
      child: Text(context.l10n.forgotPasswordHaveCode),
    ),
  ];

  List<Widget> _sent(BuildContext context) => [
    const Icon(Icons.mark_email_read_outlined, size: 56, color: AppColors.primary),
    const SizedBox(height: 12),
    Text(context.l10n.forgotPasswordCheckInbox, textAlign: TextAlign.center, style: context.text.titleLarge),
    const SizedBox(height: 6),
    Text(
      context.l10n.forgotPasswordSentBody(_email.text.trim()),
      textAlign: TextAlign.center,
      style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
    ),
    const SizedBox(height: 20),
    PrimaryButton(label: context.l10n.forgotPasswordEnterCode, onPressed: () => setState(() => _stage = _Stage.reset)),
    const SizedBox(height: 8),
    TextButton(onPressed: () => context.go(Routes.login), child: Text(context.l10n.forgotPasswordBackToLogin)),
  ];

  List<Widget> _resetForm(BuildContext context) => [
    Text(
      context.l10n.forgotPasswordResetIntro,
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
            validator: (v) => (v ?? '').trim().length < 10 ? context.l10n.forgotPasswordPasteFullCode : null,
            decoration: InputDecoration(
              labelText: context.l10n.forgotPasswordCodeLabel,
              prefixIcon: const Icon(Icons.key_outlined),
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          PasswordField(
            controller: _password,
            label: context.l10n.passwordNew,
            validator: AuthValidators.newPassword,
            autofillHints: const [AutofillHints.newPassword],
            onSubmitted: (_) => _reset(),
            helperText: context.l10n.passwordPolicyHelper(AuthValidators.passwordMinLength),
          ),
        ],
      ),
    ),
    const SizedBox(height: 16),
    PrimaryButton(label: context.l10n.passwordUpdateButton, loading: _loading, onPressed: _reset),
    TextButton(
      onPressed: () => setState(() => _stage = _Stage.request),
      child: Text(context.l10n.forgotPasswordRequestNewLink),
    ),
  ];

  List<Widget> _done(BuildContext context) => [
    const Icon(Icons.check_circle_outline_rounded, size: 56, color: AppColors.primary),
    const SizedBox(height: 12),
    Text(context.l10n.forgotPasswordUpdatedTitle, textAlign: TextAlign.center, style: context.text.titleLarge),
    const SizedBox(height: 6),
    Text(
      context.l10n.forgotPasswordUpdatedBody,
      textAlign: TextAlign.center,
      style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
    ),
    const SizedBox(height: 20),
    PrimaryButton(label: context.l10n.authLogIn, onPressed: () => context.go(Routes.login)),
  ];
}
