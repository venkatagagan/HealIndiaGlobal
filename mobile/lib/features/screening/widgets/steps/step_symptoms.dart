import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/models.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../l10n/l10n.dart';
import '../../providers/screening_draft.dart';
import '../screening_step_scaffold.dart';
import '../symptom_swipe_deck.dart';
import '../voice_intake_button.dart';
import 'step_actions.dart';

/// Step 2 - "Which symptoms are you experiencing?": swipe cards + "Your Symptoms" chips + custom.
class SymptomsStep extends ScreeningStepView {
  const SymptomsStep({super.key, required super.screeningId});

  @override
  ConsumerState<SymptomsStep> createState() => _SymptomsStepState();
}

class _SymptomsStepState extends ConsumerState<SymptomsStep> with ScreeningStepActions {
  final _custom = TextEditingController();

  @override
  int get step => 2;

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  static const _maxNameLength = 120;
  static const _maxSymptoms = 60;

  void _addCustom() {
    final name = _custom.text.trim();
    if (name.isEmpty) return;
    if (name.length > _maxNameLength) {
      showInfoSnack(context, context.l10n.screeningSymptomTooLong(_maxNameLength));
      return;
    }
    if ((draft?.symptoms.length ?? 0) >= _maxSymptoms) {
      showInfoSnack(context, context.l10n.screeningSymptomLimit(_maxSymptoms));
      return;
    }
    edit((d) => d.answer(name, SymptomAnswer.yes));
    _custom.clear();
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(screeningDraftProvider(screeningId)).requireValue;
    final query = (specialty: d.specialtySlug, areas: (d.bodyAreas.toList()..sort()).join(','));
    final suggestions = ref.watch(symptomSuggestionsProvider(query));
    final answered = d.answeredNames;
    final mine = d.positiveSymptoms;
    final l10n = context.l10n;

    return ScreeningStepScaffold(
      step: step,
      title: l10n.screeningStep2Title,
      primaryLabel: l10n.commonNext,
      busy: busy,
      onPrimary: goNext,
      onBack: goPrevious,
      onPrevious: goPrevious,
      onSaveExit: saveAndExit,
      help: l10n.screeningStep2Help,
      children: [
        VoiceIntakeButton(screeningId: screeningId),
        const SizedBox(height: 12),
        suggestions.when(
          loading: () => SizedBox(height: 260, child: LoadingView(message: l10n.screeningSymptomsLoading)),
          error: (e, _) => Column(
            children: [
              ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(symptomSuggestionsProvider(query))),
              SymptomSwipeDeck(
                symptoms: const [],
                onAnswer: (_, _) {},
                emptyMessage: l10n.screeningSymptomsUnavailable,
              ),
            ],
          ),
          data: (items) => SymptomSwipeDeck(
            symptoms: [
              for (final s in items)
                if (!answered.contains(s.name.toLowerCase())) s.name,
            ],
            onAnswer: (name, a) => edit((x) => x.answer(name, a)),
          ),
        ),
        const SizedBox(height: 24),
        Text(l10n.screeningYourSymptoms, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        if (mine.isEmpty)
          Text(
            l10n.screeningYourSymptomsEmpty,
            style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in mine)
                ChipToggle(
                  key: ValueKey('my-symptom-${s.name}'),
                  label: s.answer == SymptomAnswer.maybe ? l10n.screeningSymptomMaybeChip(s.name) : s.name,
                  selected: true,
                  selectedColor: s.answer == SymptomAnswer.maybe
                      ? AppColors.warning
                      : (context.isDark ? AppColors.darkSurfaceAlt : AppColors.primaryDark),
                  onChanged: null,
                  onDeleted: () => edit((x) => x.removeSymptom(s.name)),
                ),
            ],
          ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _custom,
                maxLength: _maxNameLength,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _addCustom(),
                decoration: InputDecoration(
                  hintText: l10n.screeningAddAnotherSymptom,
                  counterText: '',
                  prefixIcon: const Icon(Icons.add_comment_outlined),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: l10n.symptomAddTooltip,
              onPressed: _addCustom,
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
      ],
    );
  }
}
