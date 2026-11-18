import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/discharge_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Link validity choices (the server allows 1-30 days, default 14).
const kDischargeShareDays = [3, 7, 14, 30];

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// "Share with my doctor": the doctor's email and name, the documents to include (summary attachments and
/// the patient's own documents; the summary PDF is always included), link validity, email language and an
/// explicit consent. Shows the link once after sending. Resolves true when a link was created.
Future<bool> showDischargeShareSheet(BuildContext context, DischargeSummary summary) async {
  final created = await showModalBottomSheet<DischargeShare>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => DischargeShareSheet(summary: summary),
  );
  if (created == null || !context.mounted) return false;
  await showDialog<void>(
    context: context,
    builder: (ctx) => _ShareCreatedDialog(share: created),
  );
  return true;
}

class DischargeShareSheet extends ConsumerStatefulWidget {
  const DischargeShareSheet({super.key, required this.summary});

  final DischargeSummary summary;

  @override
  ConsumerState<DischargeShareSheet> createState() => _DischargeShareSheetState();
}

class _DischargeShareSheetState extends ConsumerState<DischargeShareSheet> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _name = TextEditingController();
  final Set<String> _documents = {};
  int _days = 14;
  String? _language;
  bool _consent = false;
  bool _consentError = false;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final valid = _form.currentState?.validate() ?? false;
    setState(() => _consentError = !_consent);
    if (!valid || !_consent) return;
    setState(() => _busy = true);
    try {
      final share = await ref
          .read(dischargeRepositoryProvider)
          .share(
            widget.summary.id,
            DischargeShareRequest(
              doctorEmail: _email.text,
              doctorName: _name.text,
              documentIds: _documents.toList(),
              expiresInDays: _days,
              language: _language ?? ref.read(localeControllerProvider).locale.languageCode,
              consent: _consent,
            ),
          );
      ref.invalidate(dischargeSharesProvider(widget.summary.id));
      if (mounted) Navigator.of(context).pop(share);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = widget.summary;
    final mine = ref.watch(documentsProvider((caseId: null, kind: null)));
    final attachmentIds = {for (final a in s.attachments) a.id, ?s.pdfDocumentId};
    final language = _language ?? ref.watch(localeControllerProvider).locale.languageCode;
    Widget docTile(String id, String title, String subtitle) => CheckboxListTile(
      key: ValueKey('discharge-share-doc-$id'),
      contentPadding: EdgeInsets.zero,
      dense: true,
      controlAffinity: ListTileControlAffinity.leading,
      value: _documents.contains(id),
      onChanged: _busy ? null : (v) => setState(() => v == true ? _documents.add(id) : _documents.remove(id)),
      title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(subtitle),
    );
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Text(l10n.dischargeShareWithDoctor, style: context.text.titleLarge),
            const SizedBox(height: 6),
            Text(l10n.dischargeShareIntro, style: context.text.bodySmall),
            const SizedBox(height: 16),
            TextFormField(
              key: const ValueKey('discharge-share-email'),
              controller: _email,
              enabled: !_busy,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: l10n.dischargeShareDoctorEmail),
              validator: (v) => _emailRe.hasMatch((v ?? '').trim()) ? null : l10n.dischargeShareDoctorEmailInvalid,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('discharge-share-name'),
              controller: _name,
              enabled: !_busy,
              textCapitalization: TextCapitalization.words,
              inputFormatters: [LengthLimitingTextInputFormatter(200)],
              decoration: InputDecoration(labelText: l10n.dischargeShareDoctorName),
            ),
            SectionTitle(l10n.dischargeShareDocuments, subtitle: l10n.dischargeShareDocumentsHint),
            if (s.attachments.isNotEmpty) ...[
              Text(l10n.dischargeShareFromHospital, style: context.text.labelLarge),
              for (final a in s.attachments) docTile(a.id, a.fileName, a.toDocument().kind.label),
            ],
            Text(l10n.dischargeShareYourDocuments, style: context.text.labelLarge),
            mine.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (e, _) => ErrorView(
                error: e,
                compact: true,
                onRetry: () => ref.invalidate(documentsProvider((caseId: null, kind: null))),
              ),
              data: (docs) {
                final own = docs.where((d) => !attachmentIds.contains(d.id)).toList();
                if (own.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Text(l10n.dischargeShareNoDocuments, style: context.text.bodySmall),
                  );
                }
                return Column(
                  children: [
                    for (final d in own)
                      docTile(d.id, d.fileName, '${d.kind.label}${l10n.commonListSeparator}${Dates.day(d.createdAt)}'),
                  ],
                );
              },
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    key: const ValueKey('discharge-share-days'),
                    initialValue: _days,
                    decoration: InputDecoration(labelText: l10n.dischargeShareValidity),
                    items: [
                      for (final d in kDischargeShareDays)
                        DropdownMenuItem(value: d, child: Text(l10n.dischargeShareDays(d))),
                    ],
                    onChanged: _busy ? null : (v) => setState(() => _days = v ?? 14),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: const ValueKey('discharge-share-language'),
                    initialValue: AppLanguage.shippedLanguages.any((l) => l.code == language) ? language : 'en',
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l10n.dischargeShareLanguage),
                    items: [
                      for (final l in AppLanguage.shippedLanguages)
                        DropdownMenuItem(
                          value: l.code,
                          child: Text(l.nativeName, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: _busy ? null : (v) => setState(() => _language = v),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            AppCard(
              padding: const EdgeInsetsDirectional.fromSTEB(4, 4, 12, 4),
              borderColor: _consentError ? AppColors.danger : null,
              child: CheckboxListTile(
                key: const ValueKey('discharge-share-consent'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _consent,
                onChanged: _busy
                    ? null
                    : (v) => setState(() {
                        _consent = v ?? false;
                        if (_consent) _consentError = false;
                      }),
                title: Text(l10n.dischargeShareConsent, style: context.text.bodySmall),
              ),
            ),
            if (_consentError)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  l10n.dischargeShareConsentRequired,
                  style: context.text.bodySmall?.copyWith(color: AppColors.danger),
                ),
              ),
            const SizedBox(height: 8),
            Text(
              l10n.dischargeConfidential,
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              key: const ValueKey('discharge-share-send'),
              label: l10n.dischargeShareSend,
              icon: Icons.send_rounded,
              loading: _busy,
              onPressed: _send,
            ),
          ],
        ),
      ),
    );
  }
}

class _ShareCreatedDialog extends StatelessWidget {
  const _ShareCreatedDialog({required this.share});

  final DischargeShare share;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final url = share.url;
    return AlertDialog(
      icon: const Icon(Icons.mark_email_read_outlined, color: AppColors.primary),
      title: Text(l10n.dischargeShareSentTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.dischargeShareSentBody(share.doctorEmailMasked, Dates.day(share.expiresAt))),
          if (url != null && url.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(l10n.dischargeShareLinkOnce, style: context.text.bodySmall),
            const SizedBox(height: 6),
            SelectableText(url, key: const ValueKey('discharge-share-url'), style: context.text.bodySmall),
          ],
        ],
      ),
      actions: [
        if (url != null && url.isNotEmpty)
          TextButton.icon(
            icon: const Icon(Icons.copy_rounded),
            label: Text(l10n.dischargeShareCopy),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: url));
              if (context.mounted) showInfoSnack(context, l10n.dischargeShareCopied);
            },
          ),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.commonDone)),
      ],
    );
  }
}
