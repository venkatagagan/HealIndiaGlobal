import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Short "what to do next" hint for a case (null when nothing is pending on the patient).
String? caseNextStep(MedicalCase c, AppLocalizations l10n) {
  final b = c.booking;
  if (b != null && b.status != BookingStatus.cancelled) {
    if (b.isPendingPayment) return l10n.caseNextPaymentNeeded;
    if (b.balanceDueMinor > 0 && b.status == BookingStatus.confirmed) return l10n.caseNextBalanceDue;
    return null;
  }
  return switch (c.status) {
    CaseStatus.enquiry => l10n.caseNextWaitingForQuote,
    CaseStatus.quoted => l10n.caseNextReviewQuote,
    CaseStatus.accepted => l10n.caseNextChooseDate,
    _ => null,
  };
}

/// Card in "My cases".
class CaseCard extends StatelessWidget {
  const CaseCard({super.key, required this.medicalCase, this.onTap});

  final MedicalCase medicalCase;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = medicalCase;
    final next = caseNextStep(c, context.l10n);
    final q = c.latestQuote;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  c.caseNumber,
                  style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                ),
              ),
              StatusBadge.forEnum(c.status, dense: true),
            ],
          ),
          const SizedBox(height: 6),
          Text(c.title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(
            [c.hospital.name, ?c.hospital.city, if (c.doctor != null) c.doctor!.fullName].join(' · '),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          if (q != null || c.booking != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (q != null) ...[
                  const Icon(Icons.request_quote_outlined, size: 16, color: AppColors.violet),
                  const SizedBox(width: 4),
                  MoneyText(q.totalMinor, q.currency, style: context.text.labelLarge),
                  const SizedBox(width: 12),
                ],
                if (c.booking != null) ...[
                  const Icon(Icons.event_available_rounded, size: 16, color: AppColors.violet),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      c.booking!.admissionDate == null
                          ? c.booking!.status.label
                          : '${Dates.dayShort(c.booking!.admissionDate)} · ${c.booking!.status.label}',
                      style: context.text.labelLarge,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ],
          if (next != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.arrow_circle_right_rounded, size: 18, color: AppColors.primary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    next,
                    style: context.text.labelLarge?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Itemized quote with accept / reject actions.
class QuoteCard extends StatelessWidget {
  const QuoteCard({super.key, required this.quote, this.onAccept, this.onReject, this.onBook, this.busy = false});

  final Quote quote;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  /// Shown for an accepted quote that has no booking yet.
  final VoidCallback? onBook;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final q = quote;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      selected: q.status == QuoteStatus.accepted,
      selectedColor: AppColors.violet,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(l10n.caseHospitalQuote, style: context.text.titleSmall)),
              StatusBadge.forEnum(q.status, dense: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (q.preparedByName != null) l10n.caseQuoteBy(q.preparedByName!),
              if (q.createdAt != null) Dates.day(q.createdAt),
              if (q.validUntil != null) l10n.bookingValidUntil(Dates.day(q.validUntil)),
            ].join(' · '),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          if (q.treatmentPlan != null && q.treatmentPlan!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(q.treatmentPlan!, style: context.text.bodyMedium),
          ],
          if (q.lineItems.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final l in q.lineItems)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l.category.label, style: context.text.bodyMedium),
                          if (l.description.isNotEmpty && l.description != l.category.label)
                            Text(
                              l.description,
                              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                            ),
                        ],
                      ),
                    ),
                    MoneyText(l.amountMinor, q.currency, style: context.text.bodyMedium),
                  ],
                ),
              ),
          ],
          const Divider(height: 20),
          Row(
            children: [
              Expanded(
                child: Text(
                  q.estimatedStayDays == null ? l10n.paymentTotal : l10n.caseQuoteTotalStay(q.estimatedStayDays!),
                  style: context.text.titleSmall,
                ),
              ),
              MoneyText(
                q.totalMinor,
                q.currency,
                style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          if (onAccept != null || onReject != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (onReject != null)
                  Expanded(
                    child: SecondaryButton(label: l10n.caseDecline, onPressed: busy ? null : onReject),
                  ),
                if (onReject != null && onAccept != null) const SizedBox(width: 10),
                if (onAccept != null)
                  Expanded(
                    child: PrimaryButton(
                      label: l10n.caseAcceptQuote,
                      tone: ButtonTone.violet,
                      loading: busy,
                      onPressed: onAccept,
                    ),
                  ),
              ],
            ),
          ],
          if (onBook != null) ...[
            const SizedBox(height: 12),
            PrimaryButton(label: l10n.caseChooseAdmissionDate, tone: ButtonTone.violet, onPressed: onBook),
          ],
        ],
      ),
    );
  }
}

