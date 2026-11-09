import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Brand asset paths (copied from `design/`, see design/README.md §4; BACKLOG #36).
///
/// Re-copy after the artwork changes: `design/logo/*` + `design/icons/app-icon.svg` -> `assets/brand/`,
/// `design/illustrations/*` -> `assets/illustrations/`, `design/specialties/*` -> `assets/specialties/`.
abstract final class BrandAssets {
  // logo/
  static const logoMark = 'assets/brand/logo-mark.svg';
  static const logoMarkMono = 'assets/brand/logo-mark-mono.svg';
  static const logoHorizontal = 'assets/brand/logo-horizontal.svg';
  static const logoHorizontalOnDark = 'assets/brand/logo-horizontal-on-dark.svg';
  static const logoStacked = 'assets/brand/logo-stacked.svg';
  static const logoStackedOnDark = 'assets/brand/logo-stacked-on-dark.svg';
  static const logoMonoWhite = 'assets/brand/logo-mono-white.svg';
  static const appIcon = 'assets/brand/app-icon.svg';

  // illustrations/ (decorative, 320 x 240: always pair with real text)
  static const onboardingWelcome = 'assets/illustrations/onboarding-welcome.svg';
  static const onboardingTrust = 'assets/illustrations/onboarding-trust.svg';
  static const onboardingSecurity = 'assets/illustrations/onboarding-security.svg';
  static const aiProcessing = 'assets/illustrations/ai-processing.svg';
  static const noResults = 'assets/illustrations/no-results.svg';
  static const noMessages = 'assets/illustrations/no-messages.svg';
  static const noDocuments = 'assets/illustrations/no-documents.svg';
  static const success = 'assets/illustrations/success.svg';
  static const error = 'assets/illustrations/error.svg';

  /// Specialty slugs with a line icon in `assets/specialties/<slug>.svg` (file name = catalogue slug).
  static const specialtySlugs = {
    'cardiology',
    'orthopedics',
    'cosmetic',
    'dental',
    'oncology',
    'neurology',
    'fertility',
    'transplant',
    'bariatric',
    'ophthalmology',
    'spine',
    'urology',
    'gastroenterology',
    'ent',
    'nephrology',
    'wellness',
  };

  /// `assets/specialties/<slug>.svg` for a known slug, `more.svg` for "more", else null.
  static String? specialtyIcon(String? slug) {
    final s = (slug ?? '').trim().toLowerCase();
    if (s == 'more') return 'assets/specialties/more.svg';
    return specialtySlugs.contains(s) ? 'assets/specialties/$s.svg' : null;
  }
}

/// Decorative brand SVG (illustration / logo), excluded from semantics.
class BrandSvg extends StatelessWidget {
  const BrandSvg(this.asset, {super.key, this.width, this.height, this.color, this.fit = BoxFit.contain});

  final String asset;
  final double? width;
  final double? height;

  /// Tints single-colour (`currentColor` / mono) assets.
  final Color? color;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    asset,
    width: width,
    height: height,
    fit: fit,
    excludeFromSemantics: true,
    colorFilter: color == null ? null : ColorFilter.mode(color!, BlendMode.srcIn),
    placeholderBuilder: (_) => SizedBox(width: width, height: height),
  );
}
