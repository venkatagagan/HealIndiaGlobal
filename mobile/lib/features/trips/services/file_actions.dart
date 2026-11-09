import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// A file chosen by the user, read into memory (works on web and mobile).
class PickedFile {
  const PickedFile({required this.name, required this.bytes});

  final String name;
  final Uint8List bytes;
}

/// Lets the user choose one PDF / image / DICOM file (max [DocumentRepository.maxUploadBytes]).
/// Returns null when cancelled. Throws [ApiException] for files that are too large.
Future<PickedFile?> pickDocumentFile() async {
  final files = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: DocumentRepository.allowedExtensions,
  );
  if (files.isEmpty) return null;
  final file = files.first;
  final size = await file.length();
  if (size != null && size > DocumentRepository.maxUploadBytes) {
    throw ApiException(statusCode: 0, code: 'validation_error', message: L10n.current.documentsFileTooLarge);
  }
  final bytes = await file.readAsBytes();
  if (bytes.length > DocumentRepository.maxUploadBytes) {
    throw ApiException(statusCode: 0, code: 'validation_error', message: L10n.current.documentsFileTooLarge);
  }
  return PickedFile(name: file.name, bytes: bytes);
}

/// Saves [bytes] through the platform "save as" flow (browser download on web).
/// Returns false when the user cancelled.
Future<bool> saveBytes({required String fileName, required Uint8List bytes, String? mimeType}) async {
  final uri = await FilePicker.saveFile(
    fileName: fileName,
    bytes: bytes,
    mimeType: mimeType ?? 'application/octet-stream',
  );
  return uri != null;
}

/// Downloads a document through the authorized endpoint and saves it.
Future<void> downloadDocument(BuildContext context, DocumentRepository repo, AppDocument doc) async {
  try {
    final bytes = await repo.download(doc.id);
    final saved = await saveBytes(fileName: doc.fileName, bytes: bytes, mimeType: doc.contentType);
    if (saved && context.mounted) showInfoSnack(context, context.l10n.documentsSaved(doc.fileName));
  } catch (e) {
    if (context.mounted) showErrorSnack(context, e);
  }
}

/// Opens a document: images are previewed in-app; other files are saved and then opened with the
/// system viewer when the platform allows it.
Future<void> openDocument(BuildContext context, DocumentRepository repo, AppDocument doc) async {
  try {
    final bytes = await repo.download(doc.id);
    if (!context.mounted) return;
    if (doc.isImage) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(doc.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: IconButton(
                  tooltip: ctx.l10n.commonClose,
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(ctx).pop(),
                ),
              ),
              Flexible(
                child: InteractiveViewer(
                  child: Image.memory(
                    bytes,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        Padding(padding: const EdgeInsets.all(24), child: Text(ctx.l10n.documentsPreviewUnavailable)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      );
      return;
    }
    final uri = await FilePicker.saveFile(
      fileName: doc.fileName,
      bytes: bytes,
      mimeType: doc.contentType ?? 'application/octet-stream',
    );
    if (uri == null) return;
    if (uri.scheme == 'file' || uri.scheme == 'content') {
      final opened = await launchUrl(uri).catchError((_) => false);
      if (!opened && context.mounted) showInfoSnack(context, context.l10n.documentsSaved(doc.fileName));
    } else if (context.mounted) {
      showInfoSnack(context, context.l10n.documentsSaved(doc.fileName));
    }
  } catch (e) {
    if (context.mounted) showErrorSnack(context, e);
  }
}

/// Icon for a document kind.
IconData documentKindIcon(DocumentKind kind) => switch (kind) {
  DocumentKind.passport || DocumentKind.visa => Icons.badge_outlined,
  DocumentKind.medicalReport || DocumentKind.labResult => Icons.monitor_heart_outlined,
  DocumentKind.prescription => Icons.medication_outlined,
  DocumentKind.imaging => Icons.image_search_outlined,
  DocumentKind.invitationLetter => Icons.mark_email_read_outlined,
  DocumentKind.invoice || DocumentKind.receipt || DocumentKind.paymentProof => Icons.receipt_long_outlined,
  _ => Icons.description_outlined,
};

/// Kinds a patient uploads from the app.
const List<DocumentKind> patientUploadKinds = [
  DocumentKind.passport,
  DocumentKind.visa,
  DocumentKind.medicalReport,
  DocumentKind.labResult,
  DocumentKind.imaging,
  DocumentKind.prescription,
  DocumentKind.paymentProof,
  DocumentKind.other,
];

/// Bottom sheet to choose a [DocumentKind] for an upload.
Future<DocumentKind?> pickDocumentKind(BuildContext context, {DocumentKind? initial}) {
  return showModalBottomSheet<DocumentKind>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(ctx.l10n.documentsWhatAreYouUploading, style: ctx.text.titleMedium),
          ),
          for (final k in patientUploadKinds)
            ListTile(
              leading: Icon(documentKindIcon(k), color: AppColors.violet),
              title: Text(k.label),
              trailing: k == initial ? const Icon(Icons.check_rounded, color: AppColors.primary) : null,
              onTap: () => Navigator.of(ctx).pop(k),
            ),
        ],
      ),
    ),
  );
}
