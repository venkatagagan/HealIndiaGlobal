// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'Votre porte d\'accès à l\'excellence médicale indienne';

  @override
  String get commonCancel => 'Annuler';

  @override
  String get commonOk => 'OK';

  @override
  String get commonSave => 'Enregistrer';

  @override
  String get commonRetry => 'Réessayer';

  @override
  String get commonTryAgain => 'Réessayer';

  @override
  String get commonClose => 'Fermer';

  @override
  String get commonContinue => 'Continuer';

  @override
  String get commonBack => 'Retour';

  @override
  String get commonNext => 'Suivant';

  @override
  String get commonDone => 'Terminé';

  @override
  String get commonEdit => 'Modifier';

  @override
  String get commonDelete => 'Supprimer';

  @override
  String get commonRemove => 'Retirer';

  @override
  String get commonSubmit => 'Envoyer';

  @override
  String get commonConfirm => 'Confirmer';

  @override
  String get commonYes => 'Oui';

  @override
  String get commonNo => 'Non';

  @override
  String get commonSeeAll => 'Tout voir';

  @override
  String get commonApply => 'Appliquer';

  @override
  String get commonReset => 'Réinitialiser';

  @override
  String get commonClear => 'Effacer';

  @override
  String get commonSkip => 'Passer';

  @override
  String get commonSend => 'Envoyer';

  @override
  String get commonOpen => 'Ouvrir';

  @override
  String get commonDownload => 'Télécharger';

  @override
  String get commonUpload => 'Importer';

  @override
  String get commonAdd => 'Ajouter';

  @override
  String get commonOptional => 'Facultatif';

  @override
  String get commonLoading => 'Chargement…';

  @override
  String get commonSomethingWentWrong => 'Une erreur s\'est produite';

  @override
  String get commonErrorDisplayingSection => 'Une erreur s\'est produite lors de l\'affichage de cette section.';

  @override
  String get commonLogOut => 'Se déconnecter';

  @override
  String get commonDeleteAccount => 'Supprimer le compte';

  @override
  String get commonAccount => 'Compte';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'Langue';

  @override
  String get languagePickerTitle => 'Langue de l\'application';

  @override
  String get languagePickerHint =>
      'L\'application, les résumés IA et la saisie vocale utilisent cette langue. Les coordinateurs et les hôpitaux vous contacteront dans cette langue lorsque c\'est possible.';

  @override
  String languageChanged(String language) {
    return 'Langue changée : $language.';
  }

  @override
  String get languageProfileSyncFailed =>
      'Langue changée sur cet appareil. Nous n\'avons pas pu l\'enregistrer dans votre profil ; nous réessaierons plus tard.';

  @override
  String get languageButtonTooltip => 'Changer de langue';

  @override
  String get datesJustNow => 'à l\'instant';

  @override
  String datesMinutesAgo(int minutes) {
    return 'il y a $minutes min';
  }

  @override
  String datesHoursAgo(int hours) {
    return 'il y a $hours h';
  }

  @override
  String get datesYesterday => 'Hier';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'il y a $days jours',
      one: 'il y a $days jour',
    );
    return '$_temp0';
  }
}
