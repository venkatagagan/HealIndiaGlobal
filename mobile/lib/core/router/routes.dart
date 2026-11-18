import '../models/enums.dart';

/// Route paths (PLAN §11) and builders for parameterized locations.
///
/// Navigate with `context.go(Routes.home)` / `context.push(Routes.hospital(id))`.
/// Pass **ids in the path and filters in the query**; avoid `extra` so deep links and web reloads
/// keep working.
abstract final class Routes {
  static const splash = '/splash';
  static const onboarding = '/onboarding';

  // auth
  static const auth = '/auth';
  static const login = '/auth/login';
  static const register = '/auth/register';
  static const forgotPassword = '/auth/forgot';

  // tabs
  static const home = '/home';
  static const search = '/search';
  static const trips = '/trips';
  static const messages = '/messages';
  static const profile = '/profile';

  // profile sub-pages (full screen)
  static const profileEdit = '/profile/edit';
  static const companions = '/profile/companions';
  static const saved = '/profile/saved';

  // screening & matches
  static const screeningNew = '/screening/new';
  static const compare = '/compare';
  static const costComparison = '/cost-comparison';

  // journey
  static const support = '/support';
  static const notifications = '/notifications';
  static const cases = '/cases';
  static const documents = '/documents';

  // document intelligence & voice intake (PLAN §7.1 / §7.2)
  static const reportCapture = '/reports/capture';
  static const voiceIntake = '/voice/intake';

  // phase 1: quick quotes, reviews, aftercare, visa guide, guest intro call
  static const quickQuoteNew = '/quote/new';
  static const myReviews = '/reviews';
  static const writeReviewPath = '/reviews/write';
  static const aftercare = '/aftercare';
  static const visaGuidePath = '/visa-guide';
  static const freeConsultation = '/free-consultation';
  static const freeConsultationStatus = '/free-consultation/status';

  // insurance & pay-later partners (CG-18)
  static const insurance = '/insurance';

  /// `/procedures/:slug/earliest` — hospitals offering a procedure, earliest date first.
  static String procedureEarliest(String slug) => '/procedures/${Uri.encodeComponent(slug)}/earliest';

  /// `/quote/new?hospitals=<id1>,<id2>&procedure=<slug>&procedure_id=&doctor=&specialty=&screening=`
  static String quickQuote({
    required List<String> hospitalIds,
    String? procedureSlug,
    String? procedureId,
    String? doctorId,
    String? specialtyId,
    String? screeningId,
  }) => _q(quickQuoteNew, {
    'hospitals': hospitalIds.join(','),
    'procedure': procedureSlug,
    'procedure_id': procedureId,
    'doctor': doctorId,
    'specialty': specialtyId,
    'screening': screeningId,
  });

  /// `/quotes/:groupId` — every hospital's quote side by side.
  static String quoteGroup(String groupId) => '/quotes/$groupId';

  /// `/reviews/write?booking=<id>` — rate the hospital of a completed booking.
  static String writeReview(String bookingId) => _q(writeReviewPath, {'booking': bookingId});

  /// `/insurance?tab=insurance|pay_later|requests&case=<id>&booking=<id>` — partner insurance, pay-later
  /// partners and the patient's requests; [caseId] / [bookingId] link a request to the booking flow.
  static String insuranceFor({String? tab, String? caseId, String? bookingId}) =>
      _q(insurance, {'tab': tab, 'case': caseId, 'booking': bookingId});

  /// `/visa-guide?nationality=XX`
  static String visaGuide({String? nationality}) => _q(visaGuidePath, {'nationality': nationality});

  // role shells (PLAN §3.1: one public door, routed by role after sign-in)
  /// Agent / facilitator shell root (`features/agent_portal`).
  static const agentHome = '/agent';

  /// Hospital user shell root (`features/hospital_portal`). Not to be confused with `/hospitals/:id`.
  static const hospitalHome = '/hospital';

  /// Landing location of a signed-in role: patient `/home`, agent `/agent`, hospital `/hospital`.
  /// Staff roles never sign in on mobile; they fall back to the auth screen.
  static String homeFor(UserRole role) => switch (role) {
    UserRole.patient => home,
    UserRole.agent => agentHome,
    UserRole.hospital => hospitalHome,
    _ => auth,
  };

  /// Whether [path] is inside [root] (`/agent`, `/agent/...`), without matching `/agents` or `/hospitals`.
  static bool isWithin(String path, String root) => path == root || path.startsWith('$root/');

  /// `/auth/login?from=/book/123` — return to [from] after signing in.
  static String loginFrom(String from) => _q(login, {'from': from});

  /// `/auth/register?from=...` — also used for guest upgrade.
  static String registerFrom(String from) => _q(register, {'from': from});

  /// `/hospitals/:id` (slug or id).
  static String hospital(String slugOrId) => '/hospitals/${Uri.encodeComponent(slugOrId)}';

