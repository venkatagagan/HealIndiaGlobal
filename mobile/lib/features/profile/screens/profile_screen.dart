import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/auth_repository.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/i18n/language_picker.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../auth/widgets/auth_widgets.dart';
import '../../onboarding/onboarding_content.dart';
import '../data/countries.dart';
import '../widgets/change_password_sheet.dart';
import '../widgets/delete_account_sheet.dart';
import '../widgets/privacy_group.dart';
import '../widgets/profile_widgets.dart';

/// Profile tab: header, personal info + masked passport, companions, saved, documents link,
/// preferences (currency, language, theme), security, guest upgrade and logout.
///
/// Route: `/profile` (tab) · Owner: fl-onboarding.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final auth = ref.watch(authStateProvider);
    final user = auth.user;
    final full = auth.isAuthenticated;

    if (full) {
      // Keep the display currency in sync with the server-side preference.
      ref.listen(patientProfileProvider, (_, next) {
        final ccy = next.value?.preferredCurrency;
        if (ccy != null && ccy.isNotEmpty && ccy.toUpperCase() != ref.read(preferredCurrencyProvider)) {
          ref.read(preferredCurrencyProvider.notifier).set(ccy);
        }
      });
    }

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            if (!full) return;
            ref.invalidate(patientProfileProvider);
            await ref.read(authControllerProvider.notifier).refreshUser().catchError((_) {});
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              const BrandHeader(padding: EdgeInsets.fromLTRB(0, 4, 0, 8)),
              _Header(user: user, isGuest: auth.isGuest),
              if (!full) ...[const SizedBox(height: 16), const _GuestUpgradeCard()],
              if (full) ...[
                const SizedBox(height: 16),
                const _PersonalInfoCard(),
                SettingsGroup(
                  title: l10n.profileMyJourney,
                  children: [
                    SettingsTile(
                      icon: Icons.folder_shared_outlined,
                      title: l10n.profileMyCasesQuotes,
                      onTap: () => context.push(Routes.cases),
                    ),
                    SettingsTile(
                      icon: Icons.description_outlined,
                      title: l10n.profileDocuments,
                      subtitle: l10n.profileDocumentsSubtitle,
                      color: AppColors.info,
                      onTap: () => context.push(Routes.documents),
                    ),
                    SettingsTile(
                      icon: Icons.group_outlined,
                      title: l10n.companionsTitle,
                      subtitle: _companionsSubtitle(ref, l10n),
                      color: AppColors.violet,
                      onTap: () => context.push(Routes.companions),
                    ),
                    SettingsTile(
                      icon: Icons.bookmark_border_rounded,
                      title: l10n.savedTitle,
                      subtitle: l10n.profileSavedSubtitle,
                      color: AppColors.warning,
                      onTap: () => context.push(Routes.saved),
                    ),
                  ],
                ),
              ],
              const _PreferencesGroup(),
              if (full) _SecurityGroup(user: user),
              if (auth.hasSession) PrivacyGroup(showAccessLog: full),
              SettingsGroup(
                title: l10n.profileAbout,
                children: [
                  SettingsTile(
                    icon: Icons.gavel_outlined,
                    title: l10n.profileTermsOfService,
                    color: context.palette.textSecondary,
                    onTap: () => openLegalUrl(context, OnboardingContent.termsUrl),
                  ),
                  SettingsTile(
                    icon: Icons.privacy_tip_outlined,
                    title: l10n.profilePrivacyPolicy,
                    color: context.palette.textSecondary,
                    onTap: () => openLegalUrl(context, OnboardingContent.privacyUrl),
                  ),
                ],
              ),
              if (auth.hasSession) ...[
                const SizedBox(height: 24),
                _LogoutButton(isGuest: auth.isGuest),
                const SizedBox(height: 8),
                Center(
                  child: TextButton.icon(
                    key: const Key('profile-delete-account'),
                    style: TextButton.styleFrom(foregroundColor: context.colors.error),
                    icon: const Icon(Icons.delete_forever_outlined),
                    label: Text(l10n.commonDeleteAccount),
                    onPressed: () async {
                      final router = GoRouter.of(context);
                      final deleted = await showDeleteAccountSheet(context, isGuest: auth.isGuest);
                      if (!deleted) return;
                      router.go(Routes.auth);
                      if (context.mounted) showInfoSnack(context, context.l10n.deleteAccountDoneSnack);
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String? _companionsSubtitle(WidgetRef ref, AppLocalizations l10n) {
    final list = ref.watch(companionsProvider).value;
    if (list == null) return l10n.companionsSubtitleDefault;
    if (list.isEmpty) return l10n.companionsSubtitleEmpty;
    return list.map((c) => c.fullName).join(', ');
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.user, required this.isGuest});

  final User? user;
  final bool isGuest;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final u = user;
    final name = u?.displayName ?? l10n.profileGuest;
    return AppCard(
      child: Row(
        children: [
          Avatar(imageUrl: u?.avatarUrl, name: name, size: 64),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: context.text.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
                if ((u?.email ?? '').isNotEmpty)
                  Text(u!.email!, style: context.text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (isGuest || u == null)
                      StatusBadge(label: l10n.profileGuest, color: AppColors.warning, dense: true)
                    else ...[
                      StatusBadge(label: l10n.profilePatientBadge, color: AppColors.primary, dense: true),
                      if (u.emailVerified)
                        StatusBadge(
                          label: l10n.profileEmailVerified,
                          color: AppColors.info,
                          icon: Icons.verified_rounded,
                          dense: true,
                        ),
                      if ((u.countryCode ?? '').isNotEmpty)
                        StatusBadge(
                          label: '${countryFlag(u.countryCode)} ${countryName(u.countryCode, l10n)}',
                          color: context.palette.textSecondary,
                          dense: true,
                        ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (!isGuest && u != null)
            IconButton(
              tooltip: l10n.editProfileTitle,
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => context.push(Routes.profileEdit),
            ),
        ],
      ),
    );
  }
}

class _GuestUpgradeCard extends StatelessWidget {
  const _GuestUpgradeCard();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      gradient: AppColors.heroGradient,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.profileGuestUpgradeTitle,
            style: context.text.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(l10n.profileGuestUpgradeBody, style: context.text.bodySmall?.copyWith(color: Colors.white)),
          const SizedBox(height: 14),
          // Wrap: translated button labels may not fit side by side.
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF1E1B4B),
                  minimumSize: const Size(0, 44),
                ),
                onPressed: () => context.push(Routes.registerFrom(Routes.profile)),
                child: Text(l10n.profileCreateAccount),
              ),
              TextButton(
                style: TextButton.styleFrom(foregroundColor: Colors.white),
                onPressed: () => context.push(Routes.loginFrom(Routes.profile)),
                child: Text(l10n.authLogIn),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PersonalInfoCard extends ConsumerWidget {
  const _PersonalInfoCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(patientProfileProvider);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(l10n.profilePersonalInfo, style: context.text.titleMedium)),
              TextButton.icon(
                onPressed: () => context.push(Routes.profileEdit),
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: Text(l10n.commonEdit),
              ),
            ],
          ),
          value.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)),
            ),
            error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(patientProfileProvider)),
            data: (p) {
              final ec = p.emergencyContact;
              final passport = p.maskedPassport == null
                  ? null
                  : [
                      p.maskedPassport,
                      if (p.passportExpiry != null) l10n.profilePassportExpires(Dates.day(p.passportExpiry)),
                    ].join(' · ');
              final expiringSoon = p.passportExpiry != null && Dates.daysUntil(p.passportExpiry!) < 180;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InfoRow(
                    icon: Icons.cake_outlined,
                    label: l10n.profileDateOfBirth,
                    value: p.dateOfBirth == null ? null : Dates.day(p.dateOfBirth),
                  ),
                  InfoRow(icon: Icons.wc_rounded, label: l10n.profileGender, value: p.gender?.label),
                  InfoRow(
                    icon: Icons.flag_outlined,
                    label: l10n.profileNationality,
                    value: p.nationality == null
                        ? null
                        : '${countryFlag(p.nationality)} ${countryName(p.nationality, l10n)}',
                  ),
                  InfoRow(icon: Icons.phone_outlined, label: l10n.profilePhone, value: p.phone),
                  InfoRow(icon: Icons.badge_outlined, label: l10n.profilePassport, value: passport),
                  if (expiringSoon)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(start: 28, bottom: 4),
                      child: Text(
                        l10n.profilePassportValidityWarning,
                        style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                      ),
                    ),
                  InfoRow(
                    icon: Icons.contact_emergency_outlined,
                    label: l10n.profileEmergencyContact,
                    value: ec == null || ec.isEmpty
                        ? null
                        : [
                            ec.name,
                            if ((ec.relationship ?? '').isNotEmpty) '(${ec.relationship})',
                            ec.phone,
                          ].whereType<String>().join(' '),
                  ),
                  InfoRow(icon: Icons.bloodtype_outlined, label: l10n.profileBloodGroup, value: p.bloodGroup),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _PreferencesGroup extends ConsumerWidget {
  const _PreferencesGroup();

  Future<void> _pickCurrency(BuildContext context, WidgetRef ref) async {
    final current = ref.read(preferredCurrencyProvider);
    final picked = await showChoiceSheet<String>(
      context,
      title: context.l10n.settingsPreferredCurrency,
      options: Currencies.supported,
      selected: current,
      labelOf: (c) => c,
    );
    if (picked == null || picked == current) return;
    await ref.read(preferredCurrencyProvider.notifier).set(picked);
    if (!ref.read(authStateProvider).isAuthenticated) return;
    try {
      await ref.read(patientRepositoryProvider).updateProfile(PatientProfileUpdate(preferredCurrency: picked));
      ref.invalidate(patientProfileProvider);
    } on Object catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _pickTheme(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final picked = await showChoiceSheet<ThemeMode>(
      context,
      title: l10n.settingsAppearance,
      options: const [ThemeMode.dark, ThemeMode.light, ThemeMode.system],
      selected: ref.read(themeModeProvider),
      labelOf: (m) => _themeLabel(l10n, m),
    );
    if (picked != null) await ref.read(themeModeProvider.notifier).set(picked);
  }

  static String _themeLabel(AppLocalizations l10n, ThemeMode m) => switch (m) {
    ThemeMode.dark => l10n.settingsThemeDark,
    ThemeMode.light => l10n.settingsThemeLight,
    ThemeMode.system => l10n.settingsThemeSystem,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final currency = ref.watch(preferredCurrencyProvider);
    final theme = ref.watch(themeModeProvider);
    return SettingsGroup(
      title: l10n.settingsPreferences,
      children: [
        SettingsTile(
          icon: Icons.payments_outlined,
          title: l10n.settingsCurrency,
          subtitle: l10n.settingsCurrencySubtitle(currency),
          trailing: _Value(currency),
          onTap: () => _pickCurrency(context, ref),
        ),
        // App language: saved on the device and, when signed in, to the profile (`preferred_language`).
        SettingsTile(
          icon: Icons.translate_rounded,
          title: l10n.languageSettingTitle,
          color: AppColors.info,
          trailing: _Value(currentLanguageName(ref)),
          onTap: () => showLanguagePicker(context, ref),
        ),
        SettingsTile(
          icon: Icons.dark_mode_outlined,
          title: l10n.settingsAppearance,
          color: AppColors.violet,
          trailing: _Value(_themeLabel(l10n, theme)),
          onTap: () => _pickTheme(context, ref),
        ),
      ],
    );
  }
}

class _SecurityGroup extends ConsumerWidget {
  const _SecurityGroup({required this.user});

  final User? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final u = user;
    return SettingsGroup(
      title: l10n.settingsSecurity,
      children: [
        SettingsTile(
          icon: Icons.lock_reset_rounded,
          title: l10n.passwordChangeTitle,
          color: AppColors.info,
          onTap: () async {
            final changed = await showChangePasswordSheet(context);
            if (changed && context.mounted) {
              showInfoSnack(context, context.l10n.passwordUpdatedSnack);
            }
          },
        ),
        if (u != null && !u.emailVerified && (u.email ?? '').isNotEmpty)
          SettingsTile(
            icon: Icons.mark_email_unread_outlined,
            title: l10n.accountVerifyEmail,
            subtitle: l10n.accountVerifyEmailSubtitle(u.email!),
            color: AppColors.warning,
            trailing: TextButton(
              onPressed: () async {
                try {
                  await ref.read(authRepositoryProvider).resendVerification();
                  if (context.mounted) showInfoSnack(context, context.l10n.accountVerificationSent);
                } on Object catch (e) {
                  if (context.mounted) showErrorSnack(context, e);
                }
              },
              child: Text(l10n.accountResend),
            ),
          ),
        SettingsTile(icon: Icons.shield_outlined, title: l10n.accountYourData, subtitle: l10n.accountYourDataSubtitle),
      ],
    );
  }
}

