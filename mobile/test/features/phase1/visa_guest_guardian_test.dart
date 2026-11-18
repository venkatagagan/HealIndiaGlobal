import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_exception.dart';
import 'package:heal_india_global/core/widgets/widgets.dart';
import 'package:heal_india_global/features/guest/screens/free_consultation_screen.dart';
import 'package:heal_india_global/features/hospital_portal/data/hospital_models.dart';
import 'package:heal_india_global/features/hospital_portal/widgets/invitation_letter_sheet.dart';
import 'package:heal_india_global/features/trips/screens/visa_guide_screen.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import 'phase1_helpers.dart';

final _guide = {
  'nationality': 'NG',
  'country_name': 'Nigeria',
  'visa_route': 'e_visa',
  'visa_type': 'e_medical',
  'attendant_visa_type': 'e_medical_attendant',
  'max_attendants': 2,
  'typical_processing_days': 3,
  'official_url': 'https://indianvisaonline.gov.in/evisa/',
  'is_default': false,
  'checklist': [
    {'item_key': 'passport', 'title': 'Passport valid 6 months', 'required': true, 'sort_order': 1, 'visa_route': 'e_visa'},
    {'item_key': 'photo', 'title': 'Recent photo', 'required': false, 'sort_order': 2, 'visa_route': 'e_visa'},
  ],
};

Map<String, Object?> _intro(String status, {String? scheduled, String? url}) => {
  'id': 'i1',
  'status': status,
  'kind': 'free_intro',
  'full_name': 'Amina Yusuf',
  'contact_channel': 'email',
  'contact_masked': 'a***@example.com',
  'preferred_from': '2026-11-19T09:00:00Z',
  'preferred_to': '2026-11-19T12:00:00Z',
  'scheduled_at': ?scheduled,
  'duration_min': 15,
  'meeting_url': ?url,
  'created_at': '2026-11-18T10:00:00Z',
};

