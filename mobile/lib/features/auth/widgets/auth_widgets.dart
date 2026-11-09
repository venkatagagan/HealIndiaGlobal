import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../onboarding/onboarding_content.dart';

/// The auth flow uses the light (white) look of the "Registration Decision" design regardless of
/// the app theme.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.child, this.title, this.onBack, this.showBack = true});

  final Widget child;
  final String? title;

  /// Defaults to pop, or `/auth` when there is nothing to pop.
  final VoidCallback? onBack;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: AppTheme.light(),
      child: Builder(
        builder: (context) => AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.dark,
          child: Scaffold(
            backgroundColor: Colors.white,
            appBar: AppBar(
              backgroundColor: Colors.white,
              automaticallyImplyLeading: false,
              leading: showBack
                  ? IconButton(
                      tooltip: 'Back',
                      icon: const Icon(Icons.chevron_left_rounded, size: 28),
                      onPressed: onBack ?? () => _defaultBack(context),
                    )
                  : null,
              title: title == null ? null : Text(title!),
            ),
            body: SafeArea(top: false, child: child),
          ),
        ),
      ),
    );
  }

  static void _defaultBack(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.auth);
    }
  }
}

/// Centered logo + brand name + tagline (registration decision header).
class AuthBrandHeader extends StatelessWidget {
  const AuthBrandHeader({super.key, this.subtitle});

  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Column(
        children: [
          const Icon(Icons.layers_outlined, size: 44, color: AppColors.info),
          const SizedBox(height: 12),
          Text(Brand.name, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(
            subtitle ?? Brand.tagline,
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Outlined, color-accented decision button (Google / Email / Guest).
class AuthChoiceButton extends StatelessWidget {
  const AuthChoiceButton({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
    this.loading = false,
  });

  final String label;
  final Widget icon;
  final Color color;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: loading ? null : onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        foregroundColor: context.colors.onSurface,
        side: BorderSide(color: color, width: 1.4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
        textStyle: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
      child: loading
          ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: color))
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                icon,
                const SizedBox(width: 10),
                Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
              ],
            ),
    );
  }
}

/// Google "G" mark drawn with text (no bundled brand asset).
class GoogleMark extends StatelessWidget {
  const GoogleMark({super.key, this.size = 18});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: Color(0xFFEFF6FF), shape: BoxShape.circle),
      child: Text(
        'G',
        style: TextStyle(fontSize: size * 0.62, fontWeight: FontWeight.w800, color: const Color(0xFF4285F4)),
      ),
    );
  }
}

/// Password input with a visibility toggle.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    this.label = 'Password',
    this.validator,
    this.errorText,
    this.textInputAction = TextInputAction.done,
    this.onSubmitted,
    this.autofillHints = const [AutofillHints.password],
    this.helperText,
  });

  final TextEditingController controller;
  final String label;
  final FormFieldValidator<String>? validator;
  final String? errorText;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String> autofillHints;
  final String? helperText;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      obscureText: _obscure,
      enableSuggestions: false,
      autocorrect: false,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onSubmitted,
      autofillHints: widget.autofillHints,
      validator: widget.validator,
      maxLength: 128,
      decoration: InputDecoration(
        labelText: widget.label,
        errorText: widget.errorText,
        helperText: widget.helperText,
        helperMaxLines: 2,
        counterText: '',
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          tooltip: _obscure ? 'Show password' : 'Hide password',
          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: () => setState(() => _obscure = !_obscure),
        ),
      ),
    );
  }
}

/// Inline error box for form-level API errors.
class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.dangerSoft,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: AppColors.danger.withValues(alpha: 0.4)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(message, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ),
          ],
        ),
      ),
    );
  }
}

/// "By continuing, you agree to our Terms & Privacy Policy." with tappable links.
class TermsNotice extends StatefulWidget {
  const TermsNotice({super.key, this.prefix = 'By continuing, you agree to our '});

  final String prefix;

  @override
  State<TermsNotice> createState() => _TermsNoticeState();
}

class _TermsNoticeState extends State<TermsNotice> {
  late final TapGestureRecognizer _terms = TapGestureRecognizer()
    ..onTap = () => openLegalUrl(context, OnboardingContent.termsUrl);
  late final TapGestureRecognizer _privacy = TapGestureRecognizer()
    ..onTap = () => openLegalUrl(context, OnboardingContent.privacyUrl);

