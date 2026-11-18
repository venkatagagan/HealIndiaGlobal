import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/whatsapp_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// WhatsApp updates: enter a number -> a 6-digit code arrives on WhatsApp -> confirm -> updates are on.
/// Turning off works here or by replying STOP. Only general updates are sent; never medical details.
///
/// Route: `/profile/whatsapp`.
class WhatsAppScreen extends ConsumerStatefulWidget {
  const WhatsAppScreen({super.key});

  @override
  ConsumerState<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends ConsumerState<WhatsAppScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _phoneKey = GlobalKey<FormFieldState<String>>();
  final _codeKey = GlobalKey<FormFieldState<String>>();
  bool _busy = false;

  /// The user chose "Use a different number" / "Send a new code" while a code is pending.
  bool _enterNumber = false;

  /// Shown under the code field (wrong / expired code).
  String? _codeError;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  /// Our own wording for the errors this screen explains; anything else uses the server message.
  String _message(Object error) {
    final l10n = context.l10n;
    final e = ApiException.from(error);
    return switch (e.code) {
      'invalid_code' => l10n.whatsappErrorInvalidCode(e.attemptsLeft ?? 0),
      'code_expired' => l10n.whatsappErrorCodeExpired,
      'too_many_attempts' => l10n.whatsappErrorTooManyAttempts,
      'whatsapp_no_pending_code' => l10n.whatsappErrorNoPendingCode,
      'whatsapp_unavailable' => l10n.whatsappUnavailable,
      'invalid_contact' => l10n.whatsappPhoneInvalid,
      _ => e.isValidation ? l10n.whatsappPhoneInvalid : e.message,
    };
  }

