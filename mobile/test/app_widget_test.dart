import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/app.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/router/app_router.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/core/widgets/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Auth controller with a fixed state (no network).
class FakeAuthController extends AuthController {
  FakeAuthController(this.initial);

  final AuthState initial;

  @override
  Future<AuthState> build() async => initial;
}

Future<List<Override>> baseOverrides({Map<String, Object> prefs = const {}, AuthState? auth}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  return [
    sharedPreferencesProvider.overrideWithValue(sp),
    tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
    navBadgesProvider.overrideWithValue(const {3: 2}),
    if (auth != null) authControllerProvider.overrideWith(() => FakeAuthController(auth)),
  ];
}

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  testWidgets('first launch without a session lands on onboarding', (tester) async {
    final overrides = await baseOverrides();
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: const HealIndiaApp(enableRealtime: false)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Welcome'), findsWidgets);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('guest sees the tab shell and is sent to register for Trips', (tester) async {
    const guest = User(id: 'g1', role: UserRole.patient, status: UserStatus.active, isGuest: true);
    final overrides = await baseOverrides(prefs: {PrefKeys.onboardingSeen: true}, auth: AuthState.fromUser(guest));
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: const HealIndiaApp(enableRealtime: false)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(NavigationBar), findsOneWidget);
    for (final tab in kNavTabs) {
      expect(find.text(tab.label), findsWidgets);
    }
    expect(find.text('2'), findsOneWidget); // messages badge

    await tester.tap(find.text('Trips'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Create account'), findsWidgets);
  });

  testWidgets('signed-in patient can open the Trips tab and theme is dark', (tester) async {
    const patient = User(id: 'p1', role: UserRole.patient, status: UserStatus.active, fullName: 'Jane');
    final overrides = await baseOverrides(prefs: {PrefKeys.onboardingSeen: true}, auth: AuthState.fromUser(patient));
    await tester.pumpWidget(ProviderScope(overrides: overrides, child: const HealIndiaApp(enableRealtime: false)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Trips'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(NavigationBar), findsOneWidget);

    final context = tester.element(find.byType(NavigationBar));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(Theme.of(context).scaffoldBackgroundColor, AppColors.darkBackground);
  });

  testWidgets('core widgets render', (tester) async {
    AppTextStyles.useGoogleFonts = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: ListView(
            children: [
              const BrandHeader(),
              PrimaryButton(label: 'Next', onPressed: () {}),
              SecondaryButton(label: 'Previous', onPressed: () {}),
              const StepProgressBar(step: 2, total: 4),
              ChipToggle(label: 'Weeks', selected: true, onChanged: (_) {}),
              const MoneyText(1250000, 'USD'),
              const RatingStars(rating: 4.8, count: 230),
              const Avatar(name: 'Arjun Sharma'),
              const SectionTitle('Your Checklist'),
              StatusBadge.forEnum(BookingStatus.confirmed),
              const AppCard(child: Text('card')),
              const SizedBox(height: 200, child: EmptyView(title: 'Nothing here')),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text(Brand.name), findsOneWidget);
    expect(find.text(r'$12,500'), findsOneWidget);
    expect(find.text('Step 2 of 4'), findsOneWidget);
    expect(find.text('AS'), findsOneWidget);
    expect(find.text('Confirmed'), findsOneWidget);
  });
}
