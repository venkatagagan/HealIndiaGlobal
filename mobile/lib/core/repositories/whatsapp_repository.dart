import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// WhatsApp updates for the signed-in user (`/me/whatsapp`): verify a number with a 6-digit code sent on
/// WhatsApp, then receive general updates there. Medical details are never sent on WhatsApp.
class WhatsAppRepository {
  WhatsAppRepository(this._api);

  final ApiClient _api;

  /// `GET /me/whatsapp`
  Future<WhatsAppStatus> status() async => WhatsAppStatus.fromJson(asJsonMap(await _api.get('/me/whatsapp')));

  /// `POST /me/whatsapp/verify {phone}` (E.164) -> `pending`; the code arrives on WhatsApp.
  Future<WhatsAppStatus> verify(String phone) async =>
      WhatsAppStatus.fromJson(asJsonMap(await _api.post('/me/whatsapp/verify', data: {'phone': phone.trim()})));

  /// `POST /me/whatsapp/confirm {code}` -> `active`.
  Future<WhatsAppStatus> confirm(String code) async =>
      WhatsAppStatus.fromJson(asJsonMap(await _api.post('/me/whatsapp/confirm', data: {'code': code.trim()})));

  /// `DELETE /me/whatsapp` -> `opted_out` (same as replying STOP).
  Future<WhatsAppStatus> optOut() async => WhatsAppStatus.fromJson(asJsonMap(await _api.delete('/me/whatsapp')));
}

final whatsAppRepositoryProvider = Provider<WhatsAppRepository>(
  (ref) => WhatsAppRepository(ref.watch(apiClientProvider)),
);

final whatsAppStatusProvider = FutureProvider.autoDispose<WhatsAppStatus>(
  (ref) => ref.watch(whatsAppRepositoryProvider).status(),
);
