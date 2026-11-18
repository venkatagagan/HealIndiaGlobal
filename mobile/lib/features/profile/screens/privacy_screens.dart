import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/privacy_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Status colour of a data-rights request.
Color _statusColor(DataRightsRequestStatus s) => switch (s) {
  DataRightsRequestStatus.completed => AppColors.primary,
  DataRightsRequestStatus.rejected => AppColors.danger,
  DataRightsRequestStatus.awaitingRequester => AppColors.warning,
  _ => AppColors.info,
};

// ------------------------------------------------------------------------------------ requests

/// The signed-in user's data-rights requests and grievances (`GET /privacy/requests`), with "New request".
class DataRightsRequestsScreen extends ConsumerWidget {
  const DataRightsRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.privacyRequestsTitle)),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('privacy-request-new'),
        icon: const Icon(Icons.add_rounded),
        label: Text(l10n.privacyRequestNew),
        onPressed: () =>
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const DataRightsRequestFormScreen())),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(dataRightsRequestsProvider.future),
        child: AsyncValueView<List<DataRightsRequest>>(
          value: ref.watch(dataRightsRequestsProvider),
          onRetry: () => ref.invalidate(dataRightsRequestsProvider),
          data: (items) => items.isEmpty
              ? ListView(
                  children: [
                    const SizedBox(height: 80),
                    EmptyView(icon: Icons.policy_outlined, title: l10n.privacyRequestsEmpty),
                  ],
                )
              : ListView(
                  padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 96),
                  children: [for (final r in items) _RequestCard(request: r)],
                ),
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});

  final DataRightsRequest request;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final r = request;
    return AppCard(
      key: ValueKey('privacy-request-${r.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => Navigator.of(
        context,
      ).push(MaterialPageRoute<void>(builder: (_) => DataRightsRequestDetailScreen(requestId: r.id))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  r.kind.labelIn(l10n),
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              StatusBadge(label: r.status.labelIn(l10n), color: _statusColor(r.status), dense: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(r.reference, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (r.createdAt != null)
                Text(l10n.privacyRequestSentOn(Dates.day(r.createdAt!.toLocal())), style: context.text.bodySmall),
              if (!r.status.isClosed && r.dueAt != null)
                Text(l10n.privacyRequestDueBy(Dates.day(r.dueAt!.toLocal())), style: context.text.bodySmall),
              if (r.overdue && !r.status.isClosed)
                StatusBadge(label: l10n.privacyRequestOverdue, color: AppColors.danger, dense: true),
            ],
          ),
        ],
      ),
    );
  }
}

