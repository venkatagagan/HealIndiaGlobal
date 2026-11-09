import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/config/env.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/booking_repository.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/repositories/payment_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/services/biometric_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../logic/payment_plan.dart';
import '../providers/booking_providers.dart';
import '../services/razorpay_launcher.dart';
import '../widgets/approx_money_text.dart';
import '../widgets/option_radio_card.dart';
import 'bank_transfer_screen.dart';
import 'payment_result_screen.dart';

/// Payment: secure banner, method (card via Razorpay / bank transfer SWIFT / payment plans info,
/// mock gateway outside production), insurance, price summary and a biometric-confirmed Pay button.
///
/// Route: `/pay/:bookingId?installment=` · Owner: fl-journey.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key, required this.bookingId, this.installmentId});

  final String bookingId;

  final String? installmentId;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  late PaymentGateway _gateway = Env.razorpaySupported ? PaymentGateway.razorpay : PaymentGateway.bankTransfer;
  bool _busy = false;

  /// One idempotency key per checkout attempt; reused when the same attempt is retried.
  String? _attemptKey;
  String? _attemptSignature;

  String _idempotencyKeyFor(String signature) {
    if (_attemptSignature != signature || _attemptKey == null) {
      _attemptSignature = signature;
      _attemptKey = PaymentRepository.newIdempotencyKey();
    }
    return _attemptKey!;
  }

  void _resetAttempt() {
    _attemptKey = null;
    _attemptSignature = null;
  }

  @override
  Widget build(BuildContext context) {
    final bookingAsync = ref.watch(bookingProvider(widget.bookingId));
    final booking = bookingAsync.value;
    final needsInstallments =
        booking != null && (booking.paymentOption == PaymentOption.installments || widget.installmentId != null);
    final instAsync = needsInstallments ? ref.watch(installmentsProvider(widget.bookingId)) : null;
    final due = booking == null || (instAsync?.isLoading ?? false)
        ? null
        : computePaymentDue(booking, installments: instAsync?.value ?? const [], installmentId: widget.installmentId);
    final ready = booking != null && !(instAsync?.isLoading ?? false);

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.paymentTitle), centerTitle: true),
      body: AsyncValueView<Booking>(
        value: bookingAsync,
        onRetry: () => ref.invalidate(bookingProvider(widget.bookingId)),
        data: (b) {
          if (!ready) return const LoadingView();
          if (due == null) return _NothingDue(booking: b);
          return _content(b, due, instAsync?.value ?? const []);
        },
      ),
      bottomNavigationBar: !ready || due == null
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: _PayButton(gateway: _gateway, busy: _busy, onPressed: () => _pay(booking, due)),
            ),
    );
  }

  Widget _content(Booking b, PaymentDue due, List<Installment> installments) {
    final l10n = context.l10n;
    final preferred = ref.watch(preferredCurrencyProvider);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              const Icon(Icons.lock_outline_rounded, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.paymentSecureTitle,
                      style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      l10n.paymentSecureBody,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        _BookingSummary(booking: b),
        SectionTitle(l10n.paymentMethodSection),
        OptionRadioCard(
          key: const ValueKey('method-card'),
          title: l10n.paymentMethodCard,
          subtitle: Env.razorpaySupported ? 'Visa, MasterCard, Amex, UPI' : l10n.paymentMethodCardAppOnly,
          enabled: Env.razorpaySupported,
          selected: _gateway == PaymentGateway.razorpay,
          onTap: () => setState(() => _gateway = PaymentGateway.razorpay),
        ),
        OptionRadioCard(
          key: const ValueKey('method-bank'),
          title: l10n.bankTransferTitle,
          subtitle: l10n.bankSwiftDetails,
          selected: _gateway == PaymentGateway.bankTransfer,
          onTap: () => setState(() => _gateway = PaymentGateway.bankTransfer),
        ),
        if (!Env.isProduction)
          OptionRadioCard(
            key: const ValueKey('method-mock'),
            title: l10n.paymentTestTitle,
            subtitle: l10n.paymentTestSubtitle,
            selected: _gateway == PaymentGateway.mock,
            onTap: () => setState(() => _gateway = PaymentGateway.mock),
          ),
        OptionRadioCard(
          key: const ValueKey('method-plans'),
          title: l10n.paymentPlansTitle,
          subtitle: b.paymentOption == PaymentOption.installments
              ? l10n.paymentPlansOnBooking(b.installmentMonths ?? installments.length)
              : l10n.paymentPlansChosenWhenBooking,
          selected: false,
          showRadio: false,
          onTap: () => _showPlanSheet(b, installments),
        ),
        SectionTitle(l10n.paymentInsurance),
        AppCard(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 8, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.trailing,
                value: b.insuranceClaimRequested,
                onChanged: null,
                title: Text(l10n.bookingInsuranceClaim),
                subtitle: Text(
                  b.insuranceClaimRequested
                      ? l10n.paymentInsuranceRequestedHelp
                      : l10n.paymentInsuranceChosenWhenBooking,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ),
              if (b.insuranceClaimRequested)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    icon: const Icon(Icons.upload_file_rounded, size: 18),
                    label: Text(l10n.paymentUploadInsuranceDocs),
                    onPressed: () => context.push(Routes.documentsFor(caseId: b.caseId, kind: DocumentKind.other)),
                  ),
                ),
            ],
          ),
        ),
        SectionTitle(l10n.paymentPriceSummary),
        _PriceSummary(booking: b, due: due),
        const SizedBox(height: 10),
        if (preferred.toUpperCase() != due.currency.toUpperCase())
          Text(
            l10n.paymentChargedInCurrency(preferred),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
      ],
    );
  }

  Future<void> _showPlanSheet(Booking b, List<Installment> installments) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) {
        final l10n = ctx.l10n;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.paymentPlansTitle, style: ctx.text.titleLarge),
                const SizedBox(height: 8),
                if (b.paymentOption != PaymentOption.installments)
                  Text(l10n.paymentPlansCurrentOption(b.paymentOption.label), style: ctx.text.bodyMedium)
                else if (installments.isEmpty)
                  Text(l10n.paymentScheduleBeingPrepared, style: ctx.text.bodyMedium)
                else
                  ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.5),
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final i in installments)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              backgroundColor: AppColors.violetSoft,
                              child: Text('${i.seq}', style: const TextStyle(color: AppColors.violet)),
                            ),
                            title: MoneyText(i.amountMinor, i.currency),
                            subtitle: Text(
                              i.dueDate == null ? l10n.paymentDueDatePending : l10n.paymentDueOn(Dates.day(i.dueDate)),
                            ),
                            trailing: StatusBadge.forEnum(i.status, dense: true),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pay(Booking booking, PaymentDue due) async {
    if (_busy) return;
    final gateway = _gateway;
    final l10n = context.l10n;
    if (gateway == PaymentGateway.razorpay && !Env.razorpaySupported) {
      showInfoSnack(context, l10n.paymentCardAppOnlySnack);
      return;
    }
    if (gateway != PaymentGateway.bankTransfer) {
      final ok = await ref
          .read(biometricServiceProvider)
          .confirm(reason: l10n.paymentConfirmReason(formatMoney(due.amountMinor, due.currency)));
      if (!ok) {
        if (mounted) showInfoSnack(context, l10n.paymentNotConfirmed);
        return;
      }
    }
    setState(() => _busy = true);
    try {
      final preferred = ref.read(preferredCurrencyProvider).toUpperCase();
      final key = _idempotencyKeyFor('${gateway.json}|${due.purpose.json}|${due.installment?.id}');
      final checkout = await ref
          .read(paymentRepositoryProvider)
          .createOrder(
            purpose: due.purpose,
            gateway: gateway,
            bookingId: booking.id,
            installmentId: due.installment?.id,
            currency: Currencies.supported.contains(preferred) ? preferred : null,
            idempotencyKey: key,
          );
      if (checkout.order.isPaid) {
        _resetAttempt();
        await _showResult(PaymentResultKind.success, booking, checkout.order);
        return;
      }
      switch (gateway) {
        case PaymentGateway.razorpay:
          await _payWithRazorpay(booking, checkout);
        case PaymentGateway.bankTransfer:
          if (!mounted) return;
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => BankTransferScreen(checkout: checkout, booking: booking),
            ),
          );
          _refreshAfterPayment(booking);
        case PaymentGateway.mock:
          await _payWithMock(booking, checkout);
        case PaymentGateway.stripe:
          if (mounted) showInfoSnack(context, l10n.paymentMethodNotAvailable);
      }
    } on ApiException catch (e) {
      if (e.statusCode == 409 || e.code == 'conflict') _resetAttempt();
      if (mounted) showErrorSnack(context, e);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _payWithRazorpay(Booking booking, Checkout checkout) async {
    final l10n = context.l10n;
    final options = checkout.razorpay;
    if (options == null) {
      throw ApiException(statusCode: 0, code: 'payment_error', message: l10n.paymentCardCheckoutFailed);
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
        _resetAttempt();
        await _showResult(order.isPaid ? PaymentResultKind.success : PaymentResultKind.pending, booking, order);
      case RazorpayFailure(:final message, :final cancelled):
        if (cancelled) {
          if (mounted) showInfoSnack(context, message);
        } else {
          _resetAttempt();
          await _showResult(PaymentResultKind.failure, booking, checkout.order, message: message);
        }
      case RazorpayExternalWallet(:final walletName):
        _resetAttempt();
        await _showResult(
          PaymentResultKind.pending,
          booking,
          checkout.order,
          message: l10n.paymentWalletPending(walletName),
        );
    }
  }

  Future<void> _payWithMock(Booking booking, Checkout checkout) async {
    if (!mounted) return;
    final success = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.paymentTestTitle),
        content: Text(ctx.l10n.paymentTestDialogBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.paymentSimulateFailure)),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ctx.l10n.paymentSimulateSuccess)),
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
    _resetAttempt();
    await _showResult(
      order.isPaid
          ? PaymentResultKind.success
          : (order.isFinal ? PaymentResultKind.failure : PaymentResultKind.pending),
      booking,
      order,
    );
  }

  Future<void> _showResult(PaymentResultKind kind, Booking booking, PaymentOrder order, {String? message}) async {
    _refreshAfterPayment(booking);
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PaymentResultScreen(kind: kind, booking: booking, order: order, message: message),
      ),
    );
  }

  void _refreshAfterPayment(Booking booking) {
    ref.invalidate(bookingProvider(booking.id));
    ref.invalidate(installmentsProvider(booking.id));
    ref.invalidate(bookingPaymentOrdersProvider(booking.id));
    ref.invalidate(caseDetailProvider(booking.caseId));
    ref.invalidate(casesProvider);
    ref.invalidate(patientDashboardProvider);
    ref.invalidate(invoicesProvider);
  }
}

