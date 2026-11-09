import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../auth/auth_controller.dart';
import '../auth/token_storage.dart';
import '../config/env.dart';
import '../models/json.dart';
import 'api_client.dart';

/// Server event `{"type": "...", "data": {...}}` from `WS /ws?token=<access>` (PLAN §8.9).
class RealtimeEvent {
  const RealtimeEvent(this.type, this.data);

  final String type;
  final JsonMap data;

  @override
  String toString() => 'RealtimeEvent($type)';
}

/// Known server event types.
abstract final class RealtimeEvents {
  static const messageCreated = 'message.created';
  static const notificationCreated = 'notification.created';
  static const screeningCompleted = 'screening.completed';
  static const bookingUpdated = 'booking.updated';
  static const caseUpdated = 'case.updated';
}

enum RealtimeStatus { disconnected, connecting, connected }

/// Maintains one WebSocket connection while a session exists, with exponential-backoff reconnects.
/// Events are exposed as a broadcast stream ([events], [on]).
class RealtimeService {
  RealtimeService({
    required this._tokens,
    required this._refreshToken,
    String? url,
    WebSocketChannel Function(Uri uri)? connector,
  }) : _url = url ?? Env.wsUrl,
       _connector = connector ?? WebSocketChannel.connect;

  final TokenStorage _tokens;
  final Future<String?> Function() _refreshToken;
  final String _url;
  final WebSocketChannel Function(Uri uri) _connector;

  final StreamController<RealtimeEvent> _events = StreamController<RealtimeEvent>.broadcast();
  final ValueNotifier<RealtimeStatus> status = ValueNotifier(RealtimeStatus.disconnected);

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _reconnectTimer;
  bool _running = false;
  bool _disposed = false;
  int _attempt = 0;
  final Random _random = Random();

  /// All server events.
  Stream<RealtimeEvent> get events => _events.stream;

  /// Events of one [type] (see [RealtimeEvents]).
  Stream<RealtimeEvent> on(String type) => events.where((e) => e.type == type);

  bool get isRunning => _running;

  /// Starts (or keeps) the connection. Safe to call repeatedly.
  void start() {
    if (_disposed || _running) return;
    _running = true;
    _attempt = 0;
    unawaited(_connect());
  }

  /// Closes the connection and stops reconnecting.
  void stop() {
    _running = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _closeChannel();
    status.value = RealtimeStatus.disconnected;
  }

  /// Forces a reconnect (e.g. after the access token was rotated).
  void reconnect() {
    if (!_running) return;
    _closeChannel();
    _attempt = 0;
    unawaited(_connect());
  }

  void dispose() {
    stop();
    _disposed = true;
    unawaited(_events.close());
    status.dispose();
  }

  Future<void> _connect() async {
    if (!_running || _disposed) return;
    await _tokens.load();
    final token = _tokens.accessToken;
    if (token == null || token.isEmpty) {
      stop();
      return;
    }
    status.value = RealtimeStatus.connecting;
    final base = Uri.parse(_url);
    final uri = base.replace(queryParameters: {...base.queryParameters, 'token': token});
    try {
      final channel = _connector(uri);
      _channel = channel;
      await channel.ready.timeout(const Duration(seconds: 15));
      if (!_running || !identical(_channel, channel)) {
        unawaited(channel.sink.close());
        return;
      }
      status.value = RealtimeStatus.connected;
      _attempt = 0;
      _sub = channel.stream.listen(
        _onData,
        onError: (Object _) => _onClosed(channel),
        onDone: () => _onClosed(channel),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _onData(dynamic raw) {
    if (raw is! String) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        final m = asJsonMap(decoded);
        final type = m['type'];
        if (type is String && type.isNotEmpty) {
          _events.add(RealtimeEvent(type, asJsonMap(m['data'])));
        }
      }
    } on FormatException {
      // Ignore non-JSON frames (e.g. keep-alives).
    }
  }

  Future<void> _onClosed(WebSocketChannel channel) async {
    if (!identical(_channel, channel)) return;
    final code = channel.closeCode;
    _closeChannel();
    if (!_running) return;
    status.value = RealtimeStatus.disconnected;
    // Auth failures (policy violation / custom 4401/4403): refresh the token once, then retry.
    if (code == 1008 || code == 4401 || code == 4403 || code == 4001) {
      try {
        final fresh = await _refreshToken();
        if (fresh == null) {
          stop();
          return;
        }
      } catch (_) {
        // Network issue: fall through to the backoff.
      }
    }
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (!_running || _disposed) return;
    status.value = RealtimeStatus.disconnected;
    _reconnectTimer?.cancel();
    final seconds = min(30, 1 << min(_attempt, 5));
    _attempt++;
    final jitterMs = _random.nextInt(1000);
    _reconnectTimer = Timer(Duration(seconds: seconds, milliseconds: jitterMs), () => unawaited(_connect()));
  }

  void _closeChannel() {
    unawaited(_sub?.cancel());
    _sub = null;
    final ch = _channel;
    _channel = null;
    if (ch != null) unawaited(ch.sink.close());
  }
}

/// App-wide realtime connection. Starts automatically while a session (guest or full) exists.
final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final api = ref.watch(apiClientProvider);
  final service = RealtimeService(tokens: ref.watch(tokenStorageProvider), refreshToken: api.refreshAccessToken);
  ref.listen<AuthState>(authStateProvider, (prev, next) {
    if (next.hasSession) {
      if (prev?.user?.id != next.user?.id && service.isRunning) {
        service.reconnect();
      } else {
        service.start();
      }
    } else if (next.isKnown) {
      service.stop();
    }
  }, fireImmediately: true);
  final sub = api.sessionRefreshed.listen((_) => service.reconnect());
  ref.onDispose(() {
    unawaited(sub.cancel());
    service.dispose();
  });
  return service;
});

/// Stream of all realtime events, e.g.
/// `ref.listen(realtimeEventsProvider, (_, next) => next.whenData((e) { ... }))`.
final realtimeEventsProvider = StreamProvider<RealtimeEvent>((ref) => ref.watch(realtimeServiceProvider).events);
