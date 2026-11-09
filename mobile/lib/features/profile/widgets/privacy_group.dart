import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/repositories/privacy_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../trips/services/file_actions.dart';
import 'profile_widgets.dart';

/// Saves the export ZIP through the platform "save as" flow. Overridden in widget tests.
typedef DataExportSaver = Future<bool> Function(String fileName, Uint8List bytes);

final dataExportSaverProvider = Provider<DataExportSaver>(
  (ref) =>
      (fileName, bytes) => saveBytes(fileName: fileName, bytes: bytes, mimeType: 'application/zip'),
);

/// Profile > Privacy: "Download my data" (DPDP / GDPR access and portability) and "Who viewed my records".
class PrivacyGroup extends ConsumerStatefulWidget {
  const PrivacyGroup({super.key, this.showAccessLog = true});

  final bool showAccessLog;

  @override
  ConsumerState<PrivacyGroup> createState() => _PrivacyGroupState();
}

class _PrivacyGroupState extends ConsumerState<PrivacyGroup> {
  bool _busy = false;

  Future<void> _download() async {
    setState(() => _busy = true);
    try {
      final bytes = await ref.read(privacyRepositoryProvider).exportMyData();
      final stamp = Dates.api(DateTime.now()).replaceAll('-', '');
      final saved = await ref.read(dataExportSaverProvider)('healindia-my-data-$stamp.zip', bytes);
      if (saved && mounted) showInfoSnack(context, 'Your data has been saved');
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SettingsGroup(
      title: 'Privacy',
      children: [
        SettingsTile(
          key: const Key('profile-download-data'),
          icon: Icons.download_rounded,
          title: 'Download my data',
          subtitle: 'A ZIP file with everything we hold about you and your documents',
          color: AppColors.info,
          trailing: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : null,
          onTap: _busy ? null : _download,
        ),
        if (widget.showAccessLog)
          SettingsTile(
            key: const Key('profile-access-log'),
            icon: Icons.visibility_outlined,
            title: 'Who viewed my records',
            subtitle: 'Hospitals, agents and staff who opened your health records',
            color: AppColors.violet,
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AccessLogScreen())),
          ),
      ],
    );
  }
}

/// List of reads of the patient's health records by other people.
class AccessLogScreen extends ConsumerWidget {
  const AccessLogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final log = ref.watch(accessLogProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Who viewed my records')),
      body: log.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('We could not load the list.'),
                const SizedBox(height: 12),
                TextButton(onPressed: () => ref.invalidate(accessLogProvider), child: const Text('Try again')),
              ],
            ),
          ),
        ),
        data: (entries) => entries.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Nobody else has viewed your records yet.', textAlign: TextAlign.center),
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
                    title: Text(e.summary),
                    subtitle: Text(
                      [Dates.dayTime(e.at?.toLocal()), if ((e.reason ?? '').isNotEmpty) 'Reason: ${e.reason}']
                          .where((s) => s.isNotEmpty)
                          .join('\n'),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
