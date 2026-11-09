import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_exception.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/travel_repository.dart';
import 'package:heal_india_global/core/services/location_service.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/support/widgets/sos_flow.dart';
import 'package:latlong2/latlong.dart';

class _FakeLocation extends LocationService {
  _FakeLocation(this.result);

  final LocationResult result;
  int calls = 0;

  @override
  Future<LocationResult> currentLocation() async {
    calls++;
    return result;
  }
}

class _FakeTravel implements TravelRepository {
  _FakeTravel({this.fail = false});

  final bool fail;
  final sent = <({double? lat, double? lng, String? message, String? caseId})>[];

  @override
  Future<SosAlert> sos({double? lat, double? lng, String? message, String? caseId}) async {
    if (fail) throw const ApiException(statusCode: 503, code: 'unavailable', message: 'Service unavailable');
    sent.add((lat: lat, lng: lng, message: message, caseId: caseId));
    return SosAlert.fromJson({'id': 'sos-1', 'status': 'open', 'lat': lat, 'lng': lng});
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _gps = LatLng(17.4126, 78.4482);
const _marked = LatLng(17.4, 78.5);

Future<void> _pumpHost(
  WidgetTester tester, {
  required _FakeLocation location,
  required _FakeTravel travel,
  LatLng? marked,
  List<LatLng>? located,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        locationServiceProvider.overrideWithValue(location),
        travelRepositoryProvider.overrideWithValue(travel),
        helplinesProvider.overrideWith(
          (ref) async => const Helplines({'24x7': '+91 40 0000 0000', 'emergency': '112'}),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Consumer(
          builder: (context, ref, _) {
            ref.watch(helplinesProvider);
            return Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () =>
                      runSosFlow(context, ref, caseId: 'case-1', location: marked, onLocated: located?.add),
                  child: const Text('SOS'),
                ),
              ),
            );
          },
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _sendSos(WidgetTester tester, {bool untickLocation = false}) async {
  await tester.tap(find.text('SOS'));
  await tester.pumpAndSettle();
  expect(find.text('Send an emergency alert?'), findsOneWidget);
  if (untickLocation) await tester.tap(find.byKey(const ValueKey('sos-share-location')));
  await tester.enterText(find.byType(TextField), 'Chest pain at the hotel');
  await tester.tap(find.byKey(const ValueKey('sos-confirm')));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => AppTextStyles.useGoogleFonts = false);

  testWidgets('sends the GPS location and shows it on the map', (tester) async {
    final location = _FakeLocation(const LocationResult.found(_gps));
    final travel = _FakeTravel();
    final located = <LatLng>[];
    await _pumpHost(tester, location: location, travel: travel, marked: _marked, located: located);

    await _sendSos(tester);

    expect(location.calls, 1);
    expect(travel.sent.single.lat, _gps.latitude);
    expect(travel.sent.single.lng, _gps.longitude);
    expect(travel.sent.single.message, 'Chest pain at the hotel');
    expect(travel.sent.single.caseId, 'case-1');
    expect(located, [_gps]);
    expect(find.text('Help is on the way'), findsOneWidget);
    expect(find.textContaining('Your current location was shared'), findsOneWidget);
    expect(find.text('Call 112'), findsOneWidget);
  });

  testWidgets('permission refused: falls back to the place marked on the map', (tester) async {
    final travel = _FakeTravel();
    await _pumpHost(
      tester,
      location: _FakeLocation(const LocationResult.failed(LocationFailure.denied)),
      travel: travel,
      marked: _marked,
    );

    await _sendSos(tester);

    expect(travel.sent.single.lat, _marked.latitude);
    expect(travel.sent.single.lng, _marked.longitude);
    expect(find.textContaining('Location permission was not given.'), findsOneWidget);
    expect(find.textContaining('The place you marked on the map was shared instead.'), findsOneWidget);
  });

  testWidgets('no location at all: the alert still goes out and asks the patient to say where they are', (
    tester,
  ) async {
    final travel = _FakeTravel();
    await _pumpHost(
      tester,
      location: _FakeLocation(const LocationResult.failed(LocationFailure.serviceOff)),
      travel: travel,
    );

    await _sendSos(tester);

    expect(travel.sent.single.lat, isNull);
    expect(travel.sent.single.lng, isNull);
    expect(find.text('Help is on the way'), findsOneWidget);
    expect(find.textContaining('Tell the team where you are when they call.'), findsOneWidget);
  });

  testWidgets('unticking "share my location" never reads GPS or sends a location', (tester) async {
    final location = _FakeLocation(const LocationResult.found(_gps));
    final travel = _FakeTravel();
    await _pumpHost(tester, location: location, travel: travel, marked: _marked);

    await _sendSos(tester, untickLocation: true);

    expect(location.calls, 0);
    expect(travel.sent.single.lat, isNull);
    expect(find.textContaining('location'), findsNothing);
    expect(find.text('Help is on the way'), findsOneWidget);
  });

  testWidgets('send failure offers a direct call', (tester) async {
    await _pumpHost(tester, location: _FakeLocation(const LocationResult.found(_gps)), travel: _FakeTravel(fail: true));

    await _sendSos(tester);

    expect(find.text('Alert could not be sent'), findsOneWidget);
    expect(find.text('Call 112'), findsOneWidget);
    expect(find.text('Call helpline'), findsOneWidget);
  });
}
