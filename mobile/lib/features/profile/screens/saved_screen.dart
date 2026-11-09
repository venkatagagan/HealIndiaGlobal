import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../search/widgets/catalog_cards.dart';
import '../../search/widgets/procedure_sheet.dart';
import '../../search/widgets/save_button.dart';

/// Saved hospitals, doctors and procedures (`GET /patient/saved`).
///
/// Route: `/profile/saved` · Owner: fl-onboarding.
class SavedScreen extends ConsumerStatefulWidget {
  const SavedScreen({super.key});

  @override
  ConsumerState<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends ConsumerState<SavedScreen> {
  SavedEntityType? _filter;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(savedItemsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.savedTitle)),
      body: AsyncValueView<List<SavedItem>>(
        value: value,
        onRetry: () => ref.invalidate(savedItemsProvider),
        data: (all) {
          if (all.isEmpty) {
            return EmptyView(
              icon: Icons.bookmark_border_rounded,
              title: l10n.savedEmptyTitle,
              message: l10n.savedEmptyMessage,
              actionLabel: l10n.savedExploreHospitals,
              onAction: () => context.go(Routes.search),
            );
          }
          final items = _filter == null ? all : all.where((i) => i.entityType == _filter).toList();
          return Column(
            children: [
              SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  children: [
                    ChipToggle(
                      label: l10n.savedFilterAll(all.length),
                      selected: _filter == null,
                      onChanged: (_) => setState(() => _filter = null),
                    ),
                    for (final t in SavedEntityType.values) ...[
                      const SizedBox(width: 8),
                      ChipToggle(
                        label: l10n.savedFilterType(t.json, all.where((i) => i.entityType == t).length),
                        selected: _filter == t,
                        onChanged: (_) => setState(() => _filter = _filter == t ? null : t),
                      ),
                    ],
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () => ref.refresh(savedItemsProvider.future),
                  child: items.isEmpty
                      ? ListView(
                          children: [SizedBox(height: 280, child: EmptyView(title: l10n.savedEmptyCategory))],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          itemCount: items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 10),
                          itemBuilder: (context, i) => _SavedTile(item: items[i]),
                        ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SavedTile extends StatelessWidget {
  const _SavedTile({required this.item});

  final SavedItem item;

  @override
  Widget build(BuildContext context) {
    final h = item.hospital;
    final d = item.doctor;
    final p = item.procedure;
    if (h != null) return HospitalListTile(hospital: h, onTap: () => context.push(Routes.hospital(h.id)));
    if (d != null) return DoctorListTile(doctor: d, onTap: () => context.push(Routes.doctor(d.id)));
    if (p != null) return ProcedureListTile(procedure: p, onTap: () => showProcedureSheet(context, p));
    // The saved entity is no longer listed (e.g. hospital suspended): allow removing it.
    return AppCard(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 4, 8),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, color: context.palette.textSecondary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(context.l10n.savedNoLongerAvailable(item.entityType.json), style: context.text.bodyMedium),
          ),
          SaveButton(entityType: item.entityType, entityId: item.entityId),
        ],
      ),
    );
  }
}
