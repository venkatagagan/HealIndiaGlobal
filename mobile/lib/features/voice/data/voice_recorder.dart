import 'dart:async';
import 'dart:io' show Directory, File;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:record/record.dart';

/// A finished recording ready for upload.
class VoiceClip {
  const VoiceClip({required this.fileName, required this.contentType, this.path, this.bytes, required this.duration});

  final String fileName;
  final String contentType;
  final String? path;
  final Uint8List? bytes;
  final Duration duration;
}

/// Microphone recording (overridable in tests through [voiceRecorderProvider]).
abstract class VoiceRecorder {
  /// Asks for / checks microphone permission.
  Future<bool> hasPermission();

  Future<void> start();

  /// Stops and returns the clip (null when nothing was recorded).
  Future<VoiceClip?> stop();

  Future<void> cancel();

  /// Input level 0..1, sampled every ~100 ms while recording.
  Stream<double> levels();

  Future<void> dispose();
}

/// [VoiceRecorder] using the `record` plugin: AAC-LC `.m4a`, mono, 16 kHz on Android / iOS
/// (Whisper's native rate), Opus `.webm` in the browser.
class RecordVoiceRecorder implements VoiceRecorder {
  final AudioRecorder _rec = AudioRecorder();
  final Stopwatch _clock = Stopwatch();
  String? _path;

  static const _mobile = RecordConfig(encoder: AudioEncoder.aacLc, sampleRate: 16000, numChannels: 1, bitRate: 48000);
  static const _web = RecordConfig(encoder: AudioEncoder.opus, numChannels: 1, bitRate: 48000);

  @override
  Future<bool> hasPermission() => _rec.hasPermission();

  @override
  Future<void> start() async {
    await _deleteTemp(); // re-record: drop the previous take
    final name = 'voice_${DateTime.now().millisecondsSinceEpoch}.${kIsWeb ? 'webm' : 'm4a'}';
    _path = kIsWeb ? name : '${Directory.systemTemp.path}/$name';
    await _rec.start(kIsWeb ? _web : _mobile, path: _path!);
    _clock
      ..reset()
      ..start();
  }

  @override
  Future<VoiceClip?> stop() async {
    _clock.stop();
    final out = await _rec.stop();
    if (out == null) return null;
    final duration = _clock.elapsed;
    if (kIsWeb) {
      // `out` is a blob: URL in the browser.
      final bytes = await XFile(out).readAsBytes();
      return VoiceClip(fileName: 'voice.webm', contentType: 'audio/webm', bytes: bytes, duration: duration);
    }
    return VoiceClip(fileName: 'voice.m4a', contentType: 'audio/mp4', path: out, duration: duration);
  }

  @override
  Future<void> cancel() async {
    _clock.stop();
    await _rec.cancel();
  }

  @override
  Stream<double> levels() => _rec.onAmplitudeChanged(const Duration(milliseconds: 100)).map((a) {
    // dBFS (-160..0) → 0..1 with a -50 dB floor.
    final db = a.current.isFinite ? a.current : -160.0;
    return ((db + 50) / 50).clamp(0.0, 1.0);
  });

  @override
  Future<void> dispose() async {
    await _rec.dispose();
    await _deleteTemp();
  }

  Future<void> _deleteTemp() async {
    final p = _path;
    _path = null;
    if (kIsWeb || p == null) return;
    try {
      final f = File(p);
      if (f.existsSync()) await f.delete();
    } catch (_) {
      // temp file cleanup is best-effort
    }
  }
}

/// A fresh recorder per voice screen (disposed by the screen).
final voiceRecorderProvider = Provider<VoiceRecorder Function()>((ref) => RecordVoiceRecorder.new);