/// One request: what was asked, status, due date and our answer (`GET /privacy/requests/{id}`).
class DataRightsRequestDetailScreen extends ConsumerWidget {
  const DataRightsRequestDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(dataRightsRequestProvider(requestId));
    return Scaffold(
      appBar: AppBar(title: Text(value.value?.reference ?? l10n.privacyRequestsTitle)),
      body: AsyncValueView<DataRightsRequest>(
        value: value,
        onRetry: () => ref.invalidate(dataRightsRequestProvider(requestId)),
        data: (r) => ListView(
          padding: AppSpacing.pageAll,
          children: [
            Row(
              children: [
                Expanded(child: Text(r.kind.labelIn(l10n), style: context.text.titleMedium)),
                StatusBadge(label: r.status.labelIn(l10n), color: _statusColor(r.status)),
              ],
            ),
            const SizedBox(height: 8),
            if (r.createdAt != null) Text(l10n.privacyRequestSentOn(Dates.dayTime(r.createdAt!.toLocal()))),
            if (!r.status.isClosed && r.dueAt != null) Text(l10n.privacyRequestDueBy(Dates.day(r.dueAt!.toLocal()))),
            if (r.closedAt != null) Text(l10n.privacyRequestClosedOn(Dates.day(r.closedAt!.toLocal()))),
            SectionTitle(l10n.privacyRequestYourRequest),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if ((r.onBehalfOf ?? '').isNotEmpty) ...[
                    Text(
                      '${l10n.privacyRequestOnBehalfLabel}: ${r.onBehalfOf}',
                      style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                    ),
                    const SizedBox(height: 6),
                  ],
                  Text(r.details),
                ],
              ),
            ),
            SectionTitle(l10n.privacyRequestResolution),
            AppCard(
              child: Text(
                (r.resolution ?? '').isNotEmpty ? r.resolution! : l10n.privacyRequestNoAnswerYet,
                style: (r.resolution ?? '').isNotEmpty
                    ? null
                    : context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// `POST /privacy/requests`: kind, details (10+ characters), optional "on behalf of".
class DataRightsRequestFormScreen extends ConsumerStatefulWidget {
  const DataRightsRequestFormScreen({super.key, this.initialKind = DataRightsRequestKind.access});

  final DataRightsRequestKind initialKind;

  @override
  ConsumerState<DataRightsRequestFormScreen> createState() => _DataRightsRequestFormScreenState();
}

class _DataRightsRequestFormScreenState extends ConsumerState<DataRightsRequestFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _details = TextEditingController();
  final _onBehalf = TextEditingController();
  late DataRightsRequestKind _kind = widget.initialKind;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    _onBehalf.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !(_formKey.currentState?.validate() ?? false)) return;
    final l10n = context.l10n;
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.maybeOf(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final created = await ref
          .read(privacyRepositoryProvider)
          .createRequest(kind: _kind, details: _details.text.trim(), onBehalfOf: _onBehalf.text.trim());
      ref.invalidate(dataRightsRequestsProvider);
      messenger?.showSnackBar(
        SnackBar(
          content: Text(
            l10n.privacyRequestSent(
              created.reference,
              created.dueAt == null ? '' : Dates.day(created.dueAt!.toLocal()),
            ),
          ),
        ),
      );
      navigator.pop(created);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.privacyRequestNew)),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            Text(
              l10n.privacyRequestFormIntro,
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<DataRightsRequestKind>(
              key: const ValueKey('privacy-request-kind'),
              initialValue: _kind,
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.privacyRequestKindLabel),
              items: [
                for (final k in DataRightsRequestKind.values)
                  DropdownMenuItem(
                    value: k,
                    child: Text(k.labelIn(l10n), overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: _busy ? null : (v) => setState(() => _kind = v ?? _kind),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('privacy-request-details'),
              controller: _details,
              minLines: 4,
              maxLines: 8,
              maxLength: 5000,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: l10n.privacyRequestDetailsLabel,
                hintText: l10n.privacyRequestDetailsHint,
                alignLabelWithHint: true,
              ),
              validator: (v) => (v ?? '').trim().length < 10 ? l10n.privacyRequestDetailsTooShort : null,
            ),
            TextFormField(
              key: const ValueKey('privacy-request-on-behalf'),
              controller: _onBehalf,
              maxLength: 300,
              decoration: InputDecoration(
                labelText: l10n.privacyRequestOnBehalfLabel,
                hintText: l10n.privacyRequestOnBehalfHint,
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: 16),
            PrimaryButton(
              key: const ValueKey('privacy-request-submit'),
              label: l10n.privacyRequestSubmit,
              icon: Icons.send_rounded,
              loading: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------------------------- nominee

/// Nominee who may exercise the user's data rights (DPDP s.14): `GET/PUT/DELETE /privacy/nominee`.
class NomineeScreen extends ConsumerWidget {
  const NomineeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.privacyNomineeTitle)),
      body: AsyncValueView<Nominee?>(
        value: ref.watch(nomineeProvider),
        onRetry: () => ref.invalidate(nomineeProvider),
        data: (n) => _NomineeForm(key: ValueKey(n?.fullName ?? '-'), initial: n),
      ),
    );
  }
}

class _NomineeForm extends ConsumerStatefulWidget {
  const _NomineeForm({super.key, this.initial});

  final Nominee? initial;

  @override
  ConsumerState<_NomineeForm> createState() => _NomineeFormState();
}

class _NomineeFormState extends ConsumerState<_NomineeForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initial?.fullName);
  late final _relationship = TextEditingController(text: widget.initial?.relationship);
  late final _email = TextEditingController(text: widget.initial?.email);
  late final _phone = TextEditingController(text: widget.initial?.phone);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _relationship, _email, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _contactValidator(String? _) {
    if (_email.text.trim().isEmpty && _phone.text.trim().isEmpty) return context.l10n.privacyNomineeContactRequired;
    return null;
  }

