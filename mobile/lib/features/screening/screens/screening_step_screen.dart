import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../providers/screening_draft.dart';
import '../widgets/steps/step_body_areas.dart';
import '../widgets/steps/step_preferences.dart';
import '../widgets/steps/step_symptoms.dart';
import '../widgets/steps/step_timeline.dart';

/// Intelligent questionnaire steps 1-4 (body map + pain, symptoms, timeline & severity, preferences).
///
/// Route: `/screening/:id/step/:step` · Owner: fl-screening. All steps share
/// [screeningDraftProvider]; each step PATCHes its own answers on "Next".
class ScreeningStepScreen extends ConsumerWidget {
  const ScreeningStepScreen({super.key, required this.screeningId, required this.step});

  final String screeningId;

  final int step;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(screeningDraftProvider(screeningId));
    return draft.when(
      skipLoadingOnReload: true,
      skipLoadingOnRefresh: true,
      loading: () => const Scaffold(body: LoadingView(message: 'Loading your answers...')),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorView(error: e, onRetry: () => ref.invalidate(screeningDraftProvider(screeningId))),
      ),
      data: (d) {
        if (!d.source.isDraft) return _AlreadySubmitted(screening: d.source);
        return switch (step) {
          1 => BodyAreasStep(screeningId: screeningId),
          2 => SymptomsStep(screeningId: screeningId),
          3 => TimelineStep(screeningId: screeningId),
          _ => PreferencesStep(screeningId: screeningId),
        };
      },
    );
  }
}

class _AlreadySubmitted extends StatelessWidget {
  const _AlreadySubmitted({required this.screening});

  final Screening screening;

  @override
  Widget build(BuildContext context) {
    final done = screening.isCompleted;
    return Scaffold(
      appBar: AppBar(title: const Text('Screening')),
      body: EmptyView(
        icon: done ? Icons.task_alt_rounded : Icons.hourglass_top_rounded,
        title: done ? 'Your results are ready' : 'This screening was already submitted',
        message: done
            ? 'Answers can no longer be changed. Start a new screening to answer again.'
            : 'We are analysing your answers.',
        actionLabel: done ? 'View my matches' : 'See progress',
        onAction: () => context.go(done ? Routes.matches(screening.id) : Routes.screeningProcessing(screening.id)),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: SecondaryButton(
            label: 'Start a new screening',
            onPressed: () => context.go(Routes.screeningStart(specialty: screening.specialty?.slug)),
            foregroundColor: context.colors.onSurface,
          ),
        ),
      ),
    );
  }
}