  @override
  void dispose() {
    _terms.dispose();
    _privacy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = context.text.labelSmall?.copyWith(color: context.palette.textSecondary);
    final link = base?.copyWith(decoration: TextDecoration.underline, color: context.colors.onSurface);
    return Text.rich(
      TextSpan(
        style: base,
        children: [
          TextSpan(text: widget.prefix),
          TextSpan(text: 'Terms', style: link, recognizer: _terms),
          const TextSpan(text: ' & '),
          TextSpan(text: 'Privacy Policy', style: link, recognizer: _privacy),
          const TextSpan(text: '.'),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}

/// Opens a legal page in the browser; shows a snackbar if it cannot be opened.
Future<void> openLegalUrl(BuildContext context, String url) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) showInfoSnack(context, 'Could not open $url');
}

/// Copy for the 18+ attestation (CG-24).
abstract final class AgeCopy {
  static const adultConfirm = 'I confirm I am 18 or older.';
  static const adult = 'I am 18 or older';
  static const minor = 'I am under 18 and a parent or guardian will give consent for my care';
  static const required = 'Please confirm your age';
}

/// The required age question at sign-up (CG-24).
///
/// * [adultOnly] (agents, hospital users): one checkbox "I confirm I am 18 or older." — [value] is true
///   when ticked, null otherwise.
/// * Patients: two options, one must be chosen — true = 18 or older, false = under 18 with a parent or
///   guardian giving consent; null = not answered yet.
class AgeAttestationField extends StatelessWidget {
  const AgeAttestationField({
    super.key,
    required this.adultOnly,
    required this.value,
    required this.onChanged,
    this.showError = false,
    this.enabled = true,
  });

  final bool adultOnly;
  final bool? value;
  final ValueChanged<bool?> onChanged;
  final bool showError;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final error = showError
        ? Padding(
            padding: EdgeInsets.only(left: adultOnly ? 0 : 12, top: 2),
            child: Text(
              AgeCopy.required,
              key: const Key('age-error'),
              style: context.text.bodySmall?.copyWith(color: AppColors.danger),
            ),
          )
        : null;
    if (adultOnly) {
      return CheckboxListTile(
        key: const Key('age-adult-confirm'),
        value: value == true,
        onChanged: enabled ? (v) => onChanged(v == true ? true : null) : null,
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
        title: Text(AgeCopy.adultConfirm, style: context.text.bodyMedium),
        subtitle: error,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Your age', style: context.text.labelLarge),
        RadioGroup<bool>(
          groupValue: value,
          onChanged: (v) {
            if (enabled) onChanged(v);
          },
          child: Column(
            children: [
              RadioListTile<bool>(
                key: const Key('age-adult'),
                value: true,
                enabled: enabled,
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(AgeCopy.adult, style: context.text.bodyMedium),
              ),
              RadioListTile<bool>(
                key: const Key('age-minor'),
                value: false,
                enabled: enabled,
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(AgeCopy.minor, style: context.text.bodyMedium),
              ),
            ],
          ),
        ),
        ?error,
      ],
    );
  }
}

/// Asks the 18+ question when Google / Apple sign-in creates a new account (API 400
/// `age_attestation_required` / `adult_required`). Returns the answer, or null when cancelled.
Future<bool?> showAgeAttestationDialog(BuildContext context, {required bool adultOnly}) => showDialog<bool>(
  context: context,
  builder: (_) => _AgeAttestationDialog(adultOnly: adultOnly),
);

class _AgeAttestationDialog extends StatefulWidget {
  const _AgeAttestationDialog({required this.adultOnly});

  final bool adultOnly;

  @override
  State<_AgeAttestationDialog> createState() => _AgeAttestationDialogState();
}

class _AgeAttestationDialogState extends State<_AgeAttestationDialog> {
  bool? _value;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Confirm your age'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.adultOnly
                  ? 'This type of account is only for adults.'
                  : 'We need to know this before we create your account.',
              style: context.text.bodyMedium,
            ),
            const SizedBox(height: 8),
            AgeAttestationField(
              adultOnly: widget.adultOnly,
              value: _value,
              onChanged: (v) => setState(() => _value = v),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          key: const Key('age-continue'),
          onPressed: _value == null ? null : () => Navigator.pop(context, _value),
          child: const Text('Continue'),
        ),
      ],
    );
  }
}
