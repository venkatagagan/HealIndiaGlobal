import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/travel_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../trips/services/journey_actions.dart';

/// Confirms and sends an SOS (`POST /travel/sos`), optionally with the location the patient marked
/// on the map, then offers to call local emergency services.
Future<void> runSosFlow(BuildContext context, WidgetRef ref, {String? caseId, LatLng? location}) async {
  final request = await showDialog<({String message, bool shareLocation})>(
    context: context,
    builder: (_) => _SosConfirmDialog(hasLocation: location != null),
  );
  if (request == null || !context.mounted) return;
  try {
    await ref
        .read(travelRepositoryProvider)
        .sos(
          lat: request.shareLocation ? location?.latitude : null,
          lng: request.shareLocation ? location?.longitude : null,
          message: request.message.isEmpty ? null : request.message,
          caseId: caseId,
        );
  } catch (e) {
    if (context.mounted) {
      showErrorSnack(context, e);
      await _offerEmergencyCall(context, ref, failed: true);
    }
    return;
  }
  if (context.mounted) await _offerEmergencyCall(context, ref, failed: false);
}

Future<void> _offerEmergencyCall(BuildContext context, WidgetRef ref, {required bool failed}) async {
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
            : 'Your coordinator and our 24/7 support team have been alerted and will call you shortly. '
                  'If your life is in danger, call emergency services now.',
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
  const _SosConfirmDialog({required this.hasLocation});

  final bool hasLocation;

  @override
  State<_SosConfirmDialog> createState() => _SosConfirmDialogState();
}

class _SosConfirmDialogState extends State<_SosConfirmDialog> {
  final _message = TextEditingController();
  late bool _share = widget.hasLocation;

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
            if (widget.hasLocation)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _share,
                onChanged: (v) => setState(() => _share = v ?? false),
                title: const Text('Share the location I marked on the map'),
              )
            else
              Text(
                'Tip: long-press the map to mark where you are so we can find you faster.',
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
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
