// 403 `organisation_suspended`: one full-screen message for the agent / hospital section.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/agent_portal/shared/organisation_suspended.dart';
import 'package:heal_india_global/features/hospital_portal/hospital_routes.dart';

import 'portal_test_helpers.dart';

const _suspended = {
  'error': {'code': 'organisation_suspended', 'message': "Your hospital's account is suspended."},
};

void main() {
  setUp(() => AppTextStyles.useGoogleFonts = false);

  test('the API client reports 403 organisation_suspended, not other 403s', () async {
    final adapter = RoutedAdapter({
      'GET /hospital-portal/dashboard': (_) => (403, _suspended),
      'GET /cases': (_) => (
        403,
        {
          'error': {'code': 'forbidden', 'message': 'No'},
        },
      ),
    });
    final api = ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://t/api/v1', httpClientAdapter: adapter);
    var events = 0;
    final sub = api.organisationSuspended.listen((_) => events++);
    await expectLater(api.get('/cases'), throwsA(isA<ApiException>()));
    await expectLater(
      api.get('/hospital-portal/dashboard'),
      throwsA(isA<ApiException>().having((e) => e.isOrganisationSuspended, 'suspended', isTrue)),
    );
    await Future<void>.delayed(Duration.zero);
    expect(events, 1);
    await sub.cancel();
  });

  testWidgets('a suspended hospital sees the suspended screen with support contacts; check again retries', (
    tester,
  ) async {
    var suspended = true;
    final adapter = RoutedAdapter({
      'GET /hospital-portal/dashboard': (_) => suspended
          ? (403, _suspended)
          : {'new_enquiries': 0, 'quotes_pending': 0, 'admissions_upcoming': 0, 'in_treatment': 0},
      'GET /content/helplines': (_) => {'24x7': '+91 1800 123 456', 'whatsapp': '+91 98765 43210'},
    });
    await pumpPortal(
      tester,
      routes: hospitalPortalRoutes(),
      initialLocation: HospitalRoutes.home,
      user: hospitalUser,
      adapter: adapter,
      builder: (context, child) => OrganisationSuspendedGate(child: child!),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('organisation-suspended')), findsOneWidget);
    expect(find.text('Your account is suspended'), findsOneWidget);
    expect(find.textContaining("Your hospital's account has been suspended"), findsOneWidget);
    expect(find.byKey(const ValueKey('suspended-call-support')), findsOneWidget);
    expect(find.byKey(const ValueKey('suspended-whatsapp-support')), findsOneWidget);
    expect(find.byKey(const ValueKey('suspended-logout')), findsOneWidget);

    suspended = false;
    await tester.tap(find.byKey(const ValueKey('suspended-check-again')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('organisation-suspended')), findsNothing);
  });

  testWidgets('patients never see the suspended screen', (tester) async {
    final adapter = RoutedAdapter({'GET /x': (_) => (403, _suspended)});
    await pumpPortal(
      tester,
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => const Scaffold(body: Text('patient home')),
        ),
      ],
      initialLocation: '/',
      user: const User(id: 'u-p', role: UserRole.patient, status: UserStatus.active, fullName: 'Amina'),
      adapter: adapter,
      builder: (context, child) => OrganisationSuspendedGate(child: child!),
    );
    ProviderScope.containerOf(
      tester.element(find.text('patient home')),
    ).read(organisationSuspendedProvider.notifier).markSuspended();
    await tester.pumpAndSettle();
    expect(find.text('patient home'), findsOneWidget);
    expect(find.byKey(const ValueKey('organisation-suspended')), findsNothing);
  });
}
