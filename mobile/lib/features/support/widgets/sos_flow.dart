import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/travel_repository.dart';
import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../trips/services/journey_actions.dart';

/// Confirms and sends an SOS (`POST /travel/sos`), then offers to call local emergency services.
///
/// With "share my location" ticked, the phone's GPS is read once (permission asked just in time, at most
/// [LocationService.timeLimit] once granted); without a fix the place the patient marked on the map ([location]) is
/// used. The alert is sent either way. [onLocated] receives the GPS point so the map can show it.
Future<void> runSosFlow(
  BuildContext context,
  WidgetRef ref, {
  String? caseId,
  LatLng? location,
  ValueChanged<LatLng>? onLocated,
}) async {
  final request = await showDialog<({String message, bool shareLocation})>(
    context: context,
    builder: (_) => _SosConfirmDialog(hasMarkedLocation: location != null),
  );
  if (request == null || !context.mounted) return;

  LatLng? point;
  LocationFailure? gpsFailure;
  if (request.shareLocation) {
    final fix = await _withProgress(
      context,
      'Getting your location…',
      ref.read(locationServiceProvider).currentLocation(),
    );
    if (fix.point != null) onLocated?.call(fix.point!);
    point = fix.point ?? location;
    gpsFailure = fix.failure;
    if (!context.mounted) return;
  }

  try {
    await _withProgress(
      context,
      'Sending your alert…',
      ref
          .read(travelRepositoryProvider)
          .sos(
            lat: point?.latitude,
            lng: point?.longitude,
            message: request.message.isEmpty ? null : request.message,
            caseId: caseId,
          ),
    );
  } catch (e) {
    if (context.mounted) {
      showErrorSnack(context, e);
      await _offerEmergencyCall(context, ref, failed: true);
    }
    return;
  }
  if (!context.mounted) return;
  final String? locationNote;
  if (!request.shareLocation) {
    locationNote = null;
  } else if (gpsFailure == null) {
    locationNote = 'Your current location was shared with the team.';
  } else if (point != null) {
    locationNote = '${gpsFailure.message} The place you marked on the map was shared instead.';
  } else {
    locationNote = '${gpsFailure.message} Tell the team where you are when they call.';
  }
  await _offerEmergencyCall(context, ref, failed: false, locationNote: locationNote);
}

/// Runs [work] behind a small modal progress dialog that cannot be dismissed.
Future<T> _withProgress<T>(BuildContext context, String label, Future<T> work) async {
  final navigator = Navigator.of(context, rootNavigator: true);
  var open = true;
  unawaited(
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (_) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 3)),
              const SizedBox(width: 16),
              Expanded(child: Text(label)),
            ],
          ),
        ),
      ),
    ).whenComplete(() => open = false),
  );
  try {
    return await work;
  } finally {
    if (open) navigator.pop();
  }
}

Future<void> _offerEmergencyCall(
  BuildContext context,
  WidgetRef ref, {
  required bool failed,
  String? locationNote,
}) async {
  final emergency = ref.read(helplinesProvider).value?.emergency ?? '112';
  final helpline = ref.read(helplinesProvider).value?.support24x7;
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: Icon(
        failed ? Icons.error_outline_rounded : Icons.check_circle_rounded,
        color: failed ? AppColors.danger : AppColors.primary,
        size: 40,
      ),
      title: Text(failed ? 'Alert could not be sent' : 'Help is on the way'),
      content: Text(
        failed
            ? 'Please call for help directly.'
            : [
                'Your coordinator and our 24/7 support team have been alerted and will call you shortly.',
                ?locationNote,
                'If your life is in danger, call emergency services now.',
              ].join('\n\n'),
      ),
      actions: [
        if (helpline != null)
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              callNumber(context, helpline);
            },
            child: const Text('Call helpline'),
          ),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: AppColors.dangerStrong, foregroundColor: Colors.white),
          icon: const Icon(Icons.call_rounded),
          onPressed: () {
            Navigator.of(ctx).pop();
            callNumber(context, emergency);
          },
          label: Text('Call $emergency'),
        ),
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
      ],
    ),
  );
}

class _SosConfirmDialog extends StatefulWidget {
  const _SosConfirmDialog({required this.hasMarkedLocation});

  final bool hasMarkedLocation;

  @override
  State<_SosConfirmDialog> createState() => _SosConfirmDialogState();
}

class _SosConfirmDialogState extends State<_SosConfirmDialog> {
  final _message = TextEditingController();
  bool _share = true;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      icon: const Icon(Icons.sos_rounded, color: AppColors.danger, size: 40),
      title: const Text('Send an emergency alert?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Your coordinator and our 24/7 support team are alerted immediately.'),
            const SizedBox(height: 12),
            TextField(
              controller: _message,
              maxLines: 2,
              maxLength: 2000,
              decoration: const InputDecoration(labelText: 'What is happening? (optional)'),
            ),
            CheckboxListTile(
              key: const ValueKey('sos-share-location'),
              contentPadding: EdgeInsets.zero,
              value: _share,
              onChanged: (v) => setState(() => _share = v ?? false),
              title: const Text('Share my current location with the support team'),
              subtitle: Text(
                widget.hasMarkedLocation
                    ? 'Used only for this alert. If your phone cannot find you, the place you marked on the map is '
                          'shared instead.'
                    : 'Used only for this alert, so we can find you faster. Your phone may ask for permission.',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          key: const ValueKey('sos-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.dangerStrong, foregroundColor: Colors.white),
          onPressed: () => Navigator.of(context).pop((message: _message.text.trim(), shareLocation: _share)),
          child: const Text('Send SOS'),
        ),
      ],
    );
  }
}
