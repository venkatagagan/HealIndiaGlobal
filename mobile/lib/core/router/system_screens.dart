import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/l10n.dart';
import '../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'routes.dart';

/// Shown while the stored session is validated at startup (`AuthStatus.unknown`).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppColors.heroGradient),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const BrandLogo(size: 72, color: Colors.white, background: Color(0x33FFFFFF)),
                const SizedBox(height: 20),
                Text(
                  context.l10n.appName,
                  style: context.text.headlineMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(context.l10n.appTagline, style: context.text.bodyMedium?.copyWith(color: Colors.white70)),
                const SizedBox(height: 36),
                const SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Unknown route.
class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key, this.location});

  final String? location;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final where = location;
    return Scaffold(
      appBar: AppBar(),
      body: EmptyView(
        icon: Icons.explore_off_outlined,
        title: l10n.routerNotFoundTitle,
        message: where == null ? null : l10n.routerNotFoundMessage(where),
        actionLabel: l10n.routerGoHome,
        onAction: () => context.go(Routes.home),
      ),
    );
  }
}
