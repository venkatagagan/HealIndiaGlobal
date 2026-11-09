import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';

void main() {
  group('enums', () {
    test('map wire values both ways and fall back on unknown values', () {
      expect(BookingStatus.fromJson('pending_payment'), BookingStatus.pendingPayment);
      expect(BookingStatus.pendingPayment.json, 'pending_payment');
      expect(CaseStatus.fromJsonOrNull('in_treatment'), CaseStatus.inTreatment);
      expect(DocumentKind.fromJson('something_new'), DocumentKind.other);
      expect(ConversationKind.fromJson('case'), ConversationKind.caseThread);
      expect(PackageTier.medicalStay.label, 'Medical + Stay');
      expect(BookingStatus.pendingPayment.label, 'Pending payment');
      expect(UserRole.fromJsonOrNull(null), isNull);
    });
  });

  group('auth', () {
    test('AuthSession (TokenOut) parses user and refresh token', () {
      final s = AuthSession.fromJson({
        'access_token': 'acc',
        'token_type': 'bearer',
        'expires_in': 900,
        'refresh_token': 'ref',
        'user': {
          'id': 'u1',
          'email': null,
          'full_name': '',
          'role': 'patient',
          'status': 'active',
          'is_guest': true,
          'email_verified': false,
          'mfa_enabled': false,
          'preferred_language': 'en',
          'created_at': '2026-10-01T10:00:00Z',
          'patient_profile_id': 'p1',
        },
      });
      expect(s.accessToken, 'acc');
      expect(s.refreshToken, 'ref');
      expect(s.user.isGuest, isTrue);
      expect(s.user.role, UserRole.patient);
      expect(s.user.displayName, 'Guest');
      expect(User.fromJson(s.user.toJson()).patientProfileId, 'p1');
    });
  });

  group('catalog', () {
    test('HospitalDetail with doctors, procedures, packages and string decimals', () {
      final h = HospitalDetail.fromJson({
        'id': 'h1',
        'slug': 'apollo-delhi',
        'name': 'Apollo Hospitals',
        'city': 'New Delhi',
        'state': 'Delhi',
        'accreditations': ['jci', 'nabh'],
        'rating_avg': '4.8',
        'rating_count': 230,
        'specialties': ['Cardiology'],
        'languages': ['English', 'Arabic'],
        'international_desk': true,
        'starting_price_minor': 50000000,
        'currency': 'INR',
        'lat': '28.5672',
        'lng': 77.21,
        'airport_distance_km': '14.5',
        'doctors': [
          {
            'id': 'd1',
            'slug': 'arjun-sharma',
            'full_name': 'Dr. Arjun Sharma',
            'gender': 'male',
            'specialty': {'id': 's1', 'slug': 'cardiology', 'name': 'Cardiologist'},
            'qualifications': ['MBBS', 'MD', 'FACC'],
            'experience_years': 15,
            'success_rate_pct': '98.00',
            'rating_avg': 4.8,
            'rating_count': 230,
            'hospital': {'id': 'h1', 'slug': 'apollo-delhi', 'name': 'Apollo Hospitals', 'city': 'New Delhi'},
          },
        ],
        'procedures': [
          {
            'id': 'hp1',
            'hospital_id': 'h1',
            'procedure': {'id': 'p1', 'slug': 'cabg', 'name': 'CABG'},
            'price_min_minor': 50000000,
            'price_max_minor': 70000000,
            'currency': 'INR',
            'packages': [
              {
                'id': 'pk1',
                'name': 'Medical Only',
                'tier': 'medical_only',
                'price_minor': 250000,
                'original_price_minor': 300000,
                'currency': 'USD',
                'includes': {'accommodation_nights': 0, 'airport_pickup': true},
              },
            ],
          },
        ],
        'reviews': [],
      });
      expect(h.ratingAvg, 4.8);
      expect(h.lat, closeTo(28.5672, 1e-9));
      expect(h.airportDistanceKm, 14.5);
      expect(h.isJci, isTrue);
      expect(h.location, 'New Delhi, Delhi');
      expect(h.doctors.single.successRatePct, 98);
      expect(h.doctors.single.subtitle, 'Cardiologist | 15 years of experience');
      final pkg = h.procedures.single.packages.single;
      expect(pkg.tier, PackageTier.medicalOnly);
      expect(pkg.savingsMinor, 50000);
      expect(pkg.includes.bullets, contains('Airport pickup'));
      final round = HospitalDetail.fromJson(h.toJson());
      expect(round.doctors.single.hospital.name, 'Apollo Hospitals');
    });

    test('CostComparison and Paged envelope', () {
      final c = CostComparison.fromJson({
        'procedure': {'id': 'p1', 'slug': 'cabg', 'name': 'CABG'},
        'home': {
          'country_code': 'US',
          'min_minor': 1500000,
          'max_minor': 3000000,
          'currency': 'USD',
          'wait_time_text': '3-6 months',
        },
        'india': {'min_minor': 500000, 'max_minor': 1000000, 'currency': 'USD', 'wait_time_text': '1-2 weeks'},
        'savings': {'min_minor': 1000000, 'max_minor': 2000000, 'currency': 'USD', 'pct_min': 50, 'pct_max': 70},
        'itemized': [
          {'category': 'surgery', 'amount_minor': 300000, 'currency': 'USD'},
        ],
      });
      expect(c.home.waitTimeText, '3-6 months');
      expect(c.savings.pctMax, 70);
      expect(c.itemized.single.category, 'surgery');

      final page = Paged.fromJson({
        'items': [
          {'id': 's1', 'slug': 'cardiology', 'name': 'Cardiology', 'savings_min_pct': 60, 'savings_max_pct': 80},
        ],
        'total': 41,
        'page': 1,
        'page_size': 20,
        'pages': 3,
      }, Specialty.fromJson);
      expect(page.items.single.savingsLabel, 'Save 60-80%');
      expect(page.hasMore, isTrue);
      expect(Paged.fromJson([], Specialty.fromJson).isEmpty, isTrue);
    });
  });

  group('screening', () {
    test('Screening with TriageResult and matches', () {
      final s = Screening.fromJson({
        'id': 'sc1',
        'status': 'completed',
        'patient_id': 'p1',
        'specialty': {'id': 's1', 'slug': 'cardiology', 'name': 'Cardiology'},
        'body_areas': ['chest'],
        'pain_intensity': 6,
        'symptoms': [
          {'name': 'Fatigue', 'answer': 'yes'},
          {'name': 'Dizziness', 'answer': 'maybe'},
        ],
        'duration_value': 3,
        'duration_unit': 'weeks',
        'severity': {'work': 'mild', 'sleep': 'moderate', 'mobility': 'severe'},
        'previous_treatments': ['medication'],
        'preferences': {
          'languages': ['English', 'Arabic'],
          'doctor_gender': 'no_preference',
          'budget_min_minor': 500000,
          'budget_max_minor': 5000000,
          'budget_currency': 'USD',
          'travel_window_start': '2026-11-05',
          'travel_window_end': '2026-11-30',
          'use_ai': true,
        },
        'consent_ai': true,
        'ai_result': {
          'summary': 'Possible coronary artery disease.',
          'suggested_specialties': [
            {'slug': 'cardiology', 'name': 'Cardiology', 'confidence': 0.9, 'rationale': 'Chest pain'},
          ],
          'possible_conditions': [
            {'name': 'CAD', 'likelihood': 'high', 'notes': ''},
          ],
          'recommended_procedures': [
            {'slug': 'angiography', 'name': 'Angiography', 'rationale': 'Diagnostic'},
          ],
          'urgency': 'soon',
          'red_flags': [],
          'recommended_tests': ['ECG'],
          'questions_for_doctor': [],
          'travel_advice': 'Fit to travel',
          'disclaimer': 'Not a diagnosis.',
          'engine': 'claude',
        },
        'urgency': 'soon',
        'red_flags': [],
        'created_at': '2026-10-20T08:00:00Z',
      });
      expect(s.isCompleted, isTrue);
      expect(s.severity.sleep, SeverityLevel.moderate);
      expect(s.symptoms[1].answer, SymptomAnswer.maybe);
      expect(s.preferences.travelWindowStart, DateTime(2026, 11, 5));
      expect(s.aiResult!.engine, TriageEngine.claude);
      expect(s.aiResult!.possibleConditions.single.likelihood, Likelihood.high);
      expect(Screening.fromJson(s.toJson()).preferences.toJson()['travel_window_end'], '2026-11-30');

      final patch = const ScreeningPatch(
        painIntensity: 6,
        durationUnit: DurationUnit.weeks,
        symptoms: [SymptomResponse(name: 'Fatigue', answer: SymptomAnswer.no)],
      ).toJson();
      expect(patch, {
        'pain_intensity': 6,
        'symptoms': [
          {'name': 'Fatigue', 'answer': 'no'},
        ],
        'duration_unit': 'weeks',
      });

      final m = ScreeningMatch.fromJson({
        'id': 'm1',
        'rank': 1,
        'match_score': '95.50',
        'reasons': ['JCI accredited'],
        'doctor': null,
        'hospital': {'id': 'h1', 'slug': 'apollo', 'name': 'Apollo'},
        'procedure': null,
        'package': null,
        'estimated_cost_minor': 1250000,
        'currency': 'USD',
        'savings': {
          'home_country': 'US',
          'home_min_minor': 1,
          'home_max_minor': 2,
          'home_currency': 'USD',
          'pct_min': 50,
          'pct_max': 70,
        },
      });
      expect(m.matchLabel, '96% Match');
      expect(m.savings!.pctMax, 70);
    });
  });

  group('journey', () {
    test('MedicalCaseDetail, Booking, Quote, Checkout, Conversation', () {
      final c = MedicalCaseDetail.fromJson({
        'id': 'c1',
        'case_number': 'HIG-C-2026-000123',
        'status': 'quoted',
        'patient': {'id': 'p1', 'full_name': 'Jane Doe', 'nationality': 'NG', 'gender': 'female', 'age': 42},
        'agent': null,
        'hospital': {'id': 'h1', 'slug': 'apollo', 'name': 'Apollo', 'city': 'New Delhi'},
        'doctor': {'id': 'd1', 'full_name': 'Dr. Rajesh Sharma', 'specialty_name': 'Cardiologist'},
        'procedure': {'id': 'pr1', 'slug': 'cabg', 'name': 'CABG'},
        'coordinator': {'id': 'u9', 'full_name': 'Priya'},
        'latest_quote': {
          'id': 'q1',
          'case_id': 'c1',
          'status': 'sent',
          'line_items': [
            {'category': 'tests_scans', 'description': 'ECG', 'amount_minor': 100000},
          ],
          'total_minor': 500000000,
          'currency': 'INR',
          'valid_until': '2099-01-01',
        },
        'booking': null,
        'quotes': [],
        'timeline': [
          {'from_status': null, 'to_status': 'enquiry', 'note': null, 'changed_by_name': 'Jane'},
        ],
        'documents': [
          {
            'id': 'doc1',
            'kind': 'medical_report',
            'file_name': 'report.pdf',
            'content_type': 'application/pdf',
            'size_bytes': 1500000,
            'status': 'uploaded',
          },
        ],
        'created_at': '2026-10-01T00:00:00Z',
        'updated_at': '2026-10-02T00:00:00Z',
      });
      expect(c.status, CaseStatus.quoted);
      expect(c.title, 'CABG');
      expect(c.latestQuote!.isActionable, isTrue);
      expect(c.latestQuote!.lineItems.single.category, QuoteLineCategory.testsScans);
      expect(c.timeline.single.fromStatus, isNull);
      expect(c.documents.single.sizeLabel, '1.4 MB');

      final b = Booking.fromJson({
        'id': 'b1',
        'booking_number': 'HIG-B-2026-000001',
        'case_id': 'c1',
        'status': 'pending_payment',
        'patient': {'id': 'p1', 'full_name': 'Jane Doe'},
        'hospital': {'id': 'h1', 'name': 'Apollo', 'city': 'New Delhi'},
        'payment_option': 'installments',
        'installment_months': 6,
        'currency': 'INR',
        'total_minor': 1000000,
        'deposit_minor': 200000,
        'amount_paid_minor': 0,
        'amount_refunded_minor': 0,
        'admission_date': '2026-11-10',
      });
      expect(b.isPendingPayment, isTrue);
      expect(b.balanceDueMinor, 1000000);
      expect(b.admissionDate, DateTime(2026, 11, 10));
      expect(b.paymentOption, PaymentOption.installments);

      final co = Checkout.fromJson({
        'order': {
          'id': 'o1',
          'order_number': 'HIG-P-1',
          'purpose': 'booking_deposit',
          'status': 'created',
          'gateway': 'razorpay',
          'amount_minor': 24000,
          'currency': 'USD',
          'base_amount_minor': 2000000,
          'base_currency': 'INR',
          'fx_rate': '83.25000000',
        },
        'gateway': 'razorpay',
        'razorpay': {
          'key_id': 'rzp_test',
          'order_id': 'order_X',
          'amount': 24000,
          'currency': 'USD',
          'name': 'Heal India Global',
          'prefill': {'name': 'Jane', 'email': 'jane@example.com', 'contact': ''},
        },
      });
      expect(co.order.fxRate, 83.25);
      expect(co.razorpay!.toRazorpayOptions()['key'], 'rzp_test');
      expect(co.bankTransfer, isNull);

      final conv = Conversation.fromJson({
        'id': 'cv1',
        'kind': 'case',
        'case_id': 'c1',
        'subject': null,
        'participants': [
          {'user_id': 'u1', 'full_name': 'Jane', 'role': 'patient'},
          {'user_id': 'u2', 'full_name': 'Apollo Desk', 'role': 'hospital'},
        ],
        'last_message': {
          'id': 'msg1',
          'conversation_id': 'cv1',
          'sender': {'id': 'u2', 'full_name': 'Apollo Desk', 'role': 'hospital'},
          'body': 'Hello',
          'attachment_document_ids': [],
          'created_at': '2026-10-20T08:00:00Z',
        },
        'unread_count': 2,
        'last_message_at': '2026-10-20T08:00:00Z',
      });
      expect(conv.kind, ConversationKind.caseThread);
      expect(conv.titleFor('u1'), 'Apollo Desk');
      expect(conv.lastMessage!.isMine('u2'), isTrue);
    });

    test('PatientDashboard and SavedItem with embedded card', () {
      final d = PatientDashboard.fromJson({
        'next_booking': null,
        'days_until_treatment': 23,
        'checklist': [
          {'id': 'k1', 'key': 'treatment_booked', 'label': 'Treatment Booked', 'status': 'done', 'sort_order': 1},
          {'id': 'k2', 'key': 'flight_booked', 'label': 'Flight Booking', 'status': 'in_progress', 'sort_order': 3},
        ],
        'today_schedule': [
          {
            'id': 'i1',
            'kind': 'appointment',
            'title': 'Appointment with Dr. Sharma',
            'starts_at': '2026-10-21T04:30:00Z',
            'status': 'scheduled',
          },
        ],
        'active_cases': 1,
        'unread_notifications': 3,
        'coordinator': {'id': 'u9', 'full_name': 'Priya', 'phone': '+91 90000 00000'},
        'recent_screenings': [
          {'id': 'sc1', 'status': 'completed', 'created_at': '2026-10-20T08:00:00Z'},
        ],
      });
      expect(d.checklist.first.isDone, isTrue);
      expect(d.checklist[1].knownKey, ChecklistKey.flightBooked);
      expect(d.todaySchedule.single.kind, ItineraryKind.appointment);
      expect(d.recentScreenings.single.status, ScreeningStatus.completed);

      final saved = SavedItem.fromJson({
        'entity_type': 'hospital',
        'entity_id': 'h1',
        'hospital': {'id': 'h1', 'slug': 'apollo', 'name': 'Apollo'},
      });
      expect(saved.hospital!.name, 'Apollo');
      expect(saved.title, 'Apollo');
    });
  });

  group('nested patient / provider refs', () {
    test('travel, SOS and consultation models read the nested API shape', () {
      final a = AccommodationBooking.fromJson({
        'id': 'a1',
        'case_id': 'c1',
        'case_number': 'HIG-1',
        'status': 'confirmed',
        'patient': {'id': 'p1', 'full_name': 'Jane Doe'},
        'provider': {'id': 'ap1', 'name': 'Green Stay', 'type': 'hotel'},
      });
      expect(a.patientId, 'p1');
      expect(a.patientName, 'Jane Doe');
      expect(a.providerId, 'ap1');
      expect(a.providerName, 'Green Stay');
      final again = AccommodationBooking.fromJson(a.toJson());
      expect(again.patientName, 'Jane Doe');
      expect(again.providerName, 'Green Stay');

      final s = ServiceBooking.fromJson({
        'id': 's1',
        'case_id': 'c1',
        'kind': 'translator',
        'status': 'requested',
        'patient': {'id': 'p1', 'full_name': 'Jane Doe'},
        'provider': null,
      });
      expect(s.patientName, 'Jane Doe');
      expect(s.providerId, isNull);

      final sos = SosAlert.fromJson({
        'id': 'x1',
        'status': 'open',
        'patient': {'id': 'p1', 'full_name': 'Jane Doe'},
      });
      expect(sos.patientName, 'Jane Doe');

      final c = Consultation.fromJson({
        'id': 'k1',
        'case_id': 'c1',
        'status': 'requested',
        'mode': 'video',
        'doctor': {'id': 'd1', 'full_name': 'Dr. Rao', 'specialty_name': 'Cardiology'},
        'patient': {'id': 'p1', 'full_name': 'Jane Doe'},
      });
      expect(c.doctorId, 'd1');
      expect(c.doctorName, 'Dr. Rao');
      expect(c.patientId, 'p1');
    });
  });
}
