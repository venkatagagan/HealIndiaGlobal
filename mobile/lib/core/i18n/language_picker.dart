import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../theme/app_theme.dart';
import '../widgets/state_views.dart';
import 'locale_controller.dart';

/// Bottom sheet listing the enabled languages (native name + English name); applies the pick through
/// [LocaleController.setLanguage] (device + profile) and confirms it with a snack bar.
Future<void> showLanguagePicker(BuildContext context, WidgetRef ref) async {
  final state = ref.read(localeControllerProvider);
  final picked = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => _LanguageSheet(languages: state.enabledLanguages, selected: state.locale.languageCode),
  );
  if (picked == null || picked == state.locale.languageCode) return;
  final synced = await ref.read(localeControllerProvider.notifier).setLanguage(picked);
  if (!context.mounted) return;
  final language = ref.read(localeControllerProvider).current.nativeName;
  // The app rebuilds in the new language; read the strings after the frame so the snack uses them.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (!context.mounted) return;
    showInfoSnack(context, synced ? context.l10n.languageChanged(language) : context.l10n.languageProfileSyncFailed);
  });
}

class _LanguageSheet extends StatelessWidget {
  const _LanguageSheet({required this.languages, required this.selected});

  final List<AppLanguage> languages;
  final String selected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(20, 20, 20, 4),
            child: Text(l10n.languagePickerTitle, style: context.text.titleLarge),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(20, 0, 20, 8),
            child: Text(l10n.languagePickerHint, style: context.text.bodySmall),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final l in languages)
                  ListTile(
                    key: ValueKey('language-${l.code}'),
                    title: Text(l.nativeName, textDirection: l.rtl ? TextDirection.rtl : TextDirection.ltr),
                    subtitle: l.nativeName == l.name ? null : Text(l.name),
                    trailing: l.code == selected ? Icon(Icons.check_rounded, color: context.colors.primary) : null,
                    selected: l.code == selected,
                    onTap: () => Navigator.of(context).pop(l.code),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

/// Compact language button (globe + native name) for the welcome / onboarding screens. Hidden while only
/// one language is enabled.
class LanguageButton extends ConsumerWidget {
  const LanguageButton({super.key, this.foregroundColor});

  final Color? foregroundColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(localeControllerProvider);
    if (state.enabledLanguages.length < 2) return const SizedBox.shrink();
    return Tooltip(
      message: context.l10n.languageButtonTooltip,
      child: TextButton.icon(
        key: const ValueKey('language-button'),
        style: TextButton.styleFrom(foregroundColor: foregroundColor),
        onPressed: () => showLanguagePicker(context, ref),
        icon: const Icon(Icons.language_rounded, size: 18),
        label: Text(state.current.nativeName),
      ),
    );
  }
}

/// Current language's native name, for settings rows (`Language · Français`).
String currentLanguageName(WidgetRef ref) => ref.watch(localeControllerProvider).current.nativeName;
