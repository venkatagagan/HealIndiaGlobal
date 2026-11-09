import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/payment_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';

enum PaymentResultKind { success, pending, failure }

/// Outcome page after a payment attempt (pushed with `Navigator`): success with receipt download,
/// pending (bank transfer / wallet awaiting confirmation) or failure with retry.
class PaymentResultScreen extends ConsumerStatefulWidget {
  const PaymentResultScreen({super.key, required this.kind, required this.booking, this.order, this.message});

  final PaymentResultKind kind;
  final Booking booking;
  final PaymentOrder? order;
  final String? message;

  @override
  ConsumerState<PaymentResultScreen> createState() => _PaymentResultScreenState();
}

class _PaymentResultScreenState extends ConsumerState<PaymentResultScreen> {
  bool _loadingReceipt = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (icon, color, title) = switch (widget.kind) {
      PaymentResultKind.success => (Icons.check_rounded, AppColors.primary, l10n.paymentResultSuccessTitle),
      PaymentResultKind.pending => (Icons.hourglass_top_rounded, AppColors.warning, l10n.paymentResultPendingTitle),
      PaymentResultKind.failure => (Icons.close_rounded, AppColors.danger, l10n.paymentResultFailureTitle),
    };
    final order = widget.order;
    final defaultMessage = switch (widget.kind) {
      PaymentResultKind.success => l10n.paymentResultSuccessBody(widget.booking.bookingNumber),
      PaymentResultKind.pending => l10n.paymentResultPendingBody,
      PaymentResultKind.failure => l10n.paymentResultFailureBody,
    };
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: widget.kind == PaymentResultKind.failure,
        title: Text(l10n.paymentTitle),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
        children: [
          Center(
            child: switch (widget.kind) {
              PaymentResultKind.success => const BrandSvg(BrandAssets.success, height: 150),
              PaymentResultKind.failure => const BrandSvg(BrandAssets.error, height: 150),
              PaymentResultKind.pending => Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(icon, size: 56, color: color),
              ),
            },
          ),
          const SizedBox(height: 20),
          Text(title, textAlign: TextAlign.center, style: context.text.headlineSmall),
          const SizedBox(height: 8),
          Text(
            widget.message ?? defaultMessage,
            textAlign: TextAlign.center,
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
          ),
          if (order != null) ...[
            const SizedBox(height: 24),
            AppCard(
              child: Column(
                children: [
                  _row(context, l10n.paymentResultAmount, MoneyText(order.amountMinor, order.currency)),
                  _row(context, l10n.paymentResultOrder, Text(order.orderNumber)),
                  _row(context, l10n.bookingLabel, Text(widget.booking.bookingNumber)),
                  if (order.paidAt != null) _row(context, l10n.paymentResultPaidOn, Text(Dates.dayTime(order.paidAt))),
                  _row(context, l10n.paymentResultStatus, StatusBadge.forEnum(order.status, dense: true)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
          if (widget.kind == PaymentResultKind.success && order != null) ...[
            SecondaryButton(
              label: l10n.paymentDownloadReceipt,
              icon: Icons.receipt_long_rounded,
              loading: _loadingReceipt,
              onPressed: () => _downloadReceipt(order),
            ),
            const SizedBox(height: 12),
          ],
          if (widget.kind == PaymentResultKind.failure) ...[
            PrimaryButton(
              label: l10n.commonTryAgain,
              tone: ButtonTone.violet,
              onPressed: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 12),
            SecondaryButton(
              label: l10n.paymentGetHelp,
              icon: Icons.support_agent_rounded,
              onPressed: () => context.go(Routes.messages),
            ),
          ] else ...[
            PrimaryButton(
              label: l10n.paymentGoToTrip,
              tone: ButtonTone.violet,
              onPressed: () => context.go(Routes.trips),
            ),
            const SizedBox(height: 12),
            SecondaryButton(
              label: l10n.caseViewCase,
              onPressed: () => context.go(Routes.caseDetail(widget.booking.caseId)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, Widget value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      children: [
        Text(label, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
        const Spacer(),
        DefaultTextStyle.merge(
          style: const TextStyle(fontWeight: FontWeight.w600),
          child: value,
        ),
      ],
    ),
  );

  Future<void> _downloadReceipt(PaymentOrder order) async {
    setState(() => _loadingReceipt = true);
    try {
      final repo = ref.read(paymentRepositoryProvider);
      final invoices = await repo.invoices(bookingId: widget.booking.id);
      final match = invoices.where((i) => i.orderId == order.id).toList();
      if (match.isEmpty) {
        if (mounted) {
          showInfoSnack(context, context.l10n.paymentReceiptPreparing);
        }
        return;
      }
      final invoice = match.first;
      final bytes = await repo.invoicePdf(invoice.id);
      final name = 'receipt-${invoice.invoiceNumber.replaceAll(RegExp(r'[^A-Za-z0-9-]'), '-')}.pdf';
      final saved = await saveBytes(fileName: name, bytes: bytes, mimeType: 'application/pdf');
      if (saved && mounted) showInfoSnack(context, context.l10n.paymentReceiptSaved);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _loadingReceipt = false);
    }
  }
}
