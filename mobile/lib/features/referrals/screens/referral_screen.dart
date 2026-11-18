import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/referral_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

// ------------------------------------------------------------------------------------------ labels

String referralStatusLabel(AppLocalizations l10n, ReferralStatus s) => switch (s) {
  ReferralStatus.pending => l10n.referralStatusPending,
  ReferralStatus.qualified => l10n.referralStatusQualified,
  ReferralStatus.rewarded => l10n.referralStatusRewarded,
  ReferralStatus.voided => l10n.referralStatusVoid,
};

Color referralStatusColor(ReferralStatus s) => switch (s) {
  ReferralStatus.pending => AppColors.info,
  ReferralStatus.qualified => AppColors.violet,
  ReferralStatus.rewarded => AppColors.primary,
  ReferralStatus.voided => AppColors.danger,
};

String creditMovementLabel(AppLocalizations l10n, CreditMovementKind k) => switch (k) {
  CreditMovementKind.grant => l10n.referralMovementGrant,
  CreditMovementKind.redeem => l10n.referralMovementRedeem,
  CreditMovementKind.reinstate => l10n.referralMovementReinstate,
  CreditMovementKind.expire => l10n.referralMovementExpire,
  CreditMovementKind.voided => l10n.referralMovementVoid,
};

String creditKindLabel(AppLocalizations l10n, CreditKind k) => switch (k) {
  CreditKind.referrerReward => l10n.referralCreditKindReferrer,
  CreditKind.refereeReward => l10n.referralCreditKindReferee,
  CreditKind.reinstated => l10n.referralCreditKindReinstated,
};

String _fmt(MoneyAmount m) => formatMoney(m.amountMinor, m.currency);

/// Text shared through the system share sheet.
String referralShareText(AppLocalizations l10n, ReferralOverview o) {
  final link = o.shareUrl ?? o.patientWebUrl ?? o.appUrl ?? '';
  return l10n.referralShareMessage(o.code ?? '', link);
}

// ------------------------------------------------------------------------------------------ screen

