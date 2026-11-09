import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/widgets/auth_widgets.dart';
import '../data/countries.dart';
import 'profile_widgets.dart';

const kRelationships = ['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Caregiver'];

/// Add (when [existing] is null) or edit a travel companion. Returns the saved companion.
Future<PatientCompanion?> showCompanionForm(BuildContext context, {PatientCompanion? existing}) =>
    showModalBottomSheet<PatientCompanion>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CompanionFormSheet(existing: existing),
    );

class CompanionFormSheet extends ConsumerStatefulWidget {
  const CompanionFormSheet({super.key, this.existing});

  final PatientCompanion? existing;

  @override
  ConsumerState<CompanionFormSheet> createState() => _CompanionFormSheetState();
}

class _CompanionFormSheetState extends ConsumerState<CompanionFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.fullName ?? '');
  final _passport = TextEditingController();
  late String? _relationship = widget.existing?.relationship;
  late String? _nationality = widget.existing?.nationality?.toUpperCase();
  late DateTime? _dob = widget.existing?.dateOfBirth;
  bool _loading = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _name.dispose();
    _passport.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!(_formKey.currentState?.validate() ?? false) || _loading) return;
    setState(() => _loading = true);
    final input = CompanionInput(
      fullName: _name.text.trim(),
      relationship: _relationship,
      nationality: _nationality,
      dateOfBirth: _dob,
      passportNumber: _passport.text.trim().isEmpty ? null : _passport.text.trim().toUpperCase(),
    );
    try {
      final repo = ref.read(patientRepositoryProvider);
      final existing = widget.existing;
      final saved = existing == null ? await repo.addCompanion(input) : await repo.updateCompanion(existing.id, input);
      ref.invalidate(companionsProvider);
      if (mounted) Navigator.of(context).pop(saved);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _fieldErrors = e.fieldErrors;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final relationships = {...kRelationships, ?_relationship}.toList();
    final last4 = widget.existing?.passportLast4;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.existing == null ? 'Add companion' : 'Edit companion', style: context.text.titleLarge),
              const SizedBox(height: 4),
              Text(
                'Companions travel with you as medical attendants and need their own visa.',
                style: context.text.bodySmall,
              ),
              const SizedBox(height: 16),
              if (_error != null) ...[FormErrorBanner(message: _error!), const SizedBox(height: 12)],
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                maxLength: 200,
                validator: (v) => (v ?? '').trim().isEmpty ? 'Enter the full name' : null,
                decoration: InputDecoration(
                  labelText: 'Full name (as on passport)',
                  prefixIcon: const Icon(Icons.person_outline_rounded),
                  errorText: _fieldErrors['full_name'],
                  counterText: '',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _relationship,
                isExpanded: true,
                validator: (v) => v == null ? 'Choose the relationship' : null,
                decoration: InputDecoration(
                  labelText: 'Relationship',
                  prefixIcon: const Icon(Icons.diversity_3_outlined),
                  errorText: _fieldErrors['relationship'],
                ),
                items: [for (final r in relationships) DropdownMenuItem(value: r, child: Text(r))],
                onChanged: (v) => setState(() => _relationship = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: kCountries.containsKey(_nationality) ? _nationality : null,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: 'Nationality',
                  prefixIcon: const Icon(Icons.flag_outlined),
                  errorText: _fieldErrors['nationality'],
                ),
                items: [
                  for (final e in kCountries.entries)
                    DropdownMenuItem(value: e.key, child: Text('${countryFlag(e.key)}  ${e.value}')),
                ],
                onChanged: (v) => setState(() => _nationality = v),
              ),
              const SizedBox(height: 12),
              DateField(
                label: 'Date of birth',
                value: _dob,
                firstDate: DateTime(1900),
                lastDate: DateTime.now(),
                icon: Icons.cake_outlined,
                errorText: _fieldErrors['date_of_birth'],
                onChanged: (d) => setState(() => _dob = d),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _passport,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                enableSuggestions: false,
                maxLength: 32,
                validator: (v) {
                  final s = (v ?? '').trim();
                  if (s.isEmpty) return null;
                  return RegExp(r'^[A-Za-z0-9]{5,20}$').hasMatch(s) ? null : 'Enter a valid passport number';
                },
                decoration: InputDecoration(
                  labelText: last4 == null ? 'Passport number (optional)' : 'New passport number',
                  helperText: last4 == null ? 'Stored encrypted' : 'Current: •••• $last4 - leave blank to keep',
                  prefixIcon: const Icon(Icons.badge_outlined),
                  errorText: _fieldErrors['passport_number'],
                  counterText: '',
                ),
              ),
              const SizedBox(height: 20),
              PrimaryButton(label: 'Save companion', loading: _loading, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}
