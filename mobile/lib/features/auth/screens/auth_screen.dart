import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/apple_sign_in_service.dart';
import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/google_sign_in_service.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/user.dart';
import '../../../core/router/routes.dart';
import '../return_path.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/auth_widgets.dart';

/// Whether the interactive Google sign-in flow can be offered (configured + supported platform).
final googleSignInAvailableProvider = FutureProvider.autoDispose<bool>((ref) async {
  final service = ref.watch(googleSignInServiceProvider);
  if (!service.isConfigured) return false;
  return service.supportsAuthenticate();
});

/// Registration decision: Continue with Google (+ Continue with Apple on iOS) / Sign up with Email /
/// Browse as Guest. Google, Apple and guest create patient accounts; agents and hospital users sign up
/// with email (role tabs on the register screen) or log in (PLAN §3.1).
///
/// Route: `/auth?from=` · Owner: fl-onboarding.
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key, this.from});

  /// Return path after signing in.
  final String? from;

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

enum _Busy { none, google, apple, guest }

class _AuthScreenState extends ConsumerState<AuthScreen> {
  _Busy _busy = _Busy.none;

  String get _target => returnPathOrHome(widget.from);

  Future<void> _run(_Busy kind, Future<User?> Function() action) async {
    if (_busy != _Busy.none) return;
    final onboarding = ref.read(onboardingSeenProvider.notifier);
    setState(() => _busy = kind);
    try {
      final user = await action();
      if (user == null) return;
      await onboarding.complete();
      if (mounted) context.go(returnPathFor(user.role, widget.from));
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = _Busy.none);
    }
  }

  Future<void> _google() => _run(_Busy.google, () => ref.read(authControllerProvider.notifier).signInWithGoogle());

  Future<void> _apple() => _run(_Busy.apple, () => ref.read(authControllerProvider.notifier).signInWithApple());

  Future<void> _guest() => _run(_Busy.guest, () async {
    final auth = ref.read(authStateProvider);
    if (auth.hasSession) return auth.user;
    return ref.read(authControllerProvider.notifier).continueAsGuest();
  });

  void _back() {
    if (context.canPop()) {
      context.pop();
    } else if (ref.read(authStateProvider).hasSession) {
      context.go(Routes.home);
    } else {
      context.go(Routes.onboarding);
    }
  }

  @override
  Widget build(BuildContext context) {
    final googleAvailable = ref.watch(googleSignInAvailableProvider).value ?? false;
    final appleAvailable = ref.watch(appleSignInAvailableProvider).value ?? false;
    final isGuest = ref.watch(authStateProvider).isGuest;
    final busy = _busy != _Busy.none;

    return AuthScaffold(
      onBack: _back,
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  const AuthBrandHeader(),
                  const SizedBox(height: 36),
                  if (googleAvailable) ...[
                    AuthChoiceButton(
                      label: 'Continue with Google',
                      icon: const GoogleMark(),
                      color: AppColors.info,
                      loading: _busy == _Busy.google,
                      onPressed: busy ? null : _google,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (appleAvailable) ...[
                    AuthChoiceButton(
                      label: 'Continue with Apple',
                      icon: Icon(Icons.apple, size: 20, color: context.colors.onSurface),
                      color: context.colors.onSurface,
                      loading: _busy == _Busy.apple,
                      onPressed: busy ? null : _apple,
                    ),
                    const SizedBox(height: 12),
                  ],
                  AuthChoiceButton(
                    label: isGuest ? 'Create account with Email' : 'Sign up with Email',
                    icon: const Icon(Icons.mail_outline_rounded, size: 18, color: AppColors.violet),
                    color: AppColors.violet,
                    onPressed: busy ? null : () => context.push(Routes.registerFrom(_target)),
                  ),
                  const SizedBox(height: 12),
                  AuthChoiceButton(
                    label: isGuest ? 'Continue browsing as Guest' : 'Browse as Guest',
                    icon: Icon(Icons.visibility_outlined, size: 18, color: context.palette.textSecondary),
                    color: context.palette.border,
                    loading: _busy == _Busy.guest,
                    onPressed: busy ? null : _guest,
                  ),
                  if (!isGuest) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Facilitator or hospital team? Sign up with email and choose your role, or log in.',
                      textAlign: TextAlign.center,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Already have an account?', style: context.text.bodySmall),
                      TextButton(
                        onPressed: busy ? null : () => context.push(Routes.loginFrom(_target)),
                        child: const Text('Log in'),
                      ),
                    ],
                  ),
                  const Spacer(),
                  const Padding(padding: EdgeInsets.fromLTRB(8, 24, 8, 16), child: TermsNotice()),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