Future<void> _walkToCode(WidgetTester tester) async {
  await tester.enterText(find.byKey(const ValueKey('guest-name')), 'Amina Yusuf');
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('guest-next-name')));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const ValueKey('guest-contact')), 'amina@example.com');
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('guest-send-code')));
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  testWidgets('visa guide: route, processing, attendants, checklist kept on the device', (tester) async {
    final adapter = RoutedAdapter({'GET /travel/visa-guide': (_) => _guide});
    await pumpWithApi(
      tester,
      path: '/visa-guide',
      initialLocation: '/visa-guide?nationality=NG',
      screen: (s) => VisaGuideScreen(nationality: s.uri.queryParameters['nationality']),
      adapter: adapter,
      logicalSize: const Size(420, 1400),
    );
    await tester.pumpAndSettle();
    expect(adapter.last('GET', '/travel/visa-guide')!.query['nationality'], 'NG');
    expect(find.text('For Nigeria passport holders'), findsOneWidget);
    expect(find.text('e-Medical visa (apply online)'), findsOneWidget);
    expect(find.text('Usually 3 days to process'), findsOneWidget);
    expect(find.text('Up to 2 attendants can travel with you'), findsOneWidget);
    expect(find.text('0 of 2 ready'), findsOneWidget);
    expect(find.byKey(const ValueKey('visa-guide-official')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('visa-item-passport')));
    await tester.pumpAndSettle();
    expect(find.text('1 of 2 ready'), findsOneWidget);
  });

  testWidgets('hospital invitation letter: generate, see missing details, approve', (tester) async {
    final adapter = RoutedAdapter({
      'POST /hospital-portal/visa-requests/v1/invitation-letter/generate': (_) => {
        'visa_request_id': 'v1',
        'visa_status': 'documents_pending',
        'draft_document_id': 'doc-draft',
        'generated_at': '2026-11-18T10:00:00Z',
        'missing': ['passport_number', 'treating_doctor'],
      },
      'POST /hospital-portal/visa-requests/v1/invitation-letter/approve': (_) => {
        'visa_request_id': 'v1',
        'visa_status': 'invitation_issued',
        'document_id': 'doc-final',
        'missing': [],
      },
    });
    const visa = HospitalVisaRequest(
      id: 'v1',
      caseId: 'c1',
      visaType: VisaType.eMedical,
      status: VisaStatus.documentsPending,
      patientName: 'Amina Yusuf',
      caseNumber: 'HIG-C-1',
    );
    await pumpWithApi(
      tester,
      path: '/x',
      // Opened as a sheet (it pops itself once approved), like from the visa requests screen.
      screen: (_) => Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => showModalBottomSheet<bool>(
              context: context,
              isScrollControlled: true,
              builder: (_) => const InvitationLetterSheet(visa: visa),
            ),
            child: const Text('open'),
          ),
        ),
      ),
      adapter: adapter,
      logicalSize: const Size(420, 1600),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('invite-approve')), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, 'Estimated stay in India (days)'), '10');
    await tester.tap(find.byKey(const ValueKey('invite-generate')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/hospital-portal/visa-requests/v1/invitation-letter/generate')), {
      'estimated_duration_days': 10,
    });
    expect(find.text('The letter is missing:'), findsOneWidget);
    expect(find.text("• Patient's passport number"), findsOneWidget);
    expect(find.text('• Treating doctor'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('invite-approve')));
    await tester.pumpAndSettle();
    expect(adapter.last('POST', '/hospital-portal/visa-requests/v1/invitation-letter/approve'), isNotNull);
  });

  testWidgets('guest free call: name, email, code (wrong code shows attempts left), details, status', (tester) async {
    var confirmCalls = 0;
    var booked = false;
    final adapter = RoutedAdapter({
      'GET /guest/consultation': (_) => booked ? _intro('requested') : apiError(404, 'not_found'),
      'POST /guest/verify/start': (_) => (
        201,
        {
          'verification_id': 'ver1',
          'channel': 'email',
          'contact_masked': 'a***@example.com',
          'expires_at': '2026-11-18T10:10:00Z',
        },
      ),
      'POST /guest/verify/confirm': (_) => ++confirmCalls == 1
          ? apiError(400, 'invalid_code', details: {'attempts_left': 4})
          : {
              'verification_id': 'ver1',
              'verified': true,
              'channel': 'email',
              'contact_masked': 'a***@example.com',
              'valid_until': '2026-11-18T11:00:00Z',
            },
      'POST /guest/consultation': (_) {
        booked = true;
        return (201, _intro('requested'));
      },
      'GET /documents': (_) => const [],
    });
    await pumpWithApi(
      tester,
      path: '/free-consultation',
      screen: (_) => const FreeConsultationScreen(),
      adapter: adapter,
      auth: AuthState.fromUser(guestUser),
      logicalSize: const Size(420, 1400),
    );
    await tester.pumpAndSettle();
    expect(find.text('Free 15-minute video consultation'), findsOneWidget);

    await _walkToCode(tester);
    expect(bodyOf(adapter.last('POST', '/guest/verify/start')), {'channel': 'email', 'contact': 'amina@example.com'});
    expect(find.text('Enter the 6-digit code we sent to a***@example.com.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('guest-code')), '111111');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('guest-verify')));
    await tester.pumpAndSettle();
    expect(find.text('That code is not right. 4 attempts left.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('guest-code')), '123456');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('guest-verify')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const ValueKey('guest-question')), 'Is knee replacement possible?');
    await tester.tap(find.byKey(const ValueKey('guest-book')));
    await tester.pumpAndSettle();
    final req = adapter.last('POST', '/guest/consultation')!;
    final body = bodyOf(req);
    expect(body['verification_id'], 'ver1');
    expect(body['full_name'], 'Amina Yusuf');
    expect(body['question'], 'Is knee replacement possible?');
    expect(body['preferred_from'], isNotNull);
    expect(body['timezone'], isNotNull);
    expect(req.headers['X-Device-Id'], isA<String>());
    expect(find.text(routeLabel('/free-consultation/status')), findsOneWidget);
  });

  testWidgets('guest free call: SMS unavailable falls back to email; already used is explained', (tester) async {
    final adapter = RoutedAdapter({
      'GET /guest/consultation': (_) => apiError(404, 'not_found'),
      'POST /guest/verify/start': (r) => bodyOf(r)['channel'] == 'phone'
          ? apiError(400, 'sms_unavailable')
          : (201, {'verification_id': 'ver1', 'channel': 'email', 'contact_masked': 'a***@example.com'}),
      'POST /guest/verify/confirm': (_) => {'verification_id': 'ver1', 'verified': true, 'channel': 'email', 'contact_masked': 'a***@example.com'},
      'POST /guest/consultation': (_) => apiError(409, 'free_consultation_used'),
      'GET /documents': (_) => const [],
    });
    await pumpWithApi(
      tester,
      path: '/free-consultation',
      screen: (_) => const FreeConsultationScreen(),
      adapter: adapter,
      auth: AuthState.fromUser(guestUser),
      logicalSize: const Size(420, 1400),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('guest-name')), 'Amina');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('guest-next-name')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Phone'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('guest-contact')), '+2348031234567');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('guest-send-code')));
    await tester.pumpAndSettle();
    expect(find.text('Text messages are not available yet — please use your email address.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('guest-contact')), 'amina@example.com');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('guest-send-code')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('guest-code')), '123456');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('guest-verify')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('guest-book')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('guest-used')), findsOneWidget);
    expect(find.text('Free call already used'), findsOneWidget);
  });

  testWidgets('status screen shows the scheduled call, Join and create-account prompt', (tester) async {
    final adapter = RoutedAdapter({
      'GET /guest/consultation': (_) => _intro('scheduled', scheduled: '2026-11-19T10:30:00Z', url: 'https://meet.jit.si/hig-intro'),
    });
    await pumpWithApi(
      tester,
      path: '/free-consultation/status',
      screen: (_) => const FreeConsultationStatusScreen(),
      adapter: adapter,
      auth: AuthState.fromUser(guestUser),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your call is booked'), findsOneWidget);
    expect(find.byKey(const ValueKey('guest-join')), findsOneWidget);
    expect(find.byKey(const ValueKey('guest-create-account')), findsOneWidget);
  });

  testWidgets('guest free call renders right-to-left in Arabic without overflow', (tester) async {
    final adapter = RoutedAdapter({
      'GET /guest/consultation': (_) => apiError(404, 'not_found'),
      'POST /guest/verify/start': (_) => (201, {'verification_id': 'ver1', 'channel': 'email', 'contact_masked': 'a***@example.com'}),
      'GET /documents': (_) => const [],
    });
    await pumpWithApi(
      tester,
      path: '/free-consultation',
      screen: (_) => const FreeConsultationScreen(),
      adapter: adapter,
      auth: AuthState.fromUser(guestUser),
      locale: const Locale('ar'),
      logicalSize: const Size(360, 780),
    );
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(FreeConsultationScreen));
    expect(Directionality.of(context), TextDirection.rtl);
    expect(find.text(lookupAppLocalizations(const Locale('ar')).guestFreeTitle), findsOneWidget);
    await _walkToCode(tester);
    expect(find.byKey(const ValueKey('guest-code')), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'layout overflow or build error in Arabic');
  });

  test('guest AI quota and guardian consent errors get the app\'s own wording', () {
    final quota = ApiException.fromResponse(429, {
      'error': {
        'code': 'rate_limited',
        'message': 'Too many',
        'details': {'scope': 'guest_ai_daily', 'guest_upgrade_available': true},
      },
    });
    expect(quota.isGuestAiLimit, isTrue);
    expect(quota.message, "You've used today's 3 free scans — create a free account to continue.");
    final minor = ApiException.fromResponse(403, {
      'error': {'code': 'guardian_consent_required', 'message': 'x'},
    });
    expect(minor.isGuardianConsentRequired, isTrue);
    expect(minor.isGuestAiLimit, isFalse);
  });

  testWidgets('a guest over the AI limit is offered a free account', (tester) async {
    final quota = ApiException.fromResponse(429, {
      'error': {
        'code': 'rate_limited',
        'details': {'scope': 'guest_ai_daily'},
      },
    });
    await pumpWithApi(
      tester,
      path: '/x',
      screen: (_) => Scaffold(body: ErrorView(error: quota)),
      adapter: RoutedAdapter({}),
      auth: AuthState.fromUser(guestUser),
    );
    await tester.tap(find.byKey(const ValueKey('error-guest-upgrade')));
    await tester.pumpAndSettle();
    expect(find.textContaining('route:/auth/register?from='), findsOneWidget);
  });

  testWidgets('guardian consent required opens the form and records the consent', (tester) async {
    final adapter = RoutedAdapter({
      'POST /privacy/guardian-consent': (_) => (
        201,
        {'id': 'g1', 'patient_id': 'pt1', 'guardian_name': 'Fatima Yusuf', 'relationship': 'parent', 'verification_method': 'video_call', 'created_at': '2026-11-18T10:00:00Z'},
      ),
      'GET /privacy/guardian-consent': (_) => {'is_minor': true, 'date_of_birth_known': true, 'satisfied': false},
    });
    final minor = ApiException.fromResponse(403, {
      'error': {'code': 'guardian_consent_required', 'message': 'x'},
    });
    await pumpWithApi(
      tester,
      path: '/x',
      screen: (_) => Scaffold(
        body: Builder(
          builder: (context) => TextButton(onPressed: () => showErrorSnack(context, minor), child: const Text('fail')),
        ),
      ),
      adapter: adapter,
      logicalSize: const Size(420, 1400),
    );
    await tester.tap(find.text('fail'));
    await tester.pumpAndSettle();
    expect(find.text('Consent from a parent or guardian'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('guardian-name')), 'Fatima Yusuf');
    await tester.enterText(find.byKey(const ValueKey('guardian-email')), 'fatima@example.com');
    await tester.tap(find.byKey(const ValueKey('guardian-dob')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('guardian-submit')));
    await tester.pumpAndSettle();
    expect(find.text('The guardian must tick the declaration.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('guardian-declaration')));
    await tester.tap(find.byKey(const ValueKey('guardian-submit')));
    await tester.pumpAndSettle();
    final body = bodyOf(adapter.last('POST', '/privacy/guardian-consent'));
    expect(body['guardian_name'], 'Fatima Yusuf');
    expect(body['relationship'], 'parent');
    expect(body['guardian_email'], 'fatima@example.com');
    expect(body['verification_method'], 'video_call');
    expect(body['declaration'], isTrue);
    expect(body['guardian_date_of_birth'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
  });
}
