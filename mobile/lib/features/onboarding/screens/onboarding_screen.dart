import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../onboarding_content.dart';

/// 3-page carousel: Welcome Impact, Trust & Excellence, Security & Process (Get Started / Explore as Guest).
///
/// Route: `/onboarding` · Owner: fl-onboarding. Every exit marks onboarding as seen.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  static const pageCount = 3;

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;
  bool _guestLoading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page >= OnboardingScreen.pageCount - 1) return;
    _controller.nextPage(duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic);
  }

  Future<void> _finishToAuth() async {
    await ref.read(onboardingSeenProvider.notifier).complete();
    if (mounted) context.go(Routes.auth);
  }

  Future<void> _exploreAsGuest() async {
    if (_guestLoading) return;
    // Grab the notifiers up front: the router may replace this screen as soon as the session exists.
    final onboarding = ref.read(onboardingSeenProvider.notifier);
    final auth = ref.read(authControllerProvider.notifier);
    setState(() => _guestLoading = true);
    try {
      await auth.continueAsGuest();
      await onboarding.complete();
      if (mounted) context.go(Routes.home);
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _guestLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PageView(
        controller: _controller,
        onPageChanged: (i) => setState(() => _page = i),
        children: [
          _ImpactPage(page: _page, onNext: _next, onSkip: _finishToAuth),
          _TrustPage(page: _page, onNext: _next),
          _ProcessPage(onGetStarted: _finishToAuth, onGuest: _exploreAsGuest, guestLoading: _guestLoading),
        ],
      ),
    );
  }
}

// ----------------------------------------------------------------------------------------- page 1

class _ImpactPage extends StatelessWidget {
  const _ImpactPage({required this.page, required this.onNext, required this.onSkip});

