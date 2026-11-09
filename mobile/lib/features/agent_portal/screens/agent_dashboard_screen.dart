import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../agent_routes.dart';
import '../data/agent_models.dart';
import '../data/agent_repository.dart';
import '../shared/portal_account_menu.dart';
import '../shared/portal_widgets.dart';

/// Agent dashboard: KPIs, monthly trend, quick actions and recent cases.
class AgentDashboardScreen extends ConsumerWidget {
  const AgentDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final firstName = (user?.fullName ?? '').split(' ').first;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          firstName.isEmpty ? context.l10n.agentDashboardTitle : context.l10n.agentDashboardGreeting(firstName),
        ),
        actions: const [PortalAccountMenu(), SizedBox(width: 8)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(agentDashboardProvider)
            ..invalidate(agentProfileProvider);
          await ref.read(agentDashboardProvider.future);
        },
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            const _ProfileBanner(),
            AsyncValueView(
              value: ref.watch(agentDashboardProvider),
              onRetry: () => ref.invalidate(agentDashboardProvider),
              data: (d) => _DashboardBody(data: d),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileBanner extends ConsumerWidget {
  const _ProfileBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(agentProfileProvider).value;
    if (profile == null || profile.isActive) return const SizedBox.shrink();
    final rejected = profile.status == AgentStatus.rejected || profile.kycStatus == KycStatus.rejected;
    final color = rejected ? AppColors.danger : AppColors.warning;
    final l10n = context.l10n;
    final message = switch (profile.kycStatus) {
      KycStatus.notSubmitted => l10n.kycBannerNotSubmitted,
      KycStatus.pending => l10n.kycBannerPending,
      KycStatus.rejected =>
        profile.rejectionReason == null
            ? l10n.kycBannerRejected
            : l10n.kycBannerRejectedWithReason(profile.rejectionReason!),
      KycStatus.approved => l10n.agentAccountStatusBanner(profile.status.label.toLowerCase()),
    };
    return AppCard(
      margin: const EdgeInsets.only(bottom: 16),
      borderColor: color,
      color: color.withValues(alpha: 0.12),
      child: Row(
        children: [
          Icon(rejected ? Icons.error_outline_rounded : Icons.info_outline_rounded, color: color),
          const SizedBox(width: 12),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.data});

  final AgentDashboard data;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final d = data;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          tiles: [
            KpiTile(
              label: l10n.agentKpiPatients,
              value: '${d.patientsTotal}',
              icon: Icons.groups_rounded,
              color: AppColors.info,
              onTap: () => selectPortalTab(context, AgentRoutes.tabPatients),
            ),
            KpiTile(
              label: l10n.agentKpiActiveCases,
              value: '${d.activeCases}',
              icon: Icons.folder_shared_rounded,
              color: AppColors.violet,
              onTap: () => selectPortalTab(context, AgentRoutes.tabCases),
            ),
            KpiTile(
              label: l10n.agentKpiConfirmedBookings,
              value: '${d.bookingsConfirmed}',
              icon: Icons.event_available_rounded,
              onTap: () => selectPortalTab(context, AgentRoutes.tabBookings),
            ),
            KpiTile(
              label: l10n.agentKpiConversion,
              value: d.conversionLabel,
              icon: Icons.trending_up_rounded,
              color: AppColors.cyan,
            ),
            KpiTile(
              label: l10n.commissionKpiPending,
              value: money(d.commissionPendingMinor, d.currency),
              icon: Icons.hourglass_top_rounded,
              color: AppColors.warning,
              onTap: () => selectPortalTab(context, AgentRoutes.tabEarnings),
            ),
            KpiTile(
              label: l10n.commissionKpiPaid,
              value: money(d.commissionPaidMinor, d.currency),
              icon: Icons.payments_rounded,
              onTap: () => selectPortalTab(context, AgentRoutes.tabEarnings),
            ),
          ],
        ),
        SectionTitle(l10n.agentQuickActions),
        Row(
          children: [
            Expanded(
              child: PrimaryButton(
                label: l10n.agentAddPatient,
                icon: Icons.person_add_alt_1_rounded,
                onPressed: () => context.push(AgentRoutes.newPatient),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SecondaryButton(
                label: l10n.agentRunScreening,
                icon: Icons.health_and_safety_outlined,
                onPressed: () => selectPortalTab(context, AgentRoutes.tabPatients),
              ),
            ),
          ],
        ),
        SectionTitle(l10n.commissionByMonth),
        AppCard(
          child: MonthlyBars(
            points: [for (final m in d.monthly) (m.month, m.commissionMinor)],
            format: (v) => money(v.toInt(), d.currency, compact: true),
          ),
        ),
        SectionTitle(l10n.agentCasesByMonth),
        AppCard(
          child: MonthlyBars(points: [for (final m in d.monthly) (m.month, m.cases)], color: AppColors.violet),
        ),
        SectionTitle(
          l10n.agentRecentCases,
          actionLabel: l10n.agentAllCases,
          onAction: () => selectPortalTab(context, AgentRoutes.tabCases),
        ),
        if (d.recentCases.isEmpty)
          EmptyView(
            title: l10n.agentDashboardNoCases,
            message: l10n.agentDashboardNoCasesHint,
            icon: Icons.folder_open_outlined,
          )
        else
          for (final c in d.recentCases)
            CaseTile(medicalCase: c, onTap: () => context.push(AgentRoutes.caseDetail(c.id))),
      ],
    );
  }
}
