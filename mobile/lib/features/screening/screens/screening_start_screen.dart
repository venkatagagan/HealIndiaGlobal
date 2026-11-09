import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';

/// Creates a draft screening (POST /screenings) and replaces itself with step 1.
///
/// Route: `/screening/new?specialty=` · Owner: fl-screening. Without a specialty it shows a
/// specialty picker (plus "Not sure") and offers to resume the last unfinished screening.
class ScreeningStartScreen extends ConsumerStatefulWidget {
  const ScreeningStartScreen({super.key, this.specialtySlug});

  final String? specialtySlug;

  @override
  ConsumerState<ScreeningStartScreen> createState() => _ScreeningStartScreenState();
}

class _ScreeningStartScreenState extends ConsumerState<ScreeningStartScreen> {
  bool _creating = false;
  Object? _error;
  String? _pendingSlug;

  @override
  void initState() {
    super.initState();
    final slug = widget.specialtySlug?.trim();
    if (slug != null && slug.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _start(slug));
    }
  }

  Future<void> _start(String? slug) async {
    if (_creating) return;
    setState(() {
      _creating = true;
      _error = null;
      _pendingSlug = slug;
    });
    try {
      final s = await ref.read(screeningRepositoryProvider).create(specialtySlug: slug);
      await ref.read(sharedPreferencesProvider).setString(PrefKeys.lastScreeningId, s.id);
      if (!mounted) return;
      context.pushReplacement(Routes.screeningStep(s.id, 1));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final autoStart = widget.specialtySlug?.trim().isNotEmpty ?? false;
    if (autoStart || _creating || _error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('AI Screening')),
        body: _error != null
            ? ErrorView(
                error: _error,
                title: 'Could not start your screening',
                onRetry: () => _start(_pendingSlug ?? widget.specialtySlug),
              )
            : const LoadingView(message: 'Preparing your questionnaire...'),
      );
    }
    final specialties = ref.watch(specialtiesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('AI Screening')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          const BrandHeader(padding: EdgeInsets.only(bottom: 16)),
          Text('What brings you to India?', style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(
            'Pick the area of care. Four short steps help us match you with the right doctors.',
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          const SizedBox(height: 16),
          const _ResumeCard(),
          AsyncValueView<List<Specialty>>(
            value: specialties,
            onRetry: () => ref.invalidate(specialtiesProvider),
            data: (items) => GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.25,
              children: [
                for (var i = 0; i < items.length; i++)
                  _SpecialtyTile(specialty: items[i], accent: specialtyAccent(i), onTap: () => _start(items[i].slug)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          AppCard(
            onTap: () => _start(null),
            child: Row(
              children: [
                const Icon(Icons.help_outline_rounded, color: AppColors.violet),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Not sure?', style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                      Text(
                        'Describe your symptoms and we will suggest a specialty.',
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SpecialtyTile extends StatelessWidget {
  const _SpecialtyTile({required this.specialty, required this.accent, required this.onTap});

  final Specialty specialty;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      borderColor: accent.withValues(alpha: 0.6),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(specialtyIcon(specialty.icon ?? specialty.slug), color: accent),
          const Spacer(),
          Text(
            specialty.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          if (specialty.savingsLabel != null)
            Text(
              specialty.savingsLabel!,
              style: context.text.labelSmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
            ),
        ],
      ),
    );
  }
}

/// "Continue your screening" card for the last unfinished draft (stored in preferences).
class _ResumeCard extends ConsumerWidget {
  const _ResumeCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(sharedPreferencesProvider);
    final id = prefs.getString(PrefKeys.lastScreeningId);
    if (id == null) return const SizedBox.shrink();
    final s = ref.watch(screeningProvider(id)).value;
    if (s == null || !s.isDraft) return const SizedBox.shrink();
    return AppCard(
      margin: const EdgeInsets.only(bottom: 16),
      selected: true,
      onTap: () => context.pushReplacement(Routes.screeningStep(s.id, 1)),
      child: Row(
        children: [
          const Icon(Icons.history_rounded, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Continue your screening', style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                Text(
                  [s.specialty?.name ?? 'General', if (s.createdAt != null) Dates.relative(s.createdAt)].join(' · '),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}
