// Shared test harness for fl-onboarding feature tests (onboarding, auth, home, search, profile).
//
// Builds a minimal go_router app around one screen (no dependency on the app router, so these tests
// compile independently of other features) with Riverpod overrides and no network.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

const guestUser = User(id: 'g1', role: UserRole.patient, status: UserStatus.active, isGuest: true);
const patientUser = User(
  id: 'p1',
  role: UserRole.patient,
  status: UserStatus.active,
  fullName: 'Amina Yusuf',
  email: 'amina@example.com',
  countryCode: 'NG',
);

/// Auth controller with a fixed initial state that records actions instead of calling the API.
class FakeAuthController extends AuthController {
  FakeAuthController(this.initial);

  final AuthState initial;
  final List<String> calls = [];
  Map<String, Object?> lastArgs = const {};

  /// When set, actions throw this instead of succeeding.
  Object? failWith;

  /// User returned by [login] (role routing tests).
  User loginUser = patientUser;

  @override
  Future<AuthState> build() async => initial;

  Future<User> _become(User user, String call, Map<String, Object?> args) async {
    calls.add(call);
    lastArgs = args;
    final f = failWith;
    if (f != null) throw f;
    state = AsyncData(AuthState.fromUser(user));
    return user;
  }

  @override
  Future<User> continueAsGuest() => _become(guestUser, 'guest', const {});

  @override
  Future<User> login({required String email, required String password, String? otpCode}) =>
      _become(loginUser, 'login', {'email': email, 'password': password, 'otp': otpCode});

  @override
  Future<User> register({
    required String email,
    required String password,
    required String fullName,
    UserRole role = UserRole.patient,
    String? phone,
    String? countryCode,
    String? referralCode,
    String? agencyName,
    String? hospitalName,
    String? city,
  }) => _become(
    role == UserRole.patient
        ? patientUser
        : User(id: 'r1', role: role, status: UserStatus.active, fullName: fullName, email: email),
    'register',
    {
      'email': email,
      'password': password,
      'full_name': fullName,
      'role': role.json,
      'referral_code': referralCode,
      'agency_name': agencyName,
      'hospital_name': hospitalName,
      'city': city,
    },
  );

  @override
  Future<User> upgradeGuest({required String email, required String password, required String fullName}) =>
      _become(patientUser, 'upgrade', {'email': email, 'password': password, 'full_name': fullName});

  @override
  Future<void> deleteAccount({String? password, String? reason, String? otpCode}) async {
    calls.add('delete');
    lastArgs = {'password': password, 'reason': reason, 'otp_code': ?otpCode};
    final f = failWith;
    if (f != null) throw f;
    state = const AsyncData(AuthState.unauthenticated());
  }

  @override
  Future<void> requestAccountDeletion({String? reason}) async {
    calls.add('deletion-request');
    lastArgs = {'reason': reason};
  }

  @override
  Future<void> logout() async {
    calls.add('logout');
    state = const AsyncData(AuthState.unauthenticated());
  }
}

/// Catalog repository stub: every list endpoint answers from the given fixtures.
class FakeCatalogRepository extends CatalogRepository {
  FakeCatalogRepository({
    this.hospitalItems = const [],
    this.doctorItems = const [],
    this.procedureItems = const [],
    this.specialtyItems = const [],
  }) : super(ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://test.invalid/api/v1'));

  final List<HospitalCard> hospitalItems;
  final List<DoctorCard> doctorItems;
  final List<Procedure> procedureItems;
  final List<Specialty> specialtyItems;
  final List<Map<String, Object?>> hospitalQueries = [];

  @override
  Future<List<Specialty>> specialties() async => specialtyItems;

  @override
  Future<Paged<HospitalCard>> hospitals({
    String? q,
    String? city,
    String? specialty,
    String? procedure,
    String? accreditation,
    String? language,
    String? sort,
    int page = 1,
    int pageSize = 20,
  }) async {
    hospitalQueries.add({'q': q, 'specialty': specialty, 'accreditation': accreditation, 'page': page});
    final items = hospitalItems
        .where((h) => q == null || q.isEmpty || h.name.toLowerCase().contains(q.toLowerCase()))
        .toList();
    return Paged(items: items, total: items.length, page: 1, pageSize: pageSize, pages: 1);
  }

  @override
  Future<Paged<DoctorCard>> doctors({
    String? q,
    String? specialty,
    String? hospitalId,
    String? language,
    Gender? gender,
    String? procedure,
    int page = 1,
    int pageSize = 20,
  }) async => Paged(items: doctorItems, total: doctorItems.length, page: 1, pageSize: pageSize, pages: 1);

  @override
  Future<List<Procedure>> procedures({String? specialty, String? q}) async => procedureItems;

  @override
  Future<SearchResults> search(String q) async =>
      SearchResults(specialties: specialtyItems.where((s) => s.name.toLowerCase().contains(q.toLowerCase())).toList());

  @override
  Future<List<AvailabilitySlot>> doctorAvailability(String doctorId, {DateTime? from, DateTime? to}) async => [];

  @override
  Future<List<AvailabilitySlot>> hospitalAvailability(
    String hospitalId, {
    DateTime? from,
    DateTime? to,
    String? doctorId,
  }) async => [];
}

/// Text shown by the placeholder for every route other than the screen under test.
String routeLabel(String location) => 'route:$location';

/// Pumps [screen] at [path] inside a GoRouter app. Other locations render `route:<uri>`.
Future<GoRouter> pumpScreen(
  WidgetTester tester, {
  required String path,
  required Widget Function(GoRouterState state) screen,
  AuthState? auth,
  FakeAuthController? authController,
  Map<String, Object> prefs = const {},
  List<Override> overrides = const [],
  String? initialLocation,
  Size logicalSize = const Size(520, 1000),
  Locale locale = const Locale('en'),
}) async {
  AppTextStyles.useGoogleFonts = false;
  // 520 x 1000 logical: phone-like height; a little wider than a phone because the test font's
  // square glyphs are much wider than Inter (core BrandHeader's fixed-height tagline would wrap).
  tester.view.devicePixelRatio = 2.5;
  tester.view.physicalSize = logicalSize * 2.5;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final controller = authController ?? FakeAuthController(auth ?? const AuthState.unauthenticated());

  Widget stub(BuildContext _, GoRouterState s) => Scaffold(body: Center(child: Text(routeLabel(s.uri.toString()))));
  final router = GoRouter(
    initialLocation: initialLocation ?? path,
    routes: [
      GoRoute(path: path, builder: (_, s) => screen(s)),
      GoRoute(path: '/:a', builder: stub),
      GoRoute(path: '/:a/:b', builder: stub),
      GoRoute(path: '/:a/:b/:c', builder: stub),
      GoRoute(path: '/:a/:b/:c/:d', builder: stub),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sp),
        tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
        authControllerProvider.overrideWith(() => controller),
        fxRatesProvider.overrideWith((ref) async => const {'USD': 83.0, 'EUR': 90.0}),
        ...overrides,
      ],
      child: MaterialApp.router(
        theme: AppTheme.dark(),
        routerConfig: router,
        locale: locale,
        supportedLocales: L10n.supportedLocales,
        localizationsDelegates: L10n.delegates(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  return router;
}
