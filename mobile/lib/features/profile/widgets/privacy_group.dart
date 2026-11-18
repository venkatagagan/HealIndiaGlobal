import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/privacy_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';
import '../screens/privacy_screens.dart';
import 'profile_widgets.dart';

/// Saves the export ZIP through the platform "save as" flow. Overridden in widget tests.
typedef DataExportSaver = Future<bool> Function(String fileName, Uint8List bytes);

final dataExportSaverProvider = Provider<DataExportSaver>(
  (ref) =>
      (fileName, bytes) => saveBytes(fileName: fileName, bytes: bytes, mimeType: 'application/zip'),
);

/// Profile > Privacy: "Download my data" (DPDP / GDPR access and portability), "Who viewed my records",
/// data-rights requests, the nominee, the hospital / agent sharing switches (`share_with_hospitals`,
/// `share_with_agent` consents), the Grievance Officer / DPO contacts and, for patients under 18, the
/// guardian consent status (pending verification / verified / needed).
///
/// [showAccessLog] is true for full accounts: requests, nominee and sharing need one; guests only get the
/// download and the contacts.
class PrivacyGroup extends ConsumerStatefulWidget {
  const PrivacyGroup({super.key, this.showAccessLog = true});

  final bool showAccessLog;

  @override
  ConsumerState<PrivacyGroup> createState() => _PrivacyGroupState();
}

class _PrivacyGroupState extends ConsumerState<PrivacyGroup> {
  bool _busy = false;
  ConsentKind? _savingConsent;

