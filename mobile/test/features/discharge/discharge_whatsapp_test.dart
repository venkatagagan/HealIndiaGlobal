import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/features/discharge/screens/discharge_screens.dart';
import 'package:heal_india_global/features/hospital_portal/screens/hospital_discharge_screens.dart';
import 'package:heal_india_global/features/messages/logic/notification_routes.dart';
import 'package:heal_india_global/features/profile/screens/whatsapp_screen.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import '../agent_portal/portal_test_helpers.dart' show hospitalUser;
import '../phase1/phase1_helpers.dart';

Map<String, Object?> _summary({String status = 'final', bool latest = true, String id = 'ds1'}) => {
  'id': id,
  'case_id': 'c1',
  'case_number': 'HIG-C-1',
  'booking_id': 'b1',
  'booking_number': 'HIG-B-1',
  'patient_id': 'p1',
  'patient_name': 'Ada Obi',
  'hospital_id': 'h1',
  'hospital_name': 'Apollo Chennai',
  'doctor_id': 'd1',
  'doctor_name': 'Dr. Rao',
  'doctor_registration': 'TN-12345',
  'version': 2,
  'supersedes_id': 'ds0',
  'status': status,
  'is_latest': latest,
  'admission_date': '2026-11-01',
  'discharge_date': '2026-11-06',
  'diagnosis': 'Osteoarthritis of the right knee',
  'diagnosis_code': 'M17.11',
  'procedure_name': 'Total knee replacement',
  'procedure_code': null,
  'procedure_date': '2026-11-02',
  'hospital_course': 'Uneventful recovery.',
  'medications': [
    {'name': 'Paracetamol', 'dose': '500 mg', 'frequency': 'Three times a day', 'duration_days': 5, 'route': 'oral'},
    {'name': 'Aspirin', 'dose': '75 mg', 'frequency': 'Once a day'},
  ],
  'follow_up_instructions': 'Physiotherapy daily.',
  'red_flag_symptoms': 'Fever above 38 °C, calf pain or swelling',
  'allergies': 'Penicillin',
  'investigations_summary': null,
  'attachments': [
    {
      'id': 'doc-xray',
      'file_name': 'xray.pdf',
      'content_type': 'application/pdf',
      'size_bytes': 2048,
      'kind': 'imaging',
    },
  ],
  'pdf_document_id': 'doc-pdf',
  'finalized_at': status == 'final' ? '2026-11-06T10:00:00Z' : null,
  'finalized_by_user_id': null,
  'superseded_at': null,
  'created_at': '2026-11-05T10:00:00Z',
  'updated_at': '2026-11-06T10:00:00Z',
};

Map<String, Object?> _share({String id = 'sh1', bool active = true, String? url}) => {
  'id': id,
  'discharge_summary_id': 'ds1',
  'doctor_email_masked': 'd***@clinic.ng',
  'doctor_name': 'Dr. Eze',
  'document_ids': ['doc-pdf'],
  'language': 'en',
  'expires_at': '2026-11-20T10:00:00Z',
  'revoked_at': active ? null : '2026-11-10T10:00:00Z',
  'view_count': 2,
  'last_viewed_at': null,
  'created_at': '2026-11-06T11:00:00Z',
  'active': active,
  'url': ?url,
};

