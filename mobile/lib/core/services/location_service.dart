import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../../l10n/l10n.dart';

/// Why no location could be read. [message] is shown to the patient.
enum LocationFailure {
  serviceOff,
  denied,
  blocked,
  unavailable;

  /// Patient-facing explanation in the app language.
  String get message => messageIn(L10n.current);

  /// [message] in the language of [l10n].
  String messageIn(AppLocalizations l10n) => switch (this) {
    serviceOff => l10n.coreLocationServiceOff,
    denied => l10n.coreLocationDenied,
    blocked => l10n.coreLocationBlocked,
    unavailable => l10n.coreLocationUnavailable,
  };
}

/// One location reading: [point] when found, otherwise [failure].
class LocationResult {
  const LocationResult.found(LatLng this.point) : failure = null;
  const LocationResult.failed(LocationFailure this.failure) : point = null;

  final LatLng? point;
  final LocationFailure? failure;
}

/// One GPS reading for an SOS alert (COMPLIANCE_GAPS CG-10).
///
/// Permission is requested just in time, only when the patient sends an SOS with "share my location" ticked.
/// No streams and no background access: the app never tracks the patient. Never throws, so an emergency alert
/// can always go out without a location.
class LocationService {
  /// Total wait for a GPS fix once permission is granted.
  static const timeLimit = Duration(seconds: 8);

  Future<LocationResult> currentLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return const LocationResult.failed(LocationFailure.serviceOff);
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return const LocationResult.failed(LocationFailure.denied);
      if (permission == LocationPermission.deniedForever) return const LocationResult.failed(LocationFailure.blocked);
      try {
        final p = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: timeLimit),
        );
        return LocationResult.found(LatLng(p.latitude, p.longitude));
      } on TimeoutException {
        // Indoors or a cold GPS: a recent fix is still far better than nothing in an emergency.
        final last = kIsWeb ? null : await Geolocator.getLastKnownPosition();
        if (last != null) return LocationResult.found(LatLng(last.latitude, last.longitude));
        return const LocationResult.failed(LocationFailure.unavailable);
      }
    } on LocationServiceDisabledException {
      return const LocationResult.failed(LocationFailure.serviceOff);
    } on PermissionDeniedException {
      return const LocationResult.failed(LocationFailure.denied);
    } on PlatformException {
      return const LocationResult.failed(LocationFailure.unavailable);
    } on MissingPluginException {
      return const LocationResult.failed(LocationFailure.unavailable);
    } catch (_) {
      return const LocationResult.failed(LocationFailure.unavailable);
    }
  }
}

final locationServiceProvider = Provider<LocationService>((ref) => LocationService());
