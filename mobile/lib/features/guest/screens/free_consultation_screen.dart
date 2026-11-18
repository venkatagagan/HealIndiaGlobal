import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/repositories/guest_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../aftercare/screens/aftercare_screen.dart' show meetingLauncherProvider;

enum _Step { name, contact, code, details }

/// Book the one free 15-minute video consultation with a medical coordinator (before registering):
/// name → email or phone → 6-digit code → preferred time, question and attachments →
/// `POST /guest/consultation` (with `X-Device-Id`) → status screen.
///
/// Route: `/free-consultation`.
class FreeConsultationScreen extends ConsumerStatefulWidget {
  const FreeConsultationScreen({super.key});

  @override
  ConsumerState<FreeConsultationScreen> createState() => _FreeConsultationScreenState();
}

class _FreeConsultationScreenState extends ConsumerState<FreeConsultationScreen> {
  _Step _step = _Step.name;
  final _name = TextEditingController();
  final _contact = TextEditingController();
  final _code = TextEditingController();
  final _question = TextEditingController();
  String _channel = 'email';
  GuestVerification? _verification;
  late DateTime _day;
  TimeOfDay _from = const TimeOfDay(hour: 10, minute: 0);
  TimeOfDay _to = const TimeOfDay(hour: 13, minute: 0);
  bool _attachScreening = true;
  final Set<String> _documentIds = {};
  bool _busy = false;
  String? _error;
  bool _alreadyUsed = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _day = DateTime(now.year, now.month, now.day + 1);
  }

  @override
  void dispose() {
    _name.dispose();
    _contact.dispose();
    _code.dispose();
    _question.dispose();
    super.dispose();
  }

  /// Device time zone, e.g. `WAT (UTC+01:00)`.
  static String timezoneLabel(DateTime now) {
    final o = now.timeZoneOffset;
    final sign = o.isNegative ? '-' : '+';
    final h = o.inHours.abs().toString().padLeft(2, '0');
    final m = (o.inMinutes.abs() % 60).toString().padLeft(2, '0');
    return '${now.timeZoneName} (UTC$sign$h:$m)';
  }

  /// The latest finished AI screening (attached so the coordinator can prepare).
  String? _screeningId() {
    final recent = ref.read(patientDashboardProvider).value?.recentScreenings ?? const <ScreeningSummary>[];
    return recent.where((s) => s.status == ScreeningStatus.completed).firstOrNull?.id;
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _message(ApiException e) {
    final l10n = context.l10n;
    switch (e.code) {
      case 'sms_unavailable':
        _channel = 'email';
        _contact.clear();
        return l10n.guestSmsUnavailable;
      case 'invalid_code':
        final left = e.attemptsLeft;
        return left == null ? l10n.guestCodeInvalid : l10n.guestCodeInvalidLeft(left);
      case 'code_expired':
        return l10n.guestCodeExpired;
      case 'too_many_attempts':
        return l10n.guestCodeTooMany;
      case 'contact_not_verified' || 'verification_expired':
        _step = _Step.contact;
        _verification = null;
        return l10n.guestVerifyAgain;
      case 'free_consultation_used':
        _alreadyUsed = true;
        return l10n.guestAlreadyUsed;
      case 'invalid_contact':
        return _channel == 'email' ? l10n.guestEmailInvalid : l10n.guestPhoneInvalid;
    }
    return e.message;
  }

  Future<void> _sendCode() => _run(() async {
    final v = await ref
        .read(guestRepositoryProvider)
        .startVerification(channel: _channel, contact: _contact.text.trim());
    if (!mounted) return;
    setState(() {
      _verification = v;
      _code.clear();
      _step = _Step.code;
    });
  });

  Future<void> _confirm() => _run(() async {
    final v = await ref
        .read(guestRepositoryProvider)
        .confirmVerification(verificationId: _verification!.id, code: _code.text.trim());
    if (!mounted) return;
    setState(() {
      _verification = GuestVerification(
        id: v.id.isEmpty ? _verification!.id : v.id,
        channel: v.channel,
        contactMasked: v.contactMasked.isEmpty ? _verification!.contactMasked : v.contactMasked,
        verified: true,
        validUntil: v.validUntil,
      );
      _step = _Step.details;
    });
  });

  Future<void> _submit() => _run(() async {
    final from = DateTime(_day.year, _day.month, _day.day, _from.hour, _from.minute);
    var to = DateTime(_day.year, _day.month, _day.day, _to.hour, _to.minute);
    if (!to.isAfter(from)) to = from.add(const Duration(hours: 1));
    final screeningId = _screeningId();
    await ref.read(guestRepositoryProvider).requestConsultation(
      verificationId: _verification!.id,
      fullName: _name.text.trim(),
      preferredFrom: from,
      preferredTo: to,
      timezone: timezoneLabel(DateTime.now()),
      question: _question.text.trim(),
      screeningId: _attachScreening ? screeningId : null,
      documentIds: _documentIds.toList(),
    );
    ref.invalidate(introConsultationProvider);
    if (mounted) context.pushReplacement(Routes.freeConsultationStatus);
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final existing = ref.watch(introConsultationProvider);
    if (existing.value != null) {
      // One free call per person: show its status instead of the form.
      return const FreeConsultationStatusScreen();
    }
    final stepIndex = _Step.values.indexOf(_step);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.guestFreeTitle),
        leading: stepIndex == 0
            ? null
            : IconButton(
                tooltip: l10n.commonBack,
                icon: const BackButtonIcon(),
                onPressed: () => setState(() {
                  _error = null;
                  _step = _Step.values[stepIndex - 1];
                }),
              ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          StepProgressBar(step: stepIndex + 1, total: _Step.values.length),
          const SizedBox(height: 16),
          if (_alreadyUsed) _usedCard(context) else ...switch (_step) {
            _Step.name => _nameStep(context),
            _Step.contact => _contactStep(context),
            _Step.code => _codeStep(context),
            _Step.details => _detailsStep(context),
          },
          if (_error != null && !_alreadyUsed)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                _error!,
                key: const ValueKey('guest-error'),
                style: context.text.bodyMedium?.copyWith(color: AppColors.danger),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _nameStep(BuildContext context) {
    final l10n = context.l10n;
    return [
      Text(l10n.guestFreeIntro, style: context.text.bodyMedium),
      const SizedBox(height: 16),
      TextField(
        key: const ValueKey('guest-name'),
        controller: _name,
        textCapitalization: TextCapitalization.words,
        autofillHints: const [AutofillHints.name],
        decoration: InputDecoration(labelText: l10n.guestNameLabel),
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 16),
      PrimaryButton(
        key: const ValueKey('guest-next-name'),
        label: l10n.commonContinue,
        onPressed: _name.text.trim().isEmpty ? null : () => setState(() => _step = _Step.contact),
      ),
    ];
  }

  List<Widget> _contactStep(BuildContext context) {
    final l10n = context.l10n;
    final email = _channel == 'email';
    return [
      Text(l10n.guestContactIntro, style: context.text.bodyMedium),
      const SizedBox(height: 12),
      SegmentedButton<String>(
        segments: [
          ButtonSegment(value: 'email', label: Text(l10n.guestChannelEmail), icon: const Icon(Icons.mail_outline)),
          ButtonSegment(value: 'phone', label: Text(l10n.guestChannelPhone), icon: const Icon(Icons.sms_outlined)),
        ],
        selected: {_channel},
        onSelectionChanged: (s) => setState(() {
          _channel = s.first;
          _contact.clear();
          _error = null;
        }),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const ValueKey('guest-contact'),
        controller: _contact,
        keyboardType: email ? TextInputType.emailAddress : TextInputType.phone,
        autofillHints: [if (email) AutofillHints.email else AutofillHints.telephoneNumber],
        decoration: InputDecoration(
          labelText: email ? l10n.guestEmailLabel : l10n.guestPhoneLabel,
          hintText: email ? 'name@example.com' : '+234 803 123 4567',
        ),
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 16),
      PrimaryButton(
        key: const ValueKey('guest-send-code'),
        label: l10n.guestSendCode,
        loading: _busy,
        onPressed: _contact.text.trim().length < 3 ? null : _sendCode,
      ),
    ];
  }

  List<Widget> _codeStep(BuildContext context) {
    final l10n = context.l10n;
    return [
      Text(l10n.guestCodeIntro(_verification?.contactMasked ?? ''), style: context.text.bodyMedium),
      const SizedBox(height: 12),
      TextField(
        key: const ValueKey('guest-code'),
        controller: _code,
        keyboardType: TextInputType.number,
        autofillHints: const [AutofillHints.oneTimeCode],
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
        textAlign: TextAlign.center,
        style: context.text.headlineSmall?.copyWith(letterSpacing: 8),
        decoration: InputDecoration(labelText: l10n.guestCodeLabel),
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 16),
      PrimaryButton(
        key: const ValueKey('guest-verify'),
        label: l10n.guestVerify,
        loading: _busy,
        onPressed: _code.text.trim().length == 6 ? _confirm : null,
      ),
      TextButton(
        key: const ValueKey('guest-resend'),
        onPressed: _busy ? null : _sendCode,
        child: Text(l10n.guestResendCode),
      ),
    ];
  }

  List<Widget> _detailsStep(BuildContext context) {
    final l10n = context.l10n;
    final screeningId = _screeningId();
    final docs = ref.watch(documentsProvider((caseId: null, kind: null))).value ?? const <AppDocument>[];
    return [
      Text(l10n.guestDetailsIntro, style: context.text.bodyMedium),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        key: const ValueKey('guest-day'),
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        icon: const Icon(Icons.event_outlined),
        label: Text(l10n.guestPreferredDay(Dates.day(_day))),
        onPressed: () async {
          final now = DateTime.now();
          final d = await showDatePicker(
            context: context,
            initialDate: _day,
            firstDate: now,
            lastDate: now.add(const Duration(days: 60)),
          );
          if (d != null) setState(() => _day = d);
        },
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () async {
                final t = await showTimePicker(context: context, initialTime: _from);
                if (t != null) setState(() => _from = t);
              },
              child: Text(l10n.guestFrom(_from.format(context))),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () async {
                final t = await showTimePicker(context: context, initialTime: _to);
                if (t != null) setState(() => _to = t);
              },
              child: Text(l10n.guestTo(_to.format(context))),
            ),
          ),
        ],
      ),
      const SizedBox(height: 4),
      Text(
        l10n.guestTimezone(timezoneLabel(DateTime.now())),
        style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const ValueKey('guest-question'),
        controller: _question,
        minLines: 3,
        maxLines: 6,
        maxLength: 2000,
        decoration: InputDecoration(
          labelText: l10n.guestQuestionLabel,
          hintText: l10n.guestQuestionHint,
          alignLabelWithHint: true,
        ),
      ),
      if (screeningId != null)
        CheckboxListTile(
          key: const ValueKey('guest-attach-screening'),
          value: _attachScreening,
          onChanged: (v) => setState(() => _attachScreening = v ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.guestAttachScreening),
        ),
      for (final d in docs.take(10))
        CheckboxListTile(
          value: _documentIds.contains(d.id),
          onChanged: (v) => setState(() => v == true ? _documentIds.add(d.id) : _documentIds.remove(d.id)),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      const SizedBox(height: 12),
      PrimaryButton(
        key: const ValueKey('guest-book'),
        label: l10n.guestBookCall,
        icon: Icons.video_call_rounded,
        loading: _busy,
        onPressed: _submit,
      ),
      const SizedBox(height: 8),
      Text(l10n.guestNotEmergency, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
    ];
  }

  Widget _usedCard(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      key: const ValueKey('guest-used'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.info_outline_rounded, size: 36, color: AppColors.warning),
          const SizedBox(height: 8),
          Text(l10n.guestAlreadyUsedTitle, style: context.text.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(l10n.guestAlreadyUsed, style: context.text.bodyMedium, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          PrimaryButton(label: l10n.guestCreateFreeAccount, onPressed: () => openGuestUpgrade(context)),
          const SizedBox(height: 8),
          SecondaryButton(
            label: l10n.guestSeeMyCall,
            onPressed: () => context.pushReplacement(Routes.freeConsultationStatus),
          ),
        ],
      ),
    );
  }
}

