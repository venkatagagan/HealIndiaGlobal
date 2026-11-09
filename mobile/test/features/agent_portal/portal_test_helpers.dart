import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';

/// Auth controller with a fixed signed-in user (no network).
class PortalFakeAuth extends AuthController {
  PortalFakeAuth(this.user);

  final User user;

  @override
  Future<AuthState> build() async => AuthState.fromUser(user);
}

/// A request seen by [RoutedAdapter].
class SeenRequest {
  SeenRequest(this.method, this.path, this.query, this.headers, this.body);

  final String method;
  final String path;
  final Map<String, dynamic> query;
  final Map<String, dynamic> headers;
  final Object? body;

  @override
  String toString() => '$method $path $query';
}

/// HTTP adapter answering `"<METHOD> <path>"` keys (path without the base URL) with JSON.
/// A handler may return `(status, body)` for non-200 answers. Unknown routes answer 404 with the API
/// error envelope.
class RoutedAdapter implements HttpClientAdapter {
  RoutedAdapter(this.routes);

  final Map<String, Object? Function(SeenRequest r)> routes;
  final List<SeenRequest> requests = [];

  /// The last request to [method] [path], or null.
  SeenRequest? last(String method, String path) {
    for (final r in requests.reversed) {
      if (r.method == method && r.path == path) return r;
    }
    return null;
  }

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final req = SeenRequest(o.method.toUpperCase(), o.path, o.queryParameters, o.headers, o.data);
    requests.add(req);
    final handler = routes['${req.method} ${req.path}'];
    final (status, body) = handler == null
        ? (
            404,
            {
              'error': {'code': 'not_found', 'message': 'No fake for ${req.method} ${req.path}'},
            },
          )
        : switch (handler(req)) {
            (final int status, final Object? body) => (status, body),
            final Object? body => (200, body),
          };
    return ResponseBody.fromString(
      body == null ? '' : jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Decodes a request body sent as a map.
Map<String, dynamic> bodyOf(SeenRequest? r) => r?.body is Map ? Map<String, dynamic>.from(r!.body! as Map) : {};

Map<String, Object?> page(List<Object?> items) => {
  'items': items,
  'total': items.length,
  'page': 1,
  'page_size': 50,
  'pages': 1,
};

const agentUser = User(
  id: 'u-agent',
  role: UserRole.agent,
  status: UserStatus.active,
  fullName: 'Sam Okafor',
  agentId: 'ag-1',
);

const hospitalUser = User(
  id: 'u-hosp',
  role: UserRole.hospital,
  status: UserStatus.active,
  fullName: 'Priya Raman',
  hospitals: [
    UserHospital(id: 'h-1', name: 'Apollo Chennai', slug: 'apollo-chennai', memberRole: HospitalMemberRole.coordinator),
    UserHospital(id: 'h-2', name: 'Apollo Delhi', slug: 'apollo-delhi', memberRole: HospitalMemberRole.admin),
  ],
);

Map<String, Object?> quoteJson({
  String id = 'q-1',
  String caseId = 'c-1',
  String status = 'sent',
  int total = 450000000,
  String currency = 'INR',
  List<Map<String, Object?>>? lines,
}) => {
  'id': id,
  'case_id': caseId,
  'status': status,
  'treatment_plan': 'Total knee replacement, 5 nights',
  'line_items':
      lines ??
      [
        {'category': 'surgery', 'description': 'TKR surgery', 'amount_minor': total - 50000000},
        {'category': 'hospital_stay', 'description': 'Private room', 'amount_minor': 50000000},
      ],
  'total_minor': total,
  'currency': currency,
  'estimated_stay_days': 5,
  'valid_until': '2099-12-31',
  'prepared_by_name': 'Dr. Rao',
  'created_at': '2026-10-01T10:00:00Z',
};

Map<String, Object?> caseJson({
  String id = 'c-1',
  String status = 'quoted',
  String hospitalId = 'h-1',
  String hospitalName = 'Apollo Chennai',
  Map<String, Object?>? latestQuote,
  Map<String, Object?>? booking,
}) => {
  'id': id,
  'case_number': 'HIG-C-2026-0000${id.hashCode % 90 + 10}',
  'status': status,
  'patient': {'id': 'p-1', 'full_name': 'Amina Yusuf', 'nationality': 'NG', 'gender': 'female', 'age': 54},
  'agent': {'id': 'ag-1', 'agency_name': 'Lagos Health Travel'},
  'hospital': {'id': hospitalId, 'slug': 'apollo', 'name': hospitalName, 'city': 'Chennai'},
  'procedure': {'id': 'pr-1', 'slug': 'knee-replacement', 'name': 'Knee replacement'},
  'patient_notes': 'Right knee, severe pain',
  'latest_quote': latestQuote,
  'booking': booking,
  'created_at': '2026-10-01T09:00:00Z',
};

Map<String, Object?> caseDetailJson({String id = 'c-1', String status = 'quoted', List<Map<String, Object?>>? quotes}) {
  final qs = quotes ?? [quoteJson(caseId: id)];
  return {
    ...caseJson(id: id, status: status, latestQuote: qs.isEmpty ? null : qs.first),
    'medical_summary': 'Osteoarthritis grade IV',
    'quotes': qs,
    'timeline': [
      {
        'from_status': null,
        'to_status': 'enquiry',
        'note': 'Created',
        'changed_by_name': 'Sam',
        'created_at': '2026-10-01T09:00:00Z',
      },
    ],
    'screening': null,
    'documents': <Object?>[],
  };
}

Map<String, Object?> bookingJson({String id = 'b-1', String status = 'confirmed'}) => {
  'id': id,
  'booking_number': 'HIG-B-2026-000001',
  'case_id': 'c-1',
  'status': status,
  'patient': {'id': 'p-1', 'full_name': 'Amina Yusuf'},
  'hospital': {'id': 'h-1', 'name': 'Apollo Chennai', 'city': 'Chennai'},
  'procedure': {'id': 'pr-1', 'name': 'Knee replacement'},
  'admission_date': '2099-11-20',
  'payment_option': 'deposit',
  'currency': 'INR',
  'subtotal_minor': 450000000,
  'total_minor': 450000000,
  'deposit_minor': 90000000,
  'amount_paid_minor': 90000000,
  'balance_due_minor': 360000000,
};

Map<String, Object?> payeeSummaryJson() => {
  'currency': 'INR',
  'payee_type': 'agent',
  'payee_id': 'ag-1',
  'pending_minor': 1500000,
  'eligible_minor': 2500000,
  'on_hold_minor': 0,
  'batched_minor': 0,
  'paid_minor': 9000000,
  'last_payout': null,
  'next_payout_date': '2026-11-01',
  'settlement_cycle_days': 7,
};

Map<String, Object?> settlementItemJson({String id = 'si-1', String status = 'eligible'}) => {
  'id': id,
  'payee_type': 'agent',
  'payee_id': 'ag-1',
  'payee_name': 'Lagos Health Travel',
  'booking_id': 'b-1',
  'booking_number': 'HIG-B-2026-000001',
  'gross_minor': 450000000,
  'commission_minor': 2500000,
  'tax_minor': 0,
  'tds_minor': 0,
  'net_minor': 2500000,
  'currency': 'INR',
  'status': status,
  'created_at': '2026-10-02T09:00:00Z',
};

/// Pumps a router app with [routes] at [initialLocation], [user] signed in and [adapter] as the
/// HTTP backend. Uses a tall phone-sized surface.
Future<void> pumpPortal(
  WidgetTester tester, {
  required List<RouteBase> routes,
  required String initialLocation,
  required User user,
  required RoutedAdapter adapter,
}) async {
  tester.view
    ..physicalSize = const Size(1200, 2800)
    ..devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final api = ApiClient(
    tokens: InMemoryTokenStorage(),
    baseUrl: 'http://portal.test/api/v1',
    httpClientAdapter: adapter,
  );
  final router = GoRouter(initialLocation: initialLocation, routes: routes);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
        apiClientProvider.overrideWithValue(api),
        authControllerProvider.overrideWith(() => PortalFakeAuth(user)),
      ],
      child: MaterialApp.router(theme: AppTheme.dark(), routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}
