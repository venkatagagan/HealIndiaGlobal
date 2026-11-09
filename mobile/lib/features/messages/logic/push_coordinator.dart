import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/router/app_router.dart';
import '../../../core/services/push_service.dart';
import 'notification_routes.dart';

/// "Not now" on the pre-prompt silences it for this long.
const kPushPromptSnooze = Duration(days: 30);

/// Whether the in-app pre-prompt may be shown now: not within [kPushPromptSnooze] of a "Not now".
bool pushPromptAllowed(SharedPreferences prefs, {DateTime? now}) {
  final raw = prefs.getString(PrefKeys.pushPromptDeclinedAt);
  final declined = raw == null ? null : DateTime.tryParse(raw);
  if (declined == null) return true;
  return (now ?? DateTime.now()).toUtc().difference(declined.toUtc()) >= kPushPromptSnooze;
}

/// Remembers a "Not now" answer.
Future<void> rememberPushPromptDeclined(SharedPreferences prefs, {DateTime? now}) =>
    prefs.setString(PrefKeys.pushPromptDeclinedAt, (now ?? DateTime.now()).toUtc().toIso8601String());

/// In-app explanation shown before the OS permission dialog. Returns true for "Turn on".
Future<bool> showPushPrePrompt(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: const Icon(Icons.notifications_active_outlined),
      title: const Text('Turn on notifications?'),
      content: const Text(
        'Get updates about your case, messages and payments. We never put health details in notifications.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Turn on')),
      ],
    ),
  );
  return result ?? false;
}

/// Connects [PushService] to the session (CG-15):
/// * a full account signs in (or the app starts with one) -> [PushService.onSignedIn] (registers the
///   token when notifications are already allowed);
/// * right after an interactive sign-in (never at app launch, never for guests) -> the in-app pre-prompt,
///   at most once per [kPushPromptSnooze] after "Not now"; only "Turn on" shows the OS dialog;
/// * a tapped notification opens its screen ([pushLinkRoute]).
///
/// Sign-out is handled by `AuthController.logout` (token removed before the session is cleared).
/// With [NoopPushService] (push off) this does nothing at all.
class PushCoordinator {
  PushCoordinator(this._ref, this._push, {this.promptDelay = const Duration(seconds: 2)});

  final Ref _ref;
  final PushService _push;

  /// Lets the post-login navigation settle before the dialog appears.
  final Duration promptDelay;

  Timer? _promptTimer;

  void start() {
    if (!_push.isSupported) return;
    _push.onOpen = _open;
    _ref.listen<AuthState>(authStateProvider, _onAuth, fireImmediately: true);
    _ref.onDispose(() => _promptTimer?.cancel());
  }

  void _onAuth(AuthState? prev, AuthState next) {
    if (!next.isAuthenticated) {
      _promptTimer?.cancel();
      return;
    }
    final sameUser = prev != null && prev.isAuthenticated && prev.user?.id == next.user?.id;
    if (sameUser) return;
    unawaited(_push.onSignedIn());
    // Unknown -> authenticated is the stored session at app launch: no prompt then.
    final interactiveSignIn = prev != null && prev.isKnown;
    if (interactiveSignIn) {
      _promptTimer?.cancel();
      _promptTimer = Timer(promptDelay, () => unawaited(_maybePrompt()));
    }
  }

  Future<void> _maybePrompt() async {
    if (!_ref.read(authStateProvider).isAuthenticated) return;
    final prefs = _ref.read(sharedPreferencesProvider);
    if (!pushPromptAllowed(prefs)) return;
    if (await _push.permission() != PushPermission.notDetermined) return;
    final context = rootNavigatorKey.currentContext;
    if (context == null || !context.mounted) return;
    final turnOn = await showPushPrePrompt(context);
    if (turnOn) {
      await _push.requestPermission();
    } else {
      await rememberPushPromptDeclined(prefs);
    }
  }

  void _open(Map<String, dynamic> data) {
    final auth = _ref.read(authStateProvider);
    if (!auth.isAuthenticated) return;
    final route = pushLinkRoute(data['link']?.toString(), auth.user?.role ?? UserRole.patient);
    _ref.read(routerProvider).go(route);
  }
}

/// Watched by the app root; starts the coordinator once.
final pushCoordinatorProvider = Provider<PushCoordinator>((ref) {
  final coordinator = PushCoordinator(ref, ref.watch(pushServiceProvider));
  coordinator.start();
  return coordinator;
});
