import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../screening/providers/emergency_ack.dart';
import '../providers/match_view.dart';
import '../widgets/ai_summary_card.dart';
import '../widgets/match_card.dart';
import '../widgets/match_sort_filter_sheet.dart';
import 'match_detail_screen.dart';

/// Doctor/hospital match cards, compare selection bar (0/3).
///
/// Route: `/screening/:id/matches` · Owner: fl-screening.
class MatchesScreen extends ConsumerStatefulWidget {
  const MatchesScreen({super.key, required this.screeningId});

  final String screeningId;

  @override
  ConsumerState<MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends ConsumerState<MatchesScreen> {
  final List<String> _selected = [];
  MatchSort _sort = MatchSort.bestMatch;
  MatchFilters _filters = const MatchFilters();
  bool _rerunning = false;

  String get _id => widget.screeningId;

  void _toggleCompare(ScreeningMatch m) {
    setState(() {
      if (!_selected.remove(m.id)) {
        if (_selected.length >= kMaxCompare) {
          showInfoSnack(context, 'You can compare up to $kMaxCompare matches.');
          return;
        }
        _selected.add(m.id);
      }
    });
  }

  Future<void> _openSheet(List<ScreeningMatch> matches) async {
    final choice = await showMatchSortFilterSheet(context, matches: matches, sort: _sort, filters: _filters);
    if (choice != null && mounted) {
      setState(() {
        _sort = choice.sort;
        _filters = choice.filters;
      });
    }
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(screeningProvider(_id))
      ..invalidate(screeningMatchesProvider(_id));
    await ref.read(screeningMatchesProvider(_id).future).catchError((_) => <ScreeningMatch>[]);
  }

  Future<void> _rerun() async {
    setState(() => _rerunning = true);
    try {
      await ref.read(screeningRepositoryProvider).rerun(_id);
      if (mounted) context.go(Routes.screeningProcessing(_id));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _rerunning = false);
    }
  }

  void _openDetails(ScreeningMatch m, Screening? s) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MatchDetailScreen(match: m, screeningId: _id, screening: s),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screening = ref.watch(screeningProvider(_id));
    final matches = ref.watch(screeningMatchesProvider(_id));
    final s = screening.value;
    final all = matches.value ?? const <ScreeningMatch>[];

    if (s != null && (s.isProcessing || s.isDraft)) {
      return Scaffold(
        appBar: AppBar(title: const Text('Your Top Matches')),
        body: EmptyView(
          icon: Icons.hourglass_top_rounded,
          title: s.isDraft ? 'Finish your screening first' : 'Still finding your matches',
          message: s.isDraft
              ? 'Complete the questionnaire to see matched doctors.'
              : 'This usually takes under a minute.',
          actionLabel: s.isDraft ? 'Continue questionnaire' : 'See progress',
          onAction: () => context.go(s.isDraft ? Routes.screeningStep(_id, 1) : Routes.screeningProcessing(_id)),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: Text('Your Top Matches', style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            tooltip: 'Sort',
            icon: const Icon(Icons.sort_rounded),
            onPressed: all.isEmpty ? null : () => _openSheet(all),
          ),
          IconButton(
            tooltip: 'Filter',
            icon: Badge(
              isLabelVisible: !_filters.isEmpty,
              label: Text('${_filters.count}'),
              child: const Icon(Icons.tune_rounded),
            ),
            onPressed: all.isEmpty ? null : () => _openSheet(all),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: matches.when(
          loading: () => const LoadingView(message: 'Loading your matches...'),
          error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(screeningMatchesProvider(_id))),
          data: (items) => _list(context, s, items),
        ),
      ),
      bottomNavigationBar: all.isEmpty
          ? null
          : _CompareBar(
              count: _selected.length,
              onCompare: _selected.length < 2
                  ? null
                  : () => context.push(Routes.compareMatches(screeningId: _id, matchIds: List.of(_selected))),
            ),
    );
  }

