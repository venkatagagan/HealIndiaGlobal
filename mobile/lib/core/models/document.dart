import 'enums.dart';
import 'json.dart';

/// `DocumentOut` (PLAN §8.3). Named `AppDocument` to avoid clashing with other `Document` types.
class AppDocument {
  const AppDocument({
    required this.id,
    required this.kind,
    required this.fileName,
    required this.status,
    this.contentType,
    this.sizeBytes = 0,
    this.caseId,
    this.patientId,
    this.createdAt,
    this.uploadedByName,
  });

  factory AppDocument.fromJson(JsonMap j) => AppDocument(
    id: jStr(j, 'id'),
    kind: DocumentKind.fromJson(j['kind']),
    fileName: jStr(j, 'file_name'),
    contentType: jStrOrNull(j, 'content_type'),
    sizeBytes: jInt(j, 'size_bytes'),
    status: DocumentStatus.fromJson(j['status']),
    caseId: jStrOrNull(j, 'case_id'),
    patientId: jStrOrNull(j, 'patient_id'),
    createdAt: jDate(j, 'created_at'),
    uploadedByName: jStrOrNull(j, 'uploaded_by_name'),
  );

  final String id;
  final DocumentKind kind;
  final String fileName;
  final String? contentType;
  final int sizeBytes;
  final DocumentStatus status;
  final String? caseId;
  final String? patientId;
  final DateTime? createdAt;
  final String? uploadedByName;

  bool get isImage => (contentType ?? '').startsWith('image/');
  bool get isPdf => contentType == 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  /// `1.2 MB`
  String get sizeLabel {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).toStringAsFixed(0)} KB';
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind.json,
    'file_name': fileName,
    'content_type': contentType,
    'size_bytes': sizeBytes,
    'status': status.json,
    'case_id': caseId,
    'patient_id': patientId,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'uploaded_by_name': uploadedByName,
  };
}
