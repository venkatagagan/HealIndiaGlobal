import 'package:flutter/material.dart';

/// Editable marketing copy for the onboarding carousel.
///
/// The business owns these numbers and claims: change them here only (no other file hard-codes
/// them). Keep the copy honest (PLAN §9): figures must be backed by partner-hospital data, and
/// accreditations are those held by partner hospitals, not by the platform itself.
abstract final class OnboardingContent {
  // ---------------------------------------------------------------- page 1 — Welcome Impact
  /// Headline statistic ("500,000+").
  static const impactStat = '500,000+';

  /// Caption below the statistic.
  static const impactStatCaption = 'Patients Treated';

  /// Small qualifier shown under the caption (empty string hides it).
  static const impactStatFootnote = 'across our partner hospitals';

  /// Main promise.
  static const impactHeadline = 'World-Class Healthcare at 70% Less Cost';

  /// Accreditation chips (short code + accessible description).
  static const accreditations = <OnboardingBadge>[
    OnboardingBadge(code: 'JCI', description: 'Joint Commission International accredited partner hospitals'),
    OnboardingBadge(code: 'NABH', description: 'NABH accredited partner hospitals'),
    OnboardingBadge(code: 'WHO', description: 'Care that follows WHO patient-safety guidelines'),
  ];

  /// Caption under the accreditation chips (empty string hides it).
  static const accreditationsCaption = 'Accreditations held by our partner hospitals';

  // ---------------------------------------------------------------- page 2 — Trust & Excellence
  static const trustTitle = 'Care you can trust';

  static const trustPoints = <OnboardingPoint>[
    OnboardingPoint(
      icon: Icons.translate_rounded,
      title: 'English-Speaking Doctors',
      subtitle: 'Communicate with ease.',
    ),
    OnboardingPoint(icon: Icons.schedule_rounded, title: 'Zero Wait Time', subtitle: 'Get prompt medical attention.'),
    OnboardingPoint(
      icon: Icons.verified_outlined,
      title: 'Joint Commission Certified',
      subtitle: 'Internationally accredited partner facilities.',
    ),
  ];

  /// Testimonial card. Marked as illustrative in the UI until replaced by a verified review.
  static const testimonialQuote = '"Saved \$45,000 on my cardiac surgery with better care than home."';
  static const testimonialAuthor = 'Patient from the USA';
  static const testimonialRating = 5;

  /// Label rendered on the testimonial; set to '' once the quote is a verified, consented review.
  static const testimonialDisclaimer = 'Illustrative example';

  // ---------------------------------------------------------------- page 3 — Security & Process
  static const processSteps = <OnboardingPoint>[
    OnboardingPoint(
      icon: Icons.assignment_outlined,
      title: 'Share Condition',
      subtitle: 'Securely provide your medical information.',
    ),
    OnboardingPoint(
      icon: Icons.person_search_outlined,
      title: 'Get Matched',
      subtitle: 'Our AI finds the best hospitals for you.',
    ),
    OnboardingPoint(
      icon: Icons.query_stats_rounded,
      title: 'Compare Costs',
      subtitle: 'Transparent pricing to make informed decisions.',
    ),
    OnboardingPoint(
      icon: Icons.event_available_outlined,
      title: 'Book Treatment',
      subtitle: 'Schedule your appointment hassle-free.',
    ),
  ];

  static const securityBadge = 'Encrypted & Secure';
  static const securityFooter = 'Your medical data is encrypted and shared only with hospitals you choose';

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
