import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/config/app_preferences.dart';
import 'core/i18n/locale_controller.dart';
import 'core/network/api_exception.dart';
import 'core/theme/app_theme.dart';
import 'l10n/l10n.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Date / number symbols for every language; the active locale is set by the localizations delegate
  // (L10n.setCurrent) whenever the app language changes.
  await initializeDateFormatting();
  _installErrorHandlers();

  final prefs = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    retry: riverpodRetry,
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
  );
  // Enabled languages + admin string overrides: cached copy now, fresh copy in the background.
  unawaited(container.read(localeControllerProvider.notifier).refreshRemote());

  runApp(UncontrolledProviderScope(container: container, child: const HealIndiaApp()));
}

/// Riverpod 3 retries failed providers automatically; only retry transient failures
/// (network / 5xx / 429), at most 3 times with exponential backoff.
Duration? riverpodRetry(int retryCount, Object error) {
  if (retryCount >= 3 || error is! ApiException || !error.isRetryable) return null;
  return Duration(milliseconds: 500 * (1 << retryCount));
}

void _installErrorHandlers() {
  final defaultOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    if (kDebugMode) {
      defaultOnError?.call(details);
    } else {
      FlutterError.presentError(details);
    }
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('Uncaught error: $error');
    return true;
  };
  if (!kDebugMode) {
    ErrorWidget.builder = (details) => const _FriendlyErrorWidget();
  }
}

/// Replaces the red error screen in release / profile builds.
class _FriendlyErrorWidget extends StatelessWidget {
  const _FriendlyErrorWidget();

  @override
  Widget build(BuildContext context) {
    final rtl = L10n.rtlLanguages.contains(L10n.current.localeName.split('_').first);
    return ColoredBox(
      color: AppColors.darkBackground,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 40),
              const SizedBox(height: 12),
              Text(
                L10n.current.commonErrorDisplayingSection,
                textAlign: TextAlign.center,
                textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
                style: const TextStyle(color: AppColors.darkTextSecondary, fontSize: 14, decoration: TextDecoration.none),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
