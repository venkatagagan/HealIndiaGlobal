import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/router/app_router.dart';

const guest = User(id: 'g', role: UserRole.patient, status: UserStatus.active, isGuest: true);
const patient = User(id: 'p', role: UserRole.patient, status: UserStatus.active, fullName: 'Jane');

String? redirect(AuthState auth, String location, {bool onboarded = true}) =>
    computeRedirect(auth: auth, onboardingSeen: onboarded, uri: Uri.parse(location));

void main() {
  test('unknown auth state parks on splash and remembers the target', () {
    expect(redirect(const AuthState.unknown(), Routes.splash), isNull);
    expect(redirect(const AuthState.unknown(), '/cases/1'), '/splash?from=%2Fcases%2F1');
  });

  test('first launch goes to onboarding; signed-out users go to auth', () {
    const out = AuthState.unauthenticated();
    expect(redirect(out, Routes.splash, onboarded: false), Routes.onboarding);
    expect(redirect(out, Routes.home, onboarded: false), Routes.onboarding);
    expect(redirect(out, Routes.login, onboarded: false), isNull);
    expect(redirect(out, Routes.splash), Routes.auth);
    expect(redirect(out, Routes.home), '/auth?from=%2Fhome');
    expect(redirect(out, Routes.onboarding), isNull);
  });

  test('guests may browse and screen but not book', () {
    final g = AuthState.fromUser(guest);
    expect(redirect(g, Routes.splash), Routes.home);
    expect(redirect(g, Routes.home), isNull);
    expect(redirect(g, Routes.hospital('apollo')), isNull);
    expect(redirect(g, Routes.screeningStep('s1', 2)), isNull);
    expect(redirect(g, Routes.matches('s1')), isNull);
    expect(redirect(g, Routes.costComparisonFor(procedure: 'cabg', country: 'US')), isNull);
    expect(redirect(g, Routes.profile), isNull);
    expect(redirect(g, Routes.register), isNull);
    expect(redirect(g, Routes.trips), '/auth/register?from=%2Ftrips');
    expect(redirect(g, Routes.book('c1')), '/auth/register?from=%2Fbook%2Fc1');
    expect(redirect(g, Routes.profileEdit), startsWith('/auth/register'));
  });

  test('signed-in users skip auth screens and honour safe `from`', () {
    final p = AuthState.fromUser(patient);
    expect(redirect(p, Routes.trips), isNull);
    expect(redirect(p, Routes.splash), Routes.home);
    expect(redirect(p, '/auth/login?from=%2Fbook%2Fc1'), '/book/c1');
    expect(redirect(p, '/auth/login?from=https%3A%2F%2Fevil.example'), Routes.home);
    expect(redirect(p, '/auth/login?from=%2F%2Fevil.example'), Routes.home);
  });

  test('route builders', () {
    expect(Routes.screeningStart(specialty: 'cardiology'), '/screening/new?specialty=cardiology');
    expect(Routes.compareMatches(screeningId: 's', matchIds: ['a', 'b']), '/compare?screening=s&matches=a%2Cb');
    expect(Routes.book('c1', quoteId: 'q1'), '/book/c1?quote=q1');
    expect(Routes.documentsFor(caseId: 'c1', kind: DocumentKind.passport), '/documents?case=c1&kind=passport');
    expect(Routes.chat('cv1'), '/messages/cv1');
  });
}
