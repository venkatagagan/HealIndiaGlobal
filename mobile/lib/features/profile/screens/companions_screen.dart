import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
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
      builder: (context) => AlertDialog(
        title: const Text('Remove companion?'),
        content: Text('${c.fullName} will be removed from your travel companions.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(patientRepositoryProvider).deleteCompanion(c.id);
      ref.invalidate(companionsProvider);
      if (context.mounted) showInfoSnack(context, 'Companion removed');
    } on Object catch (e) {
      if (context.mounted) showErrorSnack(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(companionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Travel companions')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final saved = await showCompanionForm(context);
          if (saved != null && context.mounted) showInfoSnack(context, '${saved.fullName} added');
        },
        icon: const Icon(Icons.person_add_alt_1_rounded),
        label: const Text('Add companion'),
      ),
      body: AsyncValueView<List<PatientCompanion>>(
        value: value,
        onRetry: () => ref.invalidate(companionsProvider),
        data: (items) => items.isEmpty
            ? const EmptyView(
                icon: Icons.group_outlined,
                title: 'No companions yet',
                message: 'Add the family member or friend travelling with you so we can arrange their attendant visa.',
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
                      c.relationship,
                      if (c.nationality != null) '${countryFlag(c.nationality)} ${countryName(c.nationality)}',
                      if (c.dateOfBirth != null) 'Born ${Dates.day(c.dateOfBirth)}',
                      if (c.passportLast4 != null) 'Passport •••• ${c.passportLast4}',
                    ].whereType<String>().join(' · ');
                    return AppCard(
                      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
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
                            tooltip: 'Edit ${c.fullName}',
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () => showCompanionForm(context, existing: c),
                          ),
                          IconButton(
                            tooltip: 'Remove ${c.fullName}',
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