/// Vertical status timeline of a case.
class CaseTimeline extends StatelessWidget {
  const CaseTimeline({super.key, required this.entries});

  final List<CaseTimelineEntry> entries;

  @override
  Widget build(BuildContext context) {
    final sorted = [...entries]..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
    return Column(
      children: [
        for (var i = 0; i < sorted.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 24,
                  child: Column(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        margin: const EdgeInsets.only(top: 4),
                        decoration: BoxDecoration(
                          color: i == 0 ? AppColors.violet : context.palette.surfaceAlt,
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.violet, width: 2),
                        ),
                      ),
                      if (i < sorted.length - 1) Expanded(child: Container(width: 2, color: context.palette.border)),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(sorted[i].toStatus.label, style: context.text.titleSmall),
                        Text(
                          [
                            if (sorted[i].createdAt != null) Dates.dayTime(sorted[i].createdAt),
                            ?sorted[i].changedByName,
                          ].join(' · '),
                          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                        ),
                        if (sorted[i].note != null && sorted[i].note!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(sorted[i].note!, style: context.text.bodySmall),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Asks for a free-text reason (decline quote, cancel booking / case). Returns null when dismissed.
Future<String?> askReason(
  BuildContext context, {
  required String title,
  required String confirmLabel,
  String? hint,
  bool required = false,
  String? message,
}) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message != null) ...[Text(message), const SizedBox(height: 12)],
            TextField(
              controller: controller,
              maxLines: 3,
              maxLength: 500,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: hint ?? ctx.l10n.caseReasonOptional),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(ctx.l10n.commonBack)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.dangerStrong, foregroundColor: Colors.white),
            onPressed: required && controller.text.trim().isEmpty
                ? null
                : () => Navigator.of(ctx).pop(controller.text.trim()),
            child: Text(confirmLabel),
          ),
        ],
      ),
    ),
  ).whenComplete(controller.dispose);
}

/// Cancellation terms of a booking: the `refund_policy` tiers snapshotted at confirmation (be-cases
/// contract), e.g. "30+ days before admission: 100 % refund". Before confirmation the snapshot is
/// empty and the platform policy at confirmation will apply.
class RefundPolicyCard extends StatelessWidget {
  const RefundPolicyCard({super.key, required this.booking});

  final Booking booking;

  static String tierLabel(AppLocalizations l10n, RefundTier t, RefundTier? next) {
    final when = t.daysBefore <= 0
        ? l10n.refundTierLessThanDays(next?.daysBefore ?? 1)
        : l10n.refundTierDaysOrMore(t.daysBefore);
    final refund = t.refundPct <= 0 ? l10n.refundNone : l10n.refundPercent(t.refundPct);
    return l10n.refundTierLine(when, refund);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tiers = booking.refundPolicy;
    final muted = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    return Container(
      key: const ValueKey('refund-policy'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: context.palette.surfaceAlt, borderRadius: BorderRadius.circular(AppRadius.sm)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.refundPolicyTitle, style: context.text.titleSmall),
          const SizedBox(height: 6),
          if (tiers.isEmpty)
            Text(l10n.refundPolicyGeneral, style: muted)
          else ...[
            for (var i = 0; i < tiers.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  '• ${tierLabel(l10n, tiers[i], i > 0 ? tiers[i - 1] : null)}',
                  style: context.text.bodySmall,
                ),
              ),
            const SizedBox(height: 4),
            Text(l10n.refundPolicyLocked, style: muted),
          ],
        ],
      ),
    );
  }
}