  Future<void> _run(Future<WhatsAppStatus> Function() action, {String? done, bool codeStep = false}) async {
    setState(() {
      _busy = true;
      _codeError = null;
    });
    try {
      await action();
      ref.invalidate(whatsAppStatusProvider);
      if (!mounted) return;
      setState(() => _enterNumber = false);
      if (done != null) showInfoSnack(context, done);
    } catch (e) {
      if (!mounted) return;
      final code = ApiException.from(e).code;
      if (codeStep && code != 'whatsapp_unavailable') {
        setState(() => _codeError = _message(e));
        if (code == 'whatsapp_no_pending_code') ref.invalidate(whatsAppStatusProvider);
      } else {
        showInfoSnack(context, _message(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() async {
    if (!(_phoneKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    _code.clear();
    await _run(() => ref.read(whatsAppRepositoryProvider).verify(_phone.text), done: context.l10n.whatsappCodeSent);
  }

  Future<void> _confirm() async {
    if (!(_codeKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    await _run(
      () => ref.read(whatsAppRepositoryProvider).confirm(_code.text),
      done: context.l10n.whatsappTurnedOn,
      codeStep: true,
    );
  }

  Future<void> _turnOff() async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.whatsappTurnOffConfirmTitle),
        content: Text(ctx.l10n.whatsappTurnOffConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.commonCancel)),
          FilledButton(
            key: const ValueKey('whatsapp-turn-off-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(ctx.l10n.whatsappTurnOff),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(() => ref.read(whatsAppRepositoryProvider).optOut(), done: l10n.whatsappTurnedOff);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(whatsAppStatusProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.whatsappTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(whatsAppStatusProvider.future),
        child: AsyncValueView<WhatsAppStatus>(
          value: value,
          onRetry: () => ref.invalidate(whatsAppStatusProvider),
          data: (s) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: AppSpacing.pageAll,
            children: [
              _Intro(status: s),
              const SizedBox(height: 16),
              if (!s.available)
                AppCard(
                  key: const ValueKey('whatsapp-unavailable'),
                  color: AppColors.warningSoft,
                  borderColor: AppColors.warning.withValues(alpha: 0.5),
                  child: Row(
                    children: [
                      const Icon(Icons.schedule_rounded, color: AppColors.warning),
                      const SizedBox(width: 12),
                      Expanded(child: Text(l10n.whatsappUnavailable, style: context.text.bodyMedium)),
                    ],
                  ),
                ),
              if (s.isActive) ..._active(s) else if (s.isPending && !_enterNumber) ..._pending(s) else ..._number(s),
              const SizedBox(height: 20),
              _Notes(),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _active(WhatsAppStatus s) {
    final l10n = context.l10n;
    return [
      AppCard(
        key: const ValueKey('whatsapp-active'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: AppColors.primary),
                const SizedBox(width: 10),
                Expanded(child: Text(l10n.whatsappActiveTitle, style: context.text.titleSmall)),
              ],
            ),
            const SizedBox(height: 8),
            if (s.phoneMasked != null) Text(l10n.whatsappActiveNumber(s.phoneMasked!), style: context.text.bodyMedium),
            if (s.verifiedAt != null)
              Text(
                l10n.whatsappVerifiedOn(Dates.day(s.verifiedAt)),
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      SecondaryButton(
        key: const ValueKey('whatsapp-turn-off'),
        label: l10n.whatsappTurnOff,
        icon: Icons.notifications_off_outlined,
        foregroundColor: AppColors.danger,
        borderColor: AppColors.danger,
        onPressed: _busy ? null : _turnOff,
      ),
    ];
  }

  List<Widget> _pending(WhatsAppStatus s) {
    final l10n = context.l10n;
    return [
      Text(
        l10n.whatsappCodeSentTo(s.phoneMasked ?? ''),
        key: const ValueKey('whatsapp-code-sent'),
        style: context.text.bodyMedium,
      ),
      if (s.codeExpiresAt != null)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            l10n.whatsappCodeExpiresAt(Dates.time(s.codeExpiresAt)),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ),
      const SizedBox(height: 12),
      TextFormField(
        key: _codeKey,
        controller: _code,
        enabled: s.available && !_busy,
        keyboardType: TextInputType.number,
        autofillHints: const [AutofillHints.oneTimeCode],
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
        textInputAction: TextInputAction.done,
        onFieldSubmitted: (_) => _confirm(),
        decoration: InputDecoration(labelText: l10n.whatsappCodeLabel, errorText: _codeError, errorMaxLines: 3),
        validator: (v) => isWhatsAppCode(v ?? '') ? null : l10n.whatsappCodeInvalid,
      ),
      const SizedBox(height: 16),
      PrimaryButton(
        key: const ValueKey('whatsapp-confirm'),
        label: l10n.whatsappConfirmCode,
        icon: Icons.verified_outlined,
        loading: _busy,
        onPressed: s.available ? _confirm : null,
      ),
      const SizedBox(height: 4),
      Wrap(
        alignment: WrapAlignment.center,
        children: [
          TextButton(
            key: const ValueKey('whatsapp-resend'),
            onPressed: _busy || !s.available ? null : () => setState(() => _enterNumber = true),
            child: Text(l10n.whatsappResendCode),
          ),
          TextButton(
            onPressed: _busy || !s.available
                ? null
                : () => setState(() {
                    _phone.clear();
                    _enterNumber = true;
                  }),
            child: Text(l10n.whatsappChangeNumber),
          ),
        ],
      ),
    ];
  }

  List<Widget> _number(WhatsAppStatus s) {
    final l10n = context.l10n;
    return [
      if (s.status == WhatsAppOptInStatus.optedOut && s.optedOutAt != null && !_enterNumber)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(l10n.whatsappOptedOutNote(Dates.day(s.optedOutAt)), style: context.text.bodyMedium),
        ),
      TextFormField(
        key: _phoneKey,
        controller: _phone,
        enabled: s.available && !_busy,
        keyboardType: TextInputType.phone,
        autofillHints: const [AutofillHints.telephoneNumber],
        textInputAction: TextInputAction.send,
        onFieldSubmitted: (_) => _sendCode(),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ()\-.]')),
          LengthLimitingTextInputFormatter(32),
        ],
        decoration: InputDecoration(
          labelText: l10n.whatsappPhoneLabel,
          hintText: l10n.whatsappPhoneHint,
          helperText: l10n.whatsappPhoneHelper,
          helperMaxLines: 2,
          errorMaxLines: 3,
          prefixIcon: const Icon(Icons.phone_iphone_rounded),
        ),
        validator: (v) => isPlausibleE164(v ?? '') ? null : l10n.whatsappPhoneInvalid,
      ),
      const SizedBox(height: 16),
      PrimaryButton(
        key: const ValueKey('whatsapp-send-code'),
        label: l10n.whatsappSendCode,
        icon: Icons.send_rounded,
        loading: _busy,
        onPressed: s.available ? _sendCode : null,
      ),
      if (s.isPending)
        TextButton(onPressed: _busy ? null : () => setState(() => _enterNumber = false), child: Text(l10n.commonBack)),
    ];
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.status});

  final WhatsAppStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (label, color) = switch (status.status) {
      WhatsAppOptInStatus.active => (l10n.whatsappStatusOn, AppColors.primary),
      WhatsAppOptInStatus.pending => (l10n.whatsappStatusPending, AppColors.warning),
      _ => (l10n.whatsappStatusOff, context.palette.textSecondary),
    };
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.chat_rounded, color: AppColors.primary),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(l10n.whatsappIntro, style: context.text.bodyMedium)),
        const SizedBox(width: 8),
        StatusBadge(key: const ValueKey('whatsapp-status'), label: label, color: color, dense: true),
      ],
    );
  }
}

class _Notes extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final style = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    Widget row(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: context.palette.textSecondary),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: style)),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        row(Icons.lock_outline_rounded, l10n.whatsappPrivacyNote),
        row(Icons.block_rounded, l10n.whatsappStopNote),
      ],
    );
  }
}
