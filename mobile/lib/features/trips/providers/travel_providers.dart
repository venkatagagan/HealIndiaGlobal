import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';

/// Accommodation providers linked to a hospital (`GET /accommodations?hospital_id=`).
final accommodationOptionsProvider = FutureProvider.autoDispose.family<List<AccommodationProvider>, String?>(
  (ref, hospitalId) => ref.watch(catalogRepositoryProvider).accommodations(hospitalId: hospitalId),
);

/// Local service providers (`GET /service-providers?kind=&city=`).
typedef ServiceProviderQuery = ({ServiceKind kind, String? city});

final serviceProviderOptionsProvider = FutureProvider.autoDispose
    .family<List<LocalServiceProvider>, ServiceProviderQuery>(
      (ref, q) => ref.watch(catalogRepositoryProvider).serviceProviders(kind: q.kind, city: q.city),
    );
