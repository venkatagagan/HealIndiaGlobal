import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../data/countries.dart';
import '../widgets/companion_form_sheet.dart';

/// Travel companions (medical attendants): list, add, edit, delete.
///
/// Route: `/profile/companions` · Owner: fl-onboarding.
class CompanionsScreen extends ConsumerWidget {
  const CompanionsScreen({super.key});

  Future<void> _delete(BuildContext context, WidgetRef ref, PatientCompanion c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) {
        final l10n = context.l10n;
        return AlertDialog(
          title: Text(l10n.companionsRemoveTitle),
          content: Text(l10n.companionsRemoveBody(c.fullName)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.commonCancel)),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              onPressed: () => Navigator.pop(context, true),
              child: Text(l10n.commonRemove),
            ),
          ],
        );
      },
    );
    if (ok != true) return;
    try {
      await ref.read(patientRepositoryProvider).deleteCompanion(c.id);
      ref.invalidate(companionsProvider);
      if (context.mounted) showInfoSnack(context, context.l10n.companionsRemovedSnack);
    } on Object catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(companionsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.companionsTitle)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final saved = await showCompanionForm(context);
          if (saved == null || !context.mounted) return;
          showInfoSnack(context, context.l10n.companionsAddedSnack(saved.fullName));
        },
        icon: const Icon(Icons.person_add_alt_1_rounded),
        label: Text(l10n.companionAdd),
      ),
      body: AsyncValueView<List<PatientCompanion>>(
        value: value,
        onRetry: () => ref.invalidate(companionsProvider),
        data: (items) => items.isEmpty
            ? EmptyView(
                icon: Icons.group_outlined,
                title: l10n.companionsEmptyTitle,
                message: l10n.companionsEmptyMessage,
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(companionsProvider.future),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final c = items[i];
                    final details = [
                      if (c.relationship != null) companionRelationshipLabel(l10n, c.relationship!),
                      if (c.nationality != null) '${countryFlag(c.nationality)} ${countryName(c.nationality, l10n)}',
                      if (c.dateOfBirth != null) l10n.companionsBorn(Dates.day(c.dateOfBirth)),
                      if (c.passportLast4 != null) l10n.companionsPassportLast4(c.passportLast4!),
                    ].join(' · ');
                    return AppCard(
                      padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 4, 8),
                      child: Row(
                        children: [
                          Avatar(name: c.fullName, size: 44),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(c.fullName, style: context.text.titleSmall),
                                if (details.isNotEmpty) Text(details, style: context.text.bodySmall),
                              ],
                            ),
                          ),
                          IconButton(
                            tooltip: l10n.companionsEditTooltip(c.fullName),
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () => showCompanionForm(context, existing: c),
                          ),
                          IconButton(
                            tooltip: l10n.companionsRemoveTooltip(c.fullName),
                            icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                            onPressed: () => _delete(context, ref, c),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
