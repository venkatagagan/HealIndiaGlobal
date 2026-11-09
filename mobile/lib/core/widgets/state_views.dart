import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../network/api_exception.dart';
import '../theme/app_theme.dart';
import 'buttons.dart';

/// Centered spinner with optional message.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message, this.color});

  final String? message;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: color),
            if (message != null) ...[
              const SizedBox(height: 16),
              Text(message!, style: context.text.bodyMedium, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

/// Empty state: icon, title, message and optional action.
class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.title,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: context.palette.surfaceAlt, shape: BoxShape.circle),
              child: Icon(icon, size: 34, color: context.palette.textSecondary),
            ),
            const SizedBox(height: 16),
            Text(title, style: context.text.titleMedium, textAlign: TextAlign.center),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(
                message!,
                style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 20),
              PrimaryButton(label: actionLabel!, onPressed: onAction, expand: false),
            ],
          ],
        ),
      ),
    );
  }
}

/// Error state with retry. Accepts any error (uses [errorMessage] for the text).
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry, this.title, this.compact = false});

  final Object? error;
  final VoidCallback? onRetry;
  final String? title;

  /// Inline row variant for use inside lists / cards.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final api = error == null ? null : ApiException.from(error!);
    final offline = api?.isNetwork ?? false;
    final l10n = context.l10n;
    final heading = title ?? (offline ? l10n.coreErrorOffline : l10n.commonSomethingWentWrong);
    final message = errorMessage(error);
    if (compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded, color: AppColors.danger, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: context.text.bodySmall)),
            if (onRetry != null) TextButton(onPressed: onRetry, child: Text(l10n.commonRetry)),
          ],
        ),
      );
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
              size: 48,
              color: offline ? context.palette.textSecondary : AppColors.danger,
            ),
            const SizedBox(height: 12),
            Text(heading, style: context.text.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(
              message,
              style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              SecondaryButton(
                label: l10n.commonTryAgain,
                icon: Icons.refresh_rounded,
                onPressed: onRetry,
                expand: false,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Renders an [AsyncValue] with consistent loading / error states.
///
/// ```dart
/// AsyncValueView(
///   value: ref.watch(specialtiesProvider),
///   onRetry: () => ref.invalidate(specialtiesProvider),
///   data: (items) => SpecialtyGrid(items),
/// )
/// ```
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    super.key,
    required this.value,
    required this.data,
    this.onRetry,
    this.loading,
    this.loadingMessage,
    this.compactError = false,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final Widget? loading;
  final String? loadingMessage;
  final bool compactError;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: () => loading ?? LoadingView(message: loadingMessage),
      error: (e, _) => ErrorView(error: e, onRetry: onRetry, compact: compactError),
    );
  }
}

/// Shows a floating snackbar with the error message of [error].
void showErrorSnack(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(errorMessage(error))));
}

/// Shows a floating success / info snackbar.
void showInfoSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