  Widget _list(BuildContext context, Screening? s, List<ScreeningMatch> items) {
    final visible = applyMatchView(items, _sort, _filters);
    final urgency = s?.urgency ?? s?.aiResult?.urgency;
    final costMatch = items.where((m) => m.procedure?.slug != null).firstOrNull;
    final procedureSlug = costMatch?.procedure?.slug ?? s?.aiResult?.recommendedProcedures.firstOrNull?.slug;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Text(
          'Based on your profile, here are your top matches.',
          textAlign: TextAlign.center,
          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
        ),
        const SizedBox(height: 12),
        if (urgency == Urgency.emergency && s != null) ...[
          _EmergencyBanner(screening: s, acknowledged: ref.watch(emergencyAckProvider).contains(s.id)),
          const SizedBox(height: 12),
        ],
        if (s?.aiResult != null) ...[
          AiSummaryCard(result: s!.aiResult!, urgency: s.urgency, screeningId: _id),
          const SizedBox(height: 12),
        ],
        if (procedureSlug != null) ...[
          AppCard(
            onTap: () => context.push(
              Routes.costComparisonFor(
                procedure: procedureSlug,
                country: costMatch?.savings?.homeCountry ?? s?.homeCountry,
                currency: costMatch?.currency,
                screeningId: _id,
                matchId: costMatch?.id,
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.savings_outlined, color: AppColors.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    costMatch?.savings != null
                        ? 'Save ${costMatch!.savings!.pctMin}-${costMatch.savings!.pctMax}% vs treatment at home'
                        : 'Compare costs with your home country',
                    style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 24),
            child: Column(
              children: [
                const EmptyView(
                  icon: Icons.person_search_outlined,
                  title: 'No matches yet',
                  message: 'We could not find doctors for these answers. Try again or browse hospitals yourself.',
                ),
                PrimaryButton(label: 'Run matching again', loading: _rerunning, onPressed: _rerun),
                const SizedBox(height: 10),
                SecondaryButton(label: 'Browse hospitals', onPressed: () => context.go(Routes.search)),
              ],
            ),
          )
        else if (visible.isEmpty)
          EmptyView(
            icon: Icons.filter_alt_off_outlined,
            title: 'No matches for these filters',
            actionLabel: 'Clear filters',
            onAction: () => setState(() => _filters = const MatchFilters()),
          )
        else
          for (final m in visible)
            MatchCard(
              key: ValueKey('match-${m.id}'),
              match: m,
              selected: _selected.contains(m.id),
              compareEnabled: _selected.length < kMaxCompare,
              onCompare: () => _toggleCompare(m),
              onDetails: () => _openDetails(m, s),
            ),
      ],
    );
  }
}

class _CompareBar extends StatelessWidget {
  const _CompareBar({required this.count, required this.onCompare});

  final int count;
  final VoidCallback? onCompare;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        decoration: BoxDecoration(
          color: context.colors.surfaceContainer,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: context.palette.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: Text(
                  '$count/$kMaxCompare Selected for Comparison',
                  style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ),
            FilledButton(
              onPressed: onCompare,
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 44),
                padding: const EdgeInsets.symmetric(horizontal: 20),
                backgroundColor: AppColors.danger,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppColors.danger.withValues(alpha: 0.35),
                disabledForegroundColor: Colors.white70,
              ),
              child: const Text('Compare'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Emergency urgency: guidance + mandatory acknowledgement before booking (INTEGRATION_BACKLOG #13).
class _EmergencyBanner extends StatelessWidget {
  const _EmergencyBanner({required this.screening, required this.acknowledged});

  final Screening screening;
  final bool acknowledged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      key: const ValueKey('emergency-banner'),
      color: AppColors.dangerSoft,
      borderColor: AppColors.danger,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.emergency_rounded, color: AppColors.danger),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Your answers suggest you may need urgent care. Please seek local emergency care before planning '
                  'travel.',
                  style: context.text.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: acknowledged
                ? Text(
                    'Guidance acknowledged',
                    style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                  )
                : TextButton.icon(
                    onPressed: () => showEmergencyGuidance(context, screening),
                    style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                    icon: const Icon(Icons.info_outline_rounded, size: 18),
                    label: const Text('Read the guidance'),
                  ),
          ),
        ],
      ),
    );
  }
}
