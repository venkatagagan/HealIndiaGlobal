// CG-24: every new account answers the 18+ question (`is_adult`).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/auth_repository.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/features/auth/widgets/auth_widgets.dart';

import 'compliance_fakes.dart';

const _ageRequired = ApiException(
  statusCode: 400,
  code: 'age_attestation_required',
  message: 'Please confirm your age.',
);

/// Google endpoint that needs the age answer for a new account.
class _NewAccountRepository extends AuthRepository {
  _NewAccountRepository(TokenStorage tokens)
    : super(ApiClient(tokens: tokens, baseUrl: 'http://test.invalid/api/v1'), tokens);

  final List<bool?> googleCalls = [];

  @override
  Future<AuthSession> google({required String idToken, bool? isAdult}) async {
    googleCalls.add(isAdult);
    if (isAdult == null) throw _ageRequired;
    return const AuthSession(
      accessToken: 'at',
      refreshToken: 'rt',
      user: User(id: 'u1', role: UserRole.patient, status: UserStatus.active),
    );
  }
}

void main() {
  test('register, guest upgrade and social sign-in send is_adult', () async {
    final adapter = RecordingAdapter((_) => (201, tokenOut()));
    final tokens = InMemoryTokenStorage();
    final repo = AuthRepository(await fakeApi(adapter, tokens: tokens), tokens);

    await repo.register(email: 'a@example.com', password: 'healindia2026', fullName: 'A B', isAdult: false);
    await repo.register(
      email: 'r@example.com',
      password: 'healindia2026',
      fullName: 'R K',
      isAdult: true,
      role: UserRole.agent,
      agencyName: 'Care Travel',
    );
    await repo.upgradeGuest(email: 'g@example.com', password: 'healindia2026', fullName: 'G H', isAdult: true);
    await repo.google(idToken: 'tok');
    await repo.google(idToken: 'tok', isAdult: false);
    await repo.apple(identityToken: 'id', nonce: 'n', isAdult: true);

    final bodies = adapter.requests.map((r) => r.data as Map).toList();
    expect(bodies[0]['is_adult'], isFalse);
    expect(bodies[0]['role'], 'patient');
    expect(bodies[1]['is_adult'], isTrue);
    expect(bodies[1]['role'], 'agent');
    expect(adapter.requests[2].path, '/auth/guest/upgrade');
    expect(bodies[2]['is_adult'], isTrue);
    expect(bodies[3].containsKey('is_adult'), isFalse, reason: 'only sent once the API asks for it');
    expect(bodies[4]['is_adult'], isFalse);
    expect(bodies[5]['is_adult'], isTrue);
  });

  group('Google / Apple sign-in creating a new account', () {
    late _NewAccountRepository repo;
    late ProviderContainer container;

    setUp(() async {
      final tokens = InMemoryTokenStorage();
      repo = _NewAccountRepository(tokens);
      container = ProviderContainer(
        overrides: [tokenStorageProvider.overrideWithValue(tokens), authRepositoryProvider.overrideWithValue(repo)],
      );
      await container.read(authControllerProvider.future);
    });

    tearDown(() => container.dispose());

    test('asks the age question and retries the same call with the answer', () async {
      final asked = <bool>[];
      final user = await container
          .read(authControllerProvider.notifier)
          .signInWithGoogleIdToken(
            'tok',
            askAge: ({required adultOnly}) async {
              asked.add(adultOnly);
              return false; // under 18 with a guardian's consent
            },
          );

      expect(user?.id, 'u1');
      expect(asked, [false], reason: 'patients get both options');
      expect(repo.googleCalls, [null, false]);
      expect(container.read(authStateProvider).isAuthenticated, isTrue);
    });

    test('cancelling the age question cancels the sign-in', () async {
      final user = await container
          .read(authControllerProvider.notifier)
          .signInWithGoogleIdToken('tok', askAge: ({required adultOnly}) async => null);

      expect(user, isNull);
      expect(repo.googleCalls, [null]);
      expect(container.read(authStateProvider).hasSession, isFalse);
    });

    test('without a prompt the API error is passed on', () async {
      await expectLater(
        container.read(authControllerProvider.notifier).signInWithGoogleIdToken('tok'),
        throwsA(isA<ApiException>().having((e) => e.isAgeAttestationRequired, 'age required', isTrue)),
      );
    });
  });

  testWidgets('age dialog: patients pick one of two answers; adult-only accounts can only confirm', (tester) async {
    bool? answer = true;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Column(
            children: [
              TextButton(
                onPressed: () async => answer = await showAgeAttestationDialog(context, adultOnly: false),
                child: const Text('patient'),
              ),
              TextButton(
                onPressed: () async => answer = await showAgeAttestationDialog(context, adultOnly: true),
                child: const Text('agent'),
              ),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.text('patient'));
    await tester.pumpAndSettle();
    expect(find.text(AgeCopy.adult), findsOneWidget);
    expect(find.text(AgeCopy.minor), findsOneWidget);
    final continueButton = find.byKey(const Key('age-continue'));
    expect(tester.widget<FilledButton>(continueButton).onPressed, isNull);
    await tester.tap(find.byKey(const Key('age-minor')));
    await tester.pump();
    await tester.tap(continueButton);
    await tester.pumpAndSettle();
    expect(answer, isFalse);

    await tester.tap(find.text('agent'));
    await tester.pumpAndSettle();
    expect(find.text(AgeCopy.adultConfirm), findsOneWidget);
    expect(find.text(AgeCopy.minor), findsNothing);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(answer, isNull);
  });
}
