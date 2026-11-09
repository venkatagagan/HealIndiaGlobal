import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
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
        title: Text(firstName.isEmpty ? 'Agent dashboard' : 'Hi, $firstName'),
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
    final message = switch (profile.kycStatus) {
      KycStatus.notSubmitted => 'Submit your KYC documents on the agent web portal to start earning commissions.',
      KycStatus.pending => 'Your KYC is under review. You can add patients meanwhile.',
      KycStatus.rejected => 'KYC rejected${profile.rejectionReason == null ? '' : ': ${profile.rejectionReason}'}',
      KycStatus.approved => 'Your agency account is ${profile.status.label.toLowerCase()}.',
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
    final d = data;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrid(
          tiles: [
            KpiTile(
              label: 'Patients',
              value: '${d.patientsTotal}',
              icon: Icons.groups_rounded,
              color: AppColors.info,
              onTap: () => selectPortalTab(context, AgentRoutes.tabPatients),
            ),
            KpiTile(
              label: 'Active cases',
              value: '${d.activeCases}',
              icon: Icons.folder_shared_rounded,
              color: AppColors.violet,
              onTap: () => selectPortalTab(context, AgentRoutes.tabCases),
            ),
            KpiTile(
              label: 'Confirmed bookings',
              value: '${d.bookingsConfirmed}',
              icon: Icons.event_available_rounded,
              onTap: () => selectPortalTab(context, AgentRoutes.tabBookings),
            ),
            KpiTile(
              label: 'Conversion',
              value: d.conversionLabel,
              icon: Icons.trending_up_rounded,
              color: AppColors.cyan,
            ),
            KpiTile(
              label: 'Commission pending',
              value: money(d.commissionPendingMinor, d.currency),
              icon: Icons.hourglass_top_rounded,
              color: AppColors.warning,
              onTap: () => selectPortalTab(context, AgentRoutes.tabEarnings),
            ),
            KpiTile(
              label: 'Commission paid',
              value: money(d.commissionPaidMinor, d.currency),
              icon: Icons.payments_rounded,
              onTap: () => selectPortalTab(context, AgentRoutes.tabEarnings),
            ),
          ],
        ),
        const SectionTitle('Quick actions'),
        Row(
          children: [
            Expanded(
              child: PrimaryButton(
                label: 'Add patient',
                icon: Icons.person_add_alt_1_rounded,
                onPressed: () => context.push(AgentRoutes.newPatient),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SecondaryButton(
                label: 'Run screening',
                icon: Icons.health_and_safety_outlined,
                onPressed: () => selectPortalTab(context, AgentRoutes.tabPatients),
              ),
            ),
          ],
        ),
        const SectionTitle('Commission by month'),
        AppCard(
          child: MonthlyBars(
            points: [for (final m in d.monthly) (m.month, m.commissionMinor)],
            format: (v) => money(v.toInt(), d.currency, compact: true),
          ),
        ),
        const SectionTitle('Cases by month'),
        AppCard(
          child: MonthlyBars(points: [for (final m in d.monthly) (m.month, m.cases)], color: AppColors.violet),
        ),
        SectionTitle(
          'Recent cases',
          actionLabel: 'All cases',
          onAction: () => selectPortalTab(context, AgentRoutes.tabCases),
        ),
        if (d.recentCases.isEmpty)
          const EmptyView(
            title: 'No cases yet',
            message: 'Add a patient, run a screening and request quotes from hospitals.',
            icon: Icons.folder_open_outlined,
          )
        else
          for (final c in d.recentCases)
            CaseTile(medicalCase: c, onTap: () => context.push(AgentRoutes.caseDetail(c.id))),
      ],
    );
  }
}
