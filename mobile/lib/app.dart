import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_preferences.dart';
import 'core/network/realtime_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/brand_header.dart';
import 'features/messages/logic/push_coordinator.dart';

/// Root widget: theme, localization and go_router.
class HealIndiaApp extends ConsumerWidget {
  const HealIndiaApp({super.key, this.enableRealtime = true});

  /// Keeps the realtime WebSocket alive while a session exists and connects push notifications
  /// (disabled in widget tests).
  final bool enableRealtime;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    if (enableRealtime) {
      ref.watch(realtimeServiceProvider);
      ref.watch(pushCoordinatorProvider); // no-op unless built with PUSH_ENABLED=true
    }

    return MaterialApp.router(
      title: Brand.name,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      locale: const Locale('en'),
      supportedLocales: const [Locale('en'), Locale('en', 'IN'), Locale('en', 'US'), Locale('en', 'GB')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
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
