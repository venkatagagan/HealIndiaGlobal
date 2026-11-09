import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/realtime_service.dart';
import '../../../core/repositories/booking_repository.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../booking/logic/booking_gates.dart';
import '../services/file_actions.dart';
import '../services/journey_actions.dart';
import '../widgets/case_widgets.dart';
import 'travel_screen.dart';

/// Case detail: itemized quotes (accept / decline), booking status and payment, travel, status
/// timeline, documents and messaging.
///
/// Route: `/cases/:id` · Owner: fl-journey.
class CaseDetailScreen extends ConsumerStatefulWidget {
  const CaseDetailScreen({super.key, required this.caseId});

  final String caseId;

  @override
  ConsumerState<CaseDetailScreen> createState() => _CaseDetailScreenState();
}

class _CaseDetailScreenState extends ConsumerState<CaseDetailScreen> {
  String? _busyQuoteId;
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    ref.listen(realtimeEventsProvider, (_, next) {
      final e = next.value;
      if (e == null) return;
      if ((e.type == RealtimeEvents.caseUpdated || e.type == RealtimeEvents.bookingUpdated) &&
          (e.data['case_id'] == null || e.data['case_id'] == widget.caseId)) {
        ref.invalidate(caseDetailProvider(widget.caseId));
      }
    });
    final detail = ref.watch(caseDetailProvider(widget.caseId));
    return Scaffold(
      appBar: AppBar(
        title: Text(detail.value?.caseNumber ?? context.l10n.caseTitleFallback),
        centerTitle: true,
        actions: [
          if (detail.value != null)
            IconButton(
              tooltip: context.l10n.caseMessageTooltip,
              icon: const Icon(Icons.chat_outlined),
              onPressed: () => openCoordinatorChat(context, ref, caseId: widget.caseId),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(caseDetailProvider(widget.caseId).future),
        child: AsyncValueView<MedicalCaseDetail>(
          value: detail,
          onRetry: () => ref.invalidate(caseDetailProvider(widget.caseId)),
          data: _body,
        ),
      ),
    );
  }

  Widget _body(MedicalCaseDetail c) {
    final l10n = context.l10n;
    final booking = c.booking != null && c.booking!.status != BookingStatus.cancelled ? c.booking : null;
    final quotes = [...c.quotes]..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
    if (quotes.isEmpty && c.latestQuote != null) quotes.add(c.latestQuote!);
    final canCancelCase =
        const {CaseStatus.enquiry, CaseStatus.quoted, CaseStatus.accepted}.contains(c.status) && booking == null;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _header(c),
        if (caseNextStep(c, l10n) case final next?) ...[
          const SizedBox(height: 10),
          AppCard(
            color: AppColors.violet.withValues(alpha: 0.12),
            borderColor: AppColors.violet.withValues(alpha: 0.4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                const Icon(Icons.info_outline_rounded, color: AppColors.violet),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(next, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
        ],
        if (booking != null) ...[SectionTitle(l10n.bookingLabel), _bookingCard(c, booking)],
        SectionTitle(l10n.caseQuotesSection),
        if (quotes.isEmpty)
          AppCard(
            child: Text(
              c.status == CaseStatus.enquiry ? l10n.caseQuotePending : l10n.caseNoQuotes,
              style: context.text.bodyMedium,
            ),
          ),
        for (final q in quotes)
          QuoteCard(
            quote: q,
            busy: _busyQuoteId == q.id,
            onAccept: q.isActionable && c.status == CaseStatus.quoted ? () => _accept(c, q) : null,
            onReject: q.isActionable && c.status == CaseStatus.quoted ? () => _reject(c, q) : null,
            onBook: q.status == QuoteStatus.accepted && booking == null && c.isOpen
                ? () => context.push(Routes.book(c.id, quoteId: q.id))
                : null,
          ),
        if (booking == null && c.isOpen && c.status != CaseStatus.accepted)
          TextButton.icon(
            icon: const Icon(Icons.inventory_2_outlined),
            label: Text(l10n.caseBookPackageInstead),
            onPressed: () => context.push(Routes.book(c.id)),
          ),
        if (c.medicalSummary != null && c.medicalSummary!.isNotEmpty) ...[
          SectionTitle(l10n.caseMedicalSummary),
          AppCard(child: Text(c.medicalSummary!, style: context.text.bodyMedium)),
        ],
        if (c.patientNotes != null && c.patientNotes!.isNotEmpty) ...[
          SectionTitle(l10n.caseYourNotes),
          AppCard(child: Text(c.patientNotes!, style: context.text.bodyMedium)),
        ],
        SectionTitle(
          l10n.documentsTitle,
          actionLabel: l10n.caseDocumentsManage,
          onAction: () => context.push(Routes.documentsFor(caseId: c.id)),
        ),
        if (c.documents.isEmpty)
          AppCard(
            onTap: () => context.push(Routes.documentsFor(caseId: c.id)),
            child: Row(
              children: [
                const Icon(Icons.upload_file_rounded, color: AppColors.violet),
                const SizedBox(width: 12),
                Expanded(child: Text(l10n.caseDocumentsEmpty, style: context.text.bodyMedium)),
              ],
            ),
          )
        else
          for (final d in c.documents.take(5))
            AppCard(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
              onTap: () => openDocument(context, ref.read(documentRepositoryProvider), d),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(documentKindIcon(d.kind), color: AppColors.violet),
                title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${d.kind.label} · ${Dates.day(d.createdAt)}'),
                trailing: StatusBadge.forEnum(d.status, dense: true),
              ),
            ),
        if (c.timeline.isNotEmpty) ...[
          SectionTitle(l10n.caseStatusTimeline),
          AppCard(child: CaseTimeline(entries: c.timeline)),
        ],
        const SizedBox(height: 16),
        SecondaryButton(
          label: l10n.caseMessageCareTeam,
          icon: Icons.chat_outlined,
          onPressed: () => openCoordinatorChat(context, ref, caseId: c.id),
        ),
        if (canCancelCase) ...[
          const SizedBox(height: 10),
          TextButton(
            onPressed: _busy ? null : () => _cancelCase(c),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: Text(l10n.caseCancelThisCase),
          ),
        ],
      ],
    );
  }

  Widget _header(MedicalCaseDetail c) {
    final l10n = context.l10n;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(c.title, style: context.text.titleLarge)),
              StatusBadge.forEnum(c.status),
            ],
          ),
          const SizedBox(height: 6),
          _iconLine(Icons.local_hospital_outlined, [c.hospital.name, ?c.hospital.city].join(', ')),
          if (c.doctor != null)
            _iconLine(Icons.person_outline_rounded, [c.doctor!.fullName, ?c.doctor!.specialtyName].join(' · ')),
          if (c.coordinator != null) _iconLine(Icons.badge_outlined, l10n.caseCoordinator(c.coordinator!.fullName)),
          if (c.agent != null) _iconLine(Icons.handshake_outlined, l10n.caseAgent(c.agent!.agencyName)),
          if (c.createdAt != null) _iconLine(Icons.schedule_rounded, l10n.caseOpenedOn(Dates.day(c.createdAt))),
        ],
      ),
    );
  }

  Widget _iconLine(IconData icon, String text) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Row(
      children: [
        Icon(icon, size: 16, color: context.palette.textSecondary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
        ),
      ],
    ),
  );

  Widget _bookingCard(MedicalCaseDetail c, Booking b) {
    final l10n = context.l10n;
    Widget row(String label, Widget value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
          ),
          value,
        ],
      ),
    );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(b.bookingNumber, style: context.text.titleSmall)),
              StatusBadge.forEnum(b.status, dense: true),
            ],
          ),
          const SizedBox(height: 8),
          if (b.package != null) row(l10n.caseBookingPackage, Text(b.package!.name)),
          if (b.admissionDate != null) row(l10n.caseBookingAdmission, Text(Dates.day(b.admissionDate))),
          if (b.durationDays != null) row(l10n.caseBookingDuration, Text(l10n.caseDurationDays(b.durationDays!))),
          row(l10n.caseBookingPaymentPlan, Text(_planLabel(l10n, b))),
          row(l10n.paymentTotal, MoneyText(b.totalMinor, b.currency)),
          row(l10n.caseBookingPaid, MoneyText(b.amountPaidMinor - b.amountRefundedMinor, b.currency)),
          row(
            l10n.paymentBalance,
            MoneyText(
              b.balanceDueMinor,
              b.currency,
              style: TextStyle(fontWeight: FontWeight.w800, color: b.balanceDueMinor > 0 ? AppColors.violet : null),
            ),
          ),
          if (b.insuranceClaimRequested) row(l10n.paymentInsurance, Text(l10n.caseClaimRequested)),
          const SizedBox(height: 12),
          if (b.balanceDueMinor > 0)
            PrimaryButton(
              label: b.isPendingPayment ? l10n.casePayToConfirm : l10n.casePayBalance,
              tone: ButtonTone.violet,
              onPressed: () => context.push(Routes.pay(b.id)),
            ),
          const SizedBox(height: 8),
          SecondaryButton(
            label: l10n.travelVisaAndTravel,
            icon: Icons.flight_rounded,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => TravelScreen(
                  caseId: c.id,
                  hospitalId: c.hospital.id,
                  hospitalCity: c.hospital.city,
                  admissionDate: b.admissionDate,
                  dischargeDate: b.dischargeDate,
                ),
              ),
            ),
          ),
          if (b.isCancellable) ...[
            const SizedBox(height: 12),
            RefundPolicyCard(booking: b),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: context.colors.error),
              onPressed: _busy ? null : () => _cancelBooking(b),
              child: Text(l10n.caseCancelBooking),
            ),
          ],
        ],
      ),
    );
  }

  static String _planLabel(AppLocalizations l10n, Booking b) => switch (b.paymentOption) {
    PaymentOption.full => l10n.bookingPayInFull,
    PaymentOption.deposit => l10n.caseDepositPlusBalance,
    PaymentOption.installments =>
      b.installmentMonths == null
          ? l10n.caseMonthlyInstallmentsNoCount
          : l10n.caseMonthlyInstallments(b.installmentMonths!),
  };

  void _refresh() {
    ref.invalidate(caseDetailProvider(widget.caseId));
    ref.invalidate(casesProvider);
    ref.invalidate(patientDashboardProvider);
  }

  Future<void> _accept(MedicalCaseDetail c, Quote q) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.caseAcceptQuoteTitle),
        content: Text(ctx.l10n.caseAcceptQuoteBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.caseNotYet)),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ctx.l10n.caseAccept)),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busyQuoteId = q.id);
    try {
      try {
        await ref.read(caseRepositoryProvider).acceptQuote(c.id, q.id);
      } catch (e) {
        if (!mounted) return;
        final gate = await handleBookingGate(context, e, caseId: c.id);
        if (gate == BookingGate.none) rethrow;
        if (gate == BookingGate.handled || !mounted) return;
        await ref.read(caseRepositoryProvider).acceptQuote(c.id, q.id); // after the emergency acknowledgement
      }
      _refresh();
      if (mounted) {
        showInfoSnack(context, context.l10n.caseQuoteAccepted);
        await context.push(Routes.book(c.id, quoteId: q.id));
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyQuoteId = null);
    }
  }

  Future<void> _reject(MedicalCaseDetail c, Quote q) async {
    final reason = await askReason(
      context,
      title: context.l10n.caseDeclineQuoteTitle,
      confirmLabel: context.l10n.caseDecline,
    );
    if (reason == null) return;
    setState(() => _busyQuoteId = q.id);
    try {
      await ref.read(caseRepositoryProvider).rejectQuote(c.id, q.id, reason: reason.isEmpty ? null : reason);
      _refresh();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyQuoteId = null);
    }
  }

  Future<void> _cancelBooking(Booking b) async {
    final reason = await askReason(
      context,
      title: context.l10n.caseCancelBookingTitle,
      confirmLabel: context.l10n.caseCancelBooking,
      hint: context.l10n.caseReason,
      required: true,
      message: context.l10n.caseCancelBookingPolicy,
    );
    if (reason == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(bookingRepositoryProvider).cancel(b.id, reason: reason);
      ref.invalidate(bookingProvider(b.id));
      _refresh();
      if (mounted) showInfoSnack(context, context.l10n.caseBookingCancelled);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelCase(MedicalCaseDetail c) async {
    final reason = await askReason(
      context,
      title: context.l10n.caseCancelCaseTitle,
      confirmLabel: context.l10n.caseCancelCase,
    );
    if (reason == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(caseRepositoryProvider).cancel(c.id, note: reason.isEmpty ? null : reason);
      _refresh();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
