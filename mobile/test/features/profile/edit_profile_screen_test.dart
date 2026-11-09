import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/features/profile/screens/edit_profile_screen.dart';

import '../onboarding/fl_harness.dart';

class _FakePatientRepository extends PatientRepository {
  _FakePatientRepository() : super(ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://test.invalid/api/v1'));

  final List<Map<String, dynamic>> updates = [];

  @override
  Future<PatientProfile> updateProfile(PatientProfileUpdate update) async {
    final json = update.toJson();
    updates.add(json);
    return PatientProfile.fromJson({'id': 'pp1', 'passport_last4': '9876', ...json});
  }
}

void main() {
  testWidgets('passport is write-only, emergency contact is all-or-nothing, save sends the update', (tester) async {
    final repo = _FakePatientRepository();
    final profile = PatientProfile.fromJson({
      'id': 'pp1',
      // Same name as the signed-in user, so no PATCH /auth/me is attempted.
      'first_name': 'Amina',
      'last_name': 'Yusuf',
      'passport_last4': '4321',
      'preferred_currency': 'USD',
    });
    await pumpScreen(
      tester,
      path: '/profile/edit',
      screen: (_) => const EditProfileScreen(),
      auth: AuthState.fromUser(patientUser),
      // Tall enough that the whole form is built (no lazy ListView children to scroll to).
      logicalSize: const Size(520, 3600),
      overrides: [
        patientRepositoryProvider.overrideWithValue(repo),
        patientProfileProvider.overrideWith((ref) async => profile),
      ],
    );
    await tester.pumpAndSettle();

    final passport = find.widgetWithText(TextFormField, 'New passport number');
    expect(find.textContaining('On file: •••• 4321'), findsOneWidget);
    await tester.enterText(passport, 'a1234-567');

    final ecName = find.widgetWithText(TextFormField, 'Name');
    await tester.enterText(ecName, 'Musa Yusuf');

    final save = find.text('Save changes');
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(repo.updates, isEmpty);
    expect(find.text('Please fix the highlighted fields.'), findsOneWidget);

    final ecRel = find.widgetWithText(TextFormField, 'Relationship');
    await tester.enterText(ecRel, 'Brother');
    final ecPhone = find.widgetWithText(TextFormField, 'Phone').last;
    await tester.enterText(ecPhone, '+234 803 111 1111');

    await tester.tap(save);
    await tester.pumpAndSettle();

    expect(repo.updates, hasLength(1));
    final sent = repo.updates.single;
    expect(sent['passport_number'], 'A1234-567');
    expect(sent['emergency_contact'], {'name': 'Musa Yusuf', 'relationship': 'Brother', 'phone': '+234 803 111 1111'});
    expect(sent['preferred_currency'], 'USD');
    expect(sent.containsKey('insurance_policy_number'), isFalse);
  });
}