/// Status of the free intro call (`GET /guest/consultation`): requested / scheduled time and the Join
/// link, then an invitation to create an account.
///
/// Route: `/free-consultation/status`.
class FreeConsultationStatusScreen extends ConsumerWidget {
  const FreeConsultationStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(introConsultationProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.guestFreeTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(introConsultationProvider.future),
        child: AsyncValueView<IntroConsultation?>(
          value: value,
          onRetry: () => ref.invalidate(introConsultationProvider),
          data: (c) => c == null
              ? ListView(
                  children: [
                    EmptyView(
                      icon: Icons.video_call_outlined,
                      title: l10n.guestNoCallTitle,
                      message: l10n.guestFreeIntro,
                      actionLabel: l10n.guestBookCall,
                      onAction: () => context.pushReplacement(Routes.freeConsultation),
                    ),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  children: [_statusCard(context, ref, c), const SizedBox(height: 16), _accountCard(context)],
                ),
        ),
      ),
    );
  }

  Widget _statusCard(BuildContext context, WidgetRef ref, IntroConsultation c) {
    final l10n = context.l10n;
    final (title, color, icon) = switch (c.status) {
      'scheduled' => (l10n.guestStatusScheduled, AppColors.primary, Icons.event_available_rounded),
      'completed' => (l10n.guestStatusCompleted, AppColors.primary, Icons.task_alt_rounded),
      'cancelled' || 'no_show' => (l10n.guestStatusCancelled, AppColors.danger, Icons.event_busy_rounded),
      _ => (l10n.guestStatusRequested, AppColors.warning, Icons.hourglass_top_rounded),
    };
    final url = Uri.tryParse(c.meetingUrl ?? '');
    return AppCard(
      key: const ValueKey('guest-status'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(width: 10),
              Expanded(child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
            ],
          ),
          const SizedBox(height: 10),
          if (c.scheduledAt != null)
            Text(
              l10n.guestScheduledAt(Dates.dayTime(c.scheduledAt), c.durationMin),
              style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
            )
          else if (c.preferredFrom != null)
            Text(
              l10n.guestPreferredWindow(Dates.dayTime(c.preferredFrom), Dates.time(c.preferredTo)),
              style: context.text.bodyMedium,
            ),
          if (c.coordinatorName != null) Text(l10n.guestCoordinator(c.coordinatorName!), style: context.text.bodySmall),
          if (c.contactMasked != null) Text(l10n.guestWeWillContact(c.contactMasked!), style: context.text.bodySmall),
          if (url != null && url.scheme == 'https' && c.status == 'scheduled') ...[
            const SizedBox(height: 12),
            PrimaryButton(
              key: const ValueKey('guest-join'),
              label: l10n.aftercareJoinCall,
              icon: Icons.video_call_rounded,
              onPressed: () => ref.read(meetingLauncherProvider)(url),
            ),
          ] else if (c.status == 'requested')
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(l10n.guestLinkLater, style: context.text.labelSmall),
            ),
        ],
      ),
    );
  }

  Widget _accountCard(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      color: AppColors.violet.withValues(alpha: 0.10),
      borderColor: AppColors.violet.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.guestAccountTitle, style: context.text.titleSmall),
          const SizedBox(height: 4),
          Text(l10n.guestAccountBody, style: context.text.bodySmall),
          const SizedBox(height: 10),
          PrimaryButton(
            key: const ValueKey('guest-create-account'),
            label: l10n.guestCreateFreeAccount,
            tone: ButtonTone.violet,
            onPressed: () => context.push(Routes.registerFrom(Routes.home)),
          ),
        ],
      ),
    );
  }
}