Map<String, Object?> _wa(String status, {bool available = true}) => {
  'available': available,
  'status': status,
  'phone_masked': status == 'none' ? null : '+234*****567',
  'verified_at': status == 'active' ? '2026-11-08T09:00:00Z' : null,
  'opted_in_at': status == 'active' ? '2026-11-08T09:00:00Z' : null,
  'opted_out_at': null,
  'code_expires_at': status == 'pending' ? '2026-11-08T09:10:00Z' : null,
};

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  group('models', () {
    test('DischargeSummary parses every section', () {
      final s = DischargeSummary.fromJson(_summary());
      expect(s.id, 'ds1');
      expect(s.status, DischargeStatus.finalized);
      expect(s.isFinal, isTrue);
      expect(s.isSuperseded, isFalse);
      expect(s.version, 2);
      expect(s.dischargeDate, DateTime(2026, 11, 6));
      expect(s.medications, hasLength(2));
      expect(s.medications.first.durationDays, 5);
      expect(s.medications.last.durationDays, isNull);
      expect(s.attachments.single.toDocument().kind, DocumentKind.imaging);
      expect(s.redFlagSymptoms, contains('Fever'));
      expect(DischargeSummary.fromJson(_summary(latest: false)).isSuperseded, isTrue);
      expect(DischargeSummary.fromJson(_summary(status: 'draft')).isDraft, isTrue);
    });

    test('list item, prefill, share and reminder JSON', () {
      final item = DischargeSummaryListItem.fromJson({
        'id': 'ds1',
        'case_id': 'c1',
        'version': 1,
        'status': 'draft',
        'is_latest': true,
        'discharge_date': '2026-11-06',
        'updated_at': '2026-11-06T10:00:00Z',
      });
      expect(item.isDraft, isTrue);

      final prefill = DischargePrefill.fromJson({
        'case_id': 'c1',
        'booking_id': 'b1',
        'doctor_id': 'd1',
        'doctor_name': 'Dr. Rao',
        'admission_date': '2026-11-01',
        'discharge_date': '2026-11-06',
        'allergies': null,
        'available_documents': [
          {'id': 'doc1', 'file_name': 'mri.pdf', 'content_type': 'application/pdf', 'size_bytes': 1, 'kind': 'imaging'},
        ],
      });
      expect(prefill.availableDocuments.single.fileName, 'mri.pdf');
      expect(prefill.toCreateJson(), {
        'case_id': 'c1',
        'booking_id': 'b1',
        'doctor_id': 'd1',
        'doctor_name': 'Dr. Rao',
        'admission_date': '2026-11-01',
        'discharge_date': '2026-11-06',
      });

      final share = DischargeShare.fromJson(_share(url: 'https://x/share/t'));
      expect(share.active, isTrue);
      expect(share.url, 'https://x/share/t');
      expect(share.viewCount, 2);
      expect(DischargeShare.fromJson(_share(active: false)).isRevoked, isTrue);

      final reminder = MedicationReminder.fromJson({
        'id': 'r1',
        'discharge_summary_id': 'ds1',
        'name': 'Paracetamol',
        'start_on': '2026-11-06',
        'end_on': null,
        'enabled': true,
        'remind_hour': 20,
        'timezone': '+01:00',
      });
      expect(reminder.enabled, isTrue);
      expect(reminder.remindHour, 20);
      expect(reminder.endOn, isNull);
    });

    test('draft and share request bodies', () {
      final draft = DischargeDraft(
        doctorId: 'd1',
        doctorName: ' Dr. Rao ',
        doctorRegistration: '',
        dischargeDate: DateTime(2026, 11, 6),
        diagnosis: 'Knee OA',
        medications: const [DischargeMedication(name: 'Paracetamol', dose: '500 mg', durationDays: 5)],
        attachmentDocumentIds: const ['doc1'],
      );
      final json = draft.toJson();
      expect(json['doctor_name'], 'Dr. Rao');
      expect(json.containsKey('doctor_registration'), isTrue);
      expect(json['doctor_registration'], isNull);
      expect(json['discharge_date'], '2026-11-06');
      expect(json['medications'], [
        {'name': 'Paracetamol', 'dose': '500 mg', 'duration_days': 5},
      ]);
      // A doctor picked from the list: the server fills the registration number.
      final picked = const DischargeDraft(doctorId: 'd1', registrationFromDoctor: true).toJson();
      expect(picked.containsKey('doctor_registration'), isFalse);

      expect(
        const DischargeShareRequest(
          doctorEmail: ' doc@clinic.ng ',
          doctorName: '',
          documentIds: ['doc1'],
          expiresInDays: 7,
          language: 'fr',
          consent: true,
        ).toJson(),
        {
          'doctor_email': 'doc@clinic.ng',
          'document_ids': ['doc1'],
          'expires_in_days': 7,
          'language': 'fr',
          'consent': true,
        },
      );
    });

    test('WhatsApp status, phone and code checks, UTC offsets', () {
      final s = WhatsAppStatus.fromJson(_wa('pending'));
      expect(s.isPending, isTrue);
      expect(s.phoneMasked, '+234*****567');
      expect(s.codeExpiresAt, isNotNull);
      expect(WhatsAppStatus.fromJson(_wa('opted_out')).status, WhatsAppOptInStatus.optedOut);
      expect(WhatsAppStatus.fromJson(const {'available': false, 'status': 'weird'}).status, WhatsAppOptInStatus.none);

      expect(isPlausibleE164('+234 803 123 4567'), isTrue);
      expect(isPlausibleE164('+91-98765-43210'), isTrue);
      expect(isPlausibleE164('08031234567'), isFalse);
      expect(isPlausibleE164('+12'), isFalse);
      expect(isWhatsAppCode('123456'), isTrue);
      expect(isWhatsAppCode('12345a'), isFalse);

      expect(utcOffsetString(Duration.zero), 'UTC');
      expect(utcOffsetString(const Duration(hours: 5, minutes: 30)), '+05:30');
      expect(utcOffsetString(const Duration(hours: -3)), '-03:00');
    });
  });

  group('notifications', () {
    test('discharge notifications open the summary', () {
      AppNotification n(String kind) => AppNotification.fromJson({
        'id': 'n1',
        'kind': kind,
        'title': 't',
        'data': {'discharge_summary_id': 'ds1', 'case_id': 'c1', 'link': '/discharge-summaries/ds1'},
      });
      expect(notificationTarget(n('discharge_summary.finalized')), '/discharge-summaries/ds1');
      expect(notificationTarget(n('aftercare.medication_reminder')), '/discharge-summaries/ds1');
      expect(pushLinkRoute('/discharge-summaries/ds1', UserRole.patient), '/discharge-summaries/ds1');
      expect(pushLinkRoute('/discharge-summaries/ds1', UserRole.agent), '/agent/discharge-summaries/ds1');
      expect(pushLinkRoute('/discharge-summaries/ds1', UserRole.hospital), '/hospital/discharge-summaries/ds1');
    });
  });

  testWidgets('WhatsApp: number -> code (wrong, then right) -> on', (tester) async {
    var status = 'none';
    var attempts = 0;
    final adapter = RoutedAdapter({
      'GET /me/whatsapp': (_) => _wa(status),
      'POST /me/whatsapp/verify': (_) {
        status = 'pending';
        return _wa(status);
      },
      'POST /me/whatsapp/confirm': (r) {
        if (bodyOf(r)['code'] != '123456') {
          attempts++;
          return apiError(400, 'invalid_code', details: {'attempts_left': 5 - attempts});
        }
        status = 'active';
        return _wa(status);
      },
    });
    await pumpWithApi(tester, path: '/profile/whatsapp', screen: (_) => const WhatsAppScreen(), adapter: adapter);
    await tester.pumpAndSettle();
    expect(find.textContaining('Medical details are never sent on WhatsApp'), findsOneWidget);
    expect(find.textContaining('replying STOP'), findsOneWidget);
    expect(find.text('Off'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField), '0803');
    await tester.tap(find.byKey(const ValueKey('whatsapp-send-code')));
    await tester.pumpAndSettle();
    expect(find.textContaining('with the country code'), findsOneWidget);
    expect(adapter.last('POST', '/me/whatsapp/verify'), isNull);

    await tester.enterText(find.byType(TextFormField), '+234 803 123 4567');
    await tester.tap(find.byKey(const ValueKey('whatsapp-send-code')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/me/whatsapp/verify')), {'phone': '+234 803 123 4567'});
    expect(find.byKey(const ValueKey('whatsapp-code-sent')), findsOneWidget);
    expect(find.text('Waiting for code'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField), '111111');
    await tester.tap(find.byKey(const ValueKey('whatsapp-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('The code is not correct. 4 attempts left.'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField), '123456');
    await tester.tap(find.byKey(const ValueKey('whatsapp-confirm')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('whatsapp-active')), findsOneWidget);
    expect(find.text('Updates go to +234*****567.'), findsOneWidget);
    expect(find.text('On'), findsOneWidget);
  });

  testWidgets('WhatsApp not configured: explained and disabled', (tester) async {
    final adapter = RoutedAdapter({'GET /me/whatsapp': (_) => _wa('none', available: false)});
    await pumpWithApi(tester, path: '/profile/whatsapp', screen: (_) => const WhatsAppScreen(), adapter: adapter);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('whatsapp-unavailable')), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.descendant(of: find.byKey(const ValueKey('whatsapp-send-code')), matching: find.byType(FilledButton)),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('patient summary: red flags, medicines, share with consent, revoke', (tester) async {
    final adapter = RoutedAdapter({
      'GET /discharge-summaries/ds1': (_) => _summary(),
      'GET /discharge-summaries/ds1/shares': (_) => [_share()],
      'GET /discharge-summaries/ds1/medication-reminders': (_) => const [],
      'GET /documents': (_) => page([
        {
          'id': 'doc-own',
          'kind': 'lab_result',
          'file_name': 'blood.pdf',
          'content_type': 'application/pdf',
          'size_bytes': 10,
          'status': 'uploaded',
        },
      ]),
      'POST /discharge-summaries/ds1/shares': (_) => (201, _share(id: 'sh2', url: 'https://hig.test/share/abc')),
      'DELETE /discharge-summaries/ds1/shares/sh1': (_) => _share(active: false),
    });
    await pumpWithApi(
      tester,
      path: '/discharge-summaries/:id',
      initialLocation: '/discharge-summaries/ds1',
      screen: (s) => DischargeDetailScreen(summaryId: s.pathParameters['id']!),
      adapter: adapter,
      logicalSize: const Size(520, 4000),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('discharge-red-flags')), findsOneWidget);
    expect(find.text('Get medical help straight away if you notice:'), findsOneWidget);
    expect(find.text('Fever above 38 °C, calf pain or swelling'), findsOneWidget);
    expect(find.text('Paracetamol'), findsOneWidget);
    expect(find.text('500 mg · Three times a day · oral · For 5 days'), findsOneWidget);
    expect(find.text('75 mg · Once a day · Ongoing'), findsOneWidget);
    expect(find.text('Code: M17.11'), findsOneWidget);
    expect(find.byKey(const ValueKey('discharge-pdf')), findsOneWidget);
    expect(find.byKey(const ValueKey('discharge-fhir')), findsOneWidget);
    expect(find.byKey(const ValueKey('discharge-reminders')), findsOneWidget);
    expect(find.text('Dr. Eze · d***@clinic.ng'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('discharge-share')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('discharge-share-email')), 'doc@clinic.ng');
    await tester.tap(find.byKey(const ValueKey('discharge-share-doc-doc-own')));
    await tester.ensureVisible(find.byKey(const ValueKey('discharge-share-send')));
    await tester.tap(find.byKey(const ValueKey('discharge-share-send')));
    await tester.pumpAndSettle();
    expect(find.text('Please tick the box to agree before sharing.'), findsOneWidget);
    expect(adapter.last('POST', '/discharge-summaries/ds1/shares'), isNull);

    await tester.tap(find.byKey(const ValueKey('discharge-share-consent')));
    await tester.tap(find.byKey(const ValueKey('discharge-share-send')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/discharge-summaries/ds1/shares')), {
      'doctor_email': 'doc@clinic.ng',
      'document_ids': ['doc-own'],
      'expires_in_days': 14,
      'language': 'en',
      'consent': true,
    });
    expect(find.text('Link sent'), findsOneWidget);
    expect(find.byKey(const ValueKey('discharge-share-url')), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('discharge-share-revoke-sh1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('discharge-share-revoke-confirm')));
    await tester.pumpAndSettle();
    expect(adapter.last('DELETE', '/discharge-summaries/ds1/shares/sh1'), isNotNull);
  });

  testWidgets('medicine reminders: switch on at the chosen hour with the device offset', (tester) async {
    var enabled = false;
    final adapter = RoutedAdapter({
      'GET /discharge-summaries/ds1': (_) => _summary(),
      'GET /discharge-summaries/ds1/shares': (_) => const [],
      'GET /discharge-summaries/ds1/medication-reminders': (_) => [
        {
          'id': 'r1',
          'discharge_summary_id': 'ds1',
          'name': 'Paracetamol',
          'start_on': '2026-11-06',
          'end_on': '2026-11-11',
          'enabled': enabled,
          'remind_hour': 9,
          'timezone': 'UTC',
        },
      ],
      'PUT /discharge-summaries/ds1/medication-reminders': (r) {
        enabled = bodyOf(r)['enabled'] == true;
        return const [];
      },
    });
    await pumpWithApi(
      tester,
      path: '/discharge-summaries/:id',
      initialLocation: '/discharge-summaries/ds1',
      screen: (s) => DischargeDetailScreen(summaryId: s.pathParameters['id']!),
      adapter: adapter,
      logicalSize: const Size(520, 4000),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('discharge-reminders-switch')));
    await tester.pumpAndSettle();
    final body = bodyOf(adapter.last('PUT', '/discharge-summaries/ds1/medication-reminders'));
    expect(body['enabled'], isTrue);
    expect(body['remind_hour'], 9);
    expect(body['timezone'], utcOffsetString(DateTime.now().timeZoneOffset));
  });

  testWidgets('hospital editor: add a medicine, finalize reports missing fields', (tester) async {
    final adapter = RoutedAdapter({
      'GET /discharge-summaries/ds1': (_) => _summary(status: 'draft'),
      'GET /discharge-summaries/prefill': (_) => {
        'case_id': 'c1',
        'booking_id': 'b1',
        'available_documents': [
          {
            'id': 'doc-xray',
            'file_name': 'xray.pdf',
            'content_type': 'application/pdf',
            'size_bytes': 2048,
            'kind': 'imaging',
          },
        ],
      },
      'PATCH /discharge-summaries/ds1': (_) => _summary(status: 'draft'),
      'POST /discharge-summaries/ds1/finalize': (_) =>
          apiError(400, 'discharge_incomplete', details: ['diagnosis', 'follow_up_instructions']),
    });
    await pumpWithApi(
      tester,
      path: '/hospital/discharge-summaries/:id',
      initialLocation: '/hospital/discharge-summaries/ds1',
      screen: (s) => HospitalDischargeEditorScreen(summaryId: s.pathParameters['id']!),
      adapter: adapter,
      auth: AuthState.fromUser(hospitalUser),
      logicalSize: const Size(520, 5000),
    );
    await tester.pumpAndSettle();
    expect(find.text('Edit discharge summary'), findsOneWidget);
    expect(find.byKey(const ValueKey('discharge-hp-med-1')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('discharge-hp-add-med')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('discharge-med-save')));
    await tester.pumpAndSettle();
    expect(find.text('Enter the medicine name.'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('discharge-med-name')), 'Pantoprazole');
    await tester.enterText(find.byKey(const ValueKey('discharge-med-duration')), '14');
    await tester.tap(find.byKey(const ValueKey('discharge-med-save')));
    await tester.pumpAndSettle();
    expect(find.text('Pantoprazole'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('discharge-hp-finalize')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.widgetWithText(FilledButton, 'Finalize')),
    );
    await tester.pumpAndSettle();
    final patch = bodyOf(adapter.last('PATCH', '/discharge-summaries/ds1'));
    expect((patch['medications'] as List).last, {'name': 'Pantoprazole', 'duration_days': 14});
    expect(patch['attachment_document_ids'], ['doc-xray']);
    expect(adapter.last('POST', '/discharge-summaries/ds1/finalize'), isNotNull);
    expect(find.text('Fill in before finalizing: Diagnosis · Follow-up instructions'), findsOneWidget);
  });
}
