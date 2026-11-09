import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/booking_repository.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/payment_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../agent_routes.dart';
import '../data/agent_repository.dart';
import '../shared/portal_widgets.dart';

/// Payment orders of one booking.
final agentBookingOrdersProvider = FutureProvider.autoDispose.family<List<PaymentOrder>, String>(
  (ref, bookingId) async => (await ref.watch(paymentRepositoryProvider).orders(bookingId: bookingId)).items,
);

final agentBookingInstallmentsProvider = FutureProvider.autoDispose.family<List<Installment>, String>(
  (ref, bookingId) => ref.watch(paymentRepositoryProvider).installments(bookingId),
);

// ------------------------------------------------------------------------------------------ list

/// Bookings of the agent's patients.
class AgentBookingsScreen extends ConsumerStatefulWidget {
  const AgentBookingsScreen({super.key});

  @override
  ConsumerState<AgentBookingsScreen> createState() => _AgentBookingsScreenState();
}

class _AgentBookingsScreenState extends ConsumerState<AgentBookingsScreen> {
  BookingStatus? _status;

  @override
  Widget build(BuildContext context) {
    final bookings = ref.watch(bookingsProvider(_status));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.agentBookingsTitle)),
      body: Column(
        children: [
          StatusFilterBar<BookingStatus>(
            options: BookingStatus.values,
            selected: _status,
            labelOf: (s) => s.label,
            onSelected: (s) => setState(() => _status = s),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(bookingsProvider(_status)),
              child: AsyncValueView(
                value: bookings,
                onRetry: () => ref.invalidate(bookingsProvider(_status)),
                data: (page) => page.items.isEmpty
                    ? ListView(
                        children: [
                          EmptyView(
                            title: l10n.agentBookingsEmpty,
                            message: l10n.agentBookingsEmptyHint,
                            icon: Icons.event_busy_outlined,
                          ),
                        ],
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        children: [for (final b in page.items) BookingTile(booking: b)],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Booking row: number, patient, hospital, admission, amounts.
class BookingTile extends StatelessWidget {
  const BookingTile({super.key, required this.booking, this.onTap});

  final Booking booking;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final b = booking;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: onTap ?? () => context.push(AgentRoutes.booking(b.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  b.bookingNumber,
                  style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                ),
              ),
              StatusBadge.forEnum(b.status, dense: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            b.patient?.fullName ?? l10n.portalPatientLabel,
            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          Text(
            [
              b.procedure?.name ?? '',
              b.hospital.name,
              l10n.agentBookingAdmissionShort(Dates.day(b.admissionDate)),
            ].where((s) => s.isNotEmpty).join(' · '),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              MoneyText(b.totalMinor, b.currency, style: context.text.titleSmall),
              if (b.balanceDueMinor > 0)
                Text(
                  l10n.agentBookingDueShort(money(b.balanceDueMinor, b.currency)),
                  style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                )
              else
                Text(l10n.agentBookingPaidInFull, style: context.text.bodySmall?.copyWith(color: AppColors.primary)),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------- detail

/// Booking detail: price summary, payments, installments, collect a payment, cancel.
class AgentBookingDetailScreen extends ConsumerStatefulWidget {
  const AgentBookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<AgentBookingDetailScreen> createState() => _AgentBookingDetailScreenState();
}

class _AgentBookingDetailScreenState extends ConsumerState<AgentBookingDetailScreen> {
  bool _busy = false;

  void _refresh() {
    ref
      ..invalidate(bookingProvider(widget.bookingId))
      ..invalidate(agentBookingOrdersProvider(widget.bookingId))
      ..invalidate(agentBookingInstallmentsProvider(widget.bookingId))
      ..invalidate(bookingsProvider)
      ..invalidate(agentDashboardProvider);
  }

  Future<void> _collect(Booking b, {Installment? installment}) async {
    final choice = await showModalBottomSheet<_PaymentChoice>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _CollectPaymentSheet(booking: b, installment: installment),
    );
    if (choice == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final repo = ref.read(paymentRepositoryProvider);
      final checkout = await repo.createOrder(
        purpose: choice.purpose,
        gateway: choice.gateway,
        bookingId: b.id,
        installmentId: installment?.id,
      );
      if (choice.gateway == PaymentGateway.mock) {
        await repo.completeMock(checkout.order.id);
        if (mounted) showInfoSnack(context, context.l10n.agentTestPaymentCompleted);
      } else if (checkout.bankTransfer != null && mounted) {
        await _showBankDetails(checkout);
      }
      _refresh();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showBankDetails(Checkout checkout) {
    final t = checkout.bankTransfer!;
    final l10n = context.l10n;
    final text = [
      l10n.agentBankBeneficiary(t.beneficiaryName),
      l10n.agentBankName(t.bankName),
      l10n.agentBankAccount(t.accountNumber),
      // Banking code names (IFSC / SWIFT / IBAN) are international identifiers, not translated.
      if (t.ifsc != null) 'IFSC: ${t.ifsc}',
      if (t.swift != null) 'SWIFT: ${t.swift}',
      if (t.iban != null) 'IBAN: ${t.iban}',
      l10n.agentBankReference(t.reference),
      l10n.agentBankAmount(money(checkout.order.amountMinor, checkout.order.currency)),
    ].join('\n');
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.agentBankTransferDetailsTitle),
        content: SelectableText(text),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: text));
              if (ctx.mounted) Navigator.of(ctx).pop();
            },
            child: Text(l10n.agentCopyAndClose),
          ),
        ],
      ),
    );
  }

  Future<void> _cancel(Booking b) async {
    final l10n = context.l10n;
    final reason = await promptText(
      context,
      title: l10n.agentCancelBookingTitle(b.bookingNumber),
      label: l10n.agentReason,
      confirmLabel: l10n.agentCancelBooking,
      required: true,
      maxLines: 3,
    );
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(bookingRepositoryProvider).cancel(b.id, reason: reason);
      _refresh();
      if (mounted) showInfoSnack(context, l10n.agentBookingCancelledRefund);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final booking = ref.watch(bookingProvider(widget.bookingId));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(booking.value?.bookingNumber ?? l10n.portalBookingLabel)),
      body: AsyncValueView(
        value: booking,
        onRetry: () => ref.invalidate(bookingProvider(widget.bookingId)),
        data: (b) => RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: ListView(
            padding: AppSpacing.pageAll,
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            b.patient?.fullName ?? l10n.portalPatientLabel,
                            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        StatusBadge.forEnum(b.status),
                      ],
                    ),
                    const SizedBox(height: 8),
                    InfoRow(
                      l10n.portalHospitalLabel,
                      [b.hospital.name, b.hospital.city].whereType<String>().join(', '),
                    ),
                    InfoRow(l10n.portalDoctorLabel, b.doctor?.fullName),
                    InfoRow(l10n.agentBookingTreatment, b.procedure?.name ?? b.package?.name),
                    InfoRow(l10n.agentBookingAdmission, Dates.day(b.admissionDate)),
                    if (b.dischargeDate != null) InfoRow(l10n.agentBookingDischarge, Dates.day(b.dischargeDate)),
                    InfoRow(
                      l10n.agentBookingPaymentPlan,
                      b.paymentOption == PaymentOption.installments && b.installmentMonths != null
                          ? l10n.agentBookingMonthlyInstallments(b.installmentMonths!)
                          : b.paymentOption.label,
                    ),
                  ],
                ),
              ),
              SectionTitle(l10n.agentPriceSummary),
              AppCard(
                child: Column(
                  children: [
                    InfoRow(l10n.agentBookingTreatment, money(b.subtotalMinor, b.currency)),
                    if (b.discountMinor > 0)
                      InfoRow(l10n.agentPriceDiscount, '− ${money(b.discountMinor, b.currency)}'),
                    if (b.serviceFeeMinor > 0) InfoRow(l10n.agentPriceServiceFee, money(b.serviceFeeMinor, b.currency)),
                    if (b.taxMinor > 0) InfoRow(l10n.agentPriceTax, money(b.taxMinor, b.currency)),
                    InfoRow(l10n.portalTotal, money(b.totalMinor, b.currency)),
                    InfoRow(l10n.agentPriceDeposit, money(b.depositMinor, b.currency)),
                    InfoRow(l10n.agentPricePaid, money(b.amountPaidMinor, b.currency)),
                    if (b.amountRefundedMinor > 0)
                      InfoRow(l10n.agentPriceRefunded, money(b.amountRefundedMinor, b.currency)),
                    InfoRow(
                      l10n.agentPriceBalanceDue,
                      null,
                      valueWidget: Text(
                        money(b.balanceDueMinor, b.currency),
                        style: context.text.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: b.balanceDueMinor > 0 ? AppColors.warning : AppColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (b.isActive && b.balanceDueMinor > 0 && b.paymentOption != PaymentOption.installments) ...[
                const SizedBox(height: 12),
                PrimaryButton(
                  key: const ValueKey('agent-collect-payment'),
                  label: l10n.agentCollectPayment,
                  icon: Icons.payments_outlined,
                  tone: ButtonTone.violet,
                  loading: _busy,
                  onPressed: _busy ? null : () => _collect(b),
                ),
              ],
              if (b.paymentOption == PaymentOption.installments) _installments(b),
              SectionTitle(l10n.agentPaymentsSection),
              AsyncValueView(
                value: ref.watch(agentBookingOrdersProvider(b.id)),
                compactError: true,
                onRetry: () => ref.invalidate(agentBookingOrdersProvider(b.id)),
                data: (orders) => orders.isEmpty
                    ? Text(
                        l10n.agentPaymentsEmpty,
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      )
                    : Column(
                        children: [
                          for (final o in orders)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text('${o.purpose.label} · ${money(o.amountMinor, o.currency)}'),
                              subtitle: Text(
                                '${o.orderNumber} · ${o.gateway.label} · ${Dates.dayTime(o.paidAt ?? o.createdAt)}',
                              ),
                              trailing: StatusBadge.forEnum(o.status, dense: true),
                            ),
                        ],
                      ),
              ),
              const SizedBox(height: 16),
              SecondaryButton(
                label: l10n.agentOpenCase,
                icon: Icons.folder_shared_outlined,
                onPressed: () => context.push(AgentRoutes.caseDetail(b.caseId)),
              ),
              if (b.isCancellable) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _busy ? null : () => _cancel(b),
                  icon: const Icon(Icons.cancel_outlined, color: AppColors.danger),
                  label: Text(l10n.agentCancelBooking, style: const TextStyle(color: AppColors.danger)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _installments(Booking b) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionTitle(context.l10n.agentInstallmentsSection),
      AsyncValueView(
        value: ref.watch(agentBookingInstallmentsProvider(b.id)),
        compactError: true,
        onRetry: () => ref.invalidate(agentBookingInstallmentsProvider(b.id)),
        data: (list) => Column(
          children: [
            for (final i in list)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('#${i.seq} · ${money(i.amountMinor, i.currency)}'),
                subtitle: Text(context.l10n.agentInstallmentDue(Dates.day(i.dueDate))),
                trailing: i.status == InstallmentStatus.paid || i.status == InstallmentStatus.cancelled
                    ? StatusBadge.forEnum(i.status, dense: true)
                    : TextButton(
                        onPressed: _busy ? null : () => _collect(b, installment: i),
                        child: Text(context.l10n.agentInstallmentCollect),
                      ),
              ),
          ],
        ),
      ),
    ],
  );
}

class _PaymentChoice {
  const _PaymentChoice(this.purpose, this.gateway);

  final PaymentPurpose purpose;
  final PaymentGateway gateway;
}

class _CollectPaymentSheet extends StatefulWidget {
  const _CollectPaymentSheet({required this.booking, this.installment});

  final Booking booking;
  final Installment? installment;

  @override
  State<_CollectPaymentSheet> createState() => _CollectPaymentSheetState();
}

class _CollectPaymentSheetState extends State<_CollectPaymentSheet> {
  late PaymentPurpose _purpose = widget.installment != null
      ? PaymentPurpose.installment
      : widget.booking.amountPaidMinor == 0 && widget.booking.paymentOption == PaymentOption.deposit
      ? PaymentPurpose.bookingDeposit
      : widget.booking.amountPaidMinor == 0
      ? PaymentPurpose.bookingFull
      : PaymentPurpose.bookingBalance;
  PaymentGateway _gateway = PaymentGateway.bankTransfer;

  @override
  Widget build(BuildContext context) {
    final b = widget.booking;
    final purposes = widget.installment != null
        ? const [PaymentPurpose.installment]
        : b.amountPaidMinor == 0
        ? const [PaymentPurpose.bookingDeposit, PaymentPurpose.bookingFull]
        : const [PaymentPurpose.bookingBalance];
    final l10n = context.l10n;
    final amount = switch (_purpose) {
      PaymentPurpose.installment => widget.installment?.amountMinor ?? 0,
      PaymentPurpose.bookingDeposit => b.depositMinor,
      _ => b.balanceDueMinor,
    };
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.agentCollectPayment, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              l10n.agentCollectPaymentHint,
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            const SizedBox(height: 12),
            RadioGroup<PaymentPurpose>(
              groupValue: _purpose,
              onChanged: (v) => setState(() => _purpose = v ?? _purpose),
              child: Column(
                children: [
                  for (final p in purposes)
                    RadioListTile<PaymentPurpose>(contentPadding: EdgeInsets.zero, value: p, title: Text(p.label)),
                ],
              ),
            ),
            const Divider(),
            RadioGroup<PaymentGateway>(
              groupValue: _gateway,
              onChanged: (v) => setState(() => _gateway = v ?? _gateway),
              child: Column(
                children: [
                  RadioListTile<PaymentGateway>(
                    contentPadding: EdgeInsets.zero,
                    value: PaymentGateway.bankTransfer,
                    title: Text(l10n.agentCollectBankTransferOption),
                  ),
                  // Debug builds only: developer test gateway, not translated.
                  if (kDebugMode)
                    const RadioListTile<PaymentGateway>(
                      contentPadding: EdgeInsets.zero,
                      value: PaymentGateway.mock,
                      title: Text('Test payment (development only)'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: l10n.agentCollectContinueAmount(money(amount, b.currency)),
              onPressed: () => Navigator.of(context).pop(_PaymentChoice(_purpose, _gateway)),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------- create booking

/// Book the treatment of an accepted quote (`POST /bookings`).
class AgentCreateBookingScreen extends ConsumerStatefulWidget {
  const AgentCreateBookingScreen({super.key, required this.caseId, this.quoteId});

  final String caseId;
  final String? quoteId;

  @override
  ConsumerState<AgentCreateBookingScreen> createState() => _AgentCreateBookingScreenState();
}

class _AgentCreateBookingScreenState extends ConsumerState<AgentCreateBookingScreen> {
  DateTime? _admission;
  PaymentOption _option = PaymentOption.deposit;
  int _months = 6;
  bool _insurance = false;
  bool _saving = false;

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _admission ?? now.add(const Duration(days: 21)),
      firstDate: now.add(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _admission = picked);
  }

  Future<void> _submit() async {
    final date = _admission;
    if (date == null) return;
    setState(() => _saving = true);
    try {
      final booking = await ref
          .read(bookingRepositoryProvider)
          .create(
            caseId: widget.caseId,
            quoteId: widget.quoteId,
            admissionDate: date,
            paymentOption: _option,
            installmentMonths: _months,
            insuranceClaimRequested: _insurance,
          );
      ref
        ..invalidate(caseDetailProvider(widget.caseId))
        ..invalidate(bookingsProvider)
        ..invalidate(agentCasesProvider);
      if (mounted) context.pushReplacement(AgentRoutes.booking(booking.id));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(caseDetailProvider(widget.caseId));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.agentBookTreatment)),
      body: AsyncValueView(
        value: detail,
        onRetry: () => ref.invalidate(caseDetailProvider(widget.caseId)),
        data: (c) {
          final quote = c.quotes.where((q) => q.id == widget.quoteId).firstOrNull ?? c.latestQuote;
          return ListView(
            padding: AppSpacing.pageAll,
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.patient?.fullName ?? '',
                      style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '${c.title} · ${c.hospital.name}',
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                    if (quote != null) ...[const Divider(height: 20), QuoteBreakdown(quote: quote)],
                  ],
                ),
              ),
              SectionTitle(l10n.agentAdmissionDate),
              AppCard(
                onTap: _pickDate,
                child: Row(
                  children: [
                    const Icon(Icons.calendar_month_rounded, color: AppColors.violet),
                    const SizedBox(width: 12),
                    Expanded(child: Text(_admission == null ? l10n.agentChooseDate : Dates.weekday(_admission))),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
              SectionTitle(l10n.agentPaymentSection),
              SegmentedButton<PaymentOption>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: PaymentOption.deposit, label: Text(l10n.agentPaymentOptionDeposit)),
                  ButtonSegment(value: PaymentOption.full, label: Text(l10n.agentPaymentOptionFull)),
                  ButtonSegment(value: PaymentOption.installments, label: Text(l10n.agentPaymentOptionPlan)),
                ],
                selected: {_option},
                onSelectionChanged: (s) => setState(() => _option = s.first),
              ),
              if (_option == PaymentOption.installments) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final m in const [3, 6, 12])
                      ChoiceChip(
                        label: Text(l10n.agentInstallmentMonthsChip(m)),
                        selected: _months == m,
                        onSelected: (_) => setState(() => _months = m),
                      ),
                  ],
                ),
              ],
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _insurance,
                onChanged: (v) => setState(() => _insurance = v ?? false),
                title: Text(l10n.agentInsuranceClaim),
              ),
              const SizedBox(height: 16),
              PrimaryButton(
                label: l10n.agentCreateBooking,
                loading: _saving,
                onPressed: _admission == null || _saving ? null : _submit,
              ),
            ],
          );
        },
      ),
    );
  }
}
