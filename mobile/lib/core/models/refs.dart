import 'json.dart';

/// Compact `{id, slug, name}` reference used for specialties and procedures embedded in other
/// resources (e.g. `specialty{id,slug,name}`, `procedure{id,name}`).
class EntityRef {
  const EntityRef({required this.id, required this.name, this.slug});

  factory EntityRef.fromJson(JsonMap j) =>
      EntityRef(id: jStr(j, 'id'), name: jStr(j, 'name'), slug: jStrOrNull(j, 'slug'));

  final String id;
  final String? slug;
  final String name;

  Map<String, dynamic> toJson() => compactJson({'id': id, 'slug': slug, 'name': name});
}

/// `hospital{id, slug, name, city, accreditations[]}` as embedded in doctors, cases and bookings.
class HospitalRef {
  const HospitalRef({required this.id, required this.name, this.slug, this.city, this.accreditations = const []});

  factory HospitalRef.fromJson(JsonMap j) => HospitalRef(
    id: jStr(j, 'id'),
    name: jStr(j, 'name'),
    slug: jStrOrNull(j, 'slug'),
    city: jStrOrNull(j, 'city'),
    accreditations: jStrList(j, 'accreditations'),
  );

  final String id;
  final String? slug;
  final String name;
  final String? city;
  final List<String> accreditations;

  Map<String, dynamic> toJson() =>
      compactJson({'id': id, 'slug': slug, 'name': name, 'city': city, 'accreditations': accreditations});
}

/// A person reference: `{id, full_name, role?, phone?}` (senders, coordinators, participants).
class PersonRef {
  const PersonRef({required this.id, required this.fullName, this.role, this.phone});

  factory PersonRef.fromJson(JsonMap j) => PersonRef(
    id: jStr(j, 'id', jStr(j, 'user_id')),
    fullName: jStr(j, 'full_name'),
    role: jStrOrNull(j, 'role'),
    phone: jStrOrNull(j, 'phone'),
  );

  final String id;
  final String fullName;
  final String? role;
  final String? phone;

  /// Initials for avatars (`Arjun Sharma` -> `AS`).
  String get initials => initialsOf(fullName);

  Map<String, dynamic> toJson() => compactJson({'id': id, 'full_name': fullName, 'role': role, 'phone': phone});
}

/// `doctor{id, full_name, specialty_name?}` as embedded in cases / bookings.
class DoctorRef {
  const DoctorRef({required this.id, required this.fullName, this.specialtyName});

  factory DoctorRef.fromJson(JsonMap j) =>
      DoctorRef(id: jStr(j, 'id'), fullName: jStr(j, 'full_name'), specialtyName: jStrOrNull(j, 'specialty_name'));

  final String id;
  final String fullName;
  final String? specialtyName;

  Map<String, dynamic> toJson() => compactJson({'id': id, 'full_name': fullName, 'specialty_name': specialtyName});
}

/// Two-letter initials of a name.
String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty && p != 'Dr.' && p != 'Dr').toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
}
