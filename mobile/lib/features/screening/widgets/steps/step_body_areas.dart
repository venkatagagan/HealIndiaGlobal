import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../l10n/l10n.dart';
import '../../providers/screening_draft.dart';
import '../body_map.dart';
import '../pain_slider.dart';
import '../screening_step_scaffold.dart';
import '../voice_intake_button.dart';
import 'step_actions.dart';

/// Step 1 - "Where are you experiencing issues?": body map + pain intensity.
class BodyAreasStep extends ScreeningStepView {
  const BodyAreasStep({super.key, required super.screeningId});

  @override
  ConsumerState<BodyAreasStep> createState() => _BodyAreasStepState();
}

class _BodyAreasStepState extends ConsumerState<BodyAreasStep> with ScreeningStepActions {
  @override
  int get step => 1;

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(screeningDraftProvider(screeningId)).requireValue;
    final areas = d.bodyAreas.toList()..sort();
    final l10n = context.l10n;
    return ScreeningStepScaffold(
      step: step,
      accent: AppColors.danger,
      primaryTone: ButtonTone.red,
      title: l10n.screeningStep1Title,
      subtitle: d.specialtyName == null
          ? l10n.screeningStep1Subtitle
          : l10n.screeningStep1SubtitleWithSpecialty(d.specialtyName!),
      primaryLabel: l10n.commonNext,
      busy: busy,
      onPrimary: goNext,
      onSaveExit: saveAndExit,
      children: [
        VoiceIntakeButton(screeningId: screeningId),
        const SizedBox(height: 12),
        BodyMap(
          selected: d.bodyAreas,
          onChanged: (next) => edit((x) => x.copyWith(bodyAreas: next)),
        ),
        const SizedBox(height: 12),
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          child: areas.isEmpty
              ? Text(
                  l10n.screeningNoAreaSelected,
                  textAlign: TextAlign.center,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
                )
              : Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final a in areas)
                      ChipToggle(
                        label: BodyRegion.labelOf(a, l10n),
                        selected: true,
                        selectedColor: AppColors.danger,
                        onChanged: null,
                        onDeleted: () => edit((x) => x.copyWith(bodyAreas: {...x.bodyAreas}..remove(a))),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 20),
        PainSlider(
          value: d.painIntensity,
          onChanged: (v) => edit((x) => x.copyWith(painIntensity: v)),
        ),
      ],
    );
  }
}