/// "Refer a friend": personal code and link (copy / share), how the rewards work, credit balance with
/// what expires soon, the friends who joined and the credit history.
///
/// Route: `/referrals` (profile, notifications `referral.*`). Patients only.
class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final overview = ref.watch(referralOverviewProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.referralTitle)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(referralOverviewProvider)
            ..invalidate(creditsOverviewProvider);
          await ref.read(referralOverviewProvider.future);
        },
        child: AsyncValueView<ReferralOverview>(
          value: overview,
          onRetry: () => ref.invalidate(referralOverviewProvider),
          data: (o) => ListView(
            padding: AppSpacing.pageAll,
            children: [
              if (!o.enabled)
                AppCard(
                  margin: const EdgeInsetsDirectional.only(bottom: 12),
                  borderColor: AppColors.warning,
                  child: Row(
                    children: [
                      const Icon(Icons.pause_circle_outline_rounded, color: AppColors.warning),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.referralProgrammeOffTitle,
                              style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(l10n.referralProgrammeOffBody, style: context.text.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              if (o.enabled && o.code != null) ...[_InviteCard(overview: o), const SizedBox(height: 12)],
              _CreditCard(balance: o.credit),
              if (o.enabled) ...[SectionTitle(l10n.referralHowItWorksTitle), _HowItWorks(rewards: o.rewards)],
              SectionTitle(l10n.referralFriendsTitle),
              _Friends(overview: o),
              SectionTitle(l10n.referralHistoryTitle),
              const _CreditHistory(),
            ],
          ),
        ),
      ),
    );
  }
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({required this.overview});

  final ReferralOverview overview;

  String _headline(AppLocalizations l10n) {
    final r = overview.rewards;
    if (r.referrer != null && r.referee != null) return l10n.referralHeroBoth(_fmt(r.referee!), _fmt(r.referrer!));
    if (r.referrer != null) return l10n.referralHeroReferrerOnly(_fmt(r.referrer!));
    if (r.referee != null) return l10n.referralHeroRefereeOnly(_fmt(r.referee!));
    return l10n.referralHeroGeneric;
  }

  Future<void> _copy(BuildContext context, String text, String done) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (context.mounted) showInfoSnack(context, done);
  }

  Future<void> _share(BuildContext context) async {
    final l10n = context.l10n;
    final text = referralShareText(l10n, overview);
    final box = context.findRenderObject() as RenderBox?;
    try {
      await SharePlus.instance.share(
        ShareParams(
          text: text,
          subject: l10n.referralShareSubject,
          sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } on Object {
      // No share sheet (desktop / tests): copy the invite instead.
      if (context.mounted) await _copy(context, text, l10n.referralLinkCopied);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final o = overview;
    final link = o.shareUrl ?? o.patientWebUrl ?? o.appUrl;
    return AppCard(
      key: const ValueKey('referral-invite-card'),
      color: AppColors.primary.withValues(alpha: 0.08),
      borderColor: AppColors.primary.withValues(alpha: 0.5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.card_giftcard_rounded, color: AppColors.primary, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Text(_headline(l10n), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(l10n.referralYourCode, style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary)),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 4, 8),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.primary.withValues(alpha: 0.6)),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Row(
              children: [
                Expanded(
                  // Codes are Latin letters and digits: keep them left-to-right in RTL layouts.
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: SelectableText(
                      o.code!,
                      key: const ValueKey('referral-code'),
                      textAlign: Directionality.of(context) == TextDirection.rtl ? TextAlign.right : TextAlign.left,
                      style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: 2),
                    ),
                  ),
                ),
                IconButton(
                  key: const ValueKey('referral-copy-code'),
                  tooltip: l10n.referralCopyCode,
                  icon: const Icon(Icons.copy_rounded),
                  onPressed: () => _copy(context, o.code!, l10n.referralCodeCopied),
                ),
              ],
            ),
          ),
          if (link != null) ...[
            const SizedBox(height: 8),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(
                link,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Builder(
                  builder: (ctx) => PrimaryButton(
                    key: const ValueKey('referral-share'),
                    label: l10n.referralShare,
                    icon: Icons.ios_share_rounded,
                    onPressed: () => _share(ctx),
                  ),
                ),
              ),
              if (link != null) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: SecondaryButton(
                    key: const ValueKey('referral-copy-link'),
                    label: l10n.referralCopyLink,
                    icon: Icons.link_rounded,
                    onPressed: () => _copy(context, referralShareText(l10n, o), l10n.referralLinkCopied),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _CreditCard extends StatelessWidget {
  const _CreditCard({required this.balance});

  final CreditBalance balance;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final b = balance;
    final expiring = b.expiringSoonMinor > 0 && b.nextExpiryAt != null;
    return AppCard(
      key: const ValueKey('referral-credit-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.referralCreditTitle,
            style: context.text.labelLarge?.copyWith(color: context.palette.textSecondary),
          ),
          const SizedBox(height: 4),
          MoneyText(
            b.amountMinor,
            b.currency,
            key: const ValueKey('referral-credit-amount'),
            style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.primary),
          ),
          if (b.currency.toUpperCase() != b.baseCurrency.toUpperCase() && b.baseAmountMinor > 0)
            Text(
              l10n.referralCreditBase(formatMoney(b.baseAmountMinor, b.baseCurrency)),
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
          const SizedBox(height: 6),
          if (expiring)
            Row(
              children: [
                const Icon(Icons.schedule_rounded, size: 16, color: AppColors.warning),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    l10n.referralCreditExpiringSoon(
                      formatMoney(b.expiringSoonMinor, b.currency),
                      Dates.day(b.nextExpiryAt),
                    ),
                    style: context.text.bodySmall?.copyWith(color: AppColors.warning, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          Text(
            b.hasCredit ? l10n.referralCreditUseHint : l10n.referralCreditNone,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks({required this.rewards});

  final ReferralRewards rewards;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Widget step(int n, String text) => Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 12,
            backgroundColor: AppColors.violetSoft,
            child: Text(
              '$n',
              style: const TextStyle(color: AppColors.violet, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: context.text.bodyMedium)),
        ],
      ),
    );
    final small = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          step(1, l10n.referralStep1),
          step(2, l10n.referralStep2),
          step(3, l10n.referralStep3),
          const Divider(height: 18),
          if (rewards.creditValidityDays > 0)
            Text(l10n.referralTermsValidity(rewards.creditValidityDays), style: small),
          if (rewards.maxRewardsPerYear > 0)
            Text(l10n.referralTermsMaxPerYear(rewards.maxRewardsPerYear), style: small),
          Text(l10n.referralTermsNoCash, style: small),
        ],
      ),
    );
  }
}

class _Friends extends StatelessWidget {
  const _Friends({required this.overview});

  final ReferralOverview overview;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final o = overview;
    if (o.referrals.isEmpty) {
      return Text(l10n.referralFriendsEmpty, style: context.text.bodyMedium);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final s in ReferralStatus.values)
              if (o.count(s) > 0)
                StatusBadge(
                  label: l10n.referralCountChip(referralStatusLabel(l10n, s), o.count(s)),
                  color: referralStatusColor(s),
                ),
          ],
        ),
        const SizedBox(height: 8),
        for (final f in o.referrals)
          AppCard(
            margin: const EdgeInsetsDirectional.only(bottom: 8),
            padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 10),
            child: Row(
              children: [
                Avatar(name: f.friendName, size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f.friendName, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      Text(
                        l10n.referralFriendJoined(Dates.day(f.createdAt)),
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    StatusBadge(
                      label: referralStatusLabel(l10n, f.status),
                      color: referralStatusColor(f.status),
                      dense: true,
                    ),
                    if (f.reward != null && f.status == ReferralStatus.rewarded)
                      Text(
                        l10n.referralFriendReward(_fmt(f.reward!)),
                        style: context.text.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                      ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _CreditHistory extends ConsumerWidget {
  const _CreditHistory();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return AsyncValueView<CreditsOverview>(
      value: ref.watch(creditsOverviewProvider),
      compactError: true,
      onRetry: () => ref.invalidate(creditsOverviewProvider),
      data: (c) {
        final active = c.credits.where((x) => x.status == CreditStatus.active && x.remainingMinor > 0).toList();
        if (c.movements.isEmpty && active.isEmpty) {
          return Text(l10n.referralHistoryEmpty, style: context.text.bodyMedium);
        }
        final secondary = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final credit in active)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.savings_outlined, color: AppColors.primary),
                title: Text(creditKindLabel(l10n, credit.kind)),
                subtitle: credit.expiresAt == null
                    ? null
                    : Text(l10n.referralCreditExpires(Dates.day(credit.expiresAt)), style: secondary),
                trailing: MoneyText(credit.displayRemainingMinor, credit.displayCurrency),
              ),
            if (active.isNotEmpty && c.movements.isNotEmpty) const Divider(),
            for (final m in c.movements)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  m.isIncoming ? Icons.add_circle_outline_rounded : Icons.remove_circle_outline_rounded,
                  color: m.isIncoming ? AppColors.primary : context.palette.textSecondary,
                ),
                title: Text(creditMovementLabel(l10n, m.kind)),
                subtitle: Text(Dates.day(m.createdAt), style: secondary),
                trailing: MoneyText(
                  m.displayAmountMinor.abs(),
                  m.displayCurrency,
                  prefix: m.isIncoming ? '+' : '-',
                  style: context.text.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: m.isIncoming ? AppColors.primary : null,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