  Future<void> _save() async {
    if (_busy || !(_formKey.currentState?.validate() ?? false)) return;
    final l10n = context.l10n;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(privacyRepositoryProvider)
          .setNominee(
            Nominee(
              fullName: _name.text.trim(),
              relationship: _relationship.text.trim(),
              email: _email.text.trim(),
              phone: _phone.text.trim(),
            ),
          );
      ref.invalidate(nomineeProvider);
      if (mounted) showInfoSnack(context, l10n.privacyNomineeSaved);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e is ApiException && e.isValidation ? _validationText(e) : errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _validationText(ApiException e) => e.fieldErrors.values.firstOrNull ?? e.message;

  Future<void> _remove() async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.privacyNomineeRemove),
        content: Text(l10n.privacyNomineeRemoveConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(l10n.commonCancel)),
          FilledButton(
            key: const ValueKey('nominee-remove-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.commonRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(privacyRepositoryProvider).removeNominee();
      ref.invalidate(nomineeProvider);
      if (mounted) showInfoSnack(context, l10n.privacyNomineeRemoved);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String? min2(String? v) => (v ?? '').trim().length < 2 ? l10n.privacyNomineeTooShort : null;
    return Form(
      key: _formKey,
      child: ListView(
        padding: AppSpacing.pageAll,
        children: [
          Text(l10n.privacyNomineeIntro, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
          const SizedBox(height: 16),
          TextFormField(
            key: const ValueKey('nominee-name'),
            controller: _name,
            maxLength: 200,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: l10n.privacyNomineeName),
            validator: min2,
          ),
          TextFormField(
            key: const ValueKey('nominee-relationship'),
            controller: _relationship,
            maxLength: 60,
            decoration: InputDecoration(labelText: l10n.privacyNomineeRelationship),
            validator: min2,
          ),
          TextFormField(
            key: const ValueKey('nominee-email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: l10n.privacyNomineeEmail),
            validator: _contactValidator,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('nominee-phone'),
            controller: _phone,
            keyboardType: TextInputType.phone,
            maxLength: 32,
            decoration: InputDecoration(labelText: l10n.privacyNomineePhone),
            validator: _contactValidator,
          ),
          if (_error != null) ...[
            const SizedBox(height: 4),
            Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: 16),
          PrimaryButton(
            key: const ValueKey('nominee-save'),
            label: l10n.privacyNomineeSave,
            loading: _busy,
            onPressed: _save,
          ),
          if (widget.initial != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              key: const ValueKey('nominee-remove'),
              onPressed: _busy ? null : _remove,
              icon: const Icon(Icons.person_remove_outlined, color: AppColors.danger),
              label: Text(l10n.privacyNomineeRemove, style: const TextStyle(color: AppColors.danger)),
            ),
          ],
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------------------------- contact

/// Grievance Officer and DPO contact card (`GET /site-config/privacy-contact`, public).
class PrivacyContactScreen extends ConsumerWidget {
  const PrivacyContactScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.privacyContactTitle)),
      body: AsyncValueView<PrivacyContact>(
        value: ref.watch(privacyContactProvider),
        onRetry: () => ref.invalidate(privacyContactProvider),
        data: (c) => ListView(
          padding: AppSpacing.pageAll,
          children: [
            _PersonCard(title: l10n.privacyContactGrievance, person: c.grievanceOfficer, keyPrefix: 'grievance'),
            _PersonCard(title: l10n.privacyContactDpo, person: c.dataProtectionOfficer, keyPrefix: 'dpo'),
            if ((c.postalAddress ?? '').isNotEmpty)
              AppCard(
                margin: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.privacyContactAddress,
                      style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    SelectableText(c.postalAddress!),
                  ],
                ),
              ),
            const SizedBox(height: 6),
            Text(l10n.privacyContactResponse(c.responseDays), style: context.text.bodyMedium),
            const SizedBox(height: 10),
            Text(
              l10n.privacyContactBoard,
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: Text(l10n.privacyContactBoardLink),
                onPressed: () => _open(context, Uri.parse(c.dataProtectionBoardUrl)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _open(BuildContext context, Uri uri) async {
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) showInfoSnack(context, context.l10n.catalogCouldNotOpen(uri.toString()));
}

class _PersonCard extends StatelessWidget {
  const _PersonCard({required this.title, required this.person, required this.keyPrefix});

  final String title;
  final PrivacyContactPerson person;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = person;
    return AppCard(
      key: ValueKey('privacy-contact-$keyPrefix'),
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          if (p.isEmpty)
            Text(
              l10n.privacyContactNotPublished,
              style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
            ),
          if ((p.name ?? '').isNotEmpty) Text(p.name!, style: context.text.bodyMedium),
          if ((p.email ?? '').isNotEmpty)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              leading: const Icon(Icons.email_outlined, color: AppColors.primary),
              title: Text(p.email!, textDirection: TextDirection.ltr),
              onTap: () => _open(context, Uri(scheme: 'mailto', path: p.email)),
            ),
          if ((p.phone ?? '').isNotEmpty)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              leading: const Icon(Icons.phone_outlined, color: AppColors.primary),
              title: Text(p.phone!, textDirection: TextDirection.ltr),
              onTap: () => _open(context, Uri(scheme: 'tel', path: p.phone!.replaceAll(RegExp(r'[^0-9+]'), ''))),
            ),
        ],
      ),
    );
  }
}