  /// `/doctors/:id`
  static String doctor(String id) => '/doctors/${Uri.encodeComponent(id)}';

  /// `/search?q=&specialty=`
  static String searchFor({String? q, String? specialty}) => _q(search, {'q': q, 'specialty': specialty});

  /// `/screening/new?specialty=<slug>`
  static String screeningStart({String? specialty}) => _q(screeningNew, {'specialty': specialty});

  /// `/screening/:id/step/:step` (step 1..4).
  static String screeningStep(String screeningId, int step) => '/screening/$screeningId/step/$step';

  /// `/screening/:id/processing`
  static String screeningProcessing(String screeningId) => '/screening/$screeningId/processing';

  /// `/screening/:id/matches`
  static String matches(String screeningId) => '/screening/$screeningId/matches';

  /// `/compare?screening=<id>&matches=<id1>,<id2>,<id3>`
  static String compareMatches({required String screeningId, required List<String> matchIds}) =>
      _q(compare, {'screening': screeningId, 'matches': matchIds.join(',')});

  /// `/cost-comparison?procedure=<slug>&country=US&currency=USD&screening=<id>&match=<id>`
  static String costComparisonFor({
    String? procedure,
    String? country,
    String? currency,
    String? screeningId,
    String? matchId,
  }) => _q(costComparison, {
    'procedure': procedure,
    'country': country,
    'currency': currency,
    'screening': screeningId,
    'match': matchId,
  });

  /// `/book/:caseId?quote=<id>&package=<id>`
  static String book(String caseId, {String? quoteId, String? packageId}) =>
      _q('/book/$caseId', {'quote': quoteId, 'package': packageId});

  /// `/pay/:bookingId?installment=<id>`
  static String pay(String bookingId, {String? installmentId}) => _q('/pay/$bookingId', {'installment': installmentId});

  /// `/messages/:id`
  static String chat(String conversationId) => '$messages/$conversationId';

  /// `/cases/:id`
  static String caseDetail(String caseId) => '$cases/$caseId';

  /// `/documents?case=<id>&kind=<DocumentKind>`
  static String documentsFor({String? caseId, DocumentKind? kind}) =>
      _q(documents, {'case': caseId, 'kind': kind?.json});

  /// `/reports/capture?caseId=&screeningId=&kind=` — photo / PDF capture + AI reading + review.
  static String reportCaptureFor({String? caseId, String? screeningId, DocumentKind? kind}) =>
      _q(reportCapture, {'caseId': caseId, 'screeningId': screeningId, 'kind': kind?.json});

  /// `/reports/analysis/:id`
  static String reportAnalysis(String analysisId) => '/reports/analysis/$analysisId';

  /// `/voice/intake?screeningId=`
  static String voiceIntakeFor({String? screeningId}) => _q(voiceIntake, {'screeningId': screeningId});

  static String _q(String path, Map<String, String?> params) {
    final clean = {
      for (final e in params.entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    if (clean.isEmpty) return path;
    return Uri(path: path, queryParameters: clean).toString();
  }
}

/// Route names for `context.goNamed(...)`.
abstract final class RouteNames {
  static const splash = 'splash';
  static const onboarding = 'onboarding';
  static const auth = 'auth';
  static const login = 'login';
  static const register = 'register';
  static const forgotPassword = 'forgot-password';
  static const home = 'home';
  static const search = 'search';
  static const hospital = 'hospital';
  static const doctor = 'doctor';
  static const trips = 'trips';
  static const messages = 'messages';
  static const chat = 'chat';
  static const profile = 'profile';
  static const profileEdit = 'profile-edit';
  static const companions = 'companions';
  static const saved = 'saved';
  static const screeningNew = 'screening-new';
  static const screeningStep = 'screening-step';
  static const screeningProcessing = 'screening-processing';
  static const matches = 'matches';
  static const compare = 'compare';
  static const costComparison = 'cost-comparison';
  static const book = 'book';
  static const pay = 'pay';
  static const support = 'support';
  static const notifications = 'notifications';
  static const cases = 'cases';
  static const caseDetail = 'case-detail';
  static const documents = 'documents';
  static const agentHome = 'agent-home';
  static const hospitalHome = 'hospital-home';
  static const reportCapture = 'report-capture';
  static const reportAnalysis = 'report-analysis';
  static const voiceIntake = 'voice-intake';
  static const procedureEarliest = 'procedure-earliest';
  static const quickQuote = 'quick-quote';
  static const quoteGroup = 'quote-group';
  static const myReviews = 'my-reviews';
  static const writeReview = 'write-review';
  static const aftercare = 'aftercare';
  static const visaGuide = 'visa-guide';
  static const freeConsultation = 'free-consultation';
  static const freeConsultationStatus = 'free-consultation-status';
  static const insurance = 'insurance';
}
