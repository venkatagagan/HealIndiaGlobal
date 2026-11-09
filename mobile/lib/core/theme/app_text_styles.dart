import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Inter-based type scale. Weights follow the designs: bold headings, semibold labels.
abstract final class AppTextStyles {
  /// Set to false in tests (no network font fetching) — falls back to the platform font.
  static bool useGoogleFonts = true;

  /// Bundled script fonts (assets/fonts, SIL OFL) used for glyphs Inter lacks: Arabic and Bengali text
  /// must never render as boxes, whatever fonts the device has.
  static const List<String> scriptFallback = ['NotoSansArabic', 'NotoSansBengali'];

  static TextTheme textTheme(Color primary, Color secondary) {
    final base = TextTheme(
      displayLarge: TextStyle(fontSize: 48, fontWeight: FontWeight.w800, color: primary, height: 1.1),
      displayMedium: TextStyle(fontSize: 40, fontWeight: FontWeight.w800, color: primary, height: 1.1),
      displaySmall: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: primary, height: 1.15),
      headlineLarge: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: primary, height: 1.2),
      headlineMedium: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: primary, height: 1.25),
      headlineSmall: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: primary, height: 1.3),
      titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: primary, height: 1.3),
      titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: primary, height: 1.35),
      titleSmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: primary, height: 1.35),
      bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, color: primary, height: 1.5),
      bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: primary, height: 1.45),
      bodySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: secondary, height: 1.4),
      labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: primary, letterSpacing: 0.1),
      labelMedium: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: secondary, letterSpacing: 0.2),
      labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: secondary, letterSpacing: 0.3),
    );
    return (useGoogleFonts ? GoogleFonts.interTextTheme(base) : base).apply(fontFamilyFallback: scriptFallback);
  }

  /// Big countdown number on the pre-arrival dashboard ("23 days").
  static TextStyle countdown(Color color) => TextStyle(
    fontSize: 64,
    fontWeight: FontWeight.w900,
    color: color,
    height: 1,
    fontFamily: useGoogleFonts ? GoogleFonts.inter().fontFamily : null,
    fontFamilyFallback: scriptFallback,
  );

  /// Price emphasis on match cards ("$12,500").
  static TextStyle price(Color color, {double size = 26}) => TextStyle(
    fontSize: size,
    fontWeight: FontWeight.w800,
    color: color,
    fontFamily: useGoogleFonts ? GoogleFonts.inter().fontFamily : null,
    fontFamilyFallback: scriptFallback,
  );
}
