import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/realtime_service.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Auth controller with a fixed state (no network).
class FakeAuthController extends AuthController {
  FakeAuthController(this.initial);

  final AuthState initial;

  @override
  Future<AuthState> build() async => initial;
}

const testPatient = User(id: 'u-patient', role: UserRole.patient, status: UserStatus.active, fullName: 'Amina Yusuf');

/// Overrides every journey screen needs: prefs, in-memory tokens, a signed-in patient and a silent
/// realtime stream (no WebSocket in tests).
Future<List<Override>> journeyBaseOverrides({String currency = 'USD'}) async {
  SharedPreferences.setMockInitialValues({PrefKeys.preferredCurrency: currency});
  final sp = await SharedPreferences.getInstance();
  return [
    sharedPreferencesProvider.overrideWithValue(sp),
    tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
    authControllerProvider.overrideWith(() => FakeAuthController(AuthState.fromUser(testPatient))),
    realtimeEventsProvider.overrideWith((ref) => const Stream<RealtimeEvent>.empty()),
  ];
}

/// Pumps [routes] in a dark-themed router app starting at [initialLocation].
Widget journeyApp({
  required List<Override> overrides,
  required List<RouteBase> routes,
  required String initialLocation,
}) {
  final router = GoRouter(initialLocation: initialLocation, routes: routes);
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(theme: AppTheme.dark(), routerConfig: router),
  );
}

/// A stub destination route that renders `"<label> <param>"`.
GoRoute stubRoute(String path, String label, {String? param}) => GoRoute(
  path: path,
  builder: (_, s) => Scaffold(body: Text(param == null ? label : '$label ${s.pathParameters[param]}')),
);