  void _push(Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  /// Records an account-wide `share_with_hospitals` / `share_with_agent` decision; withdrawing asks first.
  Future<void> _setSharing(ConsentKind kind, bool granted) async {
    final l10n = context.l10n;
    if (!granted) {
      final hospitals = kind == ConsentKind.shareWithHospitals;
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(hospitals ? l10n.privacyShareHospitalsWithdrawTitle : l10n.privacyShareAgentWithdrawTitle),
          content: Text(hospitals ? l10n.privacyShareHospitalsWithdrawBody : l10n.privacyShareAgentWithdrawBody),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(l10n.commonCancel)),
            FilledButton(
              key: const Key('privacy-share-withdraw-confirm'),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l10n.privacyShareWithdraw),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() => _savingConsent = kind);
    try {
      await ref.read(authRepositoryProvider).recordConsent(kind: kind, granted: granted);
      ref.invalidate(sharingConsentsProvider);
      await ref.read(sharingConsentsProvider.future);
      if (mounted) showInfoSnack(context, l10n.privacyShareUpdated);
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _savingConsent = null);
    }
  }

  Widget _sharingTile(ConsentKind kind, bool? on) {
    final l10n = context.l10n;
    final hospitals = kind == ConsentKind.shareWithHospitals;
    final saving = _savingConsent == kind;
    return SettingsTile(
      key: Key(hospitals ? 'profile-share-hospitals' : 'profile-share-agent'),
      icon: hospitals ? Icons.local_hospital_outlined : Icons.support_agent_outlined,
      title: hospitals ? l10n.privacyShareHospitalsTitle : l10n.privacyShareAgentTitle,
      subtitle: on == null
          ? null
          : hospitals
          ? (on ? l10n.privacyShareHospitalsOn : l10n.privacyShareHospitalsOff)
          : (on ? l10n.privacyShareAgentOn : l10n.privacyShareAgentOff),
      color: hospitals ? AppColors.primary : AppColors.cyan,
      trailing: saving || on == null
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : Switch(
              key: Key(hospitals ? 'privacy-switch-hospitals' : 'privacy-switch-agent'),
              value: on,
              onChanged: _savingConsent != null ? null : (v) => _setSharing(kind, v),
            ),
    );
  }

  Future<void> _download() async {
    setState(() => _busy = true);
    try {
      final bytes = await ref.read(privacyRepositoryProvider).exportMyData();
      final stamp = Dates.api(DateTime.now()).replaceAll('-', '');
      final saved = await ref.read(dataExportSaverProvider)('healindia-my-data-$stamp.zip', bytes);
      if (saved && mounted) showInfoSnack(context, context.l10n.privacyDownloadSaved);
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final guardian = ref.watch(guardianStatusProvider).value;
    return SettingsGroup(
      title: l10n.privacyGroupTitle,
      children: [
        if (guardian != null && guardian.relevant) _guardianTile(context, guardian),
        SettingsTile(
          key: const Key('profile-download-data'),
          icon: Icons.download_rounded,
          title: l10n.privacyDownloadTitle,
          subtitle: l10n.privacyDownloadSubtitle,
          color: AppColors.info,
          trailing: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : null,
          onTap: _busy ? null : _download,
        ),
        if (widget.showAccessLog) ..._fullAccountTiles(),
        SettingsTile(
          key: const Key('profile-privacy-contact'),
          icon: Icons.contact_mail_outlined,
          title: l10n.privacyContactTitle,
          subtitle: l10n.privacyContactSubtitle,
          color: context.palette.textSecondary,
          onTap: () => _push(const PrivacyContactScreen()),
        ),
        if (widget.showAccessLog)
          SettingsTile(
            key: const Key('profile-access-log'),
            icon: Icons.visibility_outlined,
            title: l10n.privacyAccessLogTitle,
            subtitle: l10n.privacyAccessLogSubtitle,
            color: AppColors.violet,
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AccessLogScreen())),
          ),
      ],
    );
  }

  List<Widget> _fullAccountTiles() {
    final l10n = context.l10n;
    final nominee = ref.watch(nomineeProvider).value;
    final sharing = ref.watch(sharingConsentsProvider);
    return [
      SettingsTile(
        key: const Key('profile-privacy-requests'),
        icon: Icons.policy_outlined,
        title: l10n.privacyRequestsTitle,
        subtitle: l10n.privacyRequestsSubtitle,
        color: AppColors.warning,
        onTap: () => _push(const DataRightsRequestsScreen()),
      ),
      SettingsTile(
        key: const Key('profile-nominee'),
        icon: Icons.how_to_reg_outlined,
        title: l10n.privacyNomineeTitle,
        subtitle: nominee == null
            ? l10n.privacyNomineeSubtitleNone
            : l10n.privacyNomineeSubtitleSet(nominee.fullName, nominee.relationship),
        color: AppColors.violet,
        onTap: () => _push(const NomineeScreen()),
      ),
      if (!sharing.hasError) ...[
        _sharingTile(ConsentKind.shareWithHospitals, sharing.value?.hospitals),
        _sharingTile(ConsentKind.shareWithAgent, sharing.value?.agent),
      ],
    ];
  }

  Widget _guardianTile(BuildContext context, GuardianStatus g) {
    final l10n = context.l10n;
    final verified = g.consent?.verifiedAt != null && g.satisfied;
    final pending = !verified && g.pending != null;
    final (subtitle, color) = verified
        ? (l10n.guardianStatusVerified(g.consent!.guardianName), AppColors.primary)
        : pending
        ? (l10n.guardianStatusPending(g.pending!.guardianName), AppColors.warning)
        : (l10n.guardianStatusNeeded, AppColors.danger);
    return SettingsTile(
      key: const Key('profile-guardian-consent'),
      icon: Icons.family_restroom_rounded,
      title: l10n.guardianStatusTitle,
      subtitle: subtitle,
      color: color,
      onTap: verified || pending ? null : () => showGuardianConsentSheet(context),
    );
  }
}

/// List of reads of the patient's health records by other people.
class AccessLogScreen extends ConsumerWidget {
  const AccessLogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final log = ref.watch(accessLogProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.privacyAccessLogTitle)),
      body: log.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(l10n.privacyAccessLogError),
                const SizedBox(height: 12),
                TextButton(onPressed: () => ref.invalidate(accessLogProvider), child: Text(l10n.commonTryAgain)),
              ],
            ),
          ),
        ),
        data: (entries) => entries.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(l10n.privacyAccessLogEmpty, textAlign: TextAlign.center),
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: entries.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, i) {
                  final e = entries[i];
                  return ListTile(
                    leading: const Icon(Icons.visibility_outlined),
                    title: Text(e.summaryIn(l10n)),
                    subtitle: Text(
                      [
                        Dates.dayTime(e.at?.toLocal()),
                        if ((e.reason ?? '').isNotEmpty) l10n.privacyAccessLogReason(e.reason!),
                      ].where((s) => s.isNotEmpty).join('\n'),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
