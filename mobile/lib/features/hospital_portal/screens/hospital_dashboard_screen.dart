import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../agent_portal/shared/portal_account_menu.dart';
import '../../agent_portal/shared/portal_api.dart';
import '../../agent_portal/shared/portal_widgets.dart';
import '../data/hospital_models.dart';
import '../data/hospital_repository.dart';
import '../hospital_routes.dart';

/// Hospital dashboard: KPIs, monthly bookings / revenue and recent cases.
class HospitalDashboardScreen extends ConsumerWidget {
  const HospitalDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hospital = ref.watch(activeHospitalProvider);
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(hospital?.name ?? l10n.hpDashboardTitle),
        actions: const [PortalAccountMenu(), SizedBox(width: 8)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(hospitalDashboardProvider)
            ..invalidate(hospitalListingProvider);
          await ref.read(hospitalDashboardProvider.future);
        },
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            if (hospital == null)
              EmptyView(
                title: l10n.hpNoHospitalTitle,
                message: l10n.hpNoHospitalMessage,
                icon: Icons.domain_disabled_outlined,
              )
            else ...[
              const _ListingBanner(),
              AsyncValueView(
                value: ref.watch(hospitalDashboardProvider),
                onRetry: () => ref.invalidate(hospitalDashboardProvider),
                data: (d) => _DashboardBody(data: d),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ListingBanner extends ConsumerWidget {
  const _ListingBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listing = ref.watch(hospitalListingProvider).value;
    if (listing == null || listing.status == HospitalStatus.active) return const SizedBox.shrink();
    final bad = listing.status == HospitalStatus.rejected || listing.status == HospitalStatus.suspended;
    final color = bad ? AppColors.danger : AppColors.warning;
    final l10n = context.l10n;
    final text = switch (listing.status) {
      HospitalStatus.draft => l10n.hpListingDraft,
      HospitalStatus.pendingReview => l10n.hpListingPendingReview,
      _ => l10n.hpListingOtherStatus(listing.status.label.toLowerCase()),
    };
    return AppCard(
      margin: const EdgeInsets.only(bottom: 16),
      borderColor: color,
      color: color.withValues(alpha: 0.12),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, color: color),
          const SizedBox(width: 12),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.data});

  final HospitalDashboard data;

  @override
  Widget build(BuildContext context) {
    final d = data;
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          tiles: [
            KpiTile(
              label: l10n.hpKpiOpenEnquiries,
              value: '${d.enquiriesOpen}',
              icon: Icons.inbox_rounded,
              color: AppColors.info,
              onTap: () => selectPortalTab(context, HospitalRoutes.tabEnquiries),
            ),
            KpiTile(
              label: l10n.hpKpiQuotesAwaiting,
              value: '${d.quotesPending}',
              icon: Icons.request_quote_rounded,
              color: AppColors.warning,
              onTap: () => selectPortalTab(context, HospitalRoutes.tabEnquiries),
            ),
            KpiTile(
              label: l10n.hpKpiUpcomingAdmissions,
              value: '${d.bookingsUpcoming}',
              icon: Icons.event_available_rounded,
              color: AppColors.violet,
              onTap: () => selectPortalTab(context, HospitalRoutes.tabPatients),
            ),
            KpiTile(
              label: l10n.hpKpiInTreatment,
              value: '${d.patientsInTreatment}',
              icon: Icons.bed_rounded,
              color: AppColors.cyan,
              onTap: () => selectPortalTab(context, HospitalRoutes.tabPatients),
            ),
          ],
        ),
        const SizedBox(height: 12),
        AppCard(
          onTap: () => selectPortalTab(context, HospitalRoutes.tabSettlements),
          child: Row(
            children: [
              const Icon(Icons.trending_up_rounded, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(child: Text(l10n.hpRevenueThisMonth, style: context.text.bodyMedium)),
              Text(
                money(d.revenueMonthMinor, d.currency),
                style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.primary),
              ),
            ],
          ),
        ),
        SectionTitle(l10n.hpRevenueByMonth),
        AppCard(
          child: MonthlyBars(
            points: [for (final m in d.monthly) (m.month, m.revenueMinor)],
            format: (v) => money(v.toInt(), d.currency, compact: true),
          ),
        ),
        SectionTitle(l10n.hpBookingsByMonth),
        AppCard(
          child: MonthlyBars(points: [for (final m in d.monthly) (m.month, m.bookings)], color: AppColors.violet),
        ),
        SectionTitle(
          l10n.hpRecentCases,
          actionLabel: l10n.hpTabEnquiries,
          onAction: () => selectPortalTab(context, HospitalRoutes.tabEnquiries),
        ),
        if (d.recentCases.isEmpty)
          EmptyView(title: l10n.hpNoEnquiriesYet, icon: Icons.inbox_outlined)
        else
          for (final c in d.recentCases)
            CaseTile(medicalCase: c, showHospital: false, onTap: () => context.push(HospitalRoutes.caseDetail(c.id))),
      ],
    );
  }
}
