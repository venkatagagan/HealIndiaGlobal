import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/aftercare_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../screening/widgets/pain_slider.dart';
import '../../support/widgets/sos_flow.dart';
import '../widgets/checkin_tile.dart';

/// Pain at or above this is a red flag (matches the API's `PAIN_RED_FLAG`).
const kPainRedFlag = 8;

/// Starts the SOS flow (confirm, location, alert). Overridden in widget tests.
final aftercareSosProvider = Provider<Future<void> Function(BuildContext, WidgetRef, String?)>(
  (ref) =>
      (context, ref, caseId) => runSosFlow(context, ref, caseId: caseId),
);

/// A short recovery check-in: pain 0-10, fever, breathlessness, wound concerns, medicines, notes
/// (`POST /aftercare/checkins/{id}`). Red flags show an urgent message with the SOS option.
class CheckinFormScreen extends ConsumerStatefulWidget {
  const CheckinFormScreen({super.key, required this.checkin});

  final AftercareCheckin checkin;

  @override
  ConsumerState<CheckinFormScreen> createState() => _CheckinFormScreenState();
}

class _CheckinFormScreenState extends ConsumerState<CheckinFormScreen> {
  final _notes = TextEditingController();
  int _pain = 0;
  bool _fever = false;
  bool _breathless = false;
  bool _wound = false;
  String _meds = 'all';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(aftercareRepositoryProvider)
          .submit(
            widget.checkin.id,
            CheckinAnswers(
              pain: _pain,
              fever: _fever,
              woundConcerns: _wound,
              breathlessness: _breathless,
              medicationAdherence: _meds,
              freeText: _notes.text.trim(),
            ),
          );
      ref.invalidate(aftercareProvider);
      if (!mounted) return;
      final flags = result.redFlags.isNotEmpty
          ? result.redFlags
          : [
              if (_fever) 'fever',
              if (_breathless) 'breathlessness',
              if (_pain >= kPainRedFlag) 'severe_pain',
              if (_wound) 'wound_concerns',
            ];
      if (flags.isNotEmpty) {
        await _urgent(flags);
      } else {
        showInfoSnack(context, context.l10n.aftercareCheckinThanks);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _urgent(List<String> flags) async {
    final l10n = context.l10n;
    final sos = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        key: const ValueKey('checkin-urgent'),
        icon: const Icon(Icons.warning_amber_rounded, color: AppColors.danger, size: 40),
        title: Text(l10n.aftercareUrgentTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.aftercareUrgentBody),
            const SizedBox(height: 8),
            for (final f in flags) Text('• ${redFlagLabel(l10n, f)}', style: ctx.text.bodyMedium),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.aftercareUrgentOk)),
          FilledButton.icon(
            key: const ValueKey('checkin-sos'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.dangerStrong, foregroundColor: Colors.white),
            icon: const Icon(Icons.sos_rounded),
            label: Text(l10n.aftercareUrgentSos),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );
    if (sos == true && mounted) await ref.read(aftercareSosProvider)(context, ref, widget.checkin.caseId);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Widget yesNo(Key key, String label, String? hint, bool value, ValueChanged<bool> onChanged) => SwitchListTile(
      key: key,
      contentPadding: EdgeInsets.zero,
      value: value,
      onChanged: onChanged,
      title: Text(label),
      subtitle: hint == null ? null : Text(hint),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l10n.aftercareCheckinDay(widget.checkin.day))),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: PrimaryButton(
          key: const ValueKey('checkin-submit'),
          label: l10n.aftercareCheckinSend,
          icon: Icons.send_rounded,
          loading: _busy,
          onPressed: _submit,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(l10n.aftercareCheckinIntro, style: context.text.bodyMedium),
          const SizedBox(height: 16),
          PainSlider(value: _pain, onChanged: (v) => setState(() => _pain = v)),
          const SizedBox(height: 8),
          yesNo(const ValueKey('checkin-fever'), l10n.aftercareQFever, null, _fever, (v) => setState(() => _fever = v)),
          yesNo(
            const ValueKey('checkin-breath'),
            l10n.aftercareQBreathless,
            null,
            _breathless,
            (v) => setState(() => _breathless = v),
          ),
          yesNo(
            const ValueKey('checkin-wound'),
            l10n.aftercareQWound,
            l10n.aftercareQWoundHint,
            _wound,
            (v) => setState(() => _wound = v),
          ),
          const SizedBox(height: 8),
          Text(l10n.aftercareQMeds, style: context.text.titleSmall),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'all', label: Text(l10n.aftercareMedsAll)),
              ButtonSegment(value: 'some', label: Text(l10n.aftercareMedsSome)),
              ButtonSegment(value: 'none', label: Text(l10n.aftercareMedsNone)),
            ],
            selected: {_meds},
            showSelectedIcon: false,
            onSelectionChanged: (s) => setState(() => _meds = s.first),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _notes,
            minLines: 2,
            maxLines: 5,
            maxLength: 2000,
            decoration: InputDecoration(labelText: l10n.aftercareQNotes, alignLabelWithHint: true),
          ),
          if (_error != null)
            Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
          Text(l10n.aftercareEmergencyNote, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
        ],
      ),
    );
  }
}