class _LogoutButton extends ConsumerStatefulWidget {
  const _LogoutButton({required this.isGuest});

  final bool isGuest;

  @override
  ConsumerState<_LogoutButton> createState() => _LogoutButtonState();
}

class _LogoutButtonState extends ConsumerState<_LogoutButton> {
  bool _loading = false;

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) {
        final l10n = context.l10n;
        return AlertDialog(
          title: Text(widget.isGuest ? l10n.accountExitGuestTitle : l10n.accountLogOutTitle),
          content: Text(widget.isGuest ? l10n.accountExitGuestBody : l10n.accountLogOutBody),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.commonCancel)),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              onPressed: () => Navigator.pop(context, true),
              child: Text(widget.isGuest ? l10n.accountExit : l10n.commonLogOut),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) return;
    final router = GoRouter.of(context);
    setState(() => _loading = true);
    try {
      await ref.read(authControllerProvider.notifier).logout();
      router.go(Routes.auth);
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SecondaryButton(
      label: widget.isGuest ? l10n.accountExitGuestMode : l10n.commonLogOut,
      icon: Icons.logout_rounded,
      loading: _loading,
      foregroundColor: AppColors.danger,
      borderColor: AppColors.danger.withValues(alpha: 0.5),
      onPressed: _logout,
    );
  }
}

class _Value extends StatelessWidget {
  const _Value(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(text, style: context.text.labelMedium),
        const Icon(Icons.chevron_right_rounded),
      ],
    );
  }
}
