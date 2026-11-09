import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/core/repositories/privacy_repository.dart';
import 'package:heal_india_global/features/profile/screens/profile_screen.dart';
import 'package:heal_india_global/features/profile/widgets/privacy_group.dart';

import '../onboarding/fl_harness.dart';

class _FakePrivacyRepository extends PrivacyRepository {
  _FakePrivacyRepository() : super(ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://test.invalid/api/v1'));

  int exports = 0;

  @override
  Future<Uint8List> exportMyData() async {
    exports++;
    return Uint8List.fromList([0x50, 0x4b, 0x03, 0x04]);
  }

  @override
  Future<List<AccessLogEntry>> accessLog() async => [
    AccessLogEntry.fromJson({
      'at': '2026-11-09T10:00:00Z',
      'action': 'phi.download',
      'resource_type': 'document',
      'viewer_role': 'hospital',
      'viewer_name': 'Dr Rao',
    }),
  ];
}

final _profile = PatientProfile.fromJson({'id': 'pp1', 'first_name': 'Amina', 'last_name': 'Yusuf'});

void main() {
  testWidgets('patient downloads their data and sees who viewed their records', (tester) async {
    final repo = _FakePrivacyRepository();
    final saved = <String, int>{};
    await pumpScreen(
      tester,
      path: '/profile',
      screen: (_) => const ProfileScreen(),
      auth: AuthState.fromUser(patientUser),
      overrides: [
        patientProfileProvider.overrideWith((ref) async => _profile),
        companionsProvider.overrideWith((ref) async => const <PatientCompanion>[]),
        privacyRepositoryProvider.overrideWithValue(repo),
        dataExportSaverProvider.overrideWithValue((name, bytes) async {
          saved[name] = bytes.length;
          return true;
        }),
      ],
    );
    await tester.pumpAndSettle();

    final download = find.byKey(const Key('profile-download-data'));
    await tester.scrollUntilVisible(download, 300);
    expect(find.text('Download my data'), findsOneWidget);
    await tester.tap(download);
    await tester.pumpAndSettle();
    expect(repo.exports, 1);
    expect(saved.length, 1);
    expect(saved.keys.single, startsWith('healindia-my-data-'));
    expect(find.text('Your data has been saved'), findsOneWidget);

    await tester.tap(find.byKey(const Key('profile-access-log')));
    await tester.pumpAndSettle();
    expect(find.text('Who viewed my records'), findsWidgets);
    expect(find.text('Dr Rao (Hospital) downloaded a document'), findsOneWidget);
  });

  testWidgets('guest can download their data but has no access log', (tester) async {
    await pumpScreen(
      tester,
      path: '/profile',
      screen: (_) => const ProfileScreen(),
      auth: AuthState.fromUser(guestUser),
      overrides: [privacyRepositoryProvider.overrideWithValue(_FakePrivacyRepository())],
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('profile-download-data')), 300);
    expect(find.byKey(const Key('profile-access-log')), findsNothing);
  });
}
