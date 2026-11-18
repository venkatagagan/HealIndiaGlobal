import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/config/env.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/payment_repository.dart';
import '../../../core/services/biometric_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../booking/providers/booking_providers.dart';
import '../../booking/services/razorpay_launcher.dart';
import '../../booking/widgets/option_radio_card.dart';
import '../data/consultation_providers.dart';

/// Outcome of [showConsultationPaySheet].
enum ConsultationPayOutcome { paid, pending, failed, cancelled }

/// Pays a consultation's fee with the booking payment flow (`POST /payments/orders` with
/// `purpose: consultation_fee`, Razorpay checkout + `POST /payments/orders/{id}/verify`; the mock gateway
/// outside production). Shows the outcome as a snackbar and refreshes the fee state.
Future<ConsultationPayOutcome> showConsultationPaySheet(BuildContext context, Consultation consultation) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final l10n = context.l10n;
  final outcome = await showModalBottomSheet<ConsultationPayOutcome>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (_) => ConsultationPaySheet(consultation: consultation),
  );
  final message = switch (outcome) {
    ConsultationPayOutcome.paid => l10n.consultPaySuccess,
    ConsultationPayOutcome.pending => l10n.consultPayPending,
    ConsultationPayOutcome.failed => l10n.consultPayFailed,
    _ => null,
  };
  if (message != null) {
    messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
  return outcome ?? ConsultationPayOutcome.cancelled;
}

class ConsultationPaySheet extends ConsumerStatefulWidget {
  const ConsultationPaySheet({super.key, required this.consultation});

  final Consultation consultation;

  @override
  ConsumerState<ConsultationPaySheet> createState() => _ConsultationPaySheetState();
}

class _ConsultationPaySheetState extends ConsumerState<ConsultationPaySheet> {
  late PaymentGateway _gateway = Env.razorpaySupported
      ? PaymentGateway.razorpay
      : (Env.isProduction ? PaymentGateway.razorpay : PaymentGateway.mock);
  bool _busy = false;
  String? _error;

  /// One idempotency key per attempt (reused if the same attempt is retried).
  String? _key;
  String? _keyFor;

  String _idempotencyKey(String signature) {
    if (_keyFor != signature || _key == null) {
      _keyFor = signature;
      _key = PaymentRepository.newIdempotencyKey();
    }
    return _key!;
  }

  Consultation get _c => widget.consultation;

  void _finish(ConsultationPayOutcome outcome) {
    ref.invalidate(consultationFeeStateProvider(_c.id));
    ref.invalidate(consultationProvider(_c.id));
    ref.invalidate(myConsultationsProvider);
    if (mounted) Navigator.of(context).pop(outcome);
  }

  Future<void> _pay() async {
    if (_busy) return;
    final l10n = context.l10n;
    final amount = formatMoney(_c.feeMinor ?? 0, _c.currency);
    if (_gateway == PaymentGateway.razorpay && !Env.razorpaySupported) {
      setState(() => _error = l10n.paymentCardAppOnlySnack);
      return;
    }
    final ok = await ref.read(biometricServiceProvider).confirm(reason: l10n.paymentConfirmReason(amount));
    if (!ok) {
      if (mounted) setState(() => _error = l10n.paymentNotConfirmed);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(paymentRepositoryProvider);
      final preferred = ref.read(preferredCurrencyProvider).toUpperCase();
      final checkout = await repo.createOrder(
        purpose: PaymentPurpose.consultationFee,
        gateway: _gateway,
        consultationId: _c.id,
        currency: Currencies.supported.contains(preferred) ? preferred : null,
        idempotencyKey: _idempotencyKey('${_gateway.json}|${_c.id}'),
      );
      if (checkout.order.isPaid) return _finish(ConsultationPayOutcome.paid);
      switch (_gateway) {
        case PaymentGateway.razorpay:
          await _razorpay(checkout);
        case PaymentGateway.mock:
          await _mock(checkout);
        case PaymentGateway.bankTransfer || PaymentGateway.stripe:
          if (mounted) setState(() => _error = l10n.paymentMethodNotAvailable);
      }
    } on ApiException catch (e) {
      if (e.code == 'already_paid') return _finish(ConsultationPayOutcome.paid);
      if (e.isConflict) _key = null;
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _razorpay(Checkout checkout) async {
    final options = checkout.razorpay;
    if (options == null) {
      setState(() => _error = context.l10n.paymentCardCheckoutFailed);
      return;
    }
    final outcome = await ref.read(razorpayLauncherProvider).open(options.toRazorpayOptions());
    switch (outcome) {
      case RazorpaySuccess(:final paymentId, :final orderId, :final signature):
        final order = await ref
            .read(paymentRepositoryProvider)
            .verifyRazorpay(
              checkout.order.id,
              razorpayPaymentId: paymentId,
              razorpayOrderId: orderId,
              razorpaySignature: signature,
            );
        _key = null;
        _finish(order.isPaid ? ConsultationPayOutcome.paid : ConsultationPayOutcome.pending);
      case RazorpayFailure(:final message, :final cancelled):
        if (cancelled) {
          if (mounted) setState(() => _error = message);
        } else {
          _key = null;
          _finish(ConsultationPayOutcome.failed);
        }
      case RazorpayExternalWallet():
        _key = null;
        _finish(ConsultationPayOutcome.pending);
    }
  }

  Future<void> _mock(Checkout checkout) async {
    final success = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.paymentTestTitle),
        content: Text(ctx.l10n.paymentTestDialogBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.paymentSimulateFailure)),
          FilledButton(
            key: const ValueKey('consult-mock-success'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(ctx.l10n.paymentSimulateSuccess),
          ),
        ],
      ),
    );
    if (success == null) return;
    final repo = ref.read(paymentRepositoryProvider);
    var order = await repo.completeMock(checkout.order.id, success: success) ?? await repo.order(checkout.order.id);
    for (var i = 0; i < 4 && !order.isFinal; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 800));
      order = await repo.order(checkout.order.id);
    }
    _key = null;
    _finish(
      order.isPaid
          ? ConsultationPayOutcome.paid
          : (order.isFinal ? ConsultationPayOutcome.failed : ConsultationPayOutcome.pending),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final amount = formatMoney(_c.feeMinor ?? 0, _c.currency);
    return SingleChildScrollView(
      padding: const EdgeInsetsDirectional.fromSTEB(20, 0, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.consultPayTitle, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          PriceText(_c.feeMinor ?? 0, _c.currency, style: context.text.headlineSmall),
          const SizedBox(height: 16),
          OptionRadioCard(
            key: const ValueKey('consult-method-card'),
            title: l10n.paymentMethodCard,
            subtitle: Env.razorpaySupported ? 'Visa, MasterCard, Amex, UPI' : l10n.paymentMethodCardAppOnly,
            enabled: Env.razorpaySupported,
            selected: _gateway == PaymentGateway.razorpay,
            onTap: () => setState(() => _gateway = PaymentGateway.razorpay),
          ),
          if (!Env.isProduction)
            OptionRadioCard(
              key: const ValueKey('consult-method-mock'),
              title: l10n.paymentTestTitle,
              subtitle: l10n.paymentTestSubtitle,
              selected: _gateway == PaymentGateway.mock,
              onTap: () => setState(() => _gateway = PaymentGateway.mock),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: 12),
          PrimaryButton(
            key: const ValueKey('consult-pay-confirm'),
            label: l10n.consultPayButton(amount),
            icon: Icons.lock_outline_rounded,
            loading: _busy,
            onPressed: _pay,
          ),
        ],
      ),
    );
  }
}