class _PayButton extends ConsumerWidget {
  const _PayButton({required this.gateway, required this.busy, required this.onPressed});

  final PaymentGateway gateway;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (gateway == PaymentGateway.bankTransfer) {
      return PrimaryButton(
        key: const ValueKey('pay-button'),
        label: context.l10n.paymentGetBankDetails,
        icon: Icons.account_balance_rounded,
        tone: ButtonTone.violet,
        loading: busy,
        onPressed: onPressed,
      );
    }
    final biometric = ref.watch(payButtonBiometricProvider).value;
    final label = biometric?.label(context.l10n) ?? context.l10n.paymentPayButton;
    final icon = switch (biometric) {
      PayBiometric.face => Icons.face_rounded,
      PayBiometric.fingerprint => Icons.fingerprint_rounded,
      _ => Icons.lock_rounded,
    };
    return PrimaryButton(
      key: const ValueKey('pay-button'),
      label: label,
      icon: icon,
      tone: ButtonTone.violet,
      loading: busy,
      onPressed: onPressed,
    );
  }
}

class _BookingSummary extends StatelessWidget {
  const _BookingSummary({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final what = booking.package?.name ?? booking.procedure?.name ?? context.l10n.bookingTreatmentFallback;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.local_hospital_outlined, color: AppColors.violet),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(what, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  [
                    booking.hospital.name,
                    if (booking.admissionDate != null)
                      context.l10n.bookingAdmissionDate(Dates.day(booking.admissionDate)),
                  ].join(' · '),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
          Text(booking.bookingNumber, style: context.text.labelSmall),
        ],
      ),
    );
  }
}

