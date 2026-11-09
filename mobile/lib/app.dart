import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_preferences.dart';
import 'core/i18n/locale_controller.dart';
import 'core/network/realtime_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/brand_header.dart';
import 'l10n/l10n.dart';

/// Root widget: theme, localization and go_router.
class HealIndiaApp extends ConsumerWidget {
  const HealIndiaApp({super.key, this.enableRealtime = true});

  /// Keeps the realtime WebSocket alive while a session exists (disabled in widget tests).
  final bool enableRealtime;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    final language = ref.watch(localeControllerProvider);
    if (enableRealtime) ref.watch(realtimeServiceProvider);

    return MaterialApp.router(
      title: Brand.name,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      locale: language.locale,
      supportedLocales: L10n.supportedLocales,
      localizationsDelegates: L10n.delegates(language.overrides),
      builder: (context, child) {
        // Cap text scaling so dense cards stay legible without overflowing.
        final mq = MediaQuery.of(context);
        return MediaQuery(
          data: mq.copyWith(textScaler: mq.textScaler.clamp(minScaleFactor: 0.85, maxScaleFactor: 1.3)),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
