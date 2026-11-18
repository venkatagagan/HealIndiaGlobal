import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../agent_routes.dart';
import '../data/crm_models.dart';
import '../data/crm_repository.dart';
import '../shared/portal_widgets.dart';

// ------------------------------------------------------------------------------------------ labels

String leadStatusLabel(AppLocalizations l10n, LeadStatus s) => switch (s) {
  LeadStatus.newLead => l10n.crmStatusNew,
  LeadStatus.contacted => l10n.crmStatusContacted,
  LeadStatus.qualified => l10n.crmStatusQualified,
  LeadStatus.screening => l10n.crmStatusScreening,
  LeadStatus.quoteRequested => l10n.crmStatusQuoteRequested,
  LeadStatus.won => l10n.crmStatusWon,
  LeadStatus.lost => l10n.crmStatusLost,
};

String leadSourceLabel(AppLocalizations l10n, LeadSource s) => switch (s) {
  LeadSource.walkIn => l10n.crmSourceWalkIn,
  LeadSource.whatsapp => l10n.crmSourceWhatsapp,
  LeadSource.facebook => l10n.crmSourceFacebook,
  LeadSource.referral => l10n.crmSourceReferral,
  LeadSource.event => l10n.crmSourceEvent,
  LeadSource.other => l10n.crmSourceOther,
};

String leadActivityLabel(AppLocalizations l10n, LeadActivityKind k) => switch (k) {
  LeadActivityKind.call => l10n.crmActivityCall,
  LeadActivityKind.message => l10n.crmActivityMessage,
  LeadActivityKind.meeting => l10n.crmActivityMeeting,
  LeadActivityKind.note => l10n.crmActivityNote,
  LeadActivityKind.statusChange => l10n.crmActivityStatusChange,
};

IconData leadActivityIcon(LeadActivityKind k) => switch (k) {
  LeadActivityKind.call => Icons.phone_in_talk_outlined,
  LeadActivityKind.message => Icons.chat_outlined,
  LeadActivityKind.meeting => Icons.groups_2_outlined,
  LeadActivityKind.note => Icons.sticky_note_2_outlined,
  LeadActivityKind.statusChange => Icons.swap_horiz_rounded,
};

Color leadStatusColor(LeadStatus s) => switch (s) {
  LeadStatus.newLead => AppColors.info,
  LeadStatus.contacted => AppColors.cyan,
  LeadStatus.qualified => AppColors.violet,
  LeadStatus.screening => AppColors.violet,
  LeadStatus.quoteRequested => AppColors.warning,
  LeadStatus.won => AppColors.primary,
  LeadStatus.lost => AppColors.danger,
};

StatusBadge leadStatusBadge(BuildContext context, LeadStatus s, {bool dense = true}) =>
    StatusBadge(label: leadStatusLabel(context.l10n, s), color: leadStatusColor(s), dense: dense);

/// Date + time picker; null when cancelled.
Future<DateTime?> pickLeadDateTime(BuildContext context, {DateTime? initial}) async {
  final now = DateTime.now();
  final start = initial ?? DateTime(now.year, now.month, now.day + 1, 10);
  final day = await showDatePicker(
    context: context,
    initialDate: start.isBefore(now) ? now : start,
    firstDate: DateTime(now.year, now.month, now.day),
    lastDate: DateTime(now.year + 2),
  );
  if (day == null || !context.mounted) return null;
  final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(start));
  if (time == null) return null;
  return DateTime(day.year, day.month, day.day, time.hour, time.minute);
}

/// Message for the CRM error codes the app explains itself; null for the others.
String? crmErrorMessage(AppLocalizations l10n, Object error) {
  if (error is! ApiException) return null;
  return switch (error.code) {
    'lost_reason_required' => l10n.crmLostReasonRequired,
    'lead_convert_required' => l10n.crmWonViaConvert,
    'lead_converted' => l10n.crmErrorLeadConverted,
    _ => null,
  };
}

void _showCrmError(BuildContext context, Object e) {
  final known = crmErrorMessage(context.l10n, e);
  if (known != null) {
    showInfoSnack(context, known);
  } else {
    showErrorSnack(context, e);
  }
}

