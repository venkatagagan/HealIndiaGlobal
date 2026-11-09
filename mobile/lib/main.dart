import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart' show Intl;
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/config/app_preferences.dart';
import 'core/network/api_exception.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Intl.defaultLocale = 'en_US';
  await initializeDateFormatting('en_US');
  _installErrorHandlers();

  final prefs = await SharedPreferences.getInstance();

  runApp(
    ProviderScope(
      retry: riverpodRetry,
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: const HealIndiaApp(),
    ),
  );
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
    return const ColoredBox(
      color: AppColors.darkBackground,
      child: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 40),
              SizedBox(height: 12),
              Text(
                'Something went wrong displaying this section.',
                textAlign: TextAlign.center,
                textDirection: TextDirection.ltr,
                style: TextStyle(color: AppColors.darkTextSecondary, fontSize: 14, decoration: TextDecoration.none),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
