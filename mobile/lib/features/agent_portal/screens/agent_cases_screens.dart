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
import '../../../l10n/l10n.dart';
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
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.agentCasesTitle)),
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
                        children: [
                          EmptyView(
                            title: l10n.agentCasesEmpty,
                            message: l10n.agentCasesEmptyHint,
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
    final l10n = context.l10n;
    final ok = await confirmAction(
      context,
      title: l10n.agentAcceptQuoteTitle,
      message: l10n.agentAcceptQuoteMessage(c.hospital.name, money(q.totalMinor, q.currency)),
      confirmLabel: l10n.agentQuoteAccept,
    );
    if (!ok || !mounted) return;
    await _run(c, () => ref.read(caseRepositoryProvider).acceptQuote(c.id, q.id), l10n.agentQuoteAccepted);
  }

  Future<void> _reject(MedicalCaseDetail c, Quote q) async {
    final l10n = context.l10n;
    final reason = await promptText(
      context,
      title: l10n.agentRejectQuoteTitle,
      label: l10n.agentReasonOptional,
      confirmLabel: l10n.agentQuoteReject,
    );
    if (reason == null || !mounted) return;
    await _run(
      c,
      () => ref.read(caseRepositoryProvider).rejectQuote(c.id, q.id, reason: reason.isEmpty ? null : reason),
      l10n.agentQuoteRejected,
    );
  }

  Future<void> _cancel(MedicalCaseDetail c) async {
    final l10n = context.l10n;
    final ok = await confirmAction(
      context,
      title: l10n.agentCancelCaseTitle,
      message: l10n.agentCancelCaseMessage,
      confirmLabel: l10n.agentCancelCase,
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _run(c, () => ref.read(caseRepositoryProvider).cancel(c.id), l10n.agentCaseCancelled);
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(caseDetailProvider(widget.caseId));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(detail.value?.caseNumber ?? l10n.agentCaseFallbackTitle),
        actions: [
          if (detail.value != null && detail.value!.isOpen && detail.value!.booking == null)
            IconButton(
              tooltip: l10n.agentCancelCase,
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
    final l10n = context.l10n;
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
            InfoRow(l10n.portalPatientLabel, c.patient?.fullName),
            InfoRow(l10n.portalHospitalLabel, [c.hospital.name, c.hospital.city].whereType<String>().join(', ')),
            InfoRow(l10n.portalDoctorLabel, c.doctor?.fullName),
            InfoRow(l10n.agentCaseCoordinator, c.coordinator?.fullName),
            InfoRow(l10n.agentCaseOpenedLabel, Dates.day(c.createdAt)),
            if ((c.patientNotes ?? '').isNotEmpty) InfoRow(l10n.agentCaseNotes, c.patientNotes),
          ],
        ),
      ),
      if (accepted != null && c.booking == null && c.status == CaseStatus.accepted) ...[
        const SizedBox(height: 12),
        PrimaryButton(
          key: const ValueKey('agent-book-treatment'),
          label: l10n.agentBookTreatment,
          icon: Icons.event_available_rounded,
          onPressed: () => context.push(AgentRoutes.book(c.id, quoteId: accepted.id)),
        ),
      ],
      if (c.booking != null) ...[
        SectionTitle(l10n.portalBookingLabel),
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
                      l10n.agentCaseBookingSummary(
                        Dates.day(c.booking!.admissionDate),
                        money(c.booking!.balanceDueMinor, c.booking!.currency),
                      ),
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
        l10n.agentQuotesSection,
        actionLabel: patientId == null ? null : l10n.agentCompareHospitals,
        onAction: patientId == null ? null : () => context.push(AgentRoutes.compare(patientId)),
      ),
      if (c.quotes.isEmpty)
        Text(
          l10n.agentQuotesWaiting(c.hospital.name),
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
                    Expanded(child: Text(l10n.agentQuoteDated(Dates.day(q.createdAt)), style: context.text.labelLarge)),
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
                        child: SecondaryButton(
                          label: l10n.agentQuoteReject,
                          onPressed: _busy ? null : () => _reject(c, q),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: PrimaryButton(
                          key: ValueKey('accept-quote-${q.id}'),
                          label: l10n.agentQuoteAccept,
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
        SectionTitle(l10n.agentDocumentsSection),
        for (final d in c.documents)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(d.isPdf ? Icons.picture_as_pdf_outlined : Icons.description_outlined),
            title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${d.kind.label} · ${d.sizeLabel}'),
          ),
      ],
      if (c.timeline.isNotEmpty) ...[
        SectionTitle(l10n.agentTimelineSection),
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
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.agentCompareQuotes)),
      body: AsyncValueView(
        value: cases,
        onRetry: () => ref.invalidate(patientCasesProvider(patientId)),
        data: (list) {
          final cmp = QuoteComparison.fromCases(list);
          if (cmp.columns.isEmpty) {
            return EmptyView(
              title: l10n.agentCompareEmpty,
              message: l10n.agentCompareEmptyHint,
              icon: Icons.compare_arrows_rounded,
              actionLabel: l10n.agentRequestAQuote,
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
                    cmp.spreadMinor > 0
                        ? l10n.agentCompareBestPriceSaves(
                            money(cheapest.quote.totalMinor, cheapest.quote.currency),
                            cheapest.medicalCase.hospital.name,
                            money(cmp.spreadMinor, cheapest.quote.currency),
                          )
                        : l10n.agentCompareBestPrice(
                            money(cheapest.quote.totalMinor, cheapest.quote.currency),
                            cheapest.medicalCase.hospital.name,
                          ),
                  ),
                ),
              if (!cmp.sameCurrency)
                Text(
                  l10n.agentCompareMixedCurrencies,
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
                label: l10n.agentCompareRequestAnother,
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
    final l10n = context.l10n;
    final style = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    Widget cell(String t) => SizedBox(
      height: _QuoteColumnCard.rowHeight,
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Text(t, style: style),
      ),
    );
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: _QuoteColumnCard.headerHeight + 16, end: 8),
      child: SizedBox(
        width: 96,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            cell(l10n.portalTotal),
            cell(l10n.agentCompareStay),
            cell(l10n.agentCompareValidUntil),
            for (final c in cmp.categories) cell(c.label),
          ],
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
    final l10n = context.l10n;
    final ok = await confirmAction(
      context,
      title: l10n.agentCompareAcceptTitle(col.medicalCase.hospital.name),
      message: l10n.agentCompareAcceptMessage(money(col.quote.totalMinor, col.quote.currency)),
      confirmLabel: l10n.agentQuoteAccept,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(caseRepositoryProvider).acceptQuote(col.medicalCase.id, col.quote.id);
      final pid = col.medicalCase.patient?.id;
      if (pid != null) ref.invalidate(patientCasesProvider(pid));
      ref.invalidate(agentCasesProvider);
      if (mounted) {
        showInfoSnack(context, context.l10n.agentQuoteAccepted);
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
    final l10n = context.l10n;
    Widget cell(String t, {bool strong = false}) => SizedBox(
      height: _QuoteColumnCard.rowHeight,
      child: Align(
        alignment: AlignmentDirectional.centerStart,
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
      margin: const EdgeInsetsDirectional.only(end: 10),
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
                        StatusBadge(label: l10n.agentCompareBest, dense: true, color: AppColors.primary),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            cell(money(q.totalMinor, q.currency), strong: true),
            cell(q.estimatedStayDays == null ? '—' : l10n.agentCompareStayDays(q.estimatedStayDays!)),
            cell(q.validUntil == null ? '—' : Dates.dayShort(q.validUntil)),
            for (final cat in widget.cmp.categories)
              cell(col.byCategory[cat] == null ? '—' : money(col.byCategory[cat]!, q.currency)),
            const SizedBox(height: 8),
            if (q.isActionable)
              PrimaryButton(label: l10n.agentQuoteAccept, loading: _busy, onPressed: _busy ? null : _accept)
            else
              SecondaryButton(
                label: l10n.commonOpen,
                onPressed: () => context.push(AgentRoutes.caseDetail(col.medicalCase.id)),
              ),
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
        showInfoSnack(context, context.l10n.agentQuoteRequestedFrom(h.name));
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
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.agentRequestAQuote)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: l10n.agentSearchHospitalsHint,
              ),
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
                  if (page.items.isEmpty) EmptyView(title: l10n.agentNoHospitalsFound, icon: Icons.search_off_rounded),
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
                    decoration: InputDecoration(labelText: l10n.agentNotesForHospitalOptional),
                  ),
                  const SizedBox(height: 10),
                  PrimaryButton(
                    label: _hospital == null ? l10n.agentSelectHospital : l10n.agentRequestQuoteFrom(_hospital!.name),
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
