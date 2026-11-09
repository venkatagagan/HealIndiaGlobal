import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/auth_repository.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../auth/validators.dart';
import '../../auth/widgets/auth_widgets.dart';
import '../data/countries.dart';
import '../widgets/profile_widgets.dart';

const kBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/// Personal info, passport (write-only, shown masked), emergency contact, medical and insurance
/// details (`PUT /patient/profile`).
///
/// Route: `/profile/edit` · Owner: fl-onboarding.
class EditProfileScreen extends ConsumerWidget {
  const EditProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(patientProfileProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.editProfileTitle)),
      body: AsyncValueView<PatientProfile>(
        value: value,
        onRetry: () => ref.invalidate(patientProfileProvider),
        data: (p) => _ProfileForm(profile: p),
      ),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({required this.profile});

  final PatientProfile profile;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  final _formKey = GlobalKey<FormState>();
  late final PatientProfile p = widget.profile;

  late final _first = TextEditingController(text: p.firstName ?? '');
  late final _last = TextEditingController(text: p.lastName ?? '');
  late final _phone = TextEditingController(text: p.phone ?? '');
  late final _whatsapp = TextEditingController(text: p.whatsapp ?? '');
  final _passport = TextEditingController();
  late final _ecName = TextEditingController(text: p.emergencyContact?.name ?? '');
  late final _ecRelationship = TextEditingController(text: p.emergencyContact?.relationship ?? '');
  late final _ecPhone = TextEditingController(text: p.emergencyContact?.phone ?? '');
  late final _allergies = TextEditingController(text: p.allergies ?? '');
  late final _history = TextEditingController(text: p.medicalHistory ?? '');
  late final _insurer = TextEditingController(text: p.insuranceProvider ?? '');
  final _policy = TextEditingController();

  late DateTime? _dob = p.dateOfBirth;
  late DateTime? _passportExpiry = p.passportExpiry;
  late Gender? _gender = p.gender;
  late String? _nationality = p.nationality?.toUpperCase();
  late String? _residence = p.countryOfResidence?.toUpperCase();
  late String? _bloodGroup = p.bloodGroup?.toUpperCase();
  late String _currency = p.preferredCurrency.toUpperCase();

  bool _saving = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  List<TextEditingController> get _controllers => [
    _first,
    _last,
    _phone,
    _whatsapp,
    _passport,
    _ecName,
    _ecRelationship,
    _ecPhone,
    _allergies,
    _history,
    _insurer,
    _policy,
  ];

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _hasEmergencyInput =>
      _ecName.text.trim().isNotEmpty || _ecRelationship.text.trim().isNotEmpty || _ecPhone.text.trim().isNotEmpty;

  /// [message]: the localized "add the field or clear the emergency contact" error for that field.
  String? _ecRequired(String? v, String message) => _hasEmergencyInput && (v ?? '').trim().isEmpty ? message : null;

  Future<void> _save() async {
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!(_formKey.currentState?.validate() ?? false)) {
      // Inline errors may be scrolled out of view; say so where the user is looking.
      showInfoSnack(context, context.l10n.editProfileFixFields);
      return;
    }
    if (_saving) return;
    setState(() => _saving = true);

    String t(TextEditingController c) => c.text.trim();
    final update = PatientProfileUpdate(
      firstName: t(_first),
      lastName: t(_last),
      dateOfBirth: _dob,
      gender: _gender,
      nationality: _nationality,
      countryOfResidence: _residence,
      passportNumber: t(_passport).isEmpty ? null : t(_passport).toUpperCase(),
      passportExpiry: _passportExpiry,
      phone: t(_phone),
      whatsapp: t(_whatsapp),
      emergencyContact: _hasEmergencyInput
          ? EmergencyContact(name: t(_ecName), relationship: t(_ecRelationship), phone: t(_ecPhone))
          : null,
      bloodGroup: _bloodGroup,
      allergies: t(_allergies),
      medicalHistory: t(_history),
      insuranceProvider: t(_insurer),
      insurancePolicyNumber: t(_policy).isEmpty ? null : t(_policy),
      preferredCurrency: _currency,
    );

    final patients = ref.read(patientRepositoryProvider);
    final authRepo = ref.read(authRepositoryProvider);
    final auth = ref.read(authControllerProvider.notifier);
    final currency = ref.read(preferredCurrencyProvider.notifier);
    final user = ref.read(currentUserProvider);
    try {
      final saved = await patients.updateProfile(update);
      await currency.set(saved.preferredCurrency);
      final name = [t(_first), t(_last)].where((s) => s.isNotEmpty).join(' ');
      if (name.isNotEmpty && user != null && name != user.fullName) {
        try {
          auth.setUser(await authRepo.updateMe(fullName: name));
        } on ApiException {
          // The profile itself is saved; the account display name can be fixed later.
        }
      }
      ref.invalidate(patientProfileProvider);
      if (!mounted) return;
      showInfoSnack(context, context.l10n.editProfileSaved);
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(Routes.profile);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _fieldErrors = e.fieldErrors;
          _error = e.message;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  InputDecoration _dec(String label, IconData icon, String field, {String? hint, String? helper}) => InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    helperMaxLines: 2,
    prefixIcon: Icon(icon),
    errorText: _fieldErrors[field],
    counterText: '',
  );

  Widget _countryDropdown(String label, String? value, ValueChanged<String?> onChanged, String field) {
    final l10n = context.l10n;
    return DropdownButtonFormField<String?>(
      initialValue: kCountries.containsKey(value) ? value : null,
      isExpanded: true,
      decoration: _dec(label, Icons.flag_outlined, field),
      items: [
        DropdownMenuItem<String?>(value: null, child: Text(l10n.profileNotSet)),
        for (final e in countryOptions(l10n))
          DropdownMenuItem<String?>(value: e.key, child: Text('${countryFlag(e.key)}  ${e.value}')),
      ],
      onChanged: onChanged,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    const gap = SizedBox(height: 12);
    final now = DateTime.now();
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (_error != null) ...[FormErrorBanner(message: _error!), gap],
          SectionTitle(l10n.editProfilePersonalDetails, padding: const EdgeInsets.only(bottom: 10)),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _first,
                  textCapitalization: TextCapitalization.words,
                  maxLength: 100,
                  decoration: _dec(l10n.editProfileFirstName, Icons.person_outline_rounded, 'first_name'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _last,
                  textCapitalization: TextCapitalization.words,
                  maxLength: 100,
                  decoration: _dec(l10n.editProfileLastName, Icons.person_outline_rounded, 'last_name'),
                ),
              ),
            ],
          ),
          gap,
          DateField(
            label: l10n.profileDateOfBirth,
            value: _dob,
            icon: Icons.cake_outlined,
            firstDate: DateTime(1900),
            lastDate: now,
            errorText: _fieldErrors['date_of_birth'],
            onChanged: (d) => setState(() => _dob = d),
          ),
          gap,
          DropdownButtonFormField<Gender?>(
            initialValue: _gender,
            isExpanded: true,
            decoration: _dec(l10n.profileGender, Icons.wc_rounded, 'gender'),
            items: [
              DropdownMenuItem<Gender?>(value: null, child: Text(l10n.profileNotSet)),
              for (final g in Gender.values) DropdownMenuItem<Gender?>(value: g, child: Text(g.label)),
            ],
            onChanged: (g) => setState(() => _gender = g),
          ),
          gap,
          _countryDropdown(
            l10n.profileNationality,
            _nationality,
            (v) => setState(() => _nationality = v),
            'nationality',
          ),
          gap,
          _countryDropdown(
            l10n.editProfileCountryOfResidence,
            _residence,
            (v) => setState(() => _residence = v),
            'country_of_residence',
          ),
          gap,
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            validator: AuthValidators.optionalPhone,
            decoration: _dec(l10n.profilePhone, Icons.phone_outlined, 'phone', hint: '+44 20 7946 0000'),
          ),
          gap,
          TextFormField(
            controller: _whatsapp,
            keyboardType: TextInputType.phone,
            validator: AuthValidators.optionalPhone,
            decoration: _dec('WhatsApp', Icons.chat_outlined, 'whatsapp'),
          ),

          SectionTitle(l10n.profilePassport, subtitle: l10n.editProfilePassportSubtitle),
          TextFormField(
            controller: _passport,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            enableSuggestions: false,
            maxLength: 32,
            validator: (v) {
              final s = (v ?? '').replaceAll(RegExp(r'[\s-]'), '');
              if (s.isEmpty) return null;
              return RegExp(r'^[A-Za-z0-9]{5,20}$').hasMatch(s) ? null : l10n.editProfilePassportInvalid;
            },
            decoration: _dec(
              p.passportLast4 == null ? l10n.editProfilePassportNumber : l10n.profileNewPassportNumber,
              Icons.badge_outlined,
              'passport_number',
              helper: p.passportLast4 == null
                  ? l10n.editProfilePassportHelperNew
                  : l10n.editProfilePassportOnFile('${p.maskedPassport}'),
            ),
          ),
          gap,
          DateField(
            label: l10n.editProfilePassportExpiry,
            value: _passportExpiry,
            icon: Icons.event_busy_outlined,
            firstDate: DateTime(now.year - 1),
            lastDate: DateTime(now.year + 20),
            errorText: _fieldErrors['passport_expiry'],
            onChanged: (d) => setState(() => _passportExpiry = d),
          ),

          SectionTitle(l10n.profileEmergencyContact),
          TextFormField(
            controller: _ecName,
            textCapitalization: TextCapitalization.words,
            maxLength: 200,
            validator: (v) => _ecRequired(v, l10n.editProfileEcNameRequired),
            decoration: _dec(l10n.editProfileName, Icons.contact_emergency_outlined, 'name'),
          ),
          gap,
          TextFormField(
            controller: _ecRelationship,
            textCapitalization: TextCapitalization.words,
            maxLength: 60,
            validator: (v) => _ecRequired(v, l10n.editProfileEcRelationshipRequired),
            decoration: _dec(l10n.profileRelationship, Icons.diversity_3_outlined, 'relationship'),
          ),
          gap,
          TextFormField(
            controller: _ecPhone,
            keyboardType: TextInputType.phone,
            maxLength: 32,
            validator: (v) => _ecRequired(v, l10n.editProfileEcPhoneRequired) ?? AuthValidators.optionalPhone(v),
            decoration: _dec(l10n.profilePhone, Icons.phone_outlined, 'emergency_contact'),
          ),

          SectionTitle(l10n.editProfileMedicalInfo, subtitle: l10n.editProfileMedicalInfoSubtitle),
          DropdownButtonFormField<String?>(
            initialValue: kBloodGroups.contains(_bloodGroup) ? _bloodGroup : null,
            decoration: _dec(l10n.profileBloodGroup, Icons.bloodtype_outlined, 'blood_group'),
            items: [
              DropdownMenuItem<String?>(value: null, child: Text(l10n.profileNotSet)),
              for (final b in kBloodGroups) DropdownMenuItem<String?>(value: b, child: Text(b)),
            ],
            onChanged: (v) => setState(() => _bloodGroup = v),
          ),
          gap,
          TextFormField(
            controller: _allergies,
            minLines: 1,
            maxLines: 4,
            maxLength: 5000,
            decoration: _dec(l10n.editProfileAllergies, Icons.warning_amber_rounded, 'allergies'),
          ),
          gap,
          TextFormField(
            controller: _history,
            minLines: 2,
            maxLines: 8,
            maxLength: 20000,
            decoration: _dec(l10n.editProfileMedicalHistory, Icons.history_rounded, 'medical_history'),
          ),

          SectionTitle(l10n.editProfileInsurance),
          TextFormField(
            controller: _insurer,
            maxLength: 200,
            decoration: _dec(l10n.editProfileInsuranceProvider, Icons.health_and_safety_outlined, 'insurance_provider'),
          ),
          gap,
          TextFormField(
            controller: _policy,
            autocorrect: false,
            maxLength: 64,
            decoration: _dec(
              p.insurancePolicyLast4 == null ? l10n.editProfilePolicyNumber : l10n.editProfileNewPolicyNumber,
              Icons.policy_outlined,
              'insurance_policy_number',
              helper: p.insurancePolicyLast4 == null ? null : l10n.editProfilePolicyOnFile('${p.insurancePolicyLast4}'),
            ),
          ),

          SectionTitle(l10n.settingsPreferences),
          DropdownButtonFormField<String>(
            initialValue: Currencies.supported.contains(_currency) ? _currency : 'USD',
            decoration: _dec(l10n.settingsPreferredCurrency, Icons.payments_outlined, 'preferred_currency'),
            items: [for (final c in Currencies.supported) DropdownMenuItem(value: c, child: Text(c))],
            onChanged: (v) => setState(() => _currency = v ?? _currency),
          ),
          const SizedBox(height: 24),
          PrimaryButton(label: l10n.editProfileSaveChanges, loading: _saving, onPressed: _save),
        ],
      ),
    );
  }
}
