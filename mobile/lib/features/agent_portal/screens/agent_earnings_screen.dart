import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../data/agent_repository.dart';
import '../shared/payee_finance_view.dart';

/// Commissions, payouts and statements of the agent, plus the referral code to share.
class AgentEarningsScreen extends StatelessWidget {
  const AgentEarningsScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const PayeeFinanceView(title: 'Commissions', itemsLabel: 'Commissions', header: _ReferralCard());
}

class _ReferralCard extends ConsumerWidget {
  const _ReferralCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final referral = ref.watch(agentReferralProvider).value;
    final profile = ref.watch(agentProfileProvider).value;
    if (referral == null) return const SizedBox.shrink();
    return AppCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.qr_code_2_rounded, color: AppColors.violet),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Your agent code ${referral.agentCode}',
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (profile?.commissionRateBps != null)
                StatusBadge(label: '${formatBps(profile!.commissionRateBps!)} rate'),
            ],
          ),
          const SizedBox(height: 6),
          Text(referral.referralUrl, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              icon: const Icon(Icons.copy_rounded, size: 18),
              label: const Text('Copy referral link'),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: referral.referralUrl));
                if (context.mounted) showInfoSnack(context, 'Referral link copied');
              },
            ),
          ),
        ],
      ),
    );
  }
}
