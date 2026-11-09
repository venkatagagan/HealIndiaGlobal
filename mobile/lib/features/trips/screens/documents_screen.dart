import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../documents_ai/widgets/report_ai_entry.dart';
import '../services/file_actions.dart';

/// Upload / list documents (optionally for one case and/or kind). Files are opened and downloaded
/// through the authorized `/documents/{id}/download` endpoint.
///
/// Route: `/documents?case=&kind=` · Owner: fl-journey.
class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key, this.caseId, this.kind});

  final String? caseId;

  final DocumentKind? kind;

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  late DocumentKind? _kind = widget.kind;
  double? _progress;
  String? _uploadingName;

  DocumentQuery get _query => (caseId: widget.caseId, kind: _kind);

  @override
  Widget build(BuildContext context) {
    final docs = ref.watch(documentsProvider(_query));
    final uploading = _progress != null;
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.documentsTitle),
        centerTitle: true,
        // documents_ai entry point (PLAN §7.1): scan a report + AI readings → /reports/analysis/:id
        actions: [
          ReportAiEntryButton(caseId: widget.caseId, onUploaded: () => ref.invalidate(documentsProvider(_query))),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('upload-document'),
        backgroundColor: AppColors.violet,
        foregroundColor: Colors.white,
        onPressed: uploading ? null : _upload,
        icon: const Icon(Icons.upload_file_rounded),
        label: Text(l10n.commonUpload),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                ChipToggle(
                  label: l10n.caseFilterAll,
                  selected: _kind == null,
                  selectedColor: AppColors.violet,
                  onChanged: (_) => setState(() => _kind = null),
                ),
                for (final k in patientUploadKinds) ...[
                  const SizedBox(width: 8),
                  ChipToggle(
                    label: k.label,
                    selected: _kind == k,
                    selectedColor: AppColors.violet,
                    onChanged: (_) => setState(() => _kind = k),
                  ),
                ],
                if (_kind != null && !patientUploadKinds.contains(_kind)) ...[
                  const SizedBox(width: 8),
                  ChipToggle(label: _kind!.label, selected: true, selectedColor: AppColors.violet, onChanged: (_) {}),
                ],
              ],
            ),
          ),
          if (uploading)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.documentsUploading(_uploadingName ?? ''), style: context.text.bodySmall),
                  const SizedBox(height: 4),
                  LinearProgressIndicator(value: _progress == 0 ? null : _progress),
                ],
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(documentsProvider(_query).future),
              child: AsyncValueView<List<AppDocument>>(
                value: docs,
                onRetry: () => ref.invalidate(documentsProvider(_query)),
                data: (list) {
                  if (list.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 40),
                        EmptyView(
                          icon: Icons.folder_open_rounded,
                          title: l10n.documentsEmptyTitle,
                          message: l10n.documentsEmptyBody,
                          actionLabel: l10n.documentsUploadADocument,
                          onAction: uploading ? null : _upload,
                        ),
                      ],
                    );
                  }
                  final sorted = [...list]
                    ..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Icon(Icons.lock_outline_rounded, size: 14, color: context.palette.textSecondary),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                l10n.documentsSharedNote,
                                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                              ),
                            ),
                          ],
                        ),
                      ),
                      for (final d in sorted) _DocumentTile(doc: d, onDelete: () => _delete(d)),
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

  Future<void> _upload() async {
    final kind = await pickDocumentKind(context, initial: _kind);
    if (kind == null || !mounted) return;
    try {
      final file = await pickDocumentFile();
      if (file == null) return;
      setState(() {
        _progress = 0;
        _uploadingName = file.name;
      });
      await ref
          .read(documentRepositoryProvider)
          .upload(
            fileName: file.name,
            kind: kind,
            bytes: file.bytes,
            caseId: widget.caseId,
            onProgress: (sent, total) {
              if (mounted && total > 0) setState(() => _progress = sent / total);
            },
          );
      ref.invalidate(documentsProvider);
      if (widget.caseId != null) ref.invalidate(caseDetailProvider(widget.caseId!));
      if (mounted) showInfoSnack(context, context.l10n.documentsUploaded(file.name));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) {
        setState(() {
          _progress = null;
          _uploadingName = null;
        });
      }
    }
  }

  Future<void> _delete(AppDocument d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.documentsDeleteTitle),
        content: Text(ctx.l10n.documentsDeleteBody(d.fileName)),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.l10n.documentsKeep)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.dangerStrong, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(ctx.l10n.commonDelete),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(documentRepositoryProvider).delete(d.id);
      ref.invalidate(documentsProvider);
      if (widget.caseId != null) ref.invalidate(caseDetailProvider(widget.caseId!));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }
}

enum _DocAction { open, download, delete }

class _DocumentTile extends ConsumerWidget {
  const _DocumentTile({required this.doc, required this.onDelete});

  final AppDocument doc;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(documentRepositoryProvider);
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      onTap: () => openDocument(context, repo, doc),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: CircleAvatar(
          backgroundColor: AppColors.violetSoft,
          child: Icon(documentKindIcon(doc.kind), color: AppColors.violet),
        ),
        title: Text(doc.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          [doc.kind.label, doc.sizeLabel, if (doc.createdAt != null) Dates.day(doc.createdAt)].join(' · '),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            StatusBadge.forEnum(doc.status, dense: true),
            PopupMenuButton<_DocAction>(
              tooltip: context.l10n.documentsActionsTooltip,
              onSelected: (a) => switch (a) {
                _DocAction.open => openDocument(context, repo, doc),
                _DocAction.download => downloadDocument(context, repo, doc),
                _DocAction.delete => Future.sync(onDelete),
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: _DocAction.open, child: Text(context.l10n.commonOpen)),
                PopupMenuItem(value: _DocAction.download, child: Text(context.l10n.commonDownload)),
                if (doc.status != DocumentStatus.verified)
                  PopupMenuItem(value: _DocAction.delete, child: Text(context.l10n.commonDelete)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
