import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../voice/models/voice_models.dart';
import '../providers/intake_merge.dart';
import '../providers/screening_draft.dart';

/// "Describe it by voice" (screening steps 1–2, PLAN §7.2): opens `/voice/intake`, then applies the
/// patient-confirmed answers to the local draft — filling empty fields and asking about conflicts.
/// The answers are saved with the step's normal PATCH on "Next".
class VoiceIntakeButton extends ConsumerWidget {
  const VoiceIntakeButton({super.key, required this.screeningId});

  final String screeningId;

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    final result = await context.push<VoiceIntakeResult>(Routes.voiceIntakeFor(screeningId: screeningId));
    if (result == null || !context.mounted) return;
    final controller = ref.read(screeningDraftProvider(screeningId).notifier);
    final draft = ref.read(screeningDraftProvider(screeningId)).value;
    if (draft == null) return;
    final merge = mergeIntake(draft, result.intake, context.l10n);
    controller.edit((_) => merge.draft);
    var replaced = 0;
    if (merge.conflicts.isNotEmpty) {
      final chosen = await showModalBottomSheet<List<IntakeFieldConflict>>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => IntakeConflictSheet(conflicts: merge.conflicts),
      );
      if (chosen != null && chosen.isNotEmpty) {
        controller.edit((d) => chosen.fold(d, (acc, c) => c.apply(acc)));
        replaced = chosen.length;
      }
    }
    if (!context.mounted) return;
    final l10n = context.l10n;
    final fields = merge.applied.join(l10n.intakeListSeparator);
    final message = switch ((merge.applied.isNotEmpty, replaced > 0)) {
      (true, true) => l10n.intakeVoiceAddedAndUpdated(fields, replaced),
      (true, false) => l10n.intakeVoiceAddedOnly(fields),
      (false, true) => l10n.intakeVoiceUpdatedOnly(replaced),
      (false, false) => l10n.intakeVoiceAlreadyMatch,
    };
    showInfoSnack(context, message);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => OutlinedButton.icon(
    key: const ValueKey('voice-intake-button'),
    onPressed: () => _open(context, ref),
    style: OutlinedButton.styleFrom(
      foregroundColor: AppColors.primary,
      side: const BorderSide(color: AppColors.primary),
      minimumSize: const Size.fromHeight(44),
      shape: const StadiumBorder(),
    ),
    icon: const Icon(Icons.mic_rounded),
    label: Text(context.l10n.voiceIntakeTitle),
  );
}

/// Lets the patient pick which differing answers to replace with the voice answers.
class IntakeConflictSheet extends StatefulWidget {
  const IntakeConflictSheet({super.key, required this.conflicts});

  final List<IntakeFieldConflict> conflicts;

  @override
  State<IntakeConflictSheet> createState() => _IntakeConflictSheetState();
}

class _IntakeConflictSheetState extends State<IntakeConflictSheet> {
  final Set<int> _use = {};

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.intakeConflictTitle, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(
              l10n.intakeConflictHint,
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            const SizedBox(height: 8),
            for (final (i, c) in widget.conflicts.indexed)
              CheckboxListTile(
                value: _use.contains(i),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => v == true ? _use.add(i) : _use.remove(i)),
                title: Text(c.label, style: context.text.titleSmall),
                subtitle: Text(l10n.intakeConflictCompare(c.current, c.suggested)),
              ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: l10n.commonApply,
              onPressed: () => Navigator.of(context).pop([for (final i in _use) widget.conflicts[i]]),
            ),
          ],
        ),
      ),
    );
  }
}
