import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../agent_routes.dart';
import '../data/agent_repository.dart';
import '../shared/portal_widgets.dart';

// ------------------------------------------------------------------------------------------ list

/// All cases of the agent's patients with a status filter.
class AgentCasesScreen extends ConsumerStatefulWidget {
  const AgentCasesScreen({super.key});

  @override
  ConsumerState<AgentCasesScreen> createState() => _AgentCasesScreenState();
}

class _AgentCasesScreenState extends ConsumerState<AgentCasesScreen> {
  CaseStatus? _status;

  @override
  Widget build(BuildContext context) {
    final cases = ref.watch(agentCasesProvider(_status));
    return Scaffold(
      appBar: AppBar(title: const Text('Cases & quotes')),
      body: Column(
        children: [
          StatusFilterBar<CaseStatus>(
            options: const [
              CaseStatus.enquiry,
              CaseStatus.quoted,
              CaseStatus.accepted,
              CaseStatus.booked,
              CaseStatus.inTreatment,
              CaseStatus.completed,
              CaseStatus.cancelled,
            ],
            selected: _status,
            labelOf: (s) => s.label,
            onSelected: (s) => setState(() => _status = s),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(agentCasesProvider(_status)),
              child: AsyncValueView(
                value: cases,
                onRetry: () => ref.invalidate(agentCasesProvider(_status)),
                data: (page) => page.items.isEmpty
                    ? ListView(
                        children: const [
                          EmptyView(
                            title: 'No cases',
                            message: 'Open a patient and request a quote from a hospital.',
                            icon: Icons.folder_open_outlined,
                          ),
                        ],
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        children: [
                          for (final c in page.items)
                            CaseTile(medicalCase: c, onTap: () => context.push(AgentRoutes.caseDetail(c.id))),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------- detail

/// Case detail for an agent: quotes (accept / reject), booking, timeline and documents.
class AgentCaseDetailScreen extends ConsumerStatefulWidget {
  const AgentCaseDetailScreen({super.key, required this.caseId});

  final String caseId;

  @override
  ConsumerState<AgentCaseDetailScreen> createState() => _AgentCaseDetailScreenState();
}

class _AgentCaseDetailScreenState extends ConsumerState<AgentCaseDetailScreen> {
  bool _busy = false;

  void _invalidate(MedicalCaseDetail c) {
    ref
      ..invalidate(caseDetailProvider(widget.caseId))
      ..invalidate(agentCasesProvider)
      ..invalidate(agentDashboardProvider);
    final pid = c.patient?.id;
    if (pid != null) ref.invalidate(patientCasesProvider(pid));
  }

  Future<void> _run(MedicalCaseDetail c, Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      _invalidate(c);
      if (mounted) showInfoSnack(context, done);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept(MedicalCaseDetail c, Quote q) async {
    final ok = await confirmAction(
      context,
      title: 'Accept this quote?',
      message:
          '${c.hospital.name} · ${money(q.totalMinor, q.currency)}. Other open quotes stay available until booked.',
      confirmLabel: 'Accept',
    );
    if (!ok || !mounted) return;
    await _run(c, () => ref.read(caseRepositoryProvider).acceptQuote(c.id, q.id), 'Quote accepted');
  }

  Future<void> _reject(MedicalCaseDetail c, Quote q) async {
    final reason = await promptText(context, title: 'Reject quote', label: 'Reason (optional)', confirmLabel: 'Reject');
    if (reason == null || !mounted) return;
    await _run(
      c,
      () => ref.read(caseRepositoryProvider).rejectQuote(c.id, q.id, reason: reason.isEmpty ? null : reason),
      'Quote rejected',
    );
  }

  Future<void> _cancel(MedicalCaseDetail c) async {
    final ok = await confirmAction(
      context,
      title: 'Cancel this case?',
      message: 'The hospital will be notified.',
      confirmLabel: 'Cancel case',
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _run(c, () => ref.read(caseRepositoryProvider).cancel(c.id), 'Case cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(caseDetailProvider(widget.caseId));
    return Scaffold(
      appBar: AppBar(
        title: Text(detail.value?.caseNumber ?? 'Case'),
        actions: [
          if (detail.value != null && detail.value!.isOpen && detail.value!.booking == null)
            IconButton(
              tooltip: 'Cancel case',
              icon: const Icon(Icons.cancel_outlined),
              onPressed: _busy ? null : () => _cancel(detail.value!),
            ),
        ],
      ),
      body: AsyncValueView(
        value: detail,
        onRetry: () => ref.invalidate(caseDetailProvider(widget.caseId)),
        data: (c) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(caseDetailProvider(widget.caseId)),
          child: ListView(padding: AppSpacing.pageAll, children: _body(c)),
        ),
      ),
    );
  }

  List<Widget> _body(MedicalCaseDetail c) {
    final accepted = c.quotes.where((q) => q.status == QuoteStatus.accepted).firstOrNull;
    final patientId = c.patient?.id;
    return [
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(c.title, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                ),
                StatusBadge.forEnum(c.status),
              ],
            ),
            const SizedBox(height: 8),
            InfoRow('Patient', c.patient?.fullName),
            InfoRow('Hospital', [c.hospital.name, c.hospital.city].whereType<String>().join(', ')),
            InfoRow('Doctor', c.doctor?.fullName),
            InfoRow('Coordinator', c.coordinator?.fullName),
            InfoRow('Opened', Dates.day(c.createdAt)),
            if ((c.patientNotes ?? '').isNotEmpty) InfoRow('Notes', c.patientNotes),
          ],
        ),
      ),
      if (accepted != null && c.booking == null && c.status == CaseStatus.accepted) ...[
        const SizedBox(height: 12),
        PrimaryButton(
          key: const ValueKey('agent-book-treatment'),
          label: 'Book treatment',
          icon: Icons.event_available_rounded,
          onPressed: () => context.push(AgentRoutes.book(c.id, quoteId: accepted.id)),
        ),
      ],
      if (c.booking != null) ...[
        const SectionTitle('Booking'),
        AppCard(
          onTap: () => context.push(AgentRoutes.booking(c.booking!.id)),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.booking!.bookingNumber,
                      style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Admission ${Dates.day(c.booking!.admissionDate)} · balance '
                      '${money(c.booking!.balanceDueMinor, c.booking!.currency)}',
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  ],
                ),
              ),
              StatusBadge.forEnum(c.booking!.status, dense: true),
            ],
          ),
        ),
      ],
      SectionTitle(
        'Quotes',
        actionLabel: patientId == null ? null : 'Compare hospitals',
        onAction: patientId == null ? null : () => context.push(AgentRoutes.compare(patientId)),
      ),
      if (c.quotes.isEmpty)
        Text(
          'Waiting for ${c.hospital.name} to send an itemised quote.',
          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
        )
      else
        for (final q in c.quotes)
          AppCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Quote · ${Dates.day(q.createdAt)}', style: context.text.labelLarge)),
                    StatusBadge.forEnum(q.status, dense: true),
                  ],
                ),
                const SizedBox(height: 10),
                QuoteBreakdown(quote: q),
                if (q.isActionable) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: SecondaryButton(label: 'Reject', onPressed: _busy ? null : () => _reject(c, q)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: PrimaryButton(
                          key: ValueKey('accept-quote-${q.id}'),
                          label: 'Accept',
                          loading: _busy,
                          onPressed: _busy ? null : () => _accept(c, q),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
      if (c.documents.isNotEmpty) ...[
        const SectionTitle('Documents'),
        for (final d in c.documents)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(d.isPdf ? Icons.picture_as_pdf_outlined : Icons.description_outlined),
            title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${d.kind.label} · ${d.sizeLabel}'),
          ),
      ],
      if (c.timeline.isNotEmpty) ...[
        const SectionTitle('Timeline'),
        for (final t in c.timeline.reversed)
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: Icon(Icons.circle, size: 10, color: AppColors.statusColor(t.toStatus.json)),
            title: Text(t.toStatus.label),
            subtitle: Text(
              [Dates.dayTime(t.createdAt), ?t.changedByName, ?t.note].where((s) => s.isNotEmpty).join(' · '),
            ),
          ),
      ],
    ];
  }
}