// ------------------------------------------------------------------------------------------ list

/// Leads: pipeline summary, follow-up / status / source filters, search and quick add.
///
/// Route: `/agent/leads?follow_up=due|overdue|none`.
class AgentLeadsScreen extends ConsumerStatefulWidget {
  const AgentLeadsScreen({super.key, this.followUp});

  /// Initial follow-up filter (push notification `/leads?follow_up=due`).
  final String? followUp;

  @override
  ConsumerState<AgentLeadsScreen> createState() => _AgentLeadsScreenState();
}

class _AgentLeadsScreenState extends ConsumerState<AgentLeadsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  late LeadFilters _filters = LeadFilters(followUp: LeadFollowUpFilter.fromJsonOrNull(widget.followUp));

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 350),
      () => setState(() => _filters = _filters.copyWith(q: v.trim())),
    );
  }

  void _refresh() => ref
    ..invalidate(leadsProvider(_filters))
    ..invalidate(leadPipelineProvider);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final leads = ref.watch(leadsProvider(_filters));
    final pipeline = ref.watch(leadPipelineProvider).value;
    final filtered = _filters != const LeadFilters();
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.crmLeadsTitle),
        actions: [
          PopupMenuButton<LeadSource?>(
            key: const ValueKey('lead-source-filter'),
            tooltip: l10n.crmFilterSource,
            icon: Badge(isLabelVisible: _filters.source != null, child: const Icon(Icons.filter_list_rounded)),
            onSelected: (s) => setState(() => _filters = _filters.copyWith(source: () => s)),
            itemBuilder: (_) => [
              CheckedPopupMenuItem<LeadSource?>(
                value: null,
                checked: _filters.source == null,
                child: Text(l10n.crmFilterAnySource),
              ),
              for (final s in LeadSource.values)
                CheckedPopupMenuItem<LeadSource?>(
                  value: s,
                  checked: _filters.source == s,
                  child: Text(leadSourceLabel(l10n, s)),
                ),
            ],
          ),
          const SizedBox(width: 4),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'agent-add-lead',
        onPressed: () => context.push(AgentRoutes.newLead),
        icon: const Icon(Icons.person_add_alt_rounded),
        label: Text(l10n.crmAddLead),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 16, 4),
            child: TextField(
              controller: _search,
              onChanged: _onSearch,
              decoration: InputDecoration(prefixIcon: const Icon(Icons.search_rounded), hintText: l10n.crmSearchHint),
            ),
          ),
          if (pipeline != null) _PipelineSummary(pipeline: pipeline),
          _FollowUpFilterBar(
            selected: _filters.followUp,
            pipeline: pipeline,
            onSelected: (f) => setState(() => _filters = _filters.copyWith(followUp: () => f)),
          ),
          StatusFilterBar<LeadStatus>(
            options: LeadStatus.values,
            selected: _filters.status,
            onSelected: (s) => setState(() => _filters = _filters.copyWith(status: () => s)),
            labelOf: (s) => pipeline == null
                ? leadStatusLabel(l10n, s)
                : l10n.crmChipCount(leadStatusLabel(l10n, s), pipeline.countOf(s)),
          ),
          if (_filters.source != null)
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 4),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: InputChip(
                  label: Text(leadSourceLabel(l10n, _filters.source!)),
                  onDeleted: () => setState(() => _filters = _filters.copyWith(source: () => null)),
                ),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => _refresh(),
              child: AsyncValueView(
                value: leads,
                onRetry: _refresh,
                data: (page) => page.items.isEmpty
                    ? ListView(
                        children: [
                          EmptyView(
                            title: filtered ? l10n.crmLeadsNoMatch : l10n.crmLeadsEmpty,
                            message: filtered ? null : l10n.crmLeadsEmptyHint,
                            icon: Icons.contact_phone_outlined,
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 16, 96),
                        itemCount: page.items.length,
                        itemBuilder: (_, i) => LeadTile(lead: page.items[i]),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PipelineSummary extends StatelessWidget {
  const _PipelineSummary({required this.pipeline});

  final LeadPipeline pipeline;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = pipeline;
    final rate = p.conversionRate;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 4, 16, 0),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          StatusBadge(label: l10n.crmPipelineOpen(p.open), color: AppColors.info, icon: Icons.inbox_outlined),
          if (p.followUpsDueToday > 0)
            StatusBadge(
              key: const ValueKey('leads-due-today-badge'),
              label: l10n.crmFollowUpsDueToday(p.followUpsDueToday),
              color: AppColors.warning,
              icon: Icons.alarm_rounded,
            ),
          if (p.followUpsOverdue > 0)
            StatusBadge(
              label: l10n.crmFollowUpsOverdue(p.followUpsOverdue),
              color: AppColors.danger,
              icon: Icons.alarm_off_rounded,
            ),
          if (rate != null)
            StatusBadge(
              label: l10n.crmPipelineConversion('${(rate * 100).round()}%'),
              color: AppColors.primary,
              icon: Icons.trending_up_rounded,
            ),
        ],
      ),
    );
  }
}

