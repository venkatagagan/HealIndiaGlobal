/// "Your account is suspended" state of the partner shells (agent + hospital, PLAN §3.1).
///
/// The API answers 403 `organisation_suspended` (`backend/app/core/deps.py`) to every partner request once
/// the agency, or every hospital of a hospital member, is suspended. Instead of an error on each screen,
/// [ApiClient.organisationSuspended] feeds [organisationSuspendedProvider] and [OrganisationSuspendedGate]
/// (mounted once around the whole app) replaces the agent / hospital section with [OrganisationSuspendedView].
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/journey_actions.dart';

/// True once an API call of the signed-in user came back 403 `organisation_suspended`. Resets when the
/// signed-in user changes (sign out / another account) or on [OrganisationSuspendedController.clear].
final organisationSuspendedProvider = NotifierProvider<OrganisationSuspendedController, bool>(
  OrganisationSuspendedController.new,
);

class OrganisationSuspendedController extends Notifier<bool> {
  @override
  bool build() {
    ref.watch(currentUserProvider.select((u) => u?.id));
    final sub = ref.watch(apiClientProvider).organisationSuspended.listen((_) => state = true);
    ref.onDispose(sub.cancel);
    return false;
  }

  /// Marks the organisation as suspended (also used by tests).
  void markSuspended() => state = true;

  /// "Check again": shows the section again; the next request re-raises the state if still suspended.
  void clear() => state = false;
}

/// Shows [OrganisationSuspendedView] instead of [child] while an agent or hospital user's organisation is
/// suspended. Patients and signed-out users always see [child].
class OrganisationSuspendedGate extends ConsumerWidget {
  const OrganisationSuspendedGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suspended = ref.watch(organisationSuspendedProvider);
    final role = ref.watch(currentUserProvider)?.role;
    final show = suspended && (role == UserRole.agent || role == UserRole.hospital);
    // The section stays mounted (offstage) so its navigation state survives "Check again".
    return Stack(
      fit: StackFit.expand,
      children: [
        Offstage(
          offstage: show,
          child: TickerMode(enabled: !show, child: child),
        ),
        if (show) OrganisationSuspendedView(role: role!),
      ],
    );
  }
}

/// Full-screen message with support contacts (24/7 helpline, WhatsApp from `/content/helplines`),
/// "Check again" and sign out.
class OrganisationSuspendedView extends ConsumerWidget {
  const OrganisationSuspendedView({super.key, required this.role});

  final UserRole role;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final helplines = ref.watch(helplinesProvider);
    final phone = helplines.value?.support24x7;
    final whatsapp = helplines.value?.whatsapp;
    return Scaffold(
      key: const ValueKey('organisation-suspended'),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsetsDirectional.fromSTEB(24, 32, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        color: AppColors.warning.withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.block_rounded, size: 44, color: AppColors.warning),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(l10n.orgSuspendedTitle, textAlign: TextAlign.center, style: context.text.headlineSmall),
                  const SizedBox(height: 10),
                  Text(
                    role == UserRole.hospital ? l10n.orgSuspendedBodyHospital : l10n.orgSuspendedBodyAgent,
                    textAlign: TextAlign.center,
                    style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
                  ),
                  const SizedBox(height: 24),
                  if (helplines.isLoading)
                    const Center(child: CircularProgressIndicator())
                  else if (phone == null && whatsapp == null)
                    Text(
                      l10n.orgSuspendedNoContact,
                      textAlign: TextAlign.center,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
                    ),
                  if (phone != null) ...[
                    PrimaryButton(
                      key: const ValueKey('suspended-call-support'),
                      label: l10n.orgSuspendedCallSupport,
                      icon: Icons.phone_rounded,
                      onPressed: () => callNumber(context, phone),
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (whatsapp != null) ...[
                    SecondaryButton(
                      key: const ValueKey('suspended-whatsapp-support'),
                      label: l10n.orgSuspendedWhatsAppSupport,
                      icon: Icons.chat_rounded,
                      onPressed: () => openWhatsApp(context, whatsapp),
                    ),
                    const SizedBox(height: 10),
                  ],
                  TextButton.icon(
                    key: const ValueKey('suspended-check-again'),
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(l10n.orgSuspendedCheckAgain),
                    onPressed: () {
                      ref.invalidate(helplinesProvider);
                      ref.read(organisationSuspendedProvider.notifier).clear();
                    },
                  ),
                  TextButton.icon(
                    key: const ValueKey('suspended-logout'),
                    icon: const Icon(Icons.logout_rounded),
                    label: Text(l10n.commonLogOut),
                    onPressed: () => unawaited(ref.read(authControllerProvider.notifier).logout().catchError((_) {})),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
