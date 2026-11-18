import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/discharge_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/discharge_view.dart';
import '../widgets/reminders_card.dart';
import '../widgets/share_sheet.dart';

/// The patient's discharge summaries (final versions, newest first), optionally for one case.
///
/// Route: `/discharge-summaries?case=<id>`.
class DischargeListScreen extends ConsumerWidget {
  const DischargeListScreen({super.key, this.caseId, this.openSummary});

  final String? caseId;

  /// Where a tapped summary opens (default: the patient route).
  final String Function(String id)? openSummary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final query = (caseId: caseId, bookingId: null);
    final value = ref.watch(dischargeSummariesProvider(query));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.dischargeListTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(dischargeSummariesProvider(query).future),
        child: AsyncValueView<List<DischargeSummaryListItem>>(
          value: value,
          onRetry: () => ref.invalidate(dischargeSummariesProvider(query)),
          data: (items) => items.isEmpty
              ? ListView(
                  children: [
                    EmptyView(
                      icon: Icons.summarize_outlined,
                      title: l10n.dischargeEmptyTitle,
                      message: l10n.dischargeEmptyMessage,
                    ),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: AppSpacing.pageAll,
                  children: [
                    for (final item in items)
                      DischargeListTile(
                        item: item,
                        onTap: () => context.push((openSummary ?? Routes.dischargeSummary)(item.id)),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// A summary in a list: hospital (or patient), case, discharge date, version and status.
class DischargeListTile extends StatelessWidget {
  const DischargeListTile({super.key, required this.item, required this.onTap, this.showPatient = false});

  final DischargeSummaryListItem item;
  final VoidCallback onTap;
  final bool showPatient;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = showPatient ? (item.patientName ?? item.caseNumber ?? '') : (item.hospitalName ?? '');
    return AppCard(
      key: ValueKey('discharge-item-${item.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      onTap: onTap,
      child: Row(
        children: [
          Icon(
            item.isDraft ? Icons.edit_note_rounded : Icons.summarize_outlined,
            color: item.isDraft ? AppColors.warning : AppColors.violet,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  [
                    ?item.caseNumber,
                    l10n.dischargeVersion(item.version),
                    if (item.dischargeDate != null) l10n.dischargeDischargedOn(Dates.day(item.dischargeDate)),
                  ].join(l10n.commonListSeparator),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          dischargeStatusBadge(context, status: item.status, latest: item.isLatest),
        ],
      ),
    );
  }
}

/// One discharge summary for the patient: every section (warning signs first), medicines, attachments,
/// PDF / FHIR downloads, medicine reminders and "Share with my doctor" with the list of shares (revoke).
/// Agents open it read-only ([patientActions] false).
///
/// Route: `/discharge-summaries/:id` (patient) · `/agent/discharge-summaries/:id` (agent).
class DischargeDetailScreen extends ConsumerWidget {
  const DischargeDetailScreen({super.key, required this.summaryId, this.patientActions = true});

  final String summaryId;
  final bool patientActions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(dischargeSummaryProvider(summaryId));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.dischargeTitle)),
      body: RefreshIndicator(
        onRefresh: () {
          ref
            ..invalidate(dischargeSharesProvider(summaryId))
            ..invalidate(medicationRemindersProvider(summaryId));
          return ref.refresh(dischargeSummaryProvider(summaryId).future);
        },
        child: AsyncValueView<DischargeSummary>(
          value: value,
          onRetry: () => ref.invalidate(dischargeSummaryProvider(summaryId)),
          data: (s) {
            final canAct = patientActions && s.isFinal && !s.isSuperseded;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                DischargeSummaryView(summary: s, showPatient: !patientActions),
                const SizedBox(height: 20),
                if (s.isFinal) DischargeDownloads(summary: s),
                if (canAct && s.medications.isNotEmpty) ...[
                  SectionTitle(l10n.dischargeRemindersTitle),
                  MedicationRemindersCard(summaryId: s.id),
                ],
                if (canAct) ...[
                  SectionTitle(l10n.dischargeShareWithDoctor, subtitle: l10n.dischargeShareIntro),
                  PrimaryButton(
                    key: const ValueKey('discharge-share'),
                    label: l10n.dischargeShareWithDoctor,
                    icon: Icons.forward_to_inbox_rounded,
                    onPressed: () => showDischargeShareSheet(context, s),
                  ),
                  const SizedBox(height: 12),
                  _SharesList(summaryId: s.id),
                ],
                const SizedBox(height: 16),
                Text(
                  l10n.dischargeConfidential,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                  textAlign: TextAlign.center,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SharesList extends ConsumerWidget {
  const _SharesList({required this.summaryId});

  final String summaryId;

  Future<void> _revoke(BuildContext context, WidgetRef ref, DischargeShare share) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.dischargeShareRevokeTitle),
        content: Text(ctx.l10n.dischargeShareRevokeBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.commonCancel)),
          FilledButton(
            key: const ValueKey('discharge-share-revoke-confirm'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.dangerStrong),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(ctx.l10n.dischargeShareRevoke),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(dischargeRepositoryProvider).revokeShare(summaryId, share.id);
      ref.invalidate(dischargeSharesProvider(summaryId));
      if (context.mounted) showInfoSnack(context, l10n.dischargeShareRevokedSnack);
    } catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(dischargeSharesProvider(summaryId));
    return AsyncValueView<List<DischargeShare>>(
      value: value,
      compactError: true,
      loading: const LinearProgressIndicator(minHeight: 2),
      onRetry: () => ref.invalidate(dischargeSharesProvider(summaryId)),
      data: (shares) {
        if (shares.isEmpty) return Text(l10n.dischargeSharesEmpty, style: context.text.bodySmall);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.dischargeSharesTitle, style: context.text.titleSmall),
            const SizedBox(height: 8),
            for (final sh in shares)
              AppCard(
                key: ValueKey('discharge-share-${sh.id}'),
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsetsDirectional.fromSTEB(14, 10, 6, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            [?sh.doctorName, sh.doctorEmailMasked].join(l10n.commonListSeparator),
                            style: context.text.titleSmall,
                          ),
                          Text(
                            [
                              if (sh.active) l10n.dischargeShareExpires(Dates.day(sh.expiresAt)),
                              l10n.dischargeShareViews(sh.viewCount),
                            ].join(l10n.commonListSeparator),
                            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    if (sh.active)
                      TextButton(
                        key: ValueKey('discharge-share-revoke-${sh.id}'),
                        style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                        onPressed: () => _revoke(context, ref, sh),
                        child: Text(l10n.dischargeShareRevoke),
                      )
                    else
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: StatusBadge(
                          label: sh.isRevoked ? l10n.dischargeShareRevoked : l10n.dischargeShareExpired,
                          color: context.palette.textSecondary,
                          dense: true,
                        ),
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Entry card to a case's discharge summaries (case detail, aftercare).
class DischargeEntryCard extends StatelessWidget {
  const DischargeEntryCard({super.key, required this.onTap, this.margin = EdgeInsets.zero});

  final VoidCallback onTap;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      key: const ValueKey('discharge-entry'),
      margin: margin,
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.summarize_outlined, color: AppColors.violet),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.dischargeTitle, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(l10n.dischargeTileSubtitle, style: context.text.bodySmall),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}
