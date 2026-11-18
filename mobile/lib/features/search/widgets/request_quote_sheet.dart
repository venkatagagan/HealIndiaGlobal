import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/router/routes.dart';

/// Opens the quick-quote flow for up to three hospitals (`/quote/new`). Guests and signed-out users are
/// sent to registration first (cases need a full account) and come back here afterwards.
Future<void> openQuickQuote(
  BuildContext context,
  WidgetRef ref, {
  required List<String> hospitalIds,
  String? procedureSlug,
  String? procedureId,
  String? doctorId,
  String? specialtyId,
  String? screeningId,
}) async {
  final target = Routes.quickQuote(
    hospitalIds: hospitalIds,
    procedureSlug: procedureSlug,
    procedureId: procedureId,
    doctorId: doctorId,
    specialtyId: specialtyId,
    screeningId: screeningId,
  );
  final auth = ref.read(authStateProvider);
  if (!auth.isAuthenticated) {
    await context.push(Routes.registerFrom(target));
    return;
  }
  await context.push(target);
}

/// "Request quote" on a hospital / doctor page: the quick-quote flow with this hospital preselected
/// (more hospitals can be added there).
Future<void> requestQuote(
  BuildContext context,
  WidgetRef ref, {
  required String hospitalId,
  required String hospitalName,
  String? doctorId,
  String? doctorName,
  String? specialtyId,
  List<HospitalProcedure> procedures = const [],
}) => openQuickQuote(context, ref, hospitalIds: [hospitalId], doctorId: doctorId, specialtyId: specialtyId);
