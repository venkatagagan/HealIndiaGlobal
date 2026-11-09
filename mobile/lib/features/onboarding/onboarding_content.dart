import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';

/// Editable marketing copy for the onboarding carousel.
///
/// The business owns these numbers and claims: change them here and in the `onboarding*` strings of
/// `l10n_parts/a_core_home.json` (every language) only — no other file hard-codes them. Keep the copy honest
/// (PLAN §9): figures must be backed by partner-hospital data, and accreditations are those held by partner
/// hospitals, not by the platform itself.
abstract final class OnboardingContent {
  // ---------------------------------------------------------------- page 1 — Welcome Impact
  /// Headline statistic ("500,000+").
  static String impactStat(AppLocalizations l) => l.onboardingImpactStat;

  /// Caption below the statistic.
  static String impactStatCaption(AppLocalizations l) => l.onboardingImpactStatCaption;

  /// Small qualifier shown under the caption (empty string hides it).
  static String impactStatFootnote(AppLocalizations l) => l.onboardingImpactStatFootnote;

  /// Main promise.
  static String impactHeadline(AppLocalizations l) => l.onboardingImpactHeadline;

  /// Accreditation chips (short code + accessible description).
  static List<OnboardingBadge> accreditations(AppLocalizations l) => [
    OnboardingBadge(code: 'JCI', description: l.onboardingBadgeJciDescription),
    OnboardingBadge(code: 'NABH', description: l.onboardingBadgeNabhDescription),
    OnboardingBadge(code: 'WHO', description: l.onboardingBadgeWhoDescription),
  ];

  /// Caption under the accreditation chips (empty string hides it).
  static String accreditationsCaption(AppLocalizations l) => l.onboardingAccreditationsCaption;

  // ---------------------------------------------------------------- page 2 — Trust & Excellence
  static String trustTitle(AppLocalizations l) => l.onboardingTrustTitle;

  static List<OnboardingPoint> trustPoints(AppLocalizations l) => [
    OnboardingPoint(
      icon: Icons.translate_rounded,
      title: l.onboardingTrustDoctorsTitle,
      subtitle: l.onboardingTrustDoctorsSubtitle,
    ),
    OnboardingPoint(
      icon: Icons.schedule_rounded,
      title: l.onboardingTrustWaitTitle,
      subtitle: l.onboardingTrustWaitSubtitle,
    ),
    OnboardingPoint(
      icon: Icons.verified_outlined,
      title: l.onboardingTrustCertifiedTitle,
      subtitle: l.onboardingTrustCertifiedSubtitle,
    ),
  ];

  /// Testimonial card. Marked as illustrative in the UI until replaced by a verified review.
  static String testimonialQuote(AppLocalizations l) => l.onboardingTestimonialQuote;
  static String testimonialAuthor(AppLocalizations l) => l.onboardingTestimonialAuthor;
  static const testimonialRating = 5;

  /// Label rendered on the testimonial; set to '' (every language) once the quote is a verified, consented review.
  static String testimonialDisclaimer(AppLocalizations l) => l.onboardingTestimonialDisclaimer;

  // ---------------------------------------------------------------- page 3 — Security & Process
  static List<OnboardingPoint> processSteps(AppLocalizations l) => [
    OnboardingPoint(
      icon: Icons.assignment_outlined,
      title: l.onboardingStepShareTitle,
      subtitle: l.onboardingStepShareSubtitle,
    ),
    OnboardingPoint(
      icon: Icons.person_search_outlined,
      title: l.onboardingStepMatchTitle,
      subtitle: l.onboardingStepMatchSubtitle,
    ),
    OnboardingPoint(
      icon: Icons.query_stats_rounded,
      title: l.onboardingStepCompareTitle,
      subtitle: l.onboardingStepCompareSubtitle,
    ),
    OnboardingPoint(
      icon: Icons.event_available_outlined,
      title: l.onboardingStepBookTitle,
      subtitle: l.onboardingStepBookSubtitle,
    ),
  ];

  static String securityBadge(AppLocalizations l) => l.onboardingSecurityBadge;
  static String securityFooter(AppLocalizations l) => l.onboardingSecurityFooter;

  // ---------------------------------------------------------------- legal links (auth screens)
  static const termsUrl = 'https://healindiaglobal.com/terms';
  static const privacyUrl = 'https://healindiaglobal.com/privacy';
}

/// A short accreditation code with a screen-reader description.
@immutable
class OnboardingBadge {
  const OnboardingBadge({required this.code, required this.description});

  final String code;
  final String description;
}

/// Icon + title + subtitle row used on the trust and process pages.
@immutable
class OnboardingPoint {
  const OnboardingPoint({required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;
}