// ------------------------------------------------------------------------------- quote comparison

/// One hospital column of the comparison.
class QuoteColumn {
  const QuoteColumn({required this.medicalCase, required this.quote, required this.byCategory});

  final MedicalCase medicalCase;
  final Quote quote;

  /// Sum of line items per category.
  final Map<QuoteLineCategory, int> byCategory;
}

/// Side-by-side comparison of the latest quote of each hospital for one patient.
class QuoteComparison {
  const QuoteComparison({required this.columns, required this.categories});

  /// Builds the comparison from a patient's cases (cases without a quote or that are cancelled /
  /// declined are skipped). Columns are sorted by total, cheapest first.
  factory QuoteComparison.fromCases(List<MedicalCase> cases) {
    final cols = <QuoteColumn>[];
    for (final c in cases) {
      final q = c.latestQuote;
      if (q == null || c.status == CaseStatus.cancelled || c.status == CaseStatus.declined) continue;
      final by = <QuoteLineCategory, int>{};
      for (final li in q.lineItems) {
        by[li.category] = (by[li.category] ?? 0) + li.amountMinor;
      }
      cols.add(QuoteColumn(medicalCase: c, quote: q, byCategory: by));
    }
    cols.sort((a, b) => a.quote.totalMinor.compareTo(b.quote.totalMinor));
    final cats = [
      for (final cat in QuoteLineCategory.values)
        if (cols.any((c) => c.byCategory.containsKey(cat))) cat,
    ];
    return QuoteComparison(columns: cols, categories: cats);
  }

