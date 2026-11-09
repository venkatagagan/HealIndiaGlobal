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
    return Scaffold(
      appBar: AppBar(title: const Text('Bookings & payments')),
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
                        children: const [
                          EmptyView(
                            title: 'No bookings',
                            message: 'Accept a hospital quote, then book the treatment for your patient.',
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
            b.patient?.fullName ?? 'Patient',
            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          Text(
            [
              b.procedure?.name ?? '',
              b.hospital.name,
              'admission ${Dates.day(b.admissionDate)}',
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
                  'due ${money(b.balanceDueMinor, b.currency)}',
                  style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                )
              else
                Text('paid in full', style: context.text.bodySmall?.copyWith(color: AppColors.primary)),
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
        if (mounted) showInfoSnack(context, 'Test payment completed');
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
    final text = [
      'Beneficiary: ${t.beneficiaryName}',
      'Bank: ${t.bankName}',
      'Account: ${t.accountNumber}',
      if (t.ifsc != null) 'IFSC: ${t.ifsc}',
      if (t.swift != null) 'SWIFT: ${t.swift}',
      if (t.iban != null) 'IBAN: ${t.iban}',
      'Reference: ${t.reference}',
      'Amount: ${money(checkout.order.amountMinor, checkout.order.currency)}',
    ].join('\n');
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bank transfer details'),
        content: SelectableText(text),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: text));
              if (ctx.mounted) Navigator.of(ctx).pop();
            },
            child: const Text('Copy & close'),
          ),
        ],
      ),
    );
  }

  Future<void> _cancel(Booking b) async {
    final reason = await promptText(
      context,
      title: 'Cancel booking ${b.bookingNumber}?',
      label: 'Reason',
      confirmLabel: 'Cancel booking',
      required: true,
      maxLines: 3,
    );
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(bookingRepositoryProvider).cancel(b.id, reason: reason);
      _refresh();
      if (mounted) showInfoSnack(context, 'Booking cancelled; refund follows the hospital policy');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final booking = ref.watch(bookingProvider(widget.bookingId));
    return Scaffold(
      appBar: AppBar(title: Text(booking.value?.bookingNumber ?? 'Booking')),
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
                            b.patient?.fullName ?? 'Patient',
                            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        StatusBadge.forEnum(b.status),
                      ],
                    ),
                    const SizedBox(height: 8),
                    InfoRow('Hospital', [b.hospital.name, b.hospital.city].whereType<String>().join(', ')),
                    InfoRow('Doctor', b.doctor?.fullName),
                    InfoRow('Treatment', b.procedure?.name ?? b.package?.name),
                    InfoRow('Admission', Dates.day(b.admissionDate)),
                    if (b.dischargeDate != null) InfoRow('Discharge', Dates.day(b.dischargeDate)),
                    InfoRow(
                      'Payment plan',
                      b.paymentOption == PaymentOption.installments
                          ? '${b.installmentMonths ?? ''} monthly installments'
                          : b.paymentOption.label,
                    ),
                  ],
                ),
              ),
              const SectionTitle('Price summary'),
              AppCard(
                child: Column(
                  children: [
                    InfoRow('Treatment', money(b.subtotalMinor, b.currency)),
                    if (b.discountMinor > 0) InfoRow('Discount', '− ${money(b.discountMinor, b.currency)}'),
                    if (b.serviceFeeMinor > 0) InfoRow('Service fee', money(b.serviceFeeMinor, b.currency)),
                    if (b.taxMinor > 0) InfoRow('Tax', money(b.taxMinor, b.currency)),
                    InfoRow('Total', money(b.totalMinor, b.currency)),
                    InfoRow('Deposit', money(b.depositMinor, b.currency)),
                    InfoRow('Paid', money(b.amountPaidMinor, b.currency)),
                    if (b.amountRefundedMinor > 0) InfoRow('Refunded', money(b.amountRefundedMinor, b.currency)),
                    InfoRow(
                      'Balance due',
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
                  label: 'Collect payment',
                  icon: Icons.payments_outlined,
                  tone: ButtonTone.violet,
                  loading: _busy,
                  onPressed: _busy ? null : () => _collect(b),
                ),
              ],
              if (b.paymentOption == PaymentOption.installments) _installments(b),
              const SectionTitle('Payments'),
              AsyncValueView(
                value: ref.watch(agentBookingOrdersProvider(b.id)),
                compactError: true,
                onRetry: () => ref.invalidate(agentBookingOrdersProvider(b.id)),
                data: (orders) => orders.isEmpty
                    ? Text(
                        'No payments yet.',
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
                label: 'Open case',
                icon: Icons.folder_shared_outlined,
                onPressed: () => context.push(AgentRoutes.caseDetail(b.caseId)),
              ),
              if (b.isCancellable) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _busy ? null : () => _cancel(b),
                  icon: const Icon(Icons.cancel_outlined, color: AppColors.danger),
                  label: const Text('Cancel booking', style: TextStyle(color: AppColors.danger)),
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
      const SectionTitle('Installments'),
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
                subtitle: Text('Due ${Dates.day(i.dueDate)}'),
                trailing: i.status == InstallmentStatus.paid || i.status == InstallmentStatus.cancelled
                    ? StatusBadge.forEnum(i.status, dense: true)
                    : TextButton(
                        onPressed: _busy ? null : () => _collect(b, installment: i),
                        child: const Text('Collect'),
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
            Text('Collect payment', style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              'The amount is computed by the server; the patient can also pay in their own app.',
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
              child: const Column(
                children: [
                  RadioListTile<PaymentGateway>(
                    contentPadding: EdgeInsets.zero,
                    value: PaymentGateway.bankTransfer,
                    title: Text('Bank transfer (SWIFT / NEFT)'),
                  ),
                  if (kDebugMode)
                    RadioListTile<PaymentGateway>(
                      contentPadding: EdgeInsets.zero,
                      value: PaymentGateway.mock,
                      title: Text('Test payment (development only)'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: 'Continue · ~${money(amount, b.currency)}',
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
    return Scaffold(
      appBar: AppBar(title: const Text('Book treatment')),
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
              const SectionTitle('Admission date'),
              AppCard(
                onTap: _pickDate,
                child: Row(
                  children: [
                    const Icon(Icons.calendar_month_rounded, color: AppColors.violet),
                    const SizedBox(width: 12),
                    Expanded(child: Text(_admission == null ? 'Choose a date' : Dates.weekday(_admission))),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
              const SectionTitle('Payment'),
              SegmentedButton<PaymentOption>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: PaymentOption.deposit, label: Text('Deposit')),
                  ButtonSegment(value: PaymentOption.full, label: Text('Full')),
                  ButtonSegment(value: PaymentOption.installments, label: Text('Plan')),
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
                        label: Text('$m months'),
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
                title: const Text('Patient wants to claim insurance'),
              ),
              const SizedBox(height: 16),
              PrimaryButton(
                label: 'Create booking',
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
