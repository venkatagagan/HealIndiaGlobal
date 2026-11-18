import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/detail_sections.dart';
import '../widgets/paged_list.dart';

/// All published reviews of a hospital or a doctor, newest first, loaded page by page.
///
/// Route: `/hospitals/:id/reviews` · `/doctors/:id/reviews`.
class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen.hospital({super.key, required this.id, this.title}) : doctor = false;

  const ReviewsScreen.doctor({super.key, required this.id, this.title}) : doctor = true;

  final String id;
  final bool doctor;

  /// Hospital / doctor name shown under the heading.
  final String? title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final repo = ref.watch(catalogRepositoryProvider);
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.reviewsTitle),
            if ((title ?? '').isNotEmpty) Text(title!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
      body: PagedList<Review>(
        key: ValueKey('reviews-$doctor-$id'),
        fetch: (page) => doctor ? repo.doctorReviews(id, page: page) : repo.hospitalReviews(id, page: page),
        itemBuilder: (context, r) => ReviewTile(review: r, showHospital: doctor),
        empty: EmptyView(icon: Icons.rate_review_outlined, title: l10n.reviewsEmptyTitle, message: l10n.reviewsEmptyMessage),
      ),
    );
  }
}
