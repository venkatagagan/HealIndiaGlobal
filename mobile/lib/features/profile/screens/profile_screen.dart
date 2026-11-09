import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/auth_repository.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
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
                  title: 'My journey',
                  children: [
                    SettingsTile(
                      icon: Icons.folder_shared_outlined,
                      title: 'My cases & quotes',
                      onTap: () => context.push(Routes.cases),
                    ),
                    SettingsTile(
                      icon: Icons.description_outlined,
                      title: 'Documents',
                      subtitle: 'Passport, medical reports, visas, invoices',
                      color: AppColors.info,
                      onTap: () => context.push(Routes.documents),
                    ),
                    SettingsTile(
                      icon: Icons.group_outlined,
                      title: 'Travel companions',
                      subtitle: _companionsSubtitle(ref),
                      color: AppColors.violet,
                      onTap: () => context.push(Routes.companions),
                    ),
                    SettingsTile(
                      icon: Icons.bookmark_border_rounded,
                      title: 'Saved',
                      subtitle: 'Hospitals, doctors and treatments',
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
                title: 'About',
                children: [
                  SettingsTile(
                    icon: Icons.gavel_outlined,
                    title: 'Terms of service',
                    color: context.palette.textSecondary,
                    onTap: () => openLegalUrl(context, OnboardingContent.termsUrl),
                  ),
                  SettingsTile(
                    icon: Icons.privacy_tip_outlined,
                    title: 'Privacy policy',
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
                    label: const Text('Delete account'),
                    onPressed: () async {
                      final router = GoRouter.of(context);
                      final deleted = await showDeleteAccountSheet(context, isGuest: auth.isGuest);
                      if (!deleted) return;
                      router.go(Routes.auth);
                      if (context.mounted) showInfoSnack(context, 'Your account has been deleted.');
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

  String? _companionsSubtitle(WidgetRef ref) {
    final list = ref.watch(companionsProvider).value;
    if (list == null) return 'People travelling with you';
    if (list.isEmpty) return 'Add the people travelling with you';
    return list.map((c) => c.fullName).join(', ');
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.user, required this.isGuest});

  final User? user;
  final bool isGuest;

  @override
  Widget build(BuildContext context) {
    final u = user;
    final name = u?.displayName ?? 'Guest';
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
                      const StatusBadge(label: 'Guest', color: AppColors.warning, dense: true)
                    else ...[
                      const StatusBadge(label: 'Patient', color: AppColors.primary, dense: true),
                      if (u.emailVerified)
                        const StatusBadge(
                          label: 'Email verified',
                          color: AppColors.info,
                          icon: Icons.verified_rounded,
                          dense: true,
                        ),
                      if ((u.countryCode ?? '').isNotEmpty)
                        StatusBadge(
                          label: '${countryFlag(u.countryCode)} ${countryName(u.countryCode)}',
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
              tooltip: 'Edit profile',
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
    return AppCard(
      gradient: AppColors.heroGradient,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Create your free account',
            style: context.text.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'Keep your screenings and matches, request quotes, book treatment, upload documents and chat '
            'with your coordinator.',
            style: context.text.bodySmall?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF1E1B4B),
                  minimumSize: const Size(0, 44),
                ),
                onPressed: () => context.push(Routes.registerFrom(Routes.profile)),
                child: const Text('Create account'),
              ),
              const SizedBox(width: 8),
              TextButton(
                style: TextButton.styleFrom(foregroundColor: Colors.white),
                onPressed: () => context.push(Routes.loginFrom(Routes.profile)),
                child: const Text('Log in'),
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
    final value = ref.watch(patientProfileProvider);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('Personal information', style: context.text.titleMedium)),
              TextButton.icon(
                onPressed: () => context.push(Routes.profileEdit),
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: const Text('Edit'),
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
                      if (p.passportExpiry != null) 'expires ${Dates.day(p.passportExpiry)}',
                    ].join(' · ');
              final expiringSoon = p.passportExpiry != null && Dates.daysUntil(p.passportExpiry!) < 180;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InfoRow(
                    icon: Icons.cake_outlined,
                    label: 'Date of birth',
                    value: p.dateOfBirth == null ? null : Dates.day(p.dateOfBirth),
                  ),
                  InfoRow(icon: Icons.wc_rounded, label: 'Gender', value: p.gender?.label),
                  InfoRow(
                    icon: Icons.flag_outlined,
                    label: 'Nationality',
                    value: p.nationality == null ? null : '${countryFlag(p.nationality)} ${countryName(p.nationality)}',
                  ),
                  InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: p.phone),
                  InfoRow(icon: Icons.badge_outlined, label: 'Passport', value: passport),
                  if (expiringSoon)
                    Padding(
                      padding: const EdgeInsets.only(left: 28, bottom: 4),
                      child: Text(
                        'Your passport must be valid for at least 6 months to apply for an e-Medical visa.',
                        style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                      ),
                    ),
                  InfoRow(
                    icon: Icons.contact_emergency_outlined,
                    label: 'Emergency contact',
                    value: ec == null || ec.isEmpty
                        ? null
                        : [
                            ec.name,
                            if ((ec.relationship ?? '').isNotEmpty) '(${ec.relationship})',
                            ec.phone,
                          ].whereType<String>().join(' '),
                  ),
                  InfoRow(icon: Icons.bloodtype_outlined, label: 'Blood group', value: p.bloodGroup),
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
      title: 'Preferred currency',
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

  Future<void> _pickLanguage(BuildContext context, WidgetRef ref, String current) async {
    final picked = await showChoiceSheet<String>(
      context,
      title: 'Preferred language',
      options: kLanguages.keys.toList(),
      selected: current,
      labelOf: (c) => kLanguages[c] ?? c,
    );
    if (picked == null || picked == current) return;
    try {
      final user = await ref.read(authRepositoryProvider).updateMe(preferredLanguage: picked);
      ref.read(authControllerProvider.notifier).setUser(user);
      if (context.mounted) {
        showInfoSnack(context, 'Coordinators and hospitals will contact you in ${kLanguages[picked] ?? picked}.');
      }
    } on Object catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _pickTheme(BuildContext context, WidgetRef ref) async {
    final picked = await showChoiceSheet<ThemeMode>(
      context,
      title: 'Appearance',
      options: const [ThemeMode.dark, ThemeMode.light, ThemeMode.system],
      selected: ref.read(themeModeProvider),
      labelOf: _themeLabel,
    );
    if (picked != null) await ref.read(themeModeProvider.notifier).set(picked);
  }

  static String _themeLabel(ThemeMode m) => switch (m) {
    ThemeMode.dark => 'Dark',
    ThemeMode.light => 'Light',
    ThemeMode.system => 'Match device',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(preferredCurrencyProvider);
    final theme = ref.watch(themeModeProvider);
    final auth = ref.watch(authStateProvider);
    final language = auth.user?.preferredLanguage ?? 'en';
    return SettingsGroup(
      title: 'Preferences',
      children: [
        SettingsTile(
          icon: Icons.payments_outlined,
          title: 'Currency',
          subtitle: 'Prices are shown as estimates in $currency',
          trailing: _Value(currency),
          onTap: () => _pickCurrency(context, ref),
        ),
        if (auth.isAuthenticated)
          SettingsTile(
            icon: Icons.translate_rounded,
            title: 'Language',
            color: AppColors.info,
            trailing: _Value(kLanguages[language] ?? language),
            onTap: () => _pickLanguage(context, ref, language),
          ),
        SettingsTile(
          icon: Icons.dark_mode_outlined,
          title: 'Appearance',
          color: AppColors.violet,
          trailing: _Value(_themeLabel(theme)),
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
    final u = user;
    return SettingsGroup(
      title: 'Security',
      children: [
        SettingsTile(
          icon: Icons.lock_reset_rounded,
          title: 'Change password',
          color: AppColors.info,
          onTap: () async {
            final changed = await showChangePasswordSheet(context);
            if (changed && context.mounted) {
              showInfoSnack(context, 'Password updated. Other devices have been signed out.');
            }
          },
        ),
        if (u != null && !u.emailVerified && (u.email ?? '').isNotEmpty)
          SettingsTile(
            icon: Icons.mark_email_unread_outlined,
            title: 'Verify your email',
            subtitle: 'Check ${u.email} for the verification link',
            color: AppColors.warning,
            trailing: TextButton(
              onPressed: () async {
                try {
                  await ref.read(authRepositoryProvider).resendVerification();
                  if (context.mounted) showInfoSnack(context, 'Verification email sent');
                } on Object catch (e) {
                  if (context.mounted) showErrorSnack(context, e);
                }
              },
              child: const Text('Resend'),
            ),
          ),
        const SettingsTile(
          icon: Icons.shield_outlined,
          title: 'Your data',
          subtitle: 'Medical data is encrypted and shared only with hospitals you choose.',
        ),
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
      builder: (context) => AlertDialog(
        title: Text(widget.isGuest ? 'Exit guest mode?' : 'Log out?'),
        content: Text(
          widget.isGuest
              ? 'Your guest screenings will be lost unless you create an account first.'
              : 'You can log back in any time with your email and password.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: Text(widget.isGuest ? 'Exit' : 'Log out'),
          ),
        ],
      ),
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
    return SecondaryButton(
      label: widget.isGuest ? 'Exit guest mode' : 'Log out',
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
