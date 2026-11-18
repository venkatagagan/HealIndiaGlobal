import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/trust_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// "Rate your hospital": stars, title, text and (optionally) the doctor, for a completed booking
/// (`POST /reviews`), or editing an own pending review (`PATCH /me/reviews/{id}`).
///
/// Route: `/reviews/write?booking=<id>` (new) · pushed with [existing] to edit.
class ReviewFormScreen extends ConsumerStatefulWidget {
  const ReviewFormScreen({super.key, this.bookingId, this.existing});

  final String? bookingId;
  final PatientReview? existing;

  @override
  ConsumerState<ReviewFormScreen> createState() => _ReviewFormScreenState();
}

class _ReviewFormScreenState extends ConsumerState<ReviewFormScreen> {
  late int _rating = widget.existing?.review.rating ?? 0;
  late final _title = TextEditingController(text: widget.existing?.review.title);
  late final _body = TextEditingController(text: widget.existing?.review.body);
  bool _aboutDoctor = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit(ReviewableBooking? booking) async {
    final l10n = context.l10n;
    if (_rating < 1) {
      setState(() => _error = l10n.reviewFormRatingRequired);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(trustRepositoryProvider);
      final existing = widget.existing;
      if (existing != null) {
        await repo.update(existing.id, rating: _rating, title: _title.text.trim(), body: _body.text.trim());
      } else {
        await repo.create(
          hospitalId: booking!.hospital.id,
          bookingId: booking.bookingId,
          doctorId: _aboutDoctor ? booking.doctor?.id : null,
          rating: _rating,
          title: _title.text.trim(),
          body: _body.text.trim(),
        );
      }
      ref
        ..invalidate(myReviewsProvider)
        ..invalidate(eligibleReviewsProvider);
      if (!mounted) return;
      showInfoSnack(context, existing != null ? l10n.reviewFormUpdated : l10n.reviewFormThanks);
      if (existing != null || context.canPop()) {
        context.pop(true);
      } else {
        context.go(Routes.myReviews);
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (widget.existing != null) return _form(context, null, widget.existing!.review.hospitalName ?? '');
    final eligible = ref.watch(eligibleReviewsProvider);
    return eligible.when(
      loading: () => Scaffold(appBar: AppBar(), body: const LoadingView()),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorView(error: e, onRetry: () => ref.invalidate(eligibleReviewsProvider)),
      ),
      data: (list) {
        final booking = list.where((b) => b.bookingId == widget.bookingId).firstOrNull ??
            (widget.bookingId == null ? list.firstOrNull : null);
        if (booking == null) {
          return Scaffold(
            appBar: AppBar(title: Text(l10n.reviewFormTitle)),
            body: EmptyView(
              icon: Icons.rate_review_outlined,
              title: l10n.reviewFormNotEligibleTitle,
              message: l10n.reviewFormNotEligibleMessage,
              actionLabel: l10n.myReviewsTitle,
              onAction: () => context.go(Routes.myReviews),
            ),
          );
        }
        return _form(context, booking, booking.hospital.name);
      },
    );
  }

  Widget _form(BuildContext context, ReviewableBooking? booking, String hospitalName) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(widget.existing != null ? l10n.reviewFormEditTitle : l10n.reviewFormTitle)),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: PrimaryButton(
          key: const ValueKey('review-submit'),
          label: widget.existing != null ? l10n.commonSave : l10n.reviewFormSubmit,
          icon: Icons.send_rounded,
          loading: _busy,
          onPressed: () => _submit(booking),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(hospitalName, style: context.text.headlineSmall),
          if (booking?.procedure != null) Text(booking!.procedure!.name, style: context.text.bodyMedium),
          const SizedBox(height: 16),
          Text(l10n.reviewFormRatingLabel, style: context.text.titleSmall),
          const SizedBox(height: 4),
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  key: ValueKey('review-star-$i'),
                  tooltip: l10n.reviewStarsSemantics(i),
                  iconSize: 36,
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  icon: Icon(i <= _rating ? Icons.star_rounded : Icons.star_outline_rounded, color: AppColors.star),
                  onPressed: () => setState(() => _rating = i),
                ),
            ],
          ),
          if (booking?.doctor != null)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _aboutDoctor,
              onChanged: (v) => setState(() => _aboutDoctor = v),
              title: Text(l10n.reviewFormAboutDoctor(booking!.doctor!.name)),
            ),
          const SizedBox(height: 8),
          TextField(
            key: const ValueKey('review-title'),
            controller: _title,
            maxLength: 200,
            decoration: InputDecoration(labelText: l10n.reviewFormTitleLabel),
          ),
          TextField(
            key: const ValueKey('review-body'),
            controller: _body,
            minLines: 4,
            maxLines: 10,
            maxLength: 5000,
            decoration: InputDecoration(
              labelText: l10n.reviewFormBodyLabel,
              hintText: l10n.reviewFormBodyHint,
              alignLabelWithHint: true,
            ),
          ),
          Text(l10n.reviewFormModerationNote, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ),
        ],
      ),
    );
  }
}