  final int page;
  final VoidCallback onNext;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final text = context.text;
    final l10n = context.l10n;
    final footnote = OnboardingContent.impactStatFootnote(l10n);
    final caption = OnboardingContent.accreditationsCaption(l10n);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF7B2FF7), Color(0xFF5B4CF5), Color(0xFF2563EB), Color(0xFF06B6D4)],
            stops: [0, 0.35, 0.7, 1],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              children: [
                Row(
                  children: [
                    const BrandLogo(size: 30, color: Colors.white, background: Color(0x33FFFFFF)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.appName,
                            style: text.titleSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                          ),
                          Text(
                            l10n.appTagline,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: text.labelSmall?.copyWith(color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                    const LanguageButton(foregroundColor: Colors.white),
                    TextButton(
                      onPressed: onSkip,
                      style: TextButton.styleFrom(foregroundColor: Colors.white),
                      child: Text(l10n.commonSkip),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 300),
                      child: const BrandSvg(BrandAssets.onboardingWelcome),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0x26FFFFFF),
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(l10n.onboardingWelcomeChip, style: text.labelSmall?.copyWith(color: Colors.white)),
                ),
                const SizedBox(height: 6),
                Semantics(
                  label: '${OnboardingContent.impactStat(l10n)} ${OnboardingContent.impactStatCaption(l10n)}',
                  excludeSemantics: true,
                  child: Column(
                    children: [
                      Text(
                        OnboardingContent.impactStat(l10n),
                        style: text.displaySmall?.copyWith(color: const Color(0xFFE9D5FF), fontWeight: FontWeight.w900),
                      ),
                      Text(
                        OnboardingContent.impactStatCaption(l10n),
                        style: text.titleSmall?.copyWith(color: const Color(0xFFE9D5FF)),
                      ),
                      if (footnote.isNotEmpty) Text(footnote, style: text.labelSmall?.copyWith(color: Colors.white60)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  OnboardingContent.impactHeadline(l10n),
                  textAlign: TextAlign.center,
                  style: text.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final b in OnboardingContent.accreditations(l10n))
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: _AccreditationChip(badge: b),
                      ),
                  ],
                ),
                if (caption.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    caption,
                    textAlign: TextAlign.center,
                    style: text.labelSmall?.copyWith(color: Colors.white70),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    PageDots(count: OnboardingScreen.pageCount, index: page, activeColor: Colors.white),
                    const Spacer(),
                    Semantics(
                      button: true,
                      label: l10n.onboardingNextPage,
                      child: Material(
                        color: Colors.white,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: onNext,
                          child: const SizedBox(
                            width: 52,
                            height: 52,
                            child: Icon(Icons.arrow_forward_rounded, color: Color(0xFF1E1B4B)),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AccreditationChip extends StatelessWidget {
  const _AccreditationChip({required this.badge});

  final OnboardingBadge badge;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: badge.description,
      child: Semantics(
        label: badge.description,
        excludeSemantics: true,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0x33FFFFFF),
                border: Border.all(color: Colors.white54),
              ),
              child: const Icon(Icons.workspace_premium_outlined, color: Colors.white, size: 22),
            ),
            const SizedBox(height: 4),
            Text(
              badge.code,
              style: context.text.labelSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

// ----------------------------------------------------------------------------------------- page 2

class _TrustPage extends StatelessWidget {
  const _TrustPage({required this.page, required this.onNext});

  final int page;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: AppTheme.light(),
      child: Builder(
        builder: (context) => AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.dark,
          child: ColoredBox(
            color: Colors.white,
            child: SafeArea(
              child: Column(
                children: [
                  const BrandHeader(),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 24),
                            child: BrandSvg(BrandAssets.onboardingTrust, height: 170),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                for (final p in OnboardingContent.trustPoints(context.l10n)) ...[
                                  _TrustCard(point: p),
                                  const SizedBox(height: 10),
                                ],
                                const _TestimonialCard(),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    child: Column(
                      children: [
                        PageDots(count: OnboardingScreen.pageCount, index: page, activeColor: AppColors.primary),
                        const SizedBox(height: 12),
                        PrimaryButton(label: context.l10n.commonNext, onPressed: onNext),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TrustCard extends StatelessWidget {
  const _TrustCard({required this.point});

  final OnboardingPoint point;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 2))],
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(color: Color(0xFFDCFCE7), shape: BoxShape.circle),
            child: Icon(point.icon, size: 20, color: AppColors.primaryDark),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(point.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(point.subtitle, style: context.text.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TestimonialCard extends StatelessWidget {
  const _TestimonialCard();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final author = OnboardingContent.testimonialAuthor(l10n);
    final disclaimer = OnboardingContent.testimonialDisclaimer(l10n);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 2))],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Avatar(name: author, size: 40, square: true),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    RatingStars(rating: OnboardingContent.testimonialRating.toDouble(), showValue: false, size: 16),
                    if (disclaimer.isNotEmpty)
                      StatusBadge(label: disclaimer, color: context.palette.textSecondary, dense: true),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  OnboardingContent.testimonialQuote(l10n),
                  style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text('- $author', style: context.text.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ----------------------------------------------------------------------------------------- page 3

class _ProcessPage extends StatelessWidget {
  const _ProcessPage({required this.onGetStarted, required this.onGuest, required this.guestLoading});

  final VoidCallback onGetStarted;
  final VoidCallback onGuest;
  final bool guestLoading;

  @override
  Widget build(BuildContext context) {
    final text = context.text;
    final l10n = context.l10n;
    return Theme(
      data: AppTheme.dark(),
      child: Builder(
        builder: (context) => AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: ColoredBox(
            color: const Color(0xFF0B0F0D),
            child: SafeArea(
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
                      child: Column(
                        children: [
                          const BrandSvg(BrandAssets.onboardingSecurity, height: 140),
                          const SizedBox(height: 12),
                          Text(
                            l10n.appName,
                            style: text.headlineMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 4),
                          Text(l10n.appTagline, style: text.bodyMedium?.copyWith(color: Colors.white70)),
                          const SizedBox(height: 28),
                          for (final s in OnboardingContent.processSteps(l10n)) _ProcessStep(point: s),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.lock_outline_rounded, size: 16, color: AppColors.primary),
                              const SizedBox(width: 6),
                              Text(
                                OnboardingContent.securityBadge(l10n),
                                style: text.labelMedium?.copyWith(color: Colors.white),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            OnboardingContent.securityFooter(l10n),
                            textAlign: TextAlign.center,
                            style: text.labelSmall?.copyWith(color: Colors.white60),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    child: Column(
                      children: [
                        PrimaryButton(label: l10n.onboardingGetStarted, onPressed: guestLoading ? null : onGetStarted),
                        const SizedBox(height: 12),
                        SecondaryButton(
                          label: l10n.onboardingExploreAsGuest,
                          loading: guestLoading,
                          onPressed: onGuest,
                          foregroundColor: Colors.white,
                          borderColor: const Color(0xFF2A3340),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProcessStep extends StatelessWidget {
  const _ProcessStep({required this.point});

  final OnboardingPoint point;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(color: Color(0xFF1C2A22), shape: BoxShape.circle),
            child: Icon(point.icon, size: 19, color: AppColors.primary),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(point.title, style: context.text.titleSmall?.copyWith(color: Colors.white)),
                const SizedBox(height: 2),
                Text(point.subtitle, style: context.text.bodySmall?.copyWith(color: Colors.white60)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Page indicator: the active page is an elongated pill.
class PageDots extends StatelessWidget {
  const PageDots({super.key, required this.count, required this.index, required this.activeColor, this.inactiveColor});

  final int count;
  final int index;
  final Color activeColor;
  final Color? inactiveColor;

  @override
  Widget build(BuildContext context) {
    final inactive = inactiveColor ?? activeColor.withValues(alpha: 0.35);
    return Semantics(
      label: context.l10n.onboardingPageDots(index + 1, count),
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == index ? 20 : 7,
              height: 7,
              decoration: BoxDecoration(
                color: i == index ? activeColor : inactive,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
        ],
      ),
    );
  }
}
