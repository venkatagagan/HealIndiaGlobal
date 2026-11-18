import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../data/consultation_providers.dart';
import '../widgets/consultation_pay_sheet.dart';

/// Opens a consultation's video room. Overridden in widget tests.
final meetingLauncherProvider = Provider<Future<bool> Function(Uri uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false),
);

String _title(AppLocalizations l10n, Consultation c) {
  final doctor = (c.doctorName ?? '').isNotEmpty ? c.doctorName! : l10n.consultDoctorTbc;
  return c.isFollowup ? l10n.consultFollowupWith(doctor) : l10n.consultWithDoctor(doctor);
}

/// "Scheduled for ..." / "Waiting for the hospital ..." in the device's time zone.
String _whenLine(AppLocalizations l10n, Consultation c) {
  if (c.scheduledAt != null) {
    return l10n.consultScheduledAt(Dates.dayTime(c.scheduledAt!.toLocal()), c.durationMin ?? 30);
  }
  return l10n.consultAwaitingTime;
}

/// The patient's consultations (`GET /consultations`). Route: `/consultations`.
class ConsultationsScreen extends ConsumerWidget {
  const ConsultationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.consultMineTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myConsultationsProvider.future),
        child: AsyncValueView<List<Consultation>>(
          value: ref.watch(myConsultationsProvider),
          onRetry: () => ref.invalidate(myConsultationsProvider),
          data: (items) => items.isEmpty
              ? ListView(
                  children: [
                    const SizedBox(height: 60),
                    EmptyView(
                      icon: Icons.videocam_outlined,
                      title: l10n.consultListEmpty,
                      message: l10n.consultListEmptyBody,
                      actionLabel: l10n.consultFindDoctor,
                      onAction: () => context.go(Routes.search),
                    ),
                  ],
                )
              : ListView(
                  padding: AppSpacing.pageAll,
                  children: [
                    for (final c in items)
                      AppCard(
                        key: ValueKey('consultation-${c.id}'),
                        margin: const EdgeInsets.only(bottom: 10),
                        onTap: () => context.push(Routes.consultationDetail(c.id)),
                        child: Row(
                          children: [
                            Icon(
                              c.isFollowup ? Icons.healing_outlined : Icons.videocam_outlined,
                              color: AppColors.info,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _title(l10n, c),
                                    style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                  if ((c.hospitalName ?? '').isNotEmpty)
                                    Text(c.hospitalName!, style: context.text.bodySmall),
                                  const SizedBox(height: 2),
                                  Text(
                                    _whenLine(l10n, c),
                                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            StatusBadge.forEnum(c.status, dense: true),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// One consultation: status, time (local), doctor / hospital, fee and paid state, Join video, reminders and
/// cancel. With [openPayment] (just booked) the payment sheet opens once while the fee is due.
///
/// Route: `/consultations/:id?pay=1`.
class ConsultationDetailScreen extends ConsumerStatefulWidget {
  const ConsultationDetailScreen({super.key, required this.consultationId, this.openPayment = false});

  final String consultationId;
  final bool openPayment;

  @override
  ConsumerState<ConsultationDetailScreen> createState() => _ConsultationDetailScreenState();
}

class _ConsultationDetailScreenState extends ConsumerState<ConsultationDetailScreen> {
  bool _paymentOffered = false;
  bool _cancelling = false;

  Future<void> _cancel(Consultation c) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.consultCancelConfirmTitle),
        content: Text(l10n.consultCancelConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(l10n.consultKeep)),
          FilledButton(
            key: const ValueKey('consult-cancel-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.consultCancel),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await ref.read(caseRepositoryProvider).cancelConsultation(c.id);
      ref.invalidate(consultationProvider(c.id));
      ref.invalidate(myConsultationsProvider);
      if (mounted) showInfoSnack(context, l10n.consultCancelled);
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _join(Consultation c) async {
    final ok = await ref.read(meetingLauncherProvider)(Uri.parse(c.meetingUrl!));
    if (!ok && mounted) showInfoSnack(context, context.l10n.catalogCouldNotOpen(c.meetingUrl!));
  }

  void _maybeOfferPayment(Consultation c, ConsultationFeeState? fee) {
    if (!widget.openPayment || _paymentOffered || fee != ConsultationFeeState.due || !c.isOpen) return;
    _paymentOffered = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) showConsultationPaySheet(context, c);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(consultationProvider(widget.consultationId));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.consultDetailTitle)),
      body: AsyncValueView<Consultation>(
        value: value,
        onRetry: () => ref.invalidate(consultationProvider(widget.consultationId)),
        data: (c) {
          final fee = ref.watch(consultationFeeStateProvider(c.id)).value;
          _maybeOfferPayment(c, fee);
          return RefreshIndicator(
            onRefresh: () async {
              ref
                ..invalidate(consultationFeeStateProvider(c.id))
                ..invalidate(consultationProvider(c.id));
              await ref.read(consultationProvider(c.id).future);
            },
            child: ListView(
              padding: AppSpacing.pageAll,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(_title(l10n, c), style: context.text.titleLarge)),
                    const SizedBox(width: 8),
                    StatusBadge.forEnum(c.status, key: const ValueKey('consult-status')),
                  ],
                ),
                if ((c.hospitalName ?? '').isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(c.hospitalName!, style: context.text.bodyMedium),
                ],
                const SizedBox(height: 16),
                _whenCard(context, c),
                const SizedBox(height: 12),
                if ((c.feeMinor ?? 0) > 0 || fee == ConsultationFeeState.free) _feeCard(context, c, fee),
                if ((c.notes ?? '').isNotEmpty) ...[
                  SectionTitle(l10n.consultNotesSection),
                  AppCard(child: Text(c.notes!)),
                ],
                if ((c.caseNumber ?? '').isNotEmpty)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      icon: const Icon(Icons.folder_open_outlined, size: 18),
                      label: Text(l10n.consultOpenCase(c.caseNumber!)),
                      onPressed: () => context.push(Routes.caseDetail(c.caseId)),
                    ),
                  ),
                if (c.isOpen) ...[
                  const SizedBox(height: 16),
                  TextButton.icon(
                    key: const ValueKey('consult-cancel'),
                    onPressed: _cancelling ? null : () => _cancel(c),
                    icon: const Icon(Icons.event_busy_outlined, color: AppColors.danger),
                    label: Text(l10n.consultCancel, style: const TextStyle(color: AppColors.danger)),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _whenCard(BuildContext context, Consultation c) {
    final l10n = context.l10n;
    final canJoin = c.status == ConsultationStatus.scheduled && (c.meetingUrl ?? '').isNotEmpty;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.schedule_rounded, color: AppColors.info),
              const SizedBox(width: 10),
              Expanded(child: Text(_whenLine(l10n, c), style: context.text.titleSmall)),
            ],
          ),
          if (c.scheduledAt == null && c.dueAt != null) ...[
            const SizedBox(height: 6),
            Text(
              l10n.consultPreferredTime(Dates.dayTime(c.dueAt!.toLocal())),
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            l10n.consultTimesLocal(DateTime.now().timeZoneName),
            style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
          ),
          if (c.isOpen) ...[
            const SizedBox(height: 12),
            if (canJoin) ...[
              PrimaryButton(
                key: const ValueKey('consult-join'),
                label: l10n.consultJoinVideo,
                icon: Icons.videocam_rounded,
                onPressed: () => _join(c),
              ),
              const SizedBox(height: 6),
              Text(l10n.consultJoinHint, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
            ] else
              Text(l10n.consultLinkSoon, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.notifications_active_outlined, size: 18, color: AppColors.violet),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    c.status == ConsultationStatus.scheduled
                        ? l10n.consultReminderScheduled
                        : l10n.consultReminderPending,
                    key: const ValueKey('consult-reminder'),
                    style: context.text.bodySmall,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _feeCard(BuildContext context, Consultation c, ConsultationFeeState? fee) {
    final l10n = context.l10n;
    final (label, color) = switch (fee) {
      ConsultationFeeState.paid => (l10n.consultPaid, AppColors.primary),
      ConsultationFeeState.pending => (l10n.consultPaymentPending, AppColors.warning),
      ConsultationFeeState.due => (l10n.consultPaymentDue, AppColors.danger),
      ConsultationFeeState.free => (l10n.consultFeeFree, AppColors.primary),
      null => ('', AppColors.info),
    };
    return AppCard(
      key: const ValueKey('consult-fee-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(l10n.consultFeeLabel, style: context.text.titleSmall)),
              if ((c.feeMinor ?? 0) > 0)
                PriceText(
                  c.feeMinor!,
                  c.currency,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  style: context.text.titleSmall,
                ),
            ],
          ),
          if (label.isNotEmpty) ...[
            const SizedBox(height: 6),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: StatusBadge(key: const ValueKey('consult-fee-state'), label: label, color: color, dense: true),
            ),
          ],
          if (fee == ConsultationFeeState.due && c.isOpen) ...[
            const SizedBox(height: 10),
            PrimaryButton(
              key: const ValueKey('consult-pay'),
              label: l10n.consultPayButton(formatMoneyFor(c)),
              icon: Icons.lock_outline_rounded,
              onPressed: () => showConsultationPaySheet(context, c),
            ),
          ],
        ],
      ),
    );
  }
}

/// The fee in its own currency ("₹1,500").
String formatMoneyFor(Consultation c) => Money(c.feeMinor ?? 0, c.currency).format();