class _PriceSummary extends StatelessWidget {
  const _PriceSummary({required this.booking, required this.due});

  final Booking booking;
  final PaymentDue due;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final l10n = context.l10n;
    final ccy = b.currency;
    Widget row(String label, int minor, {bool bold = false, bool negative = false, String? currency, Key? key}) =>
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: bold
                      ? context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)
                      : context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
                ),
              ),
              MoneyText(
                minor,
                currency ?? ccy,
                key: key,
                prefix: negative ? '- ' : null,
                style: bold
                    ? context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)
                    : context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
        );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          row(l10n.paymentSubtotal, b.subtotalMinor),
          if (b.discountMinor > 0) row(l10n.paymentDiscount, b.discountMinor, negative: true),
          if (b.serviceFeeMinor > 0) row(l10n.paymentServiceFee, b.serviceFeeMinor),
          row(l10n.paymentTaxes, b.taxMinor),
          const Divider(height: 18),
          row(l10n.paymentTotal, b.totalMinor, bold: true),
          if (b.amountPaidMinor > 0)
            row(l10n.paymentPaidSoFar, b.amountPaidMinor - b.amountRefundedMinor, negative: true),
          if (b.amountPaidMinor > 0) row(l10n.paymentBalance, b.balanceDueMinor),
          const Divider(height: 18),
          Row(
            children: [
              Expanded(
                child: Text(
                  due.label(l10n),
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.violet),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  MoneyText(
                    due.amountMinor,
                    due.currency,
                    key: const ValueKey('due-now'),
                    style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: AppColors.violet),
                  ),
                  ApproxMoneyText(due.amountMinor, due.currency),
                ],
              ),
            ],
          ),
          if (due.installment?.dueDate != null)
            Text(
              l10n.paymentInstallmentDueOn(due.installment!.seq, Dates.day(due.installment!.dueDate)),
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
        ],
      ),
    );
  }
}

class _NothingDue extends StatelessWidget {
  const _NothingDue({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final cancelled = booking.status == BookingStatus.cancelled;
    final l10n = context.l10n;
    return EmptyView(
      icon: cancelled ? Icons.event_busy_rounded : Icons.verified_rounded,
      title: cancelled ? l10n.paymentBookingCancelledTitle : l10n.paymentNothingDueTitle,
      message: cancelled ? l10n.paymentRefundOriginalMethod : l10n.paymentNothingDueBody(booking.bookingNumber),
      actionLabel: l10n.paymentGoToTrip,
      onAction: () => context.go(Routes.trips),
    );
  }
}