class _FollowUpFilterBar extends StatelessWidget {
  const _FollowUpFilterBar({required this.selected, required this.onSelected, this.pipeline});

  final LeadFollowUpFilter? selected;
  final ValueChanged<LeadFollowUpFilter?> onSelected;
  final LeadPipeline? pipeline;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String label(LeadFollowUpFilter f) {
      final base = switch (f) {
        LeadFollowUpFilter.due => l10n.crmFilterDueToday,
        LeadFollowUpFilter.overdue => l10n.crmFilterOverdue,
        LeadFollowUpFilter.none => l10n.crmFilterNoFollowUp,
      };
      final count = switch (f) {
        LeadFollowUpFilter.due => pipeline?.followUpsDueToday,
        LeadFollowUpFilter.overdue => pipeline?.followUpsOverdue,
        LeadFollowUpFilter.none => null,
      };
      return count == null ? base : l10n.crmChipCount(base, count);
    }

    return StatusFilterBar<LeadFollowUpFilter>(
      key: const ValueKey('lead-follow-up-filter'),
      options: LeadFollowUpFilter.values,
      selected: selected,
      onSelected: onSelected,
      labelOf: label,
      allLabel: l10n.crmFilterAllLeads,
    );
  }
}

/// One lead in the list.
class LeadTile extends StatelessWidget {
  const LeadTile({super.key, required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final l = lead;
    final details = [
      leadSourceLabel(l10n, l.source),
      ?l.country,
      if (l.interest != null && l.interest!.isNotEmpty) l.interest!,
    ].join(' · ');
    return AppCard(
      margin: const EdgeInsetsDirectional.only(bottom: 10),
      onTap: () => context.push(AgentRoutes.lead(l.id)),
      child: Row(
        children: [
          Avatar(name: l.fullName),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.fullName, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  details,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
                if (l.nextFollowUpAt != null && l.status.isOpen)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(top: 2),
                    child: Row(
                      children: [
                        Icon(
                          Icons.alarm_rounded,
                          size: 14,
                          color: l.followUpDue ? AppColors.warning : context.palette.textSecondary,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            l10n.crmFollowUpOn(Dates.dayTime(l.nextFollowUpAt)),
                            style: context.text.bodySmall?.copyWith(
                              color: l.followUpDue ? AppColors.warning : context.palette.textSecondary,
                              fontWeight: l.followUpDue ? FontWeight.w700 : null,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              leadStatusBadge(context, l.status),
              if (l.followUpDue && l.status.isOpen) ...[
                const SizedBox(height: 4),
                StatusBadge(label: l10n.crmFollowUpDueBadge, color: AppColors.warning, dense: true),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ detail

/// One lead: details, follow-up, timeline and actions (log activity, change status, convert).
class AgentLeadDetailScreen extends ConsumerStatefulWidget {
  const AgentLeadDetailScreen({super.key, required this.leadId});

  final String leadId;

  @override
  ConsumerState<AgentLeadDetailScreen> createState() => _AgentLeadDetailScreenState();
}

class _AgentLeadDetailScreenState extends ConsumerState<AgentLeadDetailScreen> {
  bool _busy = false;

  void _invalidateLists() => ref
    ..invalidate(leadsProvider)
    ..invalidate(leadPipelineProvider);

  /// Runs [action]; on success shows [done] and refreshes the lead and the lists.
  Future<void> _run(Future<Lead> Function(CrmRepository repo) action, String done) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action(ref.read(crmRepositoryProvider));
      ref.invalidate(leadProvider(widget.leadId));
      _invalidateLists();
      if (mounted) showInfoSnack(context, done);
    } catch (e) {
      if (mounted) _showCrmError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeStatus(Lead lead) async {
    final result = await showModalBottomSheet<(LeadStatus, String?)>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _StatusSheet(current: lead.status),
    );
    if (result == null || !mounted) return;
    final (status, reason) = result;
    if (status == lead.status && status != LeadStatus.lost) return;
    await _run((r) => r.changeStatus(lead.id, status, lostReason: reason), context.l10n.crmStatusUpdated);
  }

  Future<void> _scheduleFollowUp(Lead lead) async {
    final at = await pickLeadDateTime(context, initial: lead.nextFollowUpAt);
    if (at == null || !mounted) return;
    await _run((r) => r.scheduleFollowUp(lead.id, at), context.l10n.crmFollowUpScheduled);
  }

  Future<void> _clearFollowUp(Lead lead) =>
      _run((r) => r.scheduleFollowUp(lead.id, null), context.l10n.crmFollowUpCleared);

  Future<void> _logActivity(Lead lead) async {
    final input = await showModalBottomSheet<_ActivityInput>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ActivitySheet(),
    );
    if (input == null || !mounted) return;
    await _run(
      (r) => r.logActivity(lead.id, kind: input.kind, body: input.body, nextFollowUpAt: input.nextFollowUpAt),
      context.l10n.crmActivityLogged,
    );
  }

  Future<void> _delete(Lead lead) async {
    final l10n = context.l10n;
    final ok = await confirmAction(
      context,
      title: l10n.crmDeleteConfirmTitle,
      message: l10n.crmDeleteConfirmBody,
      confirmLabel: l10n.crmDeleteLead,
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(crmRepositoryProvider).delete(lead.id);
      _invalidateLists();
      if (!mounted) return;
      showInfoSnack(context, l10n.crmLeadDeleted);
      context.pop();
    } catch (e) {
      if (mounted) _showCrmError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final lead = ref.watch(leadProvider(widget.leadId));
    final l = lead.value;
    return Scaffold(
      appBar: AppBar(
        title: Text(l?.fullName ?? l10n.crmLeadDetailTitle),
        actions: [
          if (l != null && !l.isConverted)
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'delete') _delete(l);
              },
              itemBuilder: (_) => [PopupMenuItem(value: 'delete', child: Text(l10n.crmDeleteLead))],
            ),
        ],
      ),
      body: AsyncValueView(
        value: lead,
        onRetry: () => ref.invalidate(leadProvider(widget.leadId)),
        data: (l) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(leadProvider(widget.leadId)),
          child: ListView(
            padding: AppSpacing.pageAll,
            children: [
              if (_busy) const LinearProgressIndicator(),
              _LeadHeader(lead: l),
              const SizedBox(height: 12),
              if (l.isConverted)
                AppCard(
                  color: AppColors.primary.withValues(alpha: 0.10),
                  borderColor: AppColors.primary,
                  child: Row(
                    children: [
                      const Icon(Icons.verified_user_outlined, color: AppColors.primary),
                      const SizedBox(width: 12),
                      Expanded(child: Text(l10n.crmAlreadyConverted)),
                      TextButton(
                        onPressed: () => context.push(AgentRoutes.patient(l.convertedPatientId!)),
                        child: Text(l10n.crmViewPatient),
                      ),
                    ],
                  ),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      key: const ValueKey('lead-log-activity'),
                      onPressed: _busy ? null : () => _logActivity(l),
                      icon: const Icon(Icons.add_comment_outlined),
                      label: Text(l10n.crmLogActivity),
                    ),
                    OutlinedButton.icon(
                      key: const ValueKey('lead-change-status'),
                      onPressed: _busy ? null : () => _changeStatus(l),
                      icon: const Icon(Icons.swap_horiz_rounded),
                      label: Text(l10n.crmChangeStatus),
                    ),
                    if (l.status.isOpen)
                      OutlinedButton.icon(
                        key: const ValueKey('lead-convert'),
                        onPressed: _busy ? null : () => context.push(AgentRoutes.convertLead(l.id)),
                        icon: const Icon(Icons.person_add_alt_1_rounded),
                        label: Text(l10n.crmConvertToPatient),
                      ),
                  ],
                ),
              if (!l.isConverted && l.status.isOpen) ...[
                SectionTitle(l10n.crmFieldNextFollowUp),
                AppCard(
                  borderColor: l.followUpDue ? AppColors.warning : null,
                  child: Row(
                    children: [
                      Icon(Icons.alarm_rounded, color: l.followUpDue ? AppColors.warning : AppColors.info),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          l.nextFollowUpAt == null ? l10n.crmNoFollowUp : Dates.dayTime(l.nextFollowUpAt),
                          style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      if (l.followUpDue)
                        StatusBadge(label: l10n.crmFollowUpDueBadge, color: AppColors.warning, dense: true),
                      IconButton(
                        key: const ValueKey('lead-schedule-follow-up'),
                        tooltip: l10n.crmScheduleFollowUp,
                        onPressed: _busy ? null : () => _scheduleFollowUp(l),
                        icon: const Icon(Icons.edit_calendar_outlined),
                      ),
                      if (l.nextFollowUpAt != null)
                        IconButton(
                          tooltip: l10n.crmClearFollowUp,
                          onPressed: _busy ? null : () => _clearFollowUp(l),
                          icon: const Icon(Icons.close_rounded),
                        ),
                    ],
                  ),
                ),
              ],
              SectionTitle(l10n.crmDetailsTitle),
              _LeadDetails(lead: l),
              SectionTitle(l10n.crmTimelineTitle),
              if (l.activities.isEmpty)
                Text(l10n.crmTimelineEmpty, style: context.text.bodyMedium)
              else
                for (final a in l.activities) _ActivityTile(activity: a),
            ],
          ),
        ),
      ),
    );
  }
}

class _LeadHeader extends StatelessWidget {
  const _LeadHeader({required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      child: Row(
        children: [
          Avatar(name: lead.fullName, size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lead.fullName, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    leadStatusBadge(context, lead.status, dense: false),
                    StatusBadge(label: leadSourceLabel(l10n, lead.source), color: AppColors.cyan),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LeadDetails extends StatelessWidget {
  const _LeadDetails({required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final l = lead;
    final budget = l.budgetMinor == null || l.budgetCurrency == null
        ? null
        : formatMoney(l.budgetMinor!, l.budgetCurrency!);
    return AppCard(
      child: Column(
        children: [
          InfoRow(l10n.crmFieldPhone, l.phone),
          InfoRow(l10n.crmFieldWhatsapp, l.whatsapp),
          InfoRow(l10n.crmFieldEmail, l.email),
          InfoRow(l10n.crmFieldCountry, l.country),
          if (l.preferredLanguage != null) InfoRow(l10n.crmFieldLanguage, l.preferredLanguage),
          InfoRow(
            l10n.crmFieldSource,
            [
              leadSourceLabel(l10n, l.source),
              if (l.sourceDetail != null && l.sourceDetail!.isNotEmpty) l.sourceDetail!,
            ].join(' · '),
          ),
          if (l.interestedSpecialtyName != null) InfoRow(l10n.crmFieldSpecialty, l.interestedSpecialtyName),
          if (l.interestedProcedureName != null) InfoRow(l10n.crmFieldProcedure, l.interestedProcedureName),
          InfoRow(l10n.crmFieldInterest, l.interest),
          InfoRow(l10n.crmFieldBudget, budget),
          if (l.tags.isNotEmpty) InfoRow(l10n.crmFieldTags, l.tags.join(', ')),
          if (l.ownerName != null) InfoRow(l10n.crmFieldOwner, l.ownerName),
          if (l.status == LeadStatus.lost) InfoRow(l10n.crmFieldLostReason, l.lostReason),
          InfoRow(l10n.crmFieldCreated, Dates.day(l.createdAt)),
        ],
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.activity});

  final LeadActivity activity;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final a = activity;
    final title = a.kind == LeadActivityKind.statusChange && a.toStatus != null
        ? (a.fromStatus == null
              ? l10n.crmTimelineStatusSet(leadStatusLabel(l10n, a.toStatus!))
              : l10n.crmTimelineStatusChange(leadStatusLabel(l10n, a.fromStatus!), leadStatusLabel(l10n, a.toStatus!)))
        : leadActivityLabel(l10n, a.kind);
    final meta = [
      Dates.dayTime(a.occurredAt ?? a.createdAt),
      if (a.actorName != null && a.actorName!.isNotEmpty) l10n.crmTimelineBy(a.actorName!),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppColors.violet.withValues(alpha: 0.15),
            child: Icon(leadActivityIcon(a.kind), size: 18, color: AppColors.violet),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                if (a.body != null && a.body!.isNotEmpty) Text(a.body!, style: context.text.bodyMedium),
                Text(meta, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Picks a new status; "lost" asks for the reason. Pops `(status, lostReason)`.
class _StatusSheet extends StatefulWidget {
  const _StatusSheet({required this.current});

  final LeadStatus current;

  @override
  State<_StatusSheet> createState() => _StatusSheetState();
}

class _StatusSheetState extends State<_StatusSheet> {
  late LeadStatus _status = LeadStatus.editable.contains(widget.current) ? widget.current : LeadStatus.contacted;
  final _reason = TextEditingController();
  bool _showReasonError = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    if (_status == LeadStatus.lost && _reason.text.trim().isEmpty) {
      setState(() => _showReasonError = true);
      return;
    }
    Navigator.of(context).pop((_status, _status == LeadStatus.lost ? _reason.text.trim() : null));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      child: Padding(
        padding: EdgeInsetsDirectional.fromSTEB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.crmChangeStatus, style: context.text.titleLarge),
              const SizedBox(height: 8),
              RadioGroup<LeadStatus>(
                groupValue: _status,
                onChanged: (v) => setState(() => _status = v ?? _status),
                child: Column(
                  children: [
                    for (final s in LeadStatus.editable)
                      RadioListTile<LeadStatus>(
                        key: ValueKey('lead-status-${s.json}'),
                        contentPadding: EdgeInsets.zero,
                        value: s,
                        title: Text(leadStatusLabel(l10n, s)),
                      ),
                  ],
                ),
              ),
              Text(
                l10n.crmWonViaConvert,
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
              if (_status == LeadStatus.lost) ...[
                const SizedBox(height: 12),
                TextField(
                  key: const ValueKey('lead-lost-reason'),
                  controller: _reason,
                  maxLength: 500,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: l10n.crmLostReasonLabel,
                    errorText: _showReasonError ? l10n.crmLostReasonRequired : null,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              PrimaryButton(key: const ValueKey('lead-status-save'), label: l10n.crmStatusSave, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActivityInput {
  const _ActivityInput(this.kind, this.body, this.nextFollowUpAt);

  final LeadActivityKind kind;
  final String body;
  final DateTime? nextFollowUpAt;
}

/// Logs a call / message / meeting / note, optionally with the next follow-up.
class _ActivitySheet extends StatefulWidget {
  const _ActivitySheet();

  @override
  State<_ActivitySheet> createState() => _ActivitySheetState();
}

class _ActivitySheetState extends State<_ActivitySheet> {
  LeadActivityKind _kind = LeadActivityKind.call;
  final _body = TextEditingController();
  DateTime? _next;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      child: Padding(
        padding: EdgeInsetsDirectional.fromSTEB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.crmLogActivity, style: context.text.titleLarge),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final k in LeadActivityKind.loggable)
                    ChoiceChip(
                      key: ValueKey('activity-kind-${k.json}'),
                      avatar: Icon(leadActivityIcon(k), size: 18),
                      label: Text(leadActivityLabel(l10n, k)),
                      selected: _kind == k,
                      onSelected: (_) => setState(() => _kind = k),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('activity-body'),
                controller: _body,
                maxLines: 4,
                maxLength: 5000,
                decoration: InputDecoration(labelText: l10n.crmActivityBodyLabel, counterText: ''),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.alarm_add_outlined),
                title: Text(_next == null ? l10n.crmActivityNextFollowUp : Dates.dayTime(_next)),
                trailing: _next == null
                    ? const Icon(Icons.edit_calendar_outlined)
                    : IconButton(
                        tooltip: l10n.crmClearFollowUp,
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => setState(() => _next = null),
                      ),
                onTap: () async {
                  final at = await pickLeadDateTime(context, initial: _next);
                  if (at != null) setState(() => _next = at);
                },
              ),
              const SizedBox(height: 8),
              PrimaryButton(
                key: const ValueKey('activity-save'),
                label: l10n.crmActivitySave,
                onPressed: () => Navigator.of(context).pop(_ActivityInput(_kind, _body.text.trim(), _next)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ form

/// Quick add of a lead (`POST /agent-portal/leads`).
class AgentLeadFormScreen extends ConsumerStatefulWidget {
  const AgentLeadFormScreen({super.key});

  @override
  ConsumerState<AgentLeadFormScreen> createState() => _AgentLeadFormScreenState();
}

class _AgentLeadFormScreenState extends ConsumerState<AgentLeadFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _whatsapp = TextEditingController();
  final _email = TextEditingController();
  final _country = TextEditingController();
  final _sourceDetail = TextEditingController();
  final _interest = TextEditingController();
  final _budget = TextEditingController();
  final _currency = TextEditingController(text: 'USD');
  final _note = TextEditingController();
  LeadSource _source = LeadSource.walkIn;
  DateTime? _followUp;
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _whatsapp, _email, _country, _sourceDetail, _interest, _budget, _currency, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final ccy = _currency.text.trim().toUpperCase();
    final budget = double.tryParse(_budget.text.trim().replaceAll(',', ''));
    setState(() => _saving = true);
    try {
      final lead = await ref
          .read(crmRepositoryProvider)
          .create(
            LeadInput(
              fullName: _name.text,
              phone: _phone.text,
              whatsapp: _whatsapp.text,
              email: _email.text,
              country: _country.text,
              source: _source,
              sourceDetail: _sourceDetail.text,
              interest: _interest.text,
              budgetMinor: budget == null ? null : majorToMinor(budget, ccy),
              budgetCurrency: budget == null ? null : ccy,
              nextFollowUpAt: _followUp,
              note: _note.text,
            ),
          );
      ref
        ..invalidate(leadsProvider)
        ..invalidate(leadPipelineProvider);
      if (!mounted) return;
      showInfoSnack(context, context.l10n.crmLeadAdded);
      context.pushReplacement(AgentRoutes.lead(lead.id));
    } catch (e) {
      if (mounted) _showCrmError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.crmAddLead)),
      body: Form(
        key: _form,
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            TextFormField(
              key: const ValueKey('lead-name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              maxLength: 200,
              decoration: InputDecoration(labelText: l10n.crmFormFullName, counterText: ''),
              validator: (v) => (v ?? '').trim().isEmpty ? l10n.crmFormRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('lead-phone'),
              controller: _phone,
              keyboardType: TextInputType.phone,
              maxLength: 32,
              decoration: InputDecoration(labelText: l10n.crmFormPhone, counterText: ''),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _whatsapp,
              keyboardType: TextInputType.phone,
              maxLength: 32,
              decoration: InputDecoration(labelText: l10n.crmFormWhatsapp, counterText: ''),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: l10n.crmFormEmail),
              validator: (v) {
                final s = (v ?? '').trim();
                return s.isEmpty || RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s) ? null : l10n.crmFormEmailInvalid;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _country,
              textCapitalization: TextCapitalization.characters,
              maxLength: 2,
              decoration: InputDecoration(labelText: l10n.crmFormCountry, counterText: ''),
              validator: (v) {
                final s = (v ?? '').trim();
                return s.isEmpty || RegExp(r'^[A-Za-z]{2}$').hasMatch(s) ? null : l10n.crmFormCountryInvalid;
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<LeadSource>(
              key: const ValueKey('lead-source'),
              initialValue: _source,
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.crmFormSource),
              items: [
                for (final s in LeadSource.values) DropdownMenuItem(value: s, child: Text(leadSourceLabel(l10n, s))),
              ],
              onChanged: (s) => setState(() => _source = s ?? LeadSource.other),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _sourceDetail,
              maxLength: 200,
              decoration: InputDecoration(labelText: l10n.crmFormSourceDetail, counterText: ''),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _interest,
              maxLength: 300,
              decoration: InputDecoration(
                labelText: l10n.crmFormInterest,
                helperText: l10n.crmFormInterestHelper,
                helperMaxLines: 2,
                counterText: '',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 2,
                  child: TextFormField(
                    controller: _budget,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(labelText: l10n.crmFormBudget),
                    validator: (v) {
                      final s = (v ?? '').trim();
                      if (s.isEmpty) return null;
                      final n = double.tryParse(s.replaceAll(',', ''));
                      return n == null || n < 0 ? l10n.crmFormBudgetInvalid : null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _currency,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 3,
                    decoration: InputDecoration(labelText: l10n.crmFormBudgetCurrency, counterText: ''),
                    validator: (v) {
                      if (_budget.text.trim().isEmpty) return null;
                      return RegExp(r'^[A-Za-z]{3}$').hasMatch((v ?? '').trim()) ? null : l10n.crmFormBudgetInvalid;
                    },
                  ),
                ),
              ],
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.alarm_add_outlined),
              title: Text(_followUp == null ? l10n.crmFormFollowUp : Dates.dayTime(_followUp)),
              trailing: _followUp == null
                  ? const Icon(Icons.edit_calendar_outlined)
                  : IconButton(
                      tooltip: l10n.crmClearFollowUp,
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => setState(() => _followUp = null),
                    ),
              onTap: () async {
                final at = await pickLeadDateTime(context, initial: _followUp);
                if (at != null) setState(() => _followUp = at);
              },
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _note,
              maxLines: 3,
              maxLength: 5000,
              decoration: InputDecoration(labelText: l10n.crmFormNote, counterText: ''),
            ),
            const SizedBox(height: 24),
            PrimaryButton(
              key: const ValueKey('lead-save'),
              label: l10n.crmAddLead,
              loading: _saving,
              onPressed: _saving ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ dashboard

/// Dashboard card: open leads and follow-ups due today (badge), opens the lead list.
class LeadsDashboardCard extends ConsumerWidget {
  const LeadsDashboardCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final pipeline = ref.watch(leadPipelineProvider).value;
    final due = pipeline?.followUpsDueToday ?? 0;
    return AppCard(
      key: const ValueKey('dashboard-leads-card'),
      margin: const EdgeInsetsDirectional.only(bottom: 16),
      onTap: () => context.push(due > 0 ? AgentRoutes.leadsFor(followUp: 'due') : AgentRoutes.leads),
      child: Row(
        children: [
          Badge(
            isLabelVisible: due > 0,
            label: Text(due > 99 ? '99+' : '$due'),
            child: const Icon(Icons.contact_phone_outlined, color: AppColors.violet, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.crmLeadsTitle, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  pipeline == null
                      ? l10n.crmDashboardHint
                      : [l10n.crmPipelineOpen(pipeline.open), l10n.crmFollowUpsDueToday(due)].join(' · '),
                  style: context.text.bodySmall?.copyWith(
                    color: due > 0 ? AppColors.warning : context.palette.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: l10n.crmAddLead,
            onPressed: () => context.push(AgentRoutes.newLead),
            icon: const Icon(Icons.person_add_alt_rounded),
          ),
        ],
      ),
    );
  }
}
