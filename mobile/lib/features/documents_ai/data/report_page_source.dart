import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

/// One captured page of a paper report (photo) or a whole PDF.
class ReportPage {
  ReportPage({required this.name, this.path, this.bytes, this.thumbnail}) : id = _nextId++;

  static int _nextId = 0;

  /// Stable local id (for list keys while reordering).
  final int id;
  final String name;

  /// File path on Android / iOS / desktop.
  final String? path;

  /// File bytes (web, or when no path is available).
  final Uint8List? bytes;

  /// Image bytes for the thumbnail (photos only).
  final Uint8List? thumbnail;

  String get extension => name.contains('.') ? name.split('.').last.toLowerCase() : '';
  bool get isPdf => extension == 'pdf';
}

/// Where report pages come from. Overridable in tests via [reportPageSourceProvider].
abstract class ReportPageSource {
  /// Camera photo of one page (null when cancelled).
  Future<ReportPage?> takePhoto();

  /// One or more photos from the gallery (empty when cancelled).
  Future<List<ReportPage>> pickPhotos({int? limit});

  /// A PDF report (null when cancelled).
  Future<ReportPage?> pickPdf();
}

/// [ReportPageSource] backed by `image_picker` (camera / gallery) and `file_picker` (PDF).
class DeviceReportPageSource implements ReportPageSource {
  DeviceReportPageSource({ImagePicker? imagePicker}) : _images = imagePicker ?? ImagePicker();

  final ImagePicker _images;

  /// Readable photos at a sane upload size; the server downscales further (≤ 1568 px).
  static const double maxWidth = 2400;
  static const int imageQuality = 85;

  Future<ReportPage> _fromXFile(XFile f) async {
    final bytes = await f.readAsBytes();
    final name = f.name.isNotEmpty ? f.name : 'page_${DateTime.now().millisecondsSinceEpoch}.jpg';
    return ReportPage(name: name, path: kIsWeb ? null : f.path, bytes: kIsWeb ? bytes : null, thumbnail: bytes);
  }

  @override
  Future<ReportPage?> takePhoto() async {
    final f = await _images.pickImage(
      source: ImageSource.camera,
      maxWidth: maxWidth,
      imageQuality: imageQuality,
      preferredCameraDevice: CameraDevice.rear,
      requestFullMetadata: false,
    );
    return f == null ? null : _fromXFile(f);
  }

  @override
  Future<List<ReportPage>> pickPhotos({int? limit}) async {
    final files = await _images.pickMultiImage(
      maxWidth: maxWidth,
      imageQuality: imageQuality,
      limit: limit != null && limit >= 2 ? limit : null,
      requestFullMetadata: false,
    );
    final pages = <ReportPage>[];
    for (final f in files) {
      pages.add(await _fromXFile(f));
    }
    return limit == null ? pages : pages.take(limit).toList();
  }

  @override
  Future<ReportPage?> pickPdf() async {
    final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf']);
    if (f == null) return null;
    final path = f.path;
    return ReportPage(name: f.name, path: path, bytes: path == null ? await f.readAsBytes() : null);
  }
}

final reportPageSourceProvider = Provider<ReportPageSource>((ref) => DeviceReportPageSource());
