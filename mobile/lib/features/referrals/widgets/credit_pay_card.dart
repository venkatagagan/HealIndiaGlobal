import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/referral_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Booking payments referral credit can be used on (instalments are excluded by the server).
const kCreditPurposes = {PaymentPurpose.bookingDeposit, PaymentPurpose.bookingBalance, PaymentPurpose.bookingFull};

/// "Use my credit" on the pay screen (patients only, never on agent pay screens): shows what the credit
/// covers (`GET /patient/credits/preview`) and applies it (`POST /patient/credits/apply`). [onApplied] gets the
/// result; when `remaining_due_minor` is 0 the payment is complete, otherwise the rest is paid normally.
class CreditPayCard extends ConsumerStatefulWidget {
  const CreditPayCard({super.key, required this.bookingId, required this.purpose, required this.onApplied});

  final String bookingId;
  final PaymentPurpose purpose;
  final Future<void> Function(CreditApplyResult result) onApplied;

  @override
  ConsumerState<CreditPayCard> createState() => _CreditPayCardState();
}

class _CreditPayCardState extends ConsumerState<CreditPayCard> {
  bool _busy = false;

  (String, PaymentPurpose) get _key => (widget.bookingId, widget.purpose);

  Future<void> _apply(CreditPreview p) async {
    if (_busy) return;
    final l10n = context.l10n;
    final amount = formatMoney(p.applyMinor, p.currency);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.referralPayConfirmTitle),
        content: Text(ctx.l10n.referralPayConfirmBody(amount)),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.commonCancel)),
          FilledButton(
            key: const ValueKey('credit-apply-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(ctx.l10n.referralPayConfirmButton),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await ref
          .read(referralRepositoryProvider)
          .apply(bookingId: widget.bookingId, purpose: widget.purpose);
      ref
        ..invalidate(creditPreviewProvider(_key))
        ..invalidate(referralOverviewProvider)
        ..invalidate(creditsOverviewProvider);
      if (mounted) showInfoSnack(context, l10n.referralPayApplied(formatMoney(result.appliedMinor, result.currency)));
      await widget.onApplied(result);
    } on ApiException catch (e) {
      ref.invalidate(creditPreviewProvider(_key));
      if (!mounted) return;
      final message = switch (e.code) {
        'credit_changed' => l10n.referralPayCreditChanged,
        'payment_in_progress' => l10n.referralPayInProgress,
        'credit_not_applicable' => l10n.referralPayNotApplicable,
        _ => null,
      };
      if (message != null) {
        showInfoSnack(context, message);
      } else {
        showErrorSnack(context, e);
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPatient = ref.watch(currentUserProvider)?.role == UserRole.patient;
    if (!isPatient || !kCreditPurposes.contains(widget.purpose)) return const SizedBox.shrink();
    // The preview never blocks paying: errors and loading simply hide the card.
    final p = ref.watch(creditPreviewProvider(_key)).value;
    if (p == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    if (!p.applicable) {
      final note = switch (p.reason) {
        CreditUnavailableReason.installments when p.availableMinor > 0 => l10n.referralPayNotForInstallments,
        CreditUnavailableReason.amountTooSmall when p.availableMinor > 0 => l10n.referralPayAmountTooSmall,
        _ => null,
      };
      if (note == null) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsetsDirectional.only(top: 10),
        child: Row(
          children: [
            Icon(Icons.info_outline_rounded, size: 18, color: context.palette.textSecondary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(note, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
            ),
          ],
        ),
      );
    }
    final available = formatMoney(p.availableMinor, p.currency);
    final apply = formatMoney(p.applyMinor, p.currency);
    return AppCard(
      key: const ValueKey('credit-pay-card'),
      margin: const EdgeInsetsDirectional.only(top: 10),
      color: AppColors.primary.withValues(alpha: 0.08),
      borderColor: AppColors.primary.withValues(alpha: 0.6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.card_giftcard_rounded, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.referralPayUseCreditTitle,
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(l10n.referralPayUseCreditBody(available, apply), style: context.text.bodyMedium),
          const SizedBox(height: 2),
          Text(
            p.coversAll
                ? l10n.referralPayCoversAll
                : l10n.referralPayRemaining(formatMoney(p.remainingDueMinor, p.currency)),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          const SizedBox(height: 10),
          PrimaryButton(
            key: const ValueKey('credit-apply'),
            label: l10n.referralPayApplyButton,
            icon: Icons.redeem_rounded,
            loading: _busy,
            onPressed: _busy ? null : () => _apply(p),
          ),
        ],
      ),
    );
  }
}
