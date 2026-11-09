import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/realtime_service.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/case_widgets.dart';

/// My cases list (quotes, booking status) with status filter.
///
/// Route: `/cases` · Owner: fl-journey.
class CasesScreen extends ConsumerStatefulWidget {
  const CasesScreen({super.key});

  @override
  ConsumerState<CasesScreen> createState() => _CasesScreenState();
}

class _CasesScreenState extends ConsumerState<CasesScreen> {
  static const _filters = <CaseStatus?>[
    null,
    CaseStatus.enquiry,
    CaseStatus.quoted,
    CaseStatus.accepted,
    CaseStatus.booked,
    CaseStatus.inTreatment,
    CaseStatus.completed,
    CaseStatus.cancelled,
  ];

  CaseStatus? _status;

  @override
  Widget build(BuildContext context) {
    ref.listen(realtimeEventsProvider, (_, next) {
      final type = next.value?.type;
      if (type == RealtimeEvents.caseUpdated || type == RealtimeEvents.bookingUpdated) {
        ref.invalidate(casesProvider);
      }
    });
    final cases = ref.watch(casesProvider(_status));
    return Scaffold(
      appBar: AppBar(title: const Text('My cases'), centerTitle: true),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _filters.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final s = _filters[i];
                return ChipToggle(
                  label: s?.label ?? 'All',
                  selected: _status == s,
                  selectedColor: AppColors.violet,
                  onChanged: (_) => setState(() => _status = s),
                );
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(casesProvider(_status).future),
              child: AsyncValueView<Paged<MedicalCase>>(
                value: cases,
                onRetry: () => ref.invalidate(casesProvider(_status)),
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 40),
                        EmptyView(
                          icon: Icons.folder_open_rounded,
                          title: _status == null ? 'No cases yet' : 'No ${_status!.label.toLowerCase()} cases',
                          message: 'Request a quote from a matched hospital to start a case.',
                          actionLabel: 'Find my treatment',
                          onAction: () => context.push(Routes.screeningStart()),
                        ),
                      ],
                    );
                  }
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [
                      for (final c in page.items)
                        CaseCard(medicalCase: c, onTap: () => context.push(Routes.caseDetail(c.id))),
                      if (page.total > page.items.length)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            'Showing ${page.items.length} of ${page.total}. Use the filters to narrow the list.',
                            textAlign: TextAlign.center,
                            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
