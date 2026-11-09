import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/features/onboarding/onboarding_content.dart';
import 'package:heal_india_global/features/onboarding/screens/onboarding_screen.dart';
import 'package:heal_india_global/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fl_harness.dart';

void main() {
  testWidgets('carousel shows the three pages from the content constants', (tester) async {
    await pumpScreen(tester, path: '/onboarding', screen: (_) => const OnboardingScreen());

    expect(find.text(OnboardingContent.impactStat(L10n.current)), findsOneWidget);
    expect(find.text(OnboardingContent.impactHeadline(L10n.current)), findsOneWidget);
    for (final b in OnboardingContent.accreditations(L10n.current)) {
      expect(find.text(b.code), findsOneWidget);
    }
    expect(find.text('Skip'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.arrow_forward_rounded));
    await tester.pumpAndSettle();
    for (final p in OnboardingContent.trustPoints(L10n.current)) {
      expect(find.text(p.title), findsOneWidget);
    }
    expect(find.text(OnboardingContent.testimonialDisclaimer(L10n.current)), findsOneWidget);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    for (final s in OnboardingContent.processSteps(L10n.current)) {
      expect(find.text(s.title), findsOneWidget);
    }
    expect(find.text(OnboardingContent.securityFooter(L10n.current)), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
    expect(find.text('Explore as Guest'), findsOneWidget);
  });

  testWidgets('Skip marks onboarding seen and opens the registration decision', (tester) async {
    await pumpScreen(tester, path: '/onboarding', screen: (_) => const OnboardingScreen());

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(find.text(routeLabel('/auth')), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool(PrefKeys.onboardingSeen), isTrue);
  });

  testWidgets('Explore as Guest starts a guest session and goes home', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated());
    await pumpScreen(tester, path: '/onboarding', screen: (_) => const OnboardingScreen(), authController: auth);

    await tester.fling(find.byType(PageView), const Offset(-600, 0), 2000);
    await tester.pumpAndSettle();
    await tester.fling(find.byType(PageView), const Offset(-600, 0), 2000);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Explore as Guest'));
    await tester.pumpAndSettle();

    expect(auth.calls, ['guest']);
    expect(find.text(routeLabel('/home')), findsOneWidget);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool(PrefKeys.onboardingSeen), isTrue);
  });
}
