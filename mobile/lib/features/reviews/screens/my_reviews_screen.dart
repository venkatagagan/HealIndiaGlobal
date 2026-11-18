import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/trust_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../search/widgets/detail_sections.dart';
import 'review_form_screen.dart';

/// "My reviews": bookings still to review, then the patient's own reviews with their status (pending /
/// published / hidden with the reason). Pending reviews can be edited or deleted.
///
/// Route: `/reviews`.
class MyReviewsScreen extends ConsumerWidget {
  const MyReviewsScreen({super.key});

  Future<void> _delete(BuildContext context, WidgetRef ref, PatientReview r) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.myReviewsDeleteTitle),
        content: Text(l10n.myReviewsDeleteBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l10n.commonDelete)),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(trustRepositoryProvider).delete(r.id);
      ref
        ..invalidate(myReviewsProvider)
        ..invalidate(eligibleReviewsProvider);
    } on Object catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final eligible = ref.watch(eligibleReviewsProvider).value ?? const <ReviewableBooking>[];
    final mine = ref.watch(myReviewsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.myReviewsTitle)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(myReviewsProvider)
            ..invalidate(eligibleReviewsProvider);
        },
        child: AsyncValueView<List<PatientReview>>(
          value: mine,
          onRetry: () => ref.invalidate(myReviewsProvider),
          data: (reviews) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (eligible.isNotEmpty) ...[
                SectionTitle(l10n.myReviewsToWrite, padding: const EdgeInsets.only(top: 4, bottom: 8)),
                for (final b in eligible)
                  AppCard(
                    key: ValueKey('to-review-${b.bookingId}'),
                    margin: const EdgeInsets.only(bottom: 8),
                    onTap: () => context.push(Routes.writeReview(b.bookingId)),
                    child: Row(
                      children: [
                        const Icon(Icons.star_rate_rounded, color: AppColors.star),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l10n.reviewBannerTitle(b.hospital.name), style: context.text.titleSmall),
                              Text(
                                [b.procedure?.name, b.bookingNumber].whereType<String>().join(' · '),
                                style: context.text.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded),
                      ],
                    ),
                  ),
              ],
              SectionTitle(l10n.myReviewsWritten, padding: const EdgeInsets.only(top: 12, bottom: 8)),
              if (reviews.isEmpty)
                Text(l10n.myReviewsEmpty, style: context.text.bodyMedium)
              else
                for (final r in reviews)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            _StatusBadge(status: r.status),
                            const Spacer(),
                            if (r.editable) ...[
                              IconButton(
                                key: ValueKey('review-edit-${r.id}'),
                                tooltip: l10n.commonEdit,
                                icon: const Icon(Icons.edit_outlined),
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute<bool>(builder: (_) => ReviewFormScreen(existing: r)),
                                ),
                              ),
                              IconButton(
                                key: ValueKey('review-delete-${r.id}'),
                                tooltip: l10n.commonDelete,
                                icon: const Icon(Icons.delete_outline_rounded),
                                onPressed: () => _delete(context, ref, r),
                              ),
                            ],
                          ],
                        ),
                        if (r.status == 'hidden' && (r.moderationReason ?? '').isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text(
                              l10n.myReviewsHiddenReason(r.moderationReason!),
                              style: context.text.bodySmall?.copyWith(color: AppColors.danger),
                            ),
                          ),
                        ReviewTile(review: r.review, showHospital: true),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (label, color, icon) = switch (status) {
      'published' => (l10n.myReviewsPublished, AppColors.primary, Icons.public_rounded),
      'hidden' => (l10n.myReviewsHidden, AppColors.danger, Icons.visibility_off_outlined),
      _ => (l10n.myReviewsPending, AppColors.warning, Icons.hourglass_top_rounded),
    };
    return StatusBadge(label: label, color: color, icon: icon, dense: true);
  }
}
