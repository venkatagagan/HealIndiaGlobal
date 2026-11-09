import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/apple_sign_in_service.dart';
import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/user.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../return_path.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../validators.dart';
import '../widgets/auth_widgets.dart';
import 'auth_screen.dart' show googleSignInAvailableProvider;

/// Email + password login (with TOTP step when the account has MFA): the one public door for patients,
/// agents and hospital users (PLAN §3.1). After sign-in the user lands in their role's shell; staff
/// accounts are refused with the generic invalid-credentials error.
///
/// Route: `/auth/login?from=` · Owner: fl-onboarding.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.from});

  final String? from;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _otp = TextEditingController();

  bool _loading = false;
  bool _googleLoading = false;
  bool _needsOtp = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  String get _target => returnPathOrHome(widget.from);

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading) return;
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final onboarding = ref.read(onboardingSeenProvider.notifier);
    setState(() => _loading = true);
    try {
      final user = await ref
          .read(authControllerProvider.notifier)
          .login(email: _email.text, password: _password.text, otpCode: _needsOtp ? _otp.text.trim() : null);
      await onboarding.complete();
      if (mounted) context.go(returnPathFor(user.role, widget.from));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.isMfaRequired) {
          final first = !_needsOtp;
          _needsOtp = true;
          _error = first ? null : e.message;
        } else {
          _error = e.message;
          _fieldErrors = e.fieldErrors;
        }
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _google() => _social(() => ref.read(authControllerProvider.notifier).signInWithGoogle());

  Future<void> _apple() => _social(() => ref.read(authControllerProvider.notifier).signInWithApple());

  Future<void> _social(Future<User?> Function() signIn) async {
    if (_googleLoading) return;
    final onboarding = ref.read(onboardingSeenProvider.notifier);
    setState(() {
      _googleLoading = true;
      _error = null;
    });
    try {
      final user = await signIn();
      if (user == null) return;
      await onboarding.complete();
      if (mounted) context.go(returnPathFor(user.role, widget.from));
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _googleLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final googleAvailable = ref.watch(googleSignInAvailableProvider).value ?? false;
    final appleAvailable = ref.watch(appleSignInAvailableProvider).value ?? false;
    return AuthScaffold(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: AutofillGroup(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AuthBrandHeader(subtitle: 'Welcome back. Log in to continue your treatment journey.'),
                const SizedBox(height: 28),
                Text('Log in', style: context.text.headlineSmall),
                const SizedBox(height: 16),
                if (_error != null) ...[FormErrorBanner(message: _error!), const SizedBox(height: 12)],
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email, AutofillHints.username],
                  autocorrect: false,
                  enabled: !_needsOtp,
                  validator: AuthValidators.email,
                  decoration: InputDecoration(
                    labelText: 'Email',
                    prefixIcon: const Icon(Icons.mail_outline_rounded),
                    errorText: _fieldErrors['email'],
                  ),
                ),
                const SizedBox(height: 12),
                PasswordField(
                  controller: _password,
                  validator: AuthValidators.loginPassword,
                  errorText: _fieldErrors['password'],
                  textInputAction: _needsOtp ? TextInputAction.next : TextInputAction.done,
                  onSubmitted: (_) => _needsOtp ? null : _submit(),
                ),
                if (_needsOtp) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Enter the 6-digit code from your authenticator app.',
                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _otp,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: 10,
                    validator: AuthValidators.otp,
                    onFieldSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(
                      labelText: 'Authentication code',
                      prefixIcon: Icon(Icons.shield_outlined),
                      counterText: '',
                    ),
                  ),
                ],
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push(Routes.forgotPassword),
                    child: const Text('Forgot password?'),
                  ),
                ),
                const SizedBox(height: 4),
                PrimaryButton(label: _needsOtp ? 'Verify & log in' : 'Log in', loading: _loading, onPressed: _submit),
                if ((googleAvailable || appleAvailable) && !_needsOtp) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text('or', style: context.text.bodySmall),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (googleAvailable)
                    AuthChoiceButton(
                      label: 'Continue with Google',
                      icon: const GoogleMark(),
                      color: AppColors.info,
                      loading: _googleLoading,
                      onPressed: _loading ? null : _google,
                    ),
                  if (googleAvailable && appleAvailable) const SizedBox(height: 12),
                  if (appleAvailable)
                    AuthChoiceButton(
                      label: 'Continue with Apple',
                      icon: Icon(Icons.apple, size: 20, color: context.colors.onSurface),
                      color: context.colors.onSurface,
                      loading: _googleLoading,
                      onPressed: _loading ? null : _apple,
                    ),
                  const SizedBox(height: 8),
                  Text(
                    'Google and Apple sign-in are for patients.',
                    textAlign: TextAlign.center,
                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text("Don't have an account?", style: context.text.bodySmall),
                    TextButton(
                      onPressed: () => context.pushReplacement(Routes.registerFrom(_target)),
                      child: const Text('Sign up'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
