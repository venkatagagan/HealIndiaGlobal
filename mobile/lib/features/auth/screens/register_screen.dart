import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/roles.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../return_path.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../profile/data/countries.dart';
import '../validators.dart';
import '../widgets/auth_widgets.dart';

/// Sign-up for the public-door roles with tabs Patient / Agent / Hospital (PLAN §3.1). Agents add
/// their agency name, hospital users the hospital name and city; the referral code is patient-only.
/// When the current session is a guest, the form is patient-only and upgrades the guest account
/// (`POST /auth/guest/upgrade`) so screenings and saved items are kept.
///
/// Route: `/auth/register?from=&role=` · Owner: fl-onboarding.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, this.from, this.initialRole});

  final String? from;

  /// Preselected tab (`?role=agent|hospital`); defaults to patient.
  final UserRole? initialRole;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _referral = TextEditingController();
  final _agency = TextEditingController();
  final _hospital = TextEditingController();
  final _city = TextEditingController();
  late UserRole _role = registrableRoles.contains(widget.initialRole) ? widget.initialRole! : UserRole.patient;
  String? _country;
  bool _acceptTerms = false;
  bool _showTermsError = false;
  bool _loading = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  String get _target => returnPathOrHome(widget.from);

  static String _roleLabel(UserRole role) => switch (role) {
    UserRole.agent => 'Agent',
    UserRole.hospital => 'Hospital',
    _ => 'Patient',
  };

  String? _required(String? v, String what) => (v == null || v.trim().isEmpty) ? 'Enter $what' : null;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _referral.dispose();
    _agency.dispose();
    _hospital.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _submit({required bool upgrade}) async {
    if (_loading) return;
    setState(() {
      _error = null;
      _fieldErrors = const {};
      _showTermsError = !_acceptTerms;
    });
    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid || !_acceptTerms) return;
    final onboarding = ref.read(onboardingSeenProvider.notifier);
    final auth = ref.read(authControllerProvider.notifier);
    setState(() => _loading = true);
    try {
      final User user;
      if (upgrade) {
        user = await auth.upgradeGuest(email: _email.text, password: _password.text, fullName: _name.text);
      } else {
        user = await auth.register(
          email: _email.text,
          password: _password.text,
          fullName: _name.text,
          role: _role,
          phone: _phone.text.trim(),
          countryCode: _country,
          referralCode: _role == UserRole.patient ? _referral.text.trim().toUpperCase() : null,
          agencyName: _role == UserRole.agent ? _agency.text.trim() : null,
          hospitalName: _role == UserRole.hospital ? _hospital.text.trim() : null,
          city: _role == UserRole.hospital ? _city.text.trim() : null,
        );
      }
      await onboarding.complete();
      if (mounted) context.go(returnPathFor(user.role, widget.from));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _fieldErrors = e.fieldErrors;
        _error = e.isConflict ? 'An account with this email already exists. Try logging in instead.' : e.message;
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isGuest = ref.watch(authStateProvider).isGuest;
    final role = isGuest ? UserRole.patient : _role;
    return AuthScaffold(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: AutofillGroup(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Create account', style: context.text.headlineSmall),
                const SizedBox(height: 6),
                Text(switch (role) {
                  _ when isGuest =>
                    'Save your screenings and matches, request quotes and book treatment. '
                        'Everything you did as a guest is kept.',
                  UserRole.agent =>
                    'For facilitators and agencies: register patients, compare hospital quotes and track '
                        'commissions. New agent accounts are verified by our team.',
                  UserRole.hospital =>
                    'For hospital teams: receive patient enquiries, send itemised quotes and manage '
                        'admissions. Your hospital is verified by our team before it is listed.',
                  _ => 'Get matched with accredited Indian hospitals and track your whole treatment journey.',
                }, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
                const SizedBox(height: 16),
                if (!isGuest) ...[
                  SegmentedButton<UserRole>(
                    key: const Key('register-role-tabs'),
                    showSelectedIcon: false,
                    segments: [for (final r in registrableRoles) ButtonSegment(value: r, label: Text(_roleLabel(r)))],
                    selected: {_role},
                    onSelectionChanged: _loading
                        ? null
                        : (s) => setState(() {
                            _role = s.first;
                            _error = null;
                            _fieldErrors = const {};
                          }),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_error != null) ...[FormErrorBanner(message: _error!), const SizedBox(height: 12)],
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  maxLength: 200,
                  validator: AuthValidators.fullName,
                  decoration: InputDecoration(
                    labelText: role == UserRole.patient ? 'Full name (as on passport)' : 'Your full name',
                    prefixIcon: const Icon(Icons.person_outline_rounded),
                    errorText: _fieldErrors['full_name'],
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  autocorrect: false,
                  validator: AuthValidators.email,
                  decoration: InputDecoration(
                    labelText: 'Email',
                    prefixIcon: const Icon(Icons.mail_outline_rounded),
                    errorText: _fieldErrors['email'],
                  ),
                ),
                const SizedBox(height: 12),
                PasswordField(
                  controller: _password,
                  validator: AuthValidators.newPassword,
                  errorText: _fieldErrors['password'],
                  textInputAction: isGuest ? TextInputAction.done : TextInputAction.next,
                  autofillHints: const [AutofillHints.newPassword],
                  helperText: 'At least ${AuthValidators.passwordMinLength} characters with a letter and a number',
                ),
                if (role == UserRole.agent) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('register-agency'),
                    controller: _agency,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.organizationName],
                    maxLength: 200,
                    validator: (v) => _required(v, 'your agency name'),
                    decoration: InputDecoration(
                      labelText: 'Agency name',
                      prefixIcon: const Icon(Icons.business_center_outlined),
                      errorText: _fieldErrors['agency_name'],
                      counterText: '',
                    ),
                  ),
                ],
                if (role == UserRole.hospital) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('register-hospital'),
                    controller: _hospital,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.organizationName],
                    maxLength: 200,
                    validator: (v) => _required(v, 'the hospital name'),
                    decoration: InputDecoration(
                      labelText: 'Hospital name',
                      prefixIcon: const Icon(Icons.local_hospital_outlined),
                      errorText: _fieldErrors['hospital_name'],
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _city,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.addressCity],
                    maxLength: 100,
                    decoration: InputDecoration(
                      labelText: 'City (optional)',
                      prefixIcon: const Icon(Icons.location_city_outlined),
                      errorText: _fieldErrors['city'],
                      counterText: '',
                    ),
                  ),
                ],
                if (!isGuest) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    validator: AuthValidators.optionalPhone,
                    decoration: InputDecoration(
                      labelText: 'Phone / WhatsApp (optional)',
                      hintText: '+1 555 123 4567',
                      prefixIcon: const Icon(Icons.phone_outlined),
                      errorText: _fieldErrors['phone'],
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _country,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: role == UserRole.patient ? 'Country of residence (optional)' : 'Country (optional)',
                      prefixIcon: const Icon(Icons.public_rounded),
                      errorText: _fieldErrors['country_code'],
                    ),
                    items: [
                      for (final e in kCountries.entries)
                        DropdownMenuItem(value: e.key, child: Text('${countryFlag(e.key)}  ${e.value}')),
                    ],
                    onChanged: (v) => setState(() => _country = v),
                  ),
                ],
                if (role == UserRole.patient && !isGuest) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _referral,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 16,
                    decoration: InputDecoration(
                      labelText: 'Facilitator referral code (optional)',
                      prefixIcon: const Icon(Icons.badge_outlined),
                      errorText: _fieldErrors['referral_code'],
                      counterText: '',
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                CheckboxListTile(
                  value: _acceptTerms,
                  onChanged: (v) => setState(() {
                    _acceptTerms = v ?? false;
                    if (_acceptTerms) _showTermsError = false;
                  }),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                  title: const TermsNotice(prefix: 'I agree to the '),
                  subtitle: _showTermsError
                      ? Text(
                          'Please accept the Terms and Privacy Policy',
                          style: context.text.bodySmall?.copyWith(color: AppColors.danger),
                        )
                      : null,
                ),
                const SizedBox(height: 8),
                PrimaryButton(
                  label: isGuest ? 'Create account & keep my progress' : 'Create account',
                  loading: _loading,
                  onPressed: () => _submit(upgrade: isGuest),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Already have an account?', style: context.text.bodySmall),
                    TextButton(
                      onPressed: () => context.pushReplacement(Routes.loginFrom(_target)),
                      child: const Text('Log in'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
