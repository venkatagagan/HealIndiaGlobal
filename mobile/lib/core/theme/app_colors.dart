import 'package:flutter/material.dart';

/// Brand palette (PLAN §10 / §11). Dark theme is the default, matching the design images.
abstract final class AppColors {
  // Brand accents
  static const primary = Color(0xFF22C55E); // green - CTAs, success, selected chips
  static const primaryDark = Color(0xFF16A34A); // pressed / hover
  static const primarySoft = Color(0x2622C55E); // 15% green tint for chip backgrounds

  // Contrast-safe shades (WCAG AA 4.5:1, BACKLOG #33). White text on #22C55E is only 2.28:1 and on
  // #EF4444 3.76:1, so text-bearing fills use dark text on green ([onPrimary]) or the strong shades.
  static const onPrimary = Color(0xFF052E16); // on primary: 6.54:1
  static const primaryStrong = Color(0xFF15803D); // green text on light surfaces: 5.02:1 on white
  static const dangerStrong = Color(0xFFB91C1C); // red fill under white text / red text on light: 6.47:1
  static const onDangerDark = Color(0xFF2A0505); // dark text on #EF4444 (dark theme onError): 4.97:1
  static const warningStrong = Color(0xFFB45309); // amber text on light surfaces: 5.02:1 on white
  static const violetLight = Color(0xFFA78BFA); // violet text on dark cards: 6.36:1 on #161B22
  static const violet = Color(0xFF7C3AED); // accent - booking/payment flow, checklist
  static const violetSoft = Color(0x267C3AED);
  static const danger = Color(0xFFEF4444); // red - questionnaire step 1, SOS, prices on match cards
  static const dangerSoft = Color(0x26EF4444);
  static const warning = Color(0xFFF59E0B); // amber - "Moderate", maybe answers
  static const warningSoft = Color(0x26F59E0B);
  static const info = Color(0xFF2563EB); // blue - translator FAB, links
  static const cyan = Color(0xFF06B6D4);
  static const star = Color(0xFFFACC15); // rating stars

  // Dark surfaces
  static const darkBackground = Color(0xFF0B0F14);
  static const darkSurface = Color(0xFF161B22); // cards
  static const darkSurfaceAlt = Color(0xFF1F2630); // inputs, raised rows, chips
  static const darkBorder = Color(0xFF2A3340);
  static const darkTextPrimary = Color(0xFFF8FAFC);
  static const darkTextSecondary = Color(0xFF94A3B8);
  static const darkTextMuted = Color(0xFF64748B);

  // Light surfaces
  static const lightBackground = Color(0xFFF8FAFC);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightSurfaceAlt = Color(0xFFF1F5F9);
  static const lightBorder = Color(0xFFE2E8F0);
  static const lightTextPrimary = Color(0xFF0F172A);
  static const lightTextSecondary = Color(0xFF475569);
  static const lightTextMuted = Color(0xFF64748B); // 4.76:1 on white (was #94A3B8, 2.56:1)

  // Gradients
  /// Onboarding / hero gradient: purple -> blue -> cyan.
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7B2FF7), Color(0xFF2563EB), Color(0xFF06B6D4)],
  );

  /// Deep violet gradient used behind the AI processing animation.
  static const processingGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF2E1065), Color(0xFF1E1B4B), Color(0xFF0B0F14)],
  );

  /// Status colors for enums rendered as badges.
  static Color statusColor(String status) => switch (status) {
    'completed' || 'done' || 'paid' || 'confirmed' || 'approved' || 'verified' || 'accepted' || 'captured' => primary,
    'cancelled' || 'declined' || 'rejected' || 'failed' || 'expired' || 'emergency' || 'overdue' => danger,
    'pending' || 'pending_payment' || 'quoted' || 'sent' || 'in_progress' || 'processing' || 'urgent' => warning,
    'booked' || 'admitted' || 'in_treatment' || 'scheduled' => violet,
    _ => info,
  };
}

/// Theme-dependent semantic colors available via `Theme.of(context).extension<AppPalette>()!`
/// or the `context.palette` shortcut.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.surfaceAlt,
    required this.border,
    required this.textSecondary,
    required this.textMuted,
    required this.success,
    required this.warning,
    required this.danger,
    required this.accent,
  });

  static const dark = AppPalette(
    surfaceAlt: AppColors.darkSurfaceAlt,
    border: AppColors.darkBorder,
    textSecondary: AppColors.darkTextSecondary,
    textMuted: AppColors.darkTextMuted,
    success: AppColors.primary,
    warning: AppColors.warning,
    danger: AppColors.danger,
    accent: AppColors.violet,
  );

  static const light = AppPalette(
    surfaceAlt: AppColors.lightSurfaceAlt,
    border: AppColors.lightBorder,
    textSecondary: AppColors.lightTextSecondary,
    textMuted: AppColors.lightTextMuted,
    success: AppColors.primaryStrong,
    warning: AppColors.warningStrong,
    danger: AppColors.dangerStrong,
    accent: AppColors.violet,
  );

  final Color surfaceAlt;
  final Color border;
  final Color textSecondary;
  final Color textMuted;
  final Color success;
  final Color warning;
  final Color danger;
  final Color accent;

  @override
  AppPalette copyWith({
    Color? surfaceAlt,
    Color? border,
    Color? textSecondary,
    Color? textMuted,
    Color? success,
    Color? warning,
    Color? danger,
    Color? accent,
  }) => AppPalette(
    surfaceAlt: surfaceAlt ?? this.surfaceAlt,
    border: border ?? this.border,
    textSecondary: textSecondary ?? this.textSecondary,
    textMuted: textMuted ?? this.textMuted,
    success: success ?? this.success,
    warning: warning ?? this.warning,
    danger: danger ?? this.danger,
    accent: accent ?? this.accent,
  );

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    return AppPalette(
      surfaceAlt: Color.lerp(surfaceAlt, other.surfaceAlt, t)!,
      border: Color.lerp(border, other.border, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
    );
  }
}

extension AppThemeContext on BuildContext {
  ThemeData get theme => Theme.of(this);
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
  AppPalette get palette => Theme.of(this).extension<AppPalette>() ?? AppPalette.dark;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}