  final List<QuoteColumn> columns;
  final List<QuoteLineCategory> categories;

  /// Totals are comparable only when every quote uses the same currency.
  bool get sameCurrency => columns.map((c) => c.quote.currency).toSet().length <= 1;

  QuoteColumn? get cheapest => columns.isEmpty || !sameCurrency ? null : columns.first;

  /// Difference between the most and least expensive quote (same currency only).
  int get spreadMinor =>
      columns.length < 2 || !sameCurrency ? 0 : columns.last.quote.totalMinor - columns.first.quote.totalMinor;
}

/// Compares the hospitals' quotes for a patient and lets the agent accept the best one.
class QuoteComparisonScreen extends ConsumerWidget {
  const QuoteComparisonScreen({super.key, required this.patientId});

  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cases = ref.watch(patientCasesProvider(patientId));
    return Scaffold(
      appBar: AppBar(title: const Text('Compare quotes')),
      body: AsyncValueView(
        value: cases,
        onRetry: () => ref.invalidate(patientCasesProvider(patientId)),
        data: (list) {
          final cmp = QuoteComparison.fromCases(list);
          if (cmp.columns.isEmpty) {
            return EmptyView(
              title: 'No quotes to compare yet',
              message: 'Request quotes from several hospitals; they appear here as soon as hospitals reply.',
              icon: Icons.compare_arrows_rounded,
              actionLabel: 'Request a quote',
              onAction: () => context.push(AgentRoutes.requestQuote(patientId)),
            );
          }
          final cheapest = cmp.cheapest;
          return ListView(
            padding: AppSpacing.pageAll,
            children: [
              if (cheapest != null)
                AppCard(
                  color: AppColors.primarySoft,
                  borderColor: AppColors.primary,
                  child: Text(
                    'Best price: ${money(cheapest.quote.totalMinor, cheapest.quote.currency)} at '
                    '${cheapest.medicalCase.hospital.name}'
                    '${cmp.spreadMinor > 0 ? ' — saves ${money(cmp.spreadMinor, cheapest.quote.currency)} vs the highest quote' : ''}.',
                  ),
                ),
              if (!cmp.sameCurrency)
                Text(
                  'Quotes are in different currencies; compare totals with care.',
                  style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _labelsColumn(context, cmp),
                    for (final col in cmp.columns) _QuoteColumnCard(column: col, cmp: cmp, best: col == cheapest),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SecondaryButton(
                label: 'Request another hospital',
                icon: Icons.add_business_outlined,
                onPressed: () => context.push(AgentRoutes.requestQuote(patientId)),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _labelsColumn(BuildContext context, QuoteComparison cmp) {
    final style = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    Widget cell(String t) => SizedBox(
      height: _QuoteColumnCard.rowHeight,
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(t, style: style),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(top: _QuoteColumnCard.headerHeight + 16, right: 8),
      child: SizedBox(
        width: 96,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [cell('Total'), cell('Stay'), cell('Valid until'), for (final c in cmp.categories) cell(c.label)],
        ),
      ),
    );
  }
}

class _QuoteColumnCard extends ConsumerStatefulWidget {
  const _QuoteColumnCard({required this.column, required this.cmp, required this.best});

  static const double rowHeight = 36;
  static const double headerHeight = 64;

  final QuoteColumn column;
  final QuoteComparison cmp;
  final bool best;

  @override
  ConsumerState<_QuoteColumnCard> createState() => _QuoteColumnCardState();
}

class _QuoteColumnCardState extends ConsumerState<_QuoteColumnCard> {
  bool _busy = false;

  Future<void> _accept() async {
    final col = widget.column;
    final ok = await confirmAction(
      context,
      title: 'Accept ${col.medicalCase.hospital.name}?',
      message: 'Total ${money(col.quote.totalMinor, col.quote.currency)}',
      confirmLabel: 'Accept',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(caseRepositoryProvider).acceptQuote(col.medicalCase.id, col.quote.id);
      final pid = col.medicalCase.patient?.id;
      if (pid != null) ref.invalidate(patientCasesProvider(pid));
      ref.invalidate(agentCasesProvider);
      if (mounted) {
        showInfoSnack(context, 'Quote accepted');
        unawaited(context.push(AgentRoutes.caseDetail(col.medicalCase.id)));
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final col = widget.column;
    final q = col.quote;
    Widget cell(String t, {bool strong = false}) => SizedBox(
      height: _QuoteColumnCard.rowHeight,
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          t,
          style: strong
              ? context.text.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: widget.best ? AppColors.primary : null,
                )
              : context.text.bodyMedium,
        ),
      ),
    );
    return Container(
      width: 180,
      margin: const EdgeInsets.only(right: 10),
      child: AppCard(
        selected: widget.best,
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: _QuoteColumnCard.headerHeight,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    col.medicalCase.hospital.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  Row(
                    children: [
                      StatusBadge.forEnum(q.status, dense: true),
                      if (widget.best) ...[
                        const SizedBox(width: 4),
                        const StatusBadge(label: 'Best', dense: true, color: AppColors.primary),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            cell(money(q.totalMinor, q.currency), strong: true),
            cell(q.estimatedStayDays == null ? '—' : '${q.estimatedStayDays} days'),
            cell(q.validUntil == null ? '—' : Dates.dayShort(q.validUntil)),
            for (final cat in widget.cmp.categories)
              cell(col.byCategory[cat] == null ? '—' : money(col.byCategory[cat]!, q.currency)),
            const SizedBox(height: 8),
            if (q.isActionable)
              PrimaryButton(label: 'Accept', loading: _busy, onPressed: _busy ? null : _accept)
            else
              SecondaryButton(label: 'Open', onPressed: () => context.push(AgentRoutes.caseDetail(col.medicalCase.id))),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------- request quote

final _hospitalSearchProvider = FutureProvider.autoDispose.family<Paged<HospitalCard>, String>(
  (ref, q) => ref.watch(catalogRepositoryProvider).hospitals(q: q.isEmpty ? null : q, sort: 'rating'),
);

/// Pick a hospital and open a case (`POST /cases {patient_id, hospital_id}`) for the patient.
class RequestQuoteScreen extends ConsumerStatefulWidget {
  const RequestQuoteScreen({super.key, required this.patientId, this.screeningId});

  final String patientId;
  final String? screeningId;

  @override
  ConsumerState<RequestQuoteScreen> createState() => _RequestQuoteScreenState();
}

class _RequestQuoteScreenState extends ConsumerState<RequestQuoteScreen> {
  final _notes = TextEditingController();
  Timer? _debounce;
  String _q = '';
  HospitalCard? _hospital;
  bool _saving = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final h = _hospital;
    if (h == null) return;
    setState(() => _saving = true);
    try {
      final created = await ref
          .read(agentRepositoryProvider)
          .createCase(
            patientId: widget.patientId,
            hospitalId: h.id,
            screeningId: widget.screeningId,
            notes: _notes.text.trim(),
          );
      ref
        ..invalidate(patientCasesProvider(widget.patientId))
        ..invalidate(agentCasesProvider);
      if (mounted) {
        showInfoSnack(context, 'Quote requested from ${h.name}');
        context.pushReplacement(AgentRoutes.caseDetail(created.id));
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hospitals = ref.watch(_hospitalSearchProvider(_q));
    return Scaffold(
      appBar: AppBar(title: const Text('Request a quote')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search hospitals'),
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), () => setState(() => _q = v.trim()));
              },
            ),
          ),
          Expanded(
            child: AsyncValueView(
              value: hospitals,
              onRetry: () => ref.invalidate(_hospitalSearchProvider(_q)),
              data: (page) => ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final h in page.items)
                    AppCard(
                      margin: const EdgeInsets.only(bottom: 8),
                      selected: _hospital?.id == h.id,
                      onTap: () => setState(() => _hospital = h),
                      child: Row(
                        children: [
                          Avatar(name: h.name, imageUrl: h.logoUrl, square: true),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(h.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                                Text(
                                  [?h.city, ...h.accreditations].join(' · '),
                                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          if (h.ratingAvg != null) RatingStars(rating: h.ratingAvg!, size: 14),
                        ],
                      ),
                    ),
                  if (page.items.isEmpty) const EmptyView(title: 'No hospitals found', icon: Icons.search_off_rounded),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: _notes,
                    decoration: const InputDecoration(labelText: 'Notes for the hospital (optional)'),
                  ),
                  const SizedBox(height: 10),
                  PrimaryButton(
                    label: _hospital == null ? 'Select a hospital' : 'Request quote from ${_hospital!.name}',
                    loading: _saving,
                    onPressed: _hospital == null || _saving ? null : _submit,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
