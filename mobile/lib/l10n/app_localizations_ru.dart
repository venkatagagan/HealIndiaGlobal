// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'Ваш путь к лучшей медицине Индии';

  @override
  String get commonCancel => 'Отмена';

  @override
  String get commonOk => 'ОК';

  @override
  String get commonSave => 'Сохранить';

  @override
  String get commonRetry => 'Повторить';

  @override
  String get commonTryAgain => 'Попробовать снова';

  @override
  String get commonClose => 'Закрыть';

  @override
  String get commonContinue => 'Продолжить';

  @override
  String get commonBack => 'Назад';

  @override
  String get commonNext => 'Далее';

  @override
  String get commonDone => 'Готово';

  @override
  String get commonEdit => 'Изменить';

  @override
  String get commonDelete => 'Удалить';

  @override
  String get commonRemove => 'Убрать';

  @override
  String get commonSubmit => 'Отправить';

  @override
  String get commonConfirm => 'Подтвердить';

  @override
  String get commonYes => 'Да';

  @override
  String get commonNo => 'Нет';

  @override
  String get commonSeeAll => 'Показать все';

  @override
  String get commonApply => 'Применить';

  @override
  String get commonReset => 'Сбросить';

  @override
  String get commonClear => 'Очистить';

  @override
  String get commonSkip => 'Пропустить';

  @override
  String get commonSend => 'Отправить';

  @override
  String get commonOpen => 'Открыть';

  @override
  String get commonDownload => 'Скачать';

  @override
  String get commonUpload => 'Загрузить';

  @override
  String get commonAdd => 'Добавить';

  @override
  String get commonOptional => 'Необязательно';

  @override
  String get commonLoading => 'Загрузка…';

  @override
  String get commonSomethingWentWrong => 'Что-то пошло не так';

  @override
  String get commonErrorDisplayingSection => 'Не удалось показать этот раздел.';

  @override
  String get commonLogOut => 'Выйти';

  @override
  String get commonDeleteAccount => 'Удалить аккаунт';

  @override
  String get commonAccount => 'Аккаунт';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'Язык';

  @override
  String get languagePickerTitle => 'Язык приложения';

  @override
  String get languagePickerHint =>
      'Приложение, сводки ИИ и голосовой ввод используют этот язык. Координаторы и больницы будут связываться с вами на нём, когда это возможно.';

  @override
  String languageChanged(String language) {
    return 'Язык изменён: $language.';
  }

  @override
  String get languageProfileSyncFailed =>
      'Язык изменён на этом устройстве. Не удалось сохранить его в профиле; мы попробуем позже.';

  @override
  String get languageButtonTooltip => 'Сменить язык';

  @override
  String get datesJustNow => 'только что';

  @override
  String datesMinutesAgo(int minutes) {
    return '$minutes мин назад';
  }

  @override
  String datesHoursAgo(int hours) {
    return '$hours ч назад';
  }

  @override
  String get datesYesterday => 'Вчера';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days дня назад',
      many: '$days дней назад',
      few: '$days дня назад',
      one: '$days день назад',
    );
    return '$_temp0';
  }

  @override
  String get enumUserRolePatient => 'Пациент';

  @override
  String get enumUserRoleAgent => 'Агент';

  @override
  String get enumUserRoleHospital => 'Больница';

  @override
  String get enumUserRoleAdmin => 'Администратор';

  @override
  String get enumUserRoleFinance => 'Финансы';

  @override
  String get enumUserRoleSupport => 'Поддержка';

  @override
  String get enumUserRoleSuperAdmin => 'Суперадминистратор';

  @override
  String get enumUserStatusActive => 'Активен';

  @override
  String get enumUserStatusPendingVerification => 'Ожидает проверки';

  @override
  String get enumUserStatusSuspended => 'Приостановлен';

  @override
  String get enumUserStatusDeleted => 'Удалён';

  @override
  String get enumGenderMale => 'Мужской';

  @override
  String get enumGenderFemale => 'Женский';

  @override
  String get enumGenderOther => 'Другое';

  @override
  String get enumGenderUndisclosed => 'Не указан';

  @override
  String get enumDoctorGenderPrefMale => 'Мужской';

  @override
  String get enumDoctorGenderPrefFemale => 'Женский';

  @override
  String get enumDoctorGenderPrefNoPreference => 'Не важно';

  @override
  String get enumKycStatusNotSubmitted => 'Не отправлено';

  @override
  String get enumKycStatusPending => 'Ожидает';

  @override
  String get enumKycStatusApproved => 'Одобрено';

  @override
  String get enumKycStatusRejected => 'Отклонено';

  @override
  String get enumHospitalStatusDraft => 'Черновик';

  @override
  String get enumHospitalStatusPendingReview => 'Ожидает проверки';

  @override
  String get enumHospitalStatusActive => 'Активен';

  @override
  String get enumHospitalStatusSuspended => 'Приостановлен';

  @override
  String get enumHospitalStatusRejected => 'Отклонено';

  @override
  String get enumAgentStatusPending => 'Ожидает';

  @override
  String get enumAgentStatusActive => 'Активен';

  @override
  String get enumAgentStatusSuspended => 'Приостановлен';

  @override
  String get enumAgentStatusRejected => 'Отклонено';

  @override
  String get enumHospitalMemberRoleOwner => 'Владелец';

  @override
  String get enumHospitalMemberRoleAdmin => 'Администратор';

  @override
  String get enumHospitalMemberRoleCoordinator => 'Координатор';

  @override
  String get enumHospitalMemberRoleFinance => 'Финансы';

  @override
  String get enumHospitalMemberRoleDoctor => 'Врач';

  @override
  String get enumPackageTierMedicalOnly => 'Только лечение';

  @override
  String get enumPackageTierMedicalStay => 'Лечение + проживание';

  @override
  String get enumPackageTierAllInclusive => 'Всё включено';

  @override
  String get enumScreeningStatusDraft => 'Черновик';

  @override
  String get enumScreeningStatusProcessing => 'Обрабатывается';

  @override
  String get enumScreeningStatusCompleted => 'Завершено';

  @override
  String get enumScreeningStatusFailed => 'Ошибка';

  @override
  String get enumUrgencyRoutine => 'Планово';

  @override
  String get enumUrgencySoon => 'В ближайшее время';

  @override
  String get enumUrgencyUrgent => 'Срочно';

  @override
  String get enumUrgencyEmergency => 'Экстренно';

  @override
  String get enumDurationUnitDays => 'Дни';

  @override
  String get enumDurationUnitWeeks => 'Недели';

  @override
  String get enumDurationUnitMonths => 'Месяцы';

  @override
  String get enumDurationUnitYears => 'Годы';

  @override
  String get enumSeverityLevelNone => 'Нет';

  @override
  String get enumSeverityLevelMild => 'Лёгкая';

  @override
  String get enumSeverityLevelModerate => 'Умеренная';

  @override
  String get enumSeverityLevelSevere => 'Сильная';

  @override
  String get enumSymptomAnswerYes => 'Да';

  @override
  String get enumSymptomAnswerMaybe => 'Возможно';

  @override
  String get enumSymptomAnswerNo => 'Нет';

  @override
  String get enumCaseStatusEnquiry => 'Запрос';

  @override
  String get enumCaseStatusQuoted => 'Предложена цена';

  @override
  String get enumCaseStatusAccepted => 'Принято';

  @override
  String get enumCaseStatusBooked => 'Забронировано';

  @override
  String get enumCaseStatusInTreatment => 'На лечении';

  @override
  String get enumCaseStatusCompleted => 'Завершено';

  @override
  String get enumCaseStatusCancelled => 'Отменено';

  @override
  String get enumCaseStatusDeclined => 'Отказано';

  @override
  String get enumQuoteStatusDraft => 'Черновик';

  @override
  String get enumQuoteStatusSent => 'Отправлено';

  @override
  String get enumQuoteStatusAccepted => 'Принято';

  @override
  String get enumQuoteStatusRejected => 'Отклонено';

  @override
  String get enumQuoteStatusExpired => 'Истёк срок';

  @override
  String get enumQuoteStatusWithdrawn => 'Отозвано';

  @override
  String get enumQuoteLineCategorySurgery => 'Операция';

  @override
  String get enumQuoteLineCategoryHospitalStay => 'Пребывание в больнице';

  @override
  String get enumQuoteLineCategoryMedications => 'Лекарства';

  @override
  String get enumQuoteLineCategoryTestsScans => 'Анализы и обследования';

  @override
  String get enumQuoteLineCategoryDoctorFees => 'Оплата врача';

  @override
  String get enumQuoteLineCategoryImplants => 'Импланты';

  @override
  String get enumQuoteLineCategoryOther => 'Другое';

  @override
  String get enumBookingStatusPendingPayment => 'Ожидает оплаты';

  @override
  String get enumBookingStatusConfirmed => 'Подтверждено';

  @override
  String get enumBookingStatusAdmitted => 'Госпитализирован';

  @override
  String get enumBookingStatusCompleted => 'Завершено';

  @override
  String get enumBookingStatusCancelled => 'Отменено';

  @override
  String get enumPaymentOptionFull => 'Полная оплата';

  @override
  String get enumPaymentOptionDeposit => 'Предоплата';

  @override
  String get enumPaymentOptionInstallments => 'Оплата частями';

  @override
  String get enumConsultationStatusRequested => 'Запрошено';

  @override
  String get enumConsultationStatusScheduled => 'Запланировано';

  @override
  String get enumConsultationStatusCompleted => 'Завершено';

  @override
  String get enumConsultationStatusCancelled => 'Отменено';

  @override
  String get enumChecklistStatusPending => 'Ожидает';

  @override
  String get enumChecklistStatusInProgress => 'В процессе';

  @override
  String get enumChecklistStatusDone => 'Готово';

  @override
  String get enumItineraryKindAppointment => 'Приём';

  @override
  String get enumItineraryKindAdmission => 'Госпитализация';

  @override
  String get enumItineraryKindSurgery => 'Операция';

  @override
  String get enumItineraryKindPickup => 'Встреча';

  @override
  String get enumItineraryKindCheckin => 'Заселение';

  @override
  String get enumItineraryKindCheckout => 'Выселение';

  @override
  String get enumItineraryKindFollowup => 'Контрольный приём';

  @override
  String get enumItineraryKindSightseeing => 'Экскурсия';

  @override
  String get enumItineraryKindOther => 'Другое';

  @override
  String get enumVisaStatusNotStarted => 'Не начато';

  @override
  String get enumVisaStatusDocumentsPending => 'Ожидаются документы';

  @override
  String get enumVisaStatusInvitationIssued => 'Приглашение выдано';

  @override
  String get enumVisaStatusApplied => 'Заявление подано';

  @override
  String get enumVisaStatusApproved => 'Одобрено';

  @override
  String get enumVisaStatusRejected => 'Отклонено';

  @override
  String get enumTravelKindFlight => 'Перелёт';

  @override
  String get enumTravelKindAirportPickup => 'Встреча в аэропорту';

  @override
  String get enumTravelKindAirportDrop => 'Трансфер в аэропорт';

  @override
  String get enumTravelKindLocalTransport => 'Местный транспорт';

  @override
  String get enumServiceBookingStatusRequested => 'Запрошено';

  @override
  String get enumServiceBookingStatusQuoted => 'Предложена цена';

  @override
  String get enumServiceBookingStatusConfirmed => 'Подтверждено';

  @override
  String get enumServiceBookingStatusCompleted => 'Завершено';

  @override
  String get enumServiceBookingStatusCancelled => 'Отменено';

  @override
  String get enumAccommodationTypeHotel => 'Отель';

  @override
  String get enumAccommodationTypeGuestHouse => 'Гостевой дом';

  @override
  String get enumAccommodationTypeServiceApartment => 'Апартаменты';

  @override
  String get enumAccommodationTypeHospitalGuestRoom => 'Гостевая комната при больнице';

  @override
  String get enumServiceKindTranslator => 'Переводчик';

  @override
  String get enumServiceKindLocalGuide => 'Местный гид';

  @override
  String get enumServiceKindTransport => 'Транспорт';

  @override
  String get enumServiceKindTravelAgent => 'Турагент';

  @override
  String get enumServiceKindInsurance => 'Страхование';

  @override
  String get enumDocumentKindPassport => 'Паспорт';

  @override
  String get enumDocumentKindVisa => 'Виза';

  @override
  String get enumDocumentKindMedicalReport => 'Медицинское заключение';

  @override
  String get enumDocumentKindPrescription => 'Рецепт';

  @override
  String get enumDocumentKindLabResult => 'Результат анализа';

  @override
  String get enumDocumentKindImaging => 'Снимки';

  @override
  String get enumDocumentKindInvitationLetter => 'Письмо-приглашение';

  @override
  String get enumDocumentKindInvoice => 'Счёт';

  @override
  String get enumDocumentKindReceipt => 'Квитанция';

  @override
  String get enumDocumentKindKycRegistration => 'Регистрация (KYC)';

  @override
  String get enumDocumentKindKycAccreditation => 'Аккредитация (KYC)';

  @override
  String get enumDocumentKindKycPan => 'Карта PAN';

  @override
  String get enumDocumentKindKycGst => 'Свидетельство GST';

  @override
  String get enumDocumentKindKycIdProof => 'Удостоверение личности';

  @override
  String get enumDocumentKindBankProof => 'Банковский документ';

  @override
  String get enumDocumentKindPaymentProof => 'Подтверждение оплаты';

  @override
  String get enumDocumentKindOther => 'Другое';

  @override
  String get enumDocumentStatusUploaded => 'Загружено';

  @override
  String get enumDocumentStatusVerified => 'Проверено';

  @override
  String get enumDocumentStatusRejected => 'Отклонено';

  @override
  String get enumConsentKindTerms => 'Условия';

  @override
  String get enumConsentKindPrivacy => 'Конфиденциальность';

  @override
  String get enumConsentKindAiProcessing => 'Обработка ИИ';

  @override
  String get enumConsentKindShareWithHospitals => 'Передача больницам';

  @override
  String get enumConsentKindMarketing => 'Маркетинг';

  @override
  String get enumConsentKindShareWithAgent => 'Делиться с моим агентом';

  @override
  String get enumConsentKindGuardianConsent => 'Согласие родителя или опекуна';

  @override
  String get enumPaymentGatewayRazorpay => 'Кредитная/дебетовая карта';

  @override
  String get enumPaymentGatewayStripe => 'Карта (Stripe)';

  @override
  String get enumPaymentGatewayBankTransfer => 'Банковский перевод';

  @override
  String get enumPaymentGatewayMock => 'Тестовый платёж';

  @override
  String get enumPaymentPurposeConsultationFee => 'Оплата консультации';

  @override
  String get enumPaymentPurposeBookingDeposit => 'Предоплата бронирования';

  @override
  String get enumPaymentPurposeBookingBalance => 'Остаток по бронированию';

  @override
  String get enumPaymentPurposeBookingFull => 'Полная оплата бронирования';

  @override
  String get enumPaymentPurposeInstallment => 'Платёж по рассрочке';

  @override
  String get enumPaymentPurposeService => 'Услуга';

  @override
  String get enumOrderStatusCreated => 'Создано';

  @override
  String get enumOrderStatusPending => 'Ожидает';

  @override
  String get enumOrderStatusPaid => 'Оплачено';

  @override
  String get enumOrderStatusPartiallyRefunded => 'Частично возвращено';

  @override
  String get enumOrderStatusRefunded => 'Возвращено';

  @override
  String get enumOrderStatusFailed => 'Ошибка';

  @override
  String get enumOrderStatusExpired => 'Истёк срок';

  @override
  String get enumOrderStatusCancelled => 'Отменено';

  @override
  String get enumPaymentStatusCreated => 'Создано';

  @override
  String get enumPaymentStatusAuthorized => 'Авторизовано';

  @override
  String get enumPaymentStatusCaptured => 'Списано';

  @override
  String get enumPaymentStatusFailed => 'Ошибка';

  @override
  String get enumPaymentStatusRefunded => 'Возвращено';

  @override
  String get enumPaymentStatusPartiallyRefunded => 'Частично возвращено';

  @override
  String get enumRefundStatusRequested => 'Запрошено';

  @override
  String get enumRefundStatusApproved => 'Одобрено';

  @override
  String get enumRefundStatusProcessing => 'Обрабатывается';

  @override
  String get enumRefundStatusProcessed => 'Обработано';

  @override
  String get enumRefundStatusFailed => 'Ошибка';

  @override
  String get enumRefundStatusRejected => 'Отклонено';

  @override
  String get enumInstallmentStatusDue => 'К оплате';

  @override
  String get enumInstallmentStatusPaid => 'Оплачено';

  @override
  String get enumInstallmentStatusOverdue => 'Просрочено';

  @override
  String get enumInstallmentStatusCancelled => 'Отменено';

  @override
  String get enumInvoiceKindPatientReceipt => 'Квитанция пациента';

  @override
  String get enumInvoiceKindCommissionInvoice => 'Счёт на комиссию';

  @override
  String get enumInvoiceKindAgentStatement => 'Выписка агента';

  @override
  String get enumPayeeTypeHospital => 'Больница';

  @override
  String get enumPayeeTypeAgent => 'Агент';

  @override
  String get enumPayeeTypeVendor => 'Поставщик';

  @override
  String get enumItineraryItemStatusScheduled => 'Запланировано';

  @override
  String get enumItineraryItemStatusDone => 'Готово';

  @override
  String get enumItineraryItemStatusCancelled => 'Отменено';

  @override
  String get enumVisaTypeEMedical => 'Электронная медицинская виза';

  @override
  String get enumVisaTypeEMedicalAttendant => 'Электронная виза сопровождающего';

  @override
  String get enumSosStatusOpen => 'Открыто';

  @override
  String get enumSosStatusAcknowledged => 'Принято';

  @override
  String get enumSosStatusResolved => 'Решено';

  @override
  String get enumConversationKindCaseThread => 'Обращение';

  @override
  String get enumConversationKindSupport => 'Поддержка';

  @override
  String get enumConversationKindDirect => 'Личные';

  @override
  String get enumSavedEntityTypeHospital => 'Больница';

  @override
  String get enumSavedEntityTypeDoctor => 'Врач';

  @override
  String get enumSavedEntityTypeProcedure => 'Процедура';

  @override
  String get enumConsultationModeVideo => 'Видео';

  @override
  String get enumConsultationModePhone => 'Телефон';

  @override
  String get enumSlotKindConsultation => 'Консультация';

  @override
  String get enumSlotKindAdmission => 'Госпитализация';

  @override
  String get enumTriageEngineClaude => 'ИИ (Claude)';

  @override
  String get enumTriageEngineRules => 'Система правил';

  @override
  String get enumLikelihoodLow => 'Низкий';

  @override
  String get enumLikelihoodMedium => 'Средний';

  @override
  String get enumLikelihoodHigh => 'Высокий';

  @override
  String get enumDevicePlatformAndroid => 'Android';

  @override
  String get enumDevicePlatformIos => 'iOS';

  @override
  String get enumDevicePlatformWeb => 'Веб';

  @override
  String get enumPreviousTreatmentMedication => 'Лекарства';

  @override
  String get enumPreviousTreatmentPhysicalTherapy => 'Физиотерапия';

  @override
  String get enumPreviousTreatmentSurgery => 'Операция';

  @override
  String get enumPreviousTreatmentOther => 'Другое';

  @override
  String get enumChecklistKeyTreatmentBooked => 'Лечение забронировано';

  @override
  String get enumChecklistKeyVisaApproved => 'Виза одобрена';

  @override
  String get enumChecklistKeyFlightBooked => 'Бронирование перелёта';

  @override
  String get enumChecklistKeyTravelInsurance => 'Страховка для поездки';

  @override
  String get enumChecklistKeyAirportPickup => 'Встреча в аэропорту';

  @override
  String get enumChecklistKeyDocumentsUploaded => 'Документы загружены';

  @override
  String get enumChecklistKeyAccommodationBooked => 'Жильё забронировано';

  @override
  String get enumAnalysisStatusQueued => 'В очереди';

  @override
  String get enumAnalysisStatusProcessing => 'Обрабатывается';

  @override
  String get enumAnalysisStatusCompleted => 'Завершено';

  @override
  String get enumAnalysisStatusFailed => 'Ошибка';

  @override
  String get enumAnalysisStatusUnsupported => 'Не поддерживается';

  @override
  String get enumAnalysisReviewStatusPendingReview => 'Ожидает проверки';

  @override
  String get enumAnalysisReviewStatusConfirmed => 'Подтверждено';

  @override
  String get enumAnalysisReviewStatusRejected => 'Отклонено';

  @override
  String get enumReportDocTypeLabReport => 'Результаты анализов';

  @override
  String get enumReportDocTypeImagingReport => 'Заключение по снимкам';

  @override
  String get enumReportDocTypeDischargeSummary => 'Выписной эпикриз';

  @override
  String get enumReportDocTypePrescription => 'Рецепт';

  @override
  String get enumReportDocTypeConsultationNote => 'Заключение врача';

  @override
  String get enumReportDocTypePathologyReport => 'Гистологическое заключение';

  @override
  String get enumReportDocTypeInsuranceDocument => 'Страховой документ';

  @override
  String get enumReportDocTypeOther => 'Другое';

  @override
  String get enumFindingSignificanceNormal => 'Норма';

  @override
  String get enumFindingSignificanceAttention => 'Требует внимания';

  @override
  String get enumFindingSignificanceUrgent => 'Срочно';

  @override
  String get enumLabFlagLow => 'Низкий';

  @override
  String get enumLabFlagHigh => 'Высокий';

  @override
  String get enumLabFlagNormal => 'Норма';

  @override
  String get enumLabFlagCritical => 'Критично';

  @override
  String get enumLabFlagUnknown => 'Неизвестно';

  @override
  String get enumVoiceStatusQueued => 'В очереди';

  @override
  String get enumVoiceStatusProcessing => 'Обрабатывается';

  @override
  String get enumVoiceStatusCompleted => 'Завершено';

  @override
  String get enumVoiceStatusFailed => 'Ошибка';

  @override
  String get enumVoiceReviewStatusPendingReview => 'Ожидает проверки';

  @override
  String get enumVoiceReviewStatusConfirmed => 'Подтверждено';

  @override
  String get enumVoiceReviewStatusDiscarded => 'Отклонено';

  @override
  String get coreInvalidCredentials => 'Неверный адрес электронной почты или пароль.';

  @override
  String get coreGoogleSignInUnavailable => 'Вход через Google недоступен в этой версии.';

  @override
  String get coreGoogleNoToken => 'Google не вернул токен.';

  @override
  String get coreGoogleSignInFailed => 'Не удалось войти через Google.';

  @override
  String get coreAppleNoToken => 'Apple не вернул токен.';

  @override
  String coreAppleSignInFailed(String error) {
    return 'Не удалось войти через Apple ($error).';
  }

  @override
  String get coreNoFileSelected => 'Файл не выбран.';

  @override
  String get coreUploadUnsupportedType =>
      'Неподдерживаемый тип файла. Используйте PDF, JPG, PNG, WEBP, HEIC или DICOM.';

  @override
  String get coreUploadTooLarge => 'Файл слишком большой (не более 20 МБ).';

  @override
  String get coreScreeningAnalysisSlow =>
      'Анализ занимает больше времени, чем ожидалось. Мы сообщим вам, когда он будет готов.';

  @override
  String get coreBiometricPay => 'Оплатить';

  @override
  String get coreBiometricPayFaceId => 'Оплатить с Face ID';

  @override
  String get coreBiometricPayFingerprint => 'Оплатить отпечатком пальца';

  @override
  String get coreBiometricConfirmReason => 'Подтвердите оплату';

  @override
  String get coreLocationServiceOff => 'На вашем телефоне отключено определение местоположения.';

  @override
  String get coreLocationDenied => 'Разрешение на доступ к местоположению не предоставлено.';

  @override
  String get coreLocationBlocked => 'Доступ к местоположению для этого приложения заблокирован в настройках телефона.';

  @override
  String get coreLocationUnavailable => 'Телефону не удалось вовремя определить ваше местоположение.';

  @override
  String corePackageNightsAccommodation(int nights) {
    String _temp0 = intl.Intl.pluralLogic(
      nights,
      locale: localeName,
      other: 'Проживание: $nights ночи',
      many: 'Проживание: $nights ночей',
      few: 'Проживание: $nights ночи',
      one: 'Проживание: $nights ночь',
    );
    return '$_temp0';
  }

  @override
  String get corePackageAirportPickup => 'Встреча в аэропорту';

  @override
  String get corePackageTranslator => 'Переводчик';

  @override
  String get corePackageMeals => 'Питание';

  @override
  String get corePackageLocalTransport => 'Местный транспорт';

  @override
  String corePackageFollowupTeleconsults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count контрольной телеконсультации',
      many: '$count контрольных телеконсультаций',
      few: '$count контрольные телеконсультации',
      one: '$count контрольная телеконсультация',
    );
    return '$_temp0';
  }

  @override
  String coreSavePercent(int pct) {
    return 'Экономия $pct%';
  }

  @override
  String coreSavePercentRange(int min, int max) {
    return 'Экономия $min–$max%';
  }

  @override
  String get coreUserGuest => 'Гость';

  @override
  String get coreUserPatient => 'Пациент';

  @override
  String coreMatchScore(int score) {
    return 'Совпадение $score%';
  }

  @override
  String get coreErrorOffline => 'Нет подключения к интернету';

  @override
  String get coreAvatarLabel => 'Аватар';

  @override
  String coreRatingCaption(String rating) {
    return '($rating/5)';
  }

  @override
  String coreRatingCaptionReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '($rating/5, $count отзыва)',
      many: '($rating/5, $count отзывов)',
      few: '($rating/5, $count отзыва)',
      one: '($rating/5, $count отзыв)',
    );
    return '$_temp0';
  }

  @override
  String coreRatingSemantics(String rating) {
    return 'Оценка $rating из 5';
  }

  @override
  String coreRatingSemanticsReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Оценка $rating из 5, $count отзыва',
      many: 'Оценка $rating из 5, $count отзывов',
      few: 'Оценка $rating из 5, $count отзыва',
      one: 'Оценка $rating из 5, $count отзыв',
    );
    return '$_temp0';
  }

  @override
  String coreStepProgress(int step, int total) {
    return 'Шаг $step из $total';
  }

  @override
  String coreStepProgressWithSuffix(int step, int total, String suffix) {
    return 'Шаг $step из $total · $suffix';
  }

  @override
  String get navHome => 'Главная';

  @override
  String get navSearch => 'Поиск';

  @override
  String get navTrips => 'Поездки';

  @override
  String get navMessages => 'Сообщения';

  @override
  String get navProfile => 'Профиль';

  @override
  String get routerNotFoundTitle => 'Страница не найдена';

  @override
  String routerNotFoundMessage(String location) {
    return 'Не удалось найти «$location».';
  }

  @override
  String get routerGoHome => 'На главную';

  @override
  String get homeTitle => 'Что привело вас в Индию?';

  @override
  String get homeSubtitle => 'Выберите медицинскую потребность';

  @override
  String get homeSearchHint => 'Поиск по заболеванию';

  @override
  String get homeSearchButton => 'Поиск';

  @override
  String get homeAllSpecialties => 'Все специализации';

  @override
  String get homeNoSpecialtiesTitle => 'Специализаций пока нет';

  @override
  String get homeNoSpecialtiesMessage => 'Вместо этого найдите больницы и врачей.';

  @override
  String get homeMoreTile => 'Ещё';

  @override
  String get homeMoreTileSubtitle => 'Другие специализации';

  @override
  String get homeTripEyebrow => 'Ваша предстоящая поездка';

  @override
  String get homeTripFallbackTitle => 'Лечение в Индии';

  @override
  String get homeTripDateTbc => 'Дата будет подтверждена';

  @override
  String get homeTripToday => 'Сегодня';

  @override
  String get homeTripTomorrow => 'Завтра';

  @override
  String get homeTripInProgress => 'Идёт сейчас';

  @override
  String homeTripInDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Через $days дня',
      many: 'Через $days дней',
      few: 'Через $days дня',
      one: 'Через $days день',
    );
    return '$_temp0';
  }

  @override
  String homeTripAdmission(String date) {
    return 'Госпитализация $date';
  }

  @override
  String get homeScreeningEyebrow => 'ИИ-скрининг';

  @override
  String get homeMatchesReadyTitle => 'Ваши подборки готовы';

  @override
  String get homeMatchesReadySubtitle => 'Посмотрите подобранные для вас больницы и врачей';

  @override
  String homeMatchesReadySubtitleSpecialty(String specialty) {
    return '$specialty · посмотрите подобранных врачей';
  }

  @override
  String get homeScreeningProcessingTitle => 'Подбираем лучшие варианты';

  @override
  String get homeScreeningProcessingSubtitle => 'Мы анализируем ваши ответы';

  @override
  String get homeScreeningContinueTitle => 'Продолжите скрининг';

  @override
  String get homeScreeningContinueSubtitle => 'Продолжите с того места, где остановились';

  @override
  String homeScreeningContinueSubtitleSpecialty(String specialty) {
    return '$specialty · продолжите с того места, где остановились';
  }

  @override
  String get onboardingWelcomeChip => 'Добро пожаловать';

  @override
  String get onboardingImpactStat => '500 000+';

  @override
  String get onboardingImpactStatCaption => 'пациентов получили лечение';

  @override
  String get onboardingImpactStatFootnote => 'в наших партнёрских больницах';

  @override
  String get onboardingImpactHeadline => 'Медицина мирового уровня на 70% дешевле';

  @override
  String get onboardingBadgeJciDescription => 'Партнёрские больницы, аккредитованные Joint Commission International';

  @override
  String get onboardingBadgeNabhDescription => 'Партнёрские больницы, аккредитованные NABH';

  @override
  String get onboardingBadgeWhoDescription =>
      'Медицинская помощь в соответствии с рекомендациями ВОЗ по безопасности пациентов';

  @override
  String get onboardingAccreditationsCaption => 'Аккредитации наших партнёрских больниц';

  @override
  String get onboardingNextPage => 'Следующая страница';

  @override
  String get onboardingTrustTitle => 'Медицина, которой можно доверять';

  @override
  String get onboardingTrustDoctorsTitle => 'Англоговорящие врачи';

  @override
  String get onboardingTrustDoctorsSubtitle => 'Общайтесь без труда.';

  @override
  String get onboardingTrustWaitTitle => 'Без ожидания';

  @override
  String get onboardingTrustWaitSubtitle => 'Получите медицинскую помощь без промедления.';

  @override
  String get onboardingTrustCertifiedTitle => 'Сертификация Joint Commission';

  @override
  String get onboardingTrustCertifiedSubtitle => 'Партнёрские клиники с международной аккредитацией.';

  @override
  String get onboardingTestimonialQuote => '«Сэкономил 45 000 \$ на операции на сердце, а уход был лучше, чем дома».';

  @override
  String get onboardingTestimonialAuthor => 'Пациент из США';

  @override
  String get onboardingTestimonialDisclaimer => 'Условный пример';

  @override
  String get onboardingStepShareTitle => 'Опишите состояние';

  @override
  String get onboardingStepShareSubtitle => 'Безопасно передайте свои медицинские данные.';

  @override
  String get onboardingStepMatchTitle => 'Получите подборку';

  @override
  String get onboardingStepMatchSubtitle => 'Наш ИИ подбирает для вас лучшие больницы.';

  @override
  String get onboardingStepCompareTitle => 'Сравните цены';

  @override
  String get onboardingStepCompareSubtitle => 'Прозрачные цены для взвешенных решений.';

  @override
  String get onboardingStepBookTitle => 'Запишитесь на лечение';

  @override
  String get onboardingStepBookSubtitle => 'Назначьте приём без лишних хлопот.';

  @override
  String get onboardingSecurityBadge => 'Зашифровано и защищено';

  @override
  String get onboardingSecurityFooter =>
      'Ваши медицинские данные зашифрованы и передаются только выбранным вами больницам';

  @override
  String get onboardingGetStarted => 'Начать';

  @override
  String get onboardingExploreAsGuest => 'Посмотреть как гость';

  @override
  String onboardingPageDots(int page, int count) {
    return 'Страница $page из $count';
  }

  @override
  String get messagesTitle => 'Сообщения';

  @override
  String get messagesContactSupport => 'Связаться с поддержкой';

  @override
  String get messagesEmptyTitle => 'Пока нет переписок';

  @override
  String get messagesEmptyMessage =>
      'Когда вы запросите смету, здесь откроется чат с больницей и вашим координатором. Вы также можете в любое время связаться с нашей службой поддержки.';

  @override
  String get messagesNoMessagesYet => 'Сообщений пока нет';

  @override
  String get messagesAttachment => 'Вложение';

  @override
  String messagesPreviewMine(String message) {
    return 'Вы: $message';
  }

  @override
  String messagesPreviewSender(String sender, String message) {
    return '$sender: $message';
  }

  @override
  String get notificationsTitle => 'Уведомления';

  @override
  String get notificationsMarkAllRead => 'Прочитать все';

  @override
  String get notificationsEmptyTitle => 'Новых уведомлений нет';

  @override
  String get notificationsEmptyMessage =>
      'Здесь будут появляться сметы, обновления бронирований, напоминания и сообщения.';

  @override
  String notificationsBellUnread(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Уведомления, $count непрочитанного',
      many: 'Уведомления, $count непрочитанных',
      few: 'Уведомления, $count непрочитанных',
      one: 'Уведомления, $count непрочитанное',
    );
    return '$_temp0';
  }

  @override
  String get supportLocationMarked => 'Место отмечено. Оно будет передано, только если вы отправите SOS.';

  @override
  String get supportRealtimeNotifications => 'Уведомления в реальном времени';

  @override
  String get supportNotificationsEmpty => 'Напоминания о приёмах и обновления появляются здесь сразу.';

  @override
  String get supportCallHelpline => 'Позвонить на линию 24/7';

  @override
  String get supportGetTranslator => 'Вызвать переводчика';

  @override
  String get supportLocalGuide => 'Местный гид';

  @override
  String get supportBookFirst => 'Сначала запишитесь на лечение или напишите в поддержку в разделе «Сообщения».';

  @override
  String get supportTranslatorRequested => 'Переводчик запрошен. Ваш координатор скоро подтвердит.';

  @override
  String get supportGuideRequested => 'Местный гид запрошен. Ваш координатор скоро подтвердит.';

  @override
  String get supportScheduleTitle => 'Ваше расписание';

  @override
  String get supportScheduleEmpty => 'Ваша больница добавит сюда приёмы.';

  @override
  String supportScheduleWhen(String weekday, String time) {
    return '$weekday, $time';
  }

  @override
  String get supportTodaysSchedule => 'Расписание на сегодня';

  @override
  String get supportNextOnSchedule => 'Далее по расписанию';

  @override
  String get supportNothingToday => 'На сегодня ничего не запланировано';

  @override
  String get cultureTipsTitle => 'Культурные советы';

  @override
  String get cultureTipsEmpty => 'Советы скоро появятся здесь.';

  @override
  String get sosButtonSemantics => 'Экстренный сигнал SOS';

  @override
  String get sosConfirmTitle => 'Отправить экстренный сигнал?';

  @override
  String get sosConfirmBody => 'Ваш координатор и наша круглосуточная служба поддержки получат сигнал немедленно.';

  @override
  String get sosMessageLabel => 'Что случилось? (необязательно)';

  @override
  String get sosShareLocationTitle => 'Передать моё текущее местоположение службе поддержки';

  @override
  String get sosShareLocationMarkedHint =>
      'Используется только для этого сигнала. Если телефон не сможет определить ваше местоположение, будет передано место, отмеченное вами на карте.';

  @override
  String get sosShareLocationHint =>
      'Используется только для этого сигнала, чтобы мы быстрее вас нашли. Телефон может запросить разрешение.';

  @override
  String get sosSendButton => 'Отправить SOS';

  @override
  String get sosGettingLocation => 'Определяем ваше местоположение…';

  @override
  String get sosSendingAlert => 'Отправляем ваш сигнал…';

  @override
  String get sosLocationShared => 'Ваше текущее местоположение передано команде.';

  @override
  String sosLocationFallbackMarked(String reason) {
    return '$reason Вместо этого передано место, отмеченное вами на карте.';
  }

  @override
  String sosLocationFallbackNone(String reason) {
    return '$reason Сообщите команде, где вы находитесь, когда вам позвонят.';
  }

  @override
  String get sosResultSentTitle => 'Помощь уже в пути';

  @override
  String get sosResultSentBody =>
      'Ваш координатор и наша круглосуточная служба поддержки получили сигнал и скоро вам позвонят.';

  @override
  String get sosResultDangerNote => 'Если ваша жизнь в опасности, немедленно позвоните в экстренные службы.';

  @override
  String get sosResultFailedTitle => 'Не удалось отправить сигнал';

  @override
  String get sosResultFailedBody => 'Пожалуйста, позвоните за помощью напрямую.';

  @override
  String get sosCallHelpline => 'Позвонить на горячую линию';

  @override
  String sosCallNumber(String number) {
    return 'Позвонить $number';
  }

  @override
  String get mapLongPressHint => 'Нажмите и удерживайте карту, чтобы отметить, где вы находитесь.';

  @override
  String get mapAttribution => 'Участники OpenStreetMap';

  @override
  String get mapZoomIn => 'Приблизить';

  @override
  String get mapZoomOut => 'Отдалить';

  @override
  String get mapShowMyPlaces => 'Показать мои места';

  @override
  String get screeningAppBarTitle => 'ИИ-скрининг';

  @override
  String get screeningStartErrorTitle => 'Не удалось начать скрининг';

  @override
  String get screeningStartPreparing => 'Готовим вашу анкету...';

  @override
  String get screeningStartHeading => 'Что привело вас в Индию?';

  @override
  String get screeningStartSubtitle =>
      'Выберите область лечения. Четыре коротких шага помогут нам подобрать подходящих врачей.';

  @override
  String get screeningStartNotSure => 'Не уверены?';

  @override
  String get screeningStartNotSureBody => 'Опишите симптомы, и мы предложим специальность.';

  @override
  String get screeningResumeTitle => 'Продолжить скрининг';

  @override
  String get screeningResumeGeneral => 'Общее';

  @override
  String get screeningLoadingAnswers => 'Загружаем ваши ответы...';

  @override
  String get screeningAlreadySubmittedAppBar => 'Скрининг';

  @override
  String get screeningResultsReadyTitle => 'Ваши результаты готовы';

  @override
  String get screeningAlreadySubmittedTitle => 'Этот скрининг уже отправлен';

  @override
  String get screeningResultsReadyMessage =>
      'Ответы больше нельзя изменить. Начните новый скрининг, чтобы ответить заново.';

  @override
  String get screeningAnalysingMessage => 'Мы анализируем ваши ответы.';

  @override
  String get screeningViewMatches => 'Посмотреть варианты';

  @override
  String get screeningSeeProgress => 'Посмотреть ход';

  @override
  String get screeningStartNewButton => 'Начать новый скрининг';

  @override
  String get screeningProcessingStepAnalyzing => 'Анализируем ваше состояние';

  @override
  String get screeningProcessingStepMatching => 'Подбираем специалистов';

  @override
  String get screeningProcessingStepSavings => 'Рассчитываем экономию';

  @override
  String screeningChecklistRowSemantics(String label, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'done': 'готово', 'active': 'выполняется', 'other': 'ожидание'});
    return '$label, $_temp0';
  }

  @override
  String get screeningProcessingHelpTitle => 'Что происходит?';

  @override
  String get screeningProcessingHelpBody =>
      'Мы изучаем ваши ответы (с помощью ИИ, если вы дали согласие), предлагаем подходящую специальность и подбираем аккредитованные больницы и врачей Индии с учётом опыта, языка, бюджета и доступности. Обычно это занимает меньше минуты. Это не диагноз.';

  @override
  String get screeningProcessingReady => 'Ваши варианты готовы!';

  @override
  String get screeningProcessingFinding => 'Ищем лучший вариант для вас...';

  @override
  String get screeningProcessingTip =>
      'Совет: можно сравнить до 3 вариантов рядом и увидеть полную разбивку стоимости.';

  @override
  String get screeningProcessingFailedTitle => 'Не удалось завершить анализ';

  @override
  String get screeningProcessingFailedMessage => 'При анализе ваших ответов произошла ошибка.';

  @override
  String get screeningProcessingTimeoutTitle => 'Это занимает больше времени, чем обычно';

  @override
  String get screeningProcessingTimeoutMessage =>
      'Мы сообщим вам, как только варианты будут готовы. Можно подождать или вернуться позже.';

  @override
  String get screeningProcessingKeepWaiting => 'Подождать ещё';

  @override
  String get screeningGoHome => 'На главную';

  @override
  String get screeningNotSubmittedTitle => 'Этот скрининг не отправлен';

  @override
  String get screeningNotSubmittedMessage => 'Заполните анкету до конца, чтобы получить подходящие варианты.';

  @override
  String get screeningContinueQuestionnaire => 'Продолжить анкету';

  @override
  String get screeningProcessingLostTitle => 'Мы потеряли связь с вашим скринингом';

  @override
  String get screeningPrevious => 'Назад';

  @override
  String get screeningHelpTooltip => 'Справка';

  @override
  String get screeningHelpDialogTitle => 'Как это работает';

  @override
  String get screeningHelpGotIt => 'Понятно';

  @override
  String get screeningSaveExit => 'Сохранить и выйти';

  @override
  String get screeningProgressSaved => 'Прогресс сохранён. Продолжить можно в любое время с главного экрана.';

  @override
  String get screeningValidateBodyArea => 'Коснитесь изображения тела, чтобы выбрать хотя бы одну область.';

  @override
  String get screeningValidateSymptoms => 'Ответьте «да» или «возможно» хотя бы на один симптом или добавьте свой.';

  @override
  String get screeningValidateDuration => 'Укажите, как давно у вас это состояние.';

  @override
  String get screeningValidateBudget => 'Минимальный бюджет не может превышать максимальный.';

  @override
  String get screeningValidateTravelWindow => 'Период поездки должен заканчиваться после его начала.';

  @override
  String get screeningStep1Title => 'Где вас беспокоит?';

  @override
  String get screeningStep1Subtitle => 'Коснитесь изображения тела, чтобы выбрать область.';

  @override
  String screeningStep1SubtitleWithSpecialty(String specialty) {
    return 'Коснитесь изображения тела, чтобы выбрать область · $specialty';
  }

  @override
  String get screeningNoAreaSelected => 'Область ещё не выбрана';

  @override
  String get screeningStep2Title => 'Какие у вас симптомы?';

  @override
  String get screeningStep2Help =>
      'Смахните карточку вправо (или нажмите галочку), если симптом есть, влево (или X), если нет, и вверх (или -), если не уверены. Ниже добавьте то, о чём мы не спросили.';

  @override
  String get screeningSymptomsLoading => 'Загружаем подсказки...';

  @override
  String get screeningSymptomsUnavailable => 'Подсказки недоступны. Добавьте симптомы ниже.';

  @override
  String get screeningYourSymptoms => 'Ваши симптомы';

  @override
  String get screeningYourSymptomsEmpty => 'Здесь появятся симптомы, на которые вы ответили «да» или «возможно».';

  @override
  String screeningSymptomMaybeChip(String name) {
    return '$name (возможно)';
  }

  @override
  String get screeningAddAnotherSymptom => 'Добавить другой симптом';

  @override
  String screeningSymptomTooLong(int max) {
    return 'Описание симптома должно быть короче $max символов.';
  }

  @override
  String screeningSymptomLimit(int max) {
    return 'Можно добавить не более $max симптомов.';
  }

  @override
  String get screeningStep3Title => 'Как давно у вас это состояние?';

  @override
  String get screeningDecrease => 'Уменьшить';

  @override
  String get screeningIncrease => 'Увеличить';

  @override
  String get screeningSeverity => 'Тяжесть';

  @override
  String get screeningDailyImpact => 'Влияние на повседневную жизнь';

  @override
  String get screeningImpactWork => 'Работа';

  @override
  String get screeningImpactSleep => 'Сон';

  @override
  String get screeningImpactMobility => 'Подвижность';

  @override
  String get screeningImpactWorkQuestion => 'Насколько это мешает вашей работе?';

  @override
  String get screeningImpactSleepQuestion => 'Насколько это мешает вашему сну?';

  @override
  String get screeningImpactMobilityQuestion => 'Насколько это ограничивает подвижность?';

  @override
  String screeningSeverityPillSemantics(String dimension, String level) {
    return '$dimension $level';
  }

  @override
  String get screeningPreviousTreatments => 'Предыдущее лечение';

  @override
  String get screeningPreviousReports => 'Предыдущие отчёты';

  @override
  String get screeningOptionalParen => '(необязательно)';

  @override
  String get screeningScanUpload => 'Отсканируйте или загрузите медицинские отчёты';

  @override
  String get screeningScanUploadHint =>
      'Сфотографируйте бумажные страницы или выберите PDF · наш ИИ прочитает их, а вы подтвердите данные';

  @override
  String get screeningAttachWithoutAi => 'Прикрепить файл без ИИ (например, DICOM)';

  @override
  String get screeningNotesLabel => 'Что-то ещё, что нам нужно знать? (необязательно)';

  @override
  String screeningRemoveReportTooltip(String name) {
    return 'Удалить $name';
  }

  @override
  String screeningAttachLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Можно прикрепить не более $count отчёта.',
      many: 'Можно прикрепить не более $count отчётов.',
      few: 'Можно прикрепить не более $count отчётов.',
      one: 'Можно прикрепить не более $count отчёта.',
    );
    return '$_temp0';
  }

  @override
  String screeningAttachPagesLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'К скринингу можно прикрепить не более $count страницы отчёта.',
      many: 'К скринингу можно прикрепить не более $count страниц отчёта.',
      few: 'К скринингу можно прикрепить не более $count страниц отчёта.',
      one: 'К скринингу можно прикрепить не более $count страницы отчёта.',
    );
    return '$_temp0';
  }

  @override
  String get screeningReportDefaultLabel => 'Медицинский отчёт';

  @override
  String screeningReportNumbered(int index) {
    return 'Медицинский отчёт $index';
  }

  @override
  String screeningReportPage(String label, int page) {
    return '$label с.$page';
  }

  @override
  String get screeningReportAiConfirmed => 'Распознавание ИИ подтверждено';

  @override
  String get screeningReportAiToReview => 'Распознавание ИИ нужно проверить';

  @override
  String get screeningStep4Title => 'Настройте подбор';

  @override
  String get screeningFindDoctors => 'Найти врачей';

  @override
  String get screeningSkipDefaults => 'Пропустить (по умолчанию)';

  @override
  String get screeningLangHindi => 'Хинди';

  @override
  String get screeningLangEnglish => 'Английский';

  @override
  String get screeningLangArabic => 'Арабский';

  @override
  String get screeningLangSpanish => 'Испанский';

  @override
  String get screeningLangFrench => 'Французский';

  @override
  String get screeningLangRussian => 'Русский';

  @override
  String get screeningPrefDoctorGender => 'Пол врача';

  @override
  String get screeningPrefBudgetRange => 'Диапазон бюджета';

  @override
  String get screeningPrefYourBudget => 'Ваш бюджет';

  @override
  String get screeningPrefAnyBudget => 'Любой бюджет';

  @override
  String get screeningPrefClearBudget => 'Сбросить бюджет';

  @override
  String get screeningPrefTravelWindow => 'Период поездки';

  @override
  String screeningPrefTravelFrom(String date) {
    return 'С $date - выберите дату окончания';
  }

  @override
  String screeningPrefTravelRange(String start, String end) {
    return '$start - $end';
  }

  @override
  String get screeningPrefUseAi => 'Рекомендации ИИ';

  @override
  String get screeningPrefUseAiOn => 'Перед анализом потребуется ваше согласие';

  @override
  String get screeningPrefUseAiOff => 'Стандартный подбор по правилам';

  @override
  String get consentAiTitle => 'Использовать рекомендации ИИ?';

  @override
  String get consentAiPointData =>
      'Ваши ответы (и приложенные отчёты) отправляются в наш ИИ-сервис, чтобы предложить подходящие специальности, процедуры и вопросы для вашего врача.';

  @override
  String get consentAiPointNotDiagnosis =>
      'Это не диагноз. Перед любым лечением квалифицированный врач больницы изучит ваш случай.';

  @override
  String get consentAiPointPrivacy =>
      'Ваши данные используются только для этого скрининга и никогда не продаются. Вы можете отозвать согласие в своём профиле.';

  @override
  String get consentAiPointAlternative =>
      'Не хотите? Тогда мы подберём варианты с помощью нашей стандартной системы на основе правил.';

  @override
  String get consentAiAgree => 'Даю согласие, использовать ИИ';

  @override
  String get consentAiDecline => 'Стандартный подбор';

  @override
  String get bodyMapHead => 'Голова';

  @override
  String get bodyMapNeck => 'Шея';

  @override
  String get bodyMapChest => 'Грудь';

  @override
  String get bodyMapAbdomen => 'Живот';

  @override
  String get bodyMapPelvis => 'Таз';

  @override
  String get bodyMapRegionBack => 'Спина';

  @override
  String get bodyMapLeftArm => 'Левая рука';

  @override
  String get bodyMapRightArm => 'Правая рука';

  @override
  String get bodyMapLeftLeg => 'Левая нога';

  @override
  String get bodyMapRightLeg => 'Правая нога';

  @override
  String get bodyMapSkin => 'Кожа';

  @override
  String get bodyMapGeneral => 'Всё тело / общее';

  @override
  String get bodyMapViewFront => 'Спереди';

  @override
  String get bodyMapViewBack => 'Сзади';

  @override
  String get painIntensityTitle => 'Интенсивность боли';

  @override
  String get painNone => 'Нет боли';

  @override
  String get painMild => 'Слабая';

  @override
  String get painModerate => 'Умеренная';

  @override
  String get painSevere => 'Сильная';

  @override
  String get painWorst => 'Невыносимая';

  @override
  String painValueLabel(int value, String label) {
    return '$value/10 · $label';
  }

  @override
  String painSemantics(int value, String label) {
    return 'Боль $value из 10, $label';
  }

  @override
  String get emergencyTitle => 'Экстренная ситуация — немедленно обратитесь за помощью на месте';

  @override
  String get emergencyBody =>
      'Некоторые ваши ответы могут указывать на неотложное медицинское состояние. Не ждите поездки. Немедленно обратитесь в ближайшее отделение неотложной помощи или позвоните по местному номеру экстренной службы.';

  @override
  String get emergencyWarningSigns => 'Тревожные признаки, которые мы заметили';

  @override
  String get emergencyNotDiagnosis => 'Этот скрининг не является диагнозом.';

  @override
  String emergencyCallButton(String number) {
    return 'Позвонить в экстренные службы ($number)';
  }

  @override
  String emergencyDialNow(String number) {
    return 'Сейчас же наберите $number со своего телефона.';
  }

  @override
  String get emergencyAckViewResults => 'Я понимаю - всё равно показать результаты';

  @override
  String get emergencyAckContinueRisk => 'Я понимаю риск - продолжить';

  @override
  String get symptomDeckAllAnswered => 'На все подсказки даны ответы. Добавьте остальное ниже.';

  @override
  String symptomCardSemantics(String name) {
    return '$name. Есть ли у вас этот симптом? Смахните вправо — да, влево — нет, вверх — возможно.';
  }

  @override
  String get symptomSwipeOrTap => 'Смахните или нажмите, чтобы ответить';

  @override
  String symptomAnswerSemantics(String answer) {
    return 'Ответ: $answer';
  }

  @override
  String symptomAnswerTooltip(String answer, String name) {
    return '$answer: $name';
  }

  @override
  String get symptomAddTooltip => 'Добавить симптом';

  @override
  String symptomRemoveTooltip(String name) {
    return 'Удалить $name';
  }

  @override
  String get intakeAppliedBodyAreas => 'области тела';

  @override
  String get intakeAppliedPainIntensity => 'интенсивность боли';

  @override
  String get intakeAppliedSymptoms => 'симптомы';

  @override
  String get intakeAppliedDuration => 'длительность';

  @override
  String get intakeAppliedDailyImpact => 'влияние на повседневную жизнь';

  @override
  String get intakeAppliedPreviousTreatments => 'предыдущее лечение';

  @override
  String get intakeAppliedNotes => 'заметки';

  @override
  String get intakeListSeparator => ', ';

  @override
  String intakeVoiceAddedOnly(String fields) {
    return 'Добавлено: $fields.';
  }

  @override
  String intakeVoiceUpdatedOnly(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Обновлено $count ответа.',
      many: 'Обновлено $count ответов.',
      few: 'Обновлено $count ответа.',
      one: 'Обновлён $count ответ.',
    );
    return '$_temp0';
  }

  @override
  String intakeVoiceAddedAndUpdated(String fields, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Добавлено: $fields; обновлено $count ответа.',
      many: 'Добавлено: $fields; обновлено $count ответов.',
      few: 'Добавлено: $fields; обновлено $count ответа.',
      one: 'Добавлено: $fields; обновлён $count ответ.',
    );
    return '$_temp0';
  }

  @override
  String get intakeVoiceAlreadyMatch => 'Ваши ответы уже совпадают с тем, что вы сказали.';

  @override
  String get intakeConflictPainIntensity => 'Интенсивность боли';

  @override
  String get intakeConflictHowLong => 'Как долго';

  @override
  String intakeConflictDailyImpact(String dimension) {
    return 'Влияние на повседневную жизнь: $dimension';
  }

  @override
  String intakeDurationValue(int value, String unit) {
    return '$value $unit';
  }

  @override
  String get intakeConflictTitle => 'Некоторые ответы различаются';

  @override
  String get intakeConflictHint =>
      'Отметьте ответы, которые нужно заменить сказанным. Неотмеченные ответы останутся без изменений.';

  @override
  String intakeConflictCompare(String current, String suggested) {
    return 'Ваш ответ: $current\nИз голоса: $suggested';
  }

  @override
  String get intakeMedicalArea => 'Медицинская область';

  @override
  String get intakeSpecialtyOptional => 'Специальность (необязательно)';

  @override
  String get intakeNotSure => 'Не знаю';

  @override
  String get intakeWhereProblem => 'Где проблема?';

  @override
  String get intakeAddPain => 'Указать интенсивность боли';

  @override
  String get intakeSymptoms => 'Симптомы';

  @override
  String get intakeAddSymptomHint => 'Добавьте симптом';

  @override
  String get intakeHowLong => 'Как давно это у вас?';

  @override
  String get intakeDailyImpact => 'Влияние на повседневную жизнь';

  @override
  String get intakePreviousTreatments => 'Предыдущее лечение';

  @override
  String get intakeNotesLabel => 'Заметки';

  @override
  String get intakeNotesHint => 'Что ещё следует знать врачу';

  @override
  String get voiceIntakeTitle => 'Опишите голосом';

  @override
  String get voiceReviewTitle => 'Проверьте ответы';

  @override
  String get voiceIntro =>
      'Расскажите своими словами, где болит, с какого времени, насколько сильно и что вы уже пробовали.';

  @override
  String get voiceMicOff =>
      'Доступ к микрофону выключен. Разрешите его для Heal India Global в настройках телефона или введите текст.';

  @override
  String get voiceStartFailed => 'Не удалось начать запись. Попробуйте снова или введите текст.';

  @override
  String get voiceNothingRecorded => 'Ничего не записано. Попробуйте снова.';

  @override
  String get voiceConsentRequired => 'Сначала дайте согласие на обработку записи.';

  @override
  String get voiceNotUnderstood =>
      'Не удалось распознать запись. Попробуйте снова в более тихом месте или введите текст.';

  @override
  String get voiceExtractTooShort => 'Опишите проблему хотя бы в нескольких словах.';

  @override
  String get voiceEmergencyAck => 'Я понимаю - продолжить проверку ответов';

  @override
  String get voiceStopRecording => 'Остановить запись';

  @override
  String get voiceRecordAgain => 'Записать заново';

  @override
  String get voiceStartRecording => 'Начать запись';

  @override
  String voiceRecordedStatus(String duration) {
    return 'Записано $duration · нажмите, чтобы записать заново';
  }

  @override
  String get voiceTapToStart => 'Нажмите и говорите';

  @override
  String get voiceInputLevel => 'Уровень сигнала';

  @override
  String get voiceConsentText =>
      'Я даю согласие на расшифровку моей записи на собственных серверах Heal India Global и на то, что ИИ преобразует её в ответы для моего скрининга. Аудио удаляется после расшифровки. Я проверю всё перед использованием.';

  @override
  String get voiceUseRecording => 'Использовать запись';

  @override
  String get voiceTypeInstead => 'Ввести текстом';

  @override
  String get voiceTypedHint => 'Опишите проблему своими словами…';

  @override
  String get voiceFillAnswers => 'Заполнить ответы';

  @override
  String get voiceSpeakInstead => 'Сказать голосом';

  @override
  String get voiceUploading => 'Загружаем запись…';

  @override
  String get voiceReading => 'Читаем ваше описание…';

  @override
  String get voiceListening => 'Слушаем вашу запись…';

  @override
  String get voiceCheckEveryAnswer => 'Вы проверите каждый ответ перед использованием.';

  @override
  String get voiceEmergencyBanner =>
      'Некоторые описанные вами симптомы могут требовать срочной помощи. Пожалуйста, немедленно обратитесь за неотложной помощью на месте.';

  @override
  String get voiceGuidance => 'Рекомендации';

  @override
  String get voiceReviewIntro => 'Проверьте, что мы поняли. Исправьте неверное и нажмите «Подтвердить».';

  @override
  String get voiceYourDescription => 'Ваше описание';

  @override
  String get voiceWhatYouSaid => 'Что вы сказали';

  @override
  String get voiceAiDisclaimer => 'Предложения, созданные ИИ, — не диагноз.';

  @override
  String get voiceDiscard => 'Удалить';

  @override
  String get searchHint => 'Поиск больниц, врачей, методов лечения';

  @override
  String get searchClearTooltip => 'Очистить поиск';

  @override
  String get searchFiltersTooltip => 'Фильтры';

  @override
  String get searchTabHospitals => 'Больницы';

  @override
  String get searchTabDoctors => 'Врачи';

  @override
  String get searchTabProcedures => 'Процедуры';

  @override
  String get searchEmptyTryDifferent => 'Измените запрос или сбросьте фильтры.';

  @override
  String get searchEmptyCheckBack => 'Загляните позже: новые партнёры добавляются регулярно.';

  @override
  String get searchClearFilters => 'Сбросить фильтры';

  @override
  String get searchNoHospitalsFound => 'Больницы не найдены';

  @override
  String get searchNoDoctorsFound => 'Врачи не найдены';

  @override
  String get searchNoProceduresFound => 'Процедуры не найдены';

  @override
  String searchGenderDoctorsChip(String gender, String label) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'female': 'Женщины-врачи',
      'male': 'Мужчины-врачи',
      'other': 'Врачи ($label)',
    });
    return '$_temp0';
  }

  @override
  String searchResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count результата',
      many: '$count результатов',
      few: '$count результата',
      one: '$count результат',
    );
    return '$_temp0';
  }

  @override
  String get filtersTitle => 'Фильтры';

  @override
  String get filtersSpecialtyLabel => 'Специальность';

  @override
  String get filtersAnySpecialty => 'Любая специальность';

  @override
  String get filtersCityLabel => 'Город';

  @override
  String get filtersCityHint => 'например, Нью-Дели, Ченнаи';

  @override
  String get filtersAccreditationLabel => 'Аккредитация (больницы)';

  @override
  String get filtersLanguageLabel => 'Язык общения';

  @override
  String get filtersDoctorGenderLabel => 'Пол врача';

  @override
  String get filtersSortLabel => 'Сортировать больницы';

  @override
  String get filtersShowResults => 'Показать результаты';

  @override
  String get filtersSortTopRated => 'Высокий рейтинг';

  @override
  String get filtersSortLowestPrice => 'Низкая цена';

  @override
  String get filtersSortName => 'Название (A-Z)';

  @override
  String get filtersLanguageEnglish => 'Английский';

  @override
  String get filtersLanguageHindi => 'Хинди';

  @override
  String get filtersLanguageArabic => 'Арабский';

  @override
  String get filtersLanguageFrench => 'Французский';

  @override
  String get filtersLanguageRussian => 'Русский';

  @override
  String get filtersLanguageBengali => 'Бенгальский';

  @override
  String get filtersLanguageSwahili => 'Суахили';

  @override
  String get filtersLanguageSpanish => 'Испанский';

  @override
  String catalogApproxPriceTooltip(String amount) {
    return 'Оценка на основе $amount по сегодняшнему курсу';
  }

  @override
  String get catalogInternationalDesk => 'Международный отдел';

  @override
  String get catalogInternationalPatientDesk => 'Отдел для иностранных пациентов';

  @override
  String get catalogPriceFromPrefix => 'от ';

  @override
  String catalogSuccessBadge(int pct) {
    return 'Успех $pct%';
  }

  @override
  String get catalogVideoConsult => 'Видеоконсультация';

  @override
  String catalogDaysInHospital(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня в больнице',
      many: '$count дней в больнице',
      few: '$count дня в больнице',
      one: '$count день в больнице',
    );
    return '$_temp0';
  }

  @override
  String catalogPercent(int value) {
    return '$value%';
  }

  @override
  String get catalogAboutSection => 'Описание';

  @override
  String get catalogLanguagesSpoken => 'Языки общения';

  @override
  String get catalogTreatmentsPrices => 'Лечение и цены';

  @override
  String get catalogShowLess => 'Свернуть';

  @override
  String get catalogReadMore => 'Читать далее';

  @override
  String catalogCouldNotOpen(String target) {
    return 'Не удалось открыть $target';
  }

  @override
  String get catalogGetMatched => 'Подобрать врача';

  @override
  String get hospitalDetailNotFound => 'Больница не найдена';

  @override
  String get hospitalDetailEstablished => 'Год основания';

  @override
  String get hospitalDetailBeds => 'Койки';

  @override
  String hospitalDetailDistanceKm(String distance) {
    return '$distance км';
  }

  @override
  String get hospitalDetailFromAirport => 'От аэропорта';

  @override
  String get hospitalDetailTreatmentsFrom => 'Лечение от ';

  @override
  String get hospitalDetailSpecialties => 'Специализации';

  @override
  String get hospitalDetailPricesIndicative =>
      'Цены ориентировочные. Окончательное предложение больница пришлёт после рассмотрения вашего случая.';

  @override
  String get hospitalDetailDoctors => 'Врачи';

  @override
  String get hospitalDetailPatientReviews => 'Отзывы пациентов';

  @override
  String get hospitalDetailContact => 'Контакты';

  @override
  String get hospitalDetailContactViaCoordinator =>
      'После запроса предложения связывайтесь с больницей через вашего координатора Heal India Global.';

  @override
  String get doctorDetailTitle => 'Профиль врача';

  @override
  String doctorDetailExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count года',
      many: '$count лет',
      few: '$count года',
      one: '$count год',
    );
    return '$_temp0';
  }

  @override
  String get doctorDetailExperience => 'Опыт';

  @override
  String get doctorDetailSuccessRate => 'Успешность';

  @override
  String doctorDetailReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count отзыва',
      many: '$count отзывов',
      few: '$count отзыва',
      one: '$count отзыв',
    );
    return '$_temp0';
  }

  @override
  String get doctorDetailVideoConsultAvailable => 'Доступна видеоконсультация';

  @override
  String get doctorDetailConsultationFee => 'Стоимость консультации';

  @override
  String get doctorDetailQualifications => 'Квалификация';

  @override
  String get doctorDetailExpertise => 'Области специализации';

  @override
  String get availabilitySection => 'Свободные даты';

  @override
  String get availabilityNext30Days => 'Свободные даты (ближайшие 30 дней)';

  @override
  String get availabilityNoSlots =>
      'Свободное время пока не опубликовано - запросите предложение, и больница предложит даты.';

  @override
  String availabilityNextAvailable(String date) {
    return 'Ближайшая дата: $date';
  }

  @override
  String availabilityDayAvailable(String day) {
    return '$day: есть места';
  }

  @override
  String availabilityDayUnavailable(String day) {
    return '$day: нет мест';
  }

  @override
  String procedureDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня',
      many: '$count дней',
      few: '$count дня',
      one: '$count день',
    );
    return '$_temp0';
  }

  @override
  String get procedureInHospital => 'В больнице';

  @override
  String get procedureRecovery => 'Восстановление';

  @override
  String get procedureTotalStayInIndia => 'Всего в Индии';

  @override
  String procedureTypicalCostIn(String country) {
    return 'Обычная стоимость ($country)';
  }

  @override
  String procedureWaitTime(String time) {
    return 'Время ожидания: $time';
  }

  @override
  String get procedureCompareCosts => 'Сравнить стоимость';

  @override
  String get quoteRequestButton => 'Запросить цену';

  @override
  String get quoteRequestedSnack => 'Запрос отправлен. Больница обычно отвечает в течение 48 часов.';

  @override
  String get quoteSheetTitle => 'Запрос цены';

  @override
  String get quoteTreatmentLabel => 'Лечение (необязательно)';

  @override
  String get quoteTreatmentNotSure => 'Пока не знаю';

  @override
  String get quoteNotesLabel => 'Расскажите больнице о вашем состоянии';

  @override
  String get quoteNotesHint => 'Диагноз, текущее лечение, желаемые даты поездки...';

  @override
  String quoteConsent(String hospital) {
    return 'Я соглашаюсь передать свой профиль, медицинские заметки и документы больнице $hospital для подготовки предложения.';
  }

  @override
  String get quoteSendRequest => 'Отправить запрос';

  @override
  String get savedRemovedSnack => 'Удалено из сохранённого';

  @override
  String get savedAddedSnack => 'Добавлено в ваш список';

  @override
  String get savedGuestPrompt => 'Создайте бесплатный аккаунт, чтобы сохранять больницы и врачей.';

  @override
  String get savedSignUpAction => 'Регистрация';

  @override
  String get savedRemoveTooltip => 'Удалить из сохранённого';

  @override
  String get matchSortBestMatch => 'Лучшее совпадение';

  @override
  String get matchSortLowestCost => 'Самая низкая стоимость';

  @override
  String get matchSortHighestRating => 'Самый высокий рейтинг';

  @override
  String get matchSortMostExperience => 'Наибольший опыт';

  @override
  String get matchSortBy => 'Сортировка';

  @override
  String get matchFilterTitle => 'Фильтр';

  @override
  String get matchFilterJciOnly => 'Только больницы с аккредитацией JCI';

  @override
  String get matchFilterVideoConsult => 'Есть видеоконсультация';

  @override
  String get matchFilterSpeaks => 'Говорит на языках';

  @override
  String get matchCardEstimatedTotalCost => 'Ориентировочная общая стоимость';

  @override
  String matchCardSaveVsHome(int min, int max) {
    return 'Экономия $min-$max% по сравнению с вашей страной';
  }

  @override
  String get matchCardAdded => 'Добавлено';

  @override
  String get matchCardCompare => 'Сравнить';

  @override
  String get matchCardViewDetails => 'Подробнее';

  @override
  String get matchDetailWhyThisMatch => 'Почему этот вариант подходит';

  @override
  String get matchDetailEstimatedCost => 'Ориентировочная стоимость';

  @override
  String matchDetailInCountry(String country) {
    return '$country: ';
  }

  @override
  String matchDetailSavePct(int min, int max) {
    return 'Экономия $min-$max%';
  }

  @override
  String get matchDetailFinalPriceNote =>
      'Окончательная цена будет указана в предложении больницы после рассмотрения вашего случая.';

  @override
  String get matchDetailSeeFullComparison => 'Полное сравнение стоимости';

  @override
  String get matchDetailSuggestedPackage => 'Рекомендуемый пакет';

  @override
  String get matchDetailCompareCosts => 'Сравнить стоимость';

  @override
  String get matchDetailProceduresPackages => 'Процедуры и пакеты';

  @override
  String get compareTitleShort => 'Сравнение';

  @override
  String get compareTitle => 'Сравнение вариантов';

  @override
  String get compareNothingTitle => 'Нечего сравнивать';

  @override
  String get compareNothingMessage => 'Выберите 2 или 3 варианта из результатов, чтобы сравнить их рядом.';

  @override
  String get compareStartScreening => 'Начать первичную оценку';

  @override
  String get compareNoLongerAvailable => 'Эти варианты больше недоступны';

  @override
  String get compareBackToMatches => 'Назад к вариантам';

  @override
  String get compareRowMatch => 'Совпадение';

  @override
  String compareExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count года',
      many: '$count лет',
      few: '$count года',
      one: '$count год',
    );
    return '$_temp0';
  }

  @override
  String get compareRowRating => 'Рейтинг';

  @override
  String get compareRowHospital => 'Больница';

  @override
  String get compareRowAccreditation => 'Аккредитация';

  @override
  String get compareRowLanguages => 'Языки';

  @override
  String get compareRowEstCost => 'Ориент. стоимость';

  @override
  String get compareLowest => 'Самая низкая';

  @override
  String get compareRowSavings => 'Экономия';

  @override
  String comparePercentRange(int min, int max) {
    return '$min-$max%';
  }

  @override
  String get compareRowPackage => 'Пакет';

  @override
  String get compareRowWhy => 'Почему';

  @override
  String get compareBook => 'Записаться';

  @override
  String get compareDetails => 'Подробнее';

  @override
  String consultationRequestSentSnack(String caseNumber, String hospital) {
    return 'Запрос $caseNumber отправлен: $hospital.';
  }

  @override
  String get consultationConsentRequired => 'Пожалуйста, подтвердите согласие на передачу ваших данных больнице.';

  @override
  String get consultationGuestUpgrade =>
      'Создайте бесплатный аккаунт, чтобы отправлять запросы в больницы. Ваши ответы первичной оценки сохранятся.';

  @override
  String get consultationBookTitle => 'Записаться на консультацию';

  @override
  String get consultationMessageLabel => 'Сообщение для больницы (необязательно)';

  @override
  String get consultationMessageHint => 'Желаемые даты, вопросы, сопровождающие вас лица...';

  @override
  String consultationConsent(String hospital) {
    return 'Я соглашаюсь передать ответы первичной оценки, медицинские заключения и медицинскую информацию больнице $hospital, чтобы там рассмотрели мой случай и подготовили предложение.';
  }

  @override
  String get consultationCreateAccount => 'Создать бесплатный аккаунт';

  @override
  String get consultationPayAfterAccept =>
      'Больница пришлёт персональное предложение. Вы платите только после того, как примете его.';

  @override
  String get costTitle => 'Сравнение стоимости лечения';

  @override
  String get costFindHospitals => 'Найти больницы';

  @override
  String get costChangeCountryTooltip => 'Изменить страну проживания';

  @override
  String costCompareWith(String country) {
    return 'Сравнить: $country';
  }

  @override
  String costTreatmentIn(String country) {
    return 'Лечение: $country';
  }

  @override
  String get costTreatmentInIndia => 'Лечение в Индии';

  @override
  String get costRowCost => 'Стоимость';

  @override
  String get costRowWaitTime => 'Время ожидания';

  @override
  String get costVaries => 'По-разному';

  @override
  String get costRowInsurance => 'Страховое покрытие';

  @override
  String get costVariesByPlan => 'Зависит от полиса';

  @override
  String get costIndiaDefaultWait => '1-2 недели';

  @override
  String costSavingsValue(String amount, int min, int max) {
    return '$amount ($min-$max%)';
  }

  @override
  String get costItemizedTitle => 'Подробная структура стоимости';

  @override
  String get costDisclaimer =>
      'Оценки приведены только для сравнения. Окончательная цена указывается в персональном предложении больницы. Данные по вашей стране - типичные опубликованные диапазоны; они зависят от поставщика услуг и страховки.';

  @override
  String get costBreakdownInQuote => 'Подробная разбивка стоимости будет в предложении больницы.';

  @override
  String costTypicalIn(String country) {
    return 'Обычно ($country)';
  }

  @override
  String get costChooseTreatment => 'Выберите лечение';

  @override
  String get costChooseTreatmentSubtitle => 'Сравните его стоимость в вашей стране и в Индии.';

  @override
  String get costSearchTreatments => 'Поиск лечения';

  @override
  String get costNoTreatmentsFound => 'Лечение не найдено';

  @override
  String get costCategorySurgery => 'Операция';

  @override
  String get costCategoryHospital => 'Больница';

  @override
  String get costCategoryMedications => 'Лекарства';

  @override
  String get costCategoryTestsScans => 'Анализы и обследования';

  @override
  String get costCategoryDoctorFees => 'Услуги врачей';

  @override
  String get costCategoryImplants => 'Импланты';

  @override
  String get costCategoryOther => 'Прочее';

  @override
  String get costCategorySurgeryHint => 'Услуги хирурга и анестезиолога, операционная и расходные материалы.';

  @override
  String get costCategoryHospitalHint => 'Палата, сестринский уход, питание и реанимация при необходимости.';

  @override
  String get costCategoryMedicationsHint => 'Лекарства во время пребывания и при выписке.';

  @override
  String get costCategoryTestsScansHint => 'Предоперационные анализы, визуализация и лабораторные исследования.';

  @override
  String get costCategoryDoctorFeesHint => 'Консультации и повторные визиты.';

  @override
  String get costCategoryImplantsHint => 'Импланты, стенты или протезы при необходимости.';

  @override
  String get costCategoryOtherHint => 'Прочие расходы, включённые в оценку.';

  @override
  String get costCountryUs => 'США';

  @override
  String get costCountryGb => 'Великобритания';

  @override
  String get costCountryCa => 'Канада';

  @override
  String get costCountryAu => 'Австралия';

  @override
  String get costCountryNz => 'Новая Зеландия';

  @override
  String get costCountryAe => 'ОАЭ';

  @override
  String get costCountrySa => 'Саудовская Аравия';

  @override
  String get costCountryOm => 'Оман';

  @override
  String get costCountryQa => 'Катар';

  @override
  String get costCountryKw => 'Кувейт';

  @override
  String get costCountryBh => 'Бахрейн';

  @override
  String get costCountryIq => 'Ирак';

  @override
  String get costCountryNg => 'Нигерия';

  @override
  String get costCountryKe => 'Кения';

  @override
  String get costCountryTz => 'Танзания';

  @override
  String get costCountryEt => 'Эфиопия';

  @override
  String get costCountryBd => 'Бангладеш';

  @override
  String get costCountryNp => 'Непал';

  @override
  String get costCountryLk => 'Шри-Ланка';

  @override
  String get costCountryAf => 'Афганистан';

  @override
  String get costCountryUz => 'Узбекистан';

  @override
  String get costCountryDe => 'Германия';

  @override
  String get costCountryFr => 'Франция';

  @override
  String get costCountryEs => 'Испания';

  @override
  String get costCountryIt => 'Италия';

  @override
  String get costCountryRu => 'Россия';

  @override
  String get costCountryIn => 'Индия';

  @override
  String get costCountryYours => 'ваша страна';

  @override
  String get paymentDueDeposit => 'Депозит к оплате сейчас';

  @override
  String get paymentDueBalance => 'Остаток к оплате сейчас';

  @override
  String get paymentDueNow => 'К оплате сейчас';

  @override
  String get paymentDueInstallment => 'Взнос к оплате сейчас';

  @override
  String paymentDueInstallmentSeq(int seq) {
    return 'Взнос $seq к оплате сейчас';
  }

  @override
  String bookingStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня',
      many: '$count дней',
      few: '$count дня',
      one: '$count день',
    );
    return '$_temp0';
  }

  @override
  String bookingStayDaysRange(int min, int max) {
    return '$min-$max дн.';
  }

  @override
  String get paymentTitle => 'Оплата';

  @override
  String get paymentSecureTitle => 'Безопасная оплата';

  @override
  String get paymentSecureBody =>
      'Зашифрованная оплата через нашего платёжного партнёра. Данные карты никогда не попадают на наши серверы.';

  @override
  String get paymentMethodSection => 'Способ оплаты';

  @override
  String get paymentMethodCard => 'Кредитная/дебетовая карта';

  @override
  String get paymentMethodCardAppOnly => 'Доступно в приложении для Android и iOS';

  @override
  String get bankTransferTitle => 'Банковский перевод';

  @override
  String get bankSwiftDetails => 'Реквизиты SWIFT';

  @override
  String get paymentTestTitle => 'Тестовый платёж';

  @override
  String get paymentTestSubtitle => 'Тестовый шлюз — реальные деньги не списываются';

  @override
  String get paymentPlansTitle => 'Планы оплаты';

  @override
  String paymentPlansOnBooking(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ежемесячного платежа по этому бронированию',
      many: '$count ежемесячных платежей по этому бронированию',
      few: '$count ежемесячных платежа по этому бронированию',
      one: '$count ежемесячный платёж по этому бронированию',
    );
    return '$_temp0';
  }

  @override
  String get paymentPlansChosenWhenBooking => '3, 6 или 12 месяцев — выбирается при бронировании';

  @override
  String get paymentInsurance => 'Страховка';

  @override
  String get bookingInsuranceClaim => 'Я хочу подать страховое требование';

  @override
  String get paymentInsuranceRequestedHelp =>
      'Требование запрошено. Загрузите полис и формы требования, чтобы наша команда могла помочь.';

  @override
  String get paymentInsuranceChosenWhenBooking =>
      'Выбирается при бронировании. Если хотите добавить требование, обратитесь к координатору.';

  @override
  String get paymentUploadInsuranceDocs => 'Загрузить страховые документы';

  @override
  String get paymentPriceSummary => 'Итоговая стоимость';

  @override
  String paymentChargedInCurrency(String currency) {
    return 'Списание будет в $currency по курсу, зафиксированному при создании заказа.';
  }

  @override
  String paymentPlansCurrentOption(String option) {
    return 'В этом бронировании выбран вариант «$option». Ежемесячные планы на 3, 6 или 12 месяцев выбираются при бронировании. Чтобы изменить, обратитесь к координатору до первого платежа.';
  }

  @override
  String get paymentScheduleBeingPrepared => 'График платежей готовится.';

  @override
  String get paymentDueDatePending => 'Срок оплаты уточняется';

  @override
  String paymentDueOn(String date) {
    return 'Срок: $date';
  }

  @override
  String get paymentCardAppOnlySnack =>
      'Оплата картой доступна в приложении для Android и iOS. Здесь используйте банковский перевод.';

  @override
  String paymentConfirmReason(String amount) {
    return 'Подтвердите оплату $amount';
  }

  @override
  String get paymentNotConfirmed => 'Оплата не подтверждена.';

  @override
  String get paymentMethodNotAvailable => 'Этот способ оплаты недоступен в приложении.';

  @override
  String get paymentCardCheckoutFailed => 'Не удалось начать оплату картой. Попробуйте ещё раз.';

  @override
  String paymentWalletPending(String wallet) {
    return 'Завершите оплату в $wallet. Мы подтвердим бронирование, как только получим платёж.';
  }

  @override
  String get paymentTestDialogBody => 'Смоделируйте ответ шлюза для этого тестового заказа.';

  @override
  String get paymentSimulateFailure => 'Смоделировать ошибку';

  @override
  String get paymentSimulateSuccess => 'Смоделировать успех';

  @override
  String get paymentGetBankDetails => 'Получить реквизиты для перевода';

  @override
  String get paymentPayButton => 'Оплатить';

  @override
  String get bookingTreatmentFallback => 'Лечение';

  @override
  String bookingAdmissionDate(String date) {
    return 'Госпитализация $date';
  }

  @override
  String get paymentSubtotal => 'Подытог';

  @override
  String get paymentDiscount => 'Скидка';

  @override
  String get paymentServiceFee => 'Сервисный сбор';

  @override
  String get paymentTaxes => 'Налоги';

  @override
  String get paymentTotal => 'Итого';

  @override
  String get paymentPaidSoFar => 'Уже оплачено';

  @override
  String get paymentBalance => 'Остаток';

  @override
  String paymentInstallmentDueOn(int seq, String date) {
    return 'Взнос $seq до $date';
  }

  @override
  String get paymentBookingCancelledTitle => 'Это бронирование отменено';

  @override
  String get paymentNothingDueTitle => 'Сейчас ничего платить не нужно';

  @override
  String get paymentRefundOriginalMethod => 'Возвраты, если они есть, поступают на исходный способ оплаты.';

  @override
  String paymentNothingDueBody(String number) {
    return 'По бронированию $number нет платежей к оплате. Мы сообщим, когда наступит срок следующего.';
  }

  @override
  String get paymentGoToTrip => 'К моей поездке';

  @override
  String get paymentResultSuccessTitle => 'Оплата прошла успешно';

  @override
  String get paymentResultPendingTitle => 'Платёж отправлен';

  @override
  String get paymentResultFailureTitle => 'Платёж не прошёл';

  @override
  String paymentResultSuccessBody(String number) {
    return 'Бронирование $number обновлено. Мы уведомили вашего координатора.';
  }

  @override
  String get paymentResultPendingBody =>
      'Мы подтвердим бронирование, как только платёж будет проверен. Вы получите уведомление.';

  @override
  String get paymentResultFailureBody => 'Деньги не списаны. Попробуйте ещё раз или выберите другой способ.';

  @override
  String get paymentResultAmount => 'Сумма';

  @override
  String get paymentResultOrder => 'Заказ';

  @override
  String get bookingLabel => 'Бронирование';

  @override
  String get paymentResultPaidOn => 'Дата оплаты';

  @override
  String get paymentResultStatus => 'Статус';

  @override
  String get paymentDownloadReceipt => 'Скачать квитанцию';

  @override
  String get paymentGetHelp => 'Получить помощь';

  @override
  String get caseViewCase => 'Открыть обращение';

  @override
  String get paymentReceiptPreparing => 'Квитанция готовится. Скоро она появится в разделе «Документы».';

  @override
  String get paymentReceiptSaved => 'Квитанция сохранена';

  @override
  String get bankTransferUnavailableTitle => 'Банковский перевод недоступен';

  @override
  String get bankTransferUnavailableBody => 'Выберите другой способ оплаты.';

  @override
  String get bankTransferAmount => 'Сумма перевода';

  @override
  String bankTransferOrder(String number) {
    return 'Заказ $number';
  }

  @override
  String get bankBeneficiary => 'Получатель';

  @override
  String get bankName => 'Банк';

  @override
  String get bankAccountNumber => 'Номер счёта';

  @override
  String get bankPaymentReference => 'Референс платежа';

  @override
  String get bankTransferInstructions =>
      'Укажите референс платежа точно, чтобы мы могли сопоставить ваш перевод. Международные переводы обычно занимают 1–3 рабочих дня; бронирование подтверждается после того, как наш финансовый отдел проверит поступление средств.';

  @override
  String get bankProofSection => 'Подтверждение перевода';

  @override
  String get bankProofReplace => 'Заменить';

  @override
  String get bankProofUpload => 'Загрузить квитанцию о переводе';

  @override
  String get bankReferenceLabel => 'Референс банковской операции (UTR / MT103)';

  @override
  String get bankReferenceRequired => 'Введите референс, полученный от банка';

  @override
  String get bankSubmitProof => 'Отправить подтверждение';

  @override
  String get bankUploadLater => 'Загружу подтверждение позже';

  @override
  String get bankProofReceived =>
      'Спасибо! Мы получили данные о переводе. Бронирование будет подтверждено после поступления средств (обычно 1–3 рабочих дня).';

  @override
  String bankCopyTooltip(String label) {
    return 'Копировать: $label';
  }

  @override
  String bankCopied(String label) {
    return 'Скопировано: $label';
  }

  @override
  String get paymentResponseIncomplete => 'Ответ платёжной системы неполный. Обратитесь в службу поддержки.';

  @override
  String get paymentCancelled => 'Оплата отменена.';

  @override
  String get paymentNotCompleted => 'Не удалось завершить оплату.';

  @override
  String get paymentWalletFallback => 'кошельке';

  @override
  String get paymentCardsUnavailableOnDevice => 'Оплата картой недоступна на этом устройстве.';

  @override
  String get bookSelectDatesTitle => 'Выбор дат';

  @override
  String bookCaseClosedTitle(String status) {
    return 'Статус обращения: $status';
  }

  @override
  String get bookCaseClosedBody => 'Создайте новый запрос, чтобы забронировать лечение.';

  @override
  String get bookProceedToPayment => 'Перейти к оплате';

  @override
  String get bookTreatmentDurationLabel => 'Длительность лечения: ';

  @override
  String get bookDurationConfirmedByHospital => 'подтверждается больницей';

  @override
  String bookDurationRequired(String duration) {
    return 'требуется $duration';
  }

  @override
  String bookAdmissionOn(String date) {
    return 'Госпитализация: $date';
  }

  @override
  String get bookSelectPackage => 'Выбор пакета';

  @override
  String get bookAcceptedQuote => 'Принятая смета больницы';

  @override
  String bookingStayDaysLabel(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days дня пребывания',
      many: '$days дней пребывания',
      few: '$days дня пребывания',
      one: '$days день пребывания',
    );
    return '$_temp0';
  }

  @override
  String bookingValidUntil(String date) {
    return 'действует до $date';
  }

  @override
  String bookItemizedCharges(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count статьи расходов',
      many: '$count статей расходов',
      few: '$count статьи расходов',
      one: '$count статья расходов',
    );
    return '$_temp0';
  }

  @override
  String get bookNoPackages =>
      'Эта больница ещё не опубликовала пакеты для этого лечения. Запросите индивидуальную смету на странице обращения.';

  @override
  String get bookPaymentOptionSection => 'Вариант оплаты';

  @override
  String get bookInsuranceHelp => 'Наша команда поможет с оформлением документов для страховой.';

  @override
  String get bookLegendAvailable => 'Свободно';

  @override
  String get bookLegendSelected => 'Выбрано';

  @override
  String get bookLegendUnavailable => 'Недоступно';

  @override
  String get bookLegendPast => 'Прошло';

  @override
  String get bookPackageMedicalOnly => 'Базовый пакет лечения';

  @override
  String get bookPackageMedicalStay => 'Лечение + проживание';

  @override
  String get bookPackageAllInclusive => 'Лечение, проживание, трансферы и переводчик';

  @override
  String bookInstallmentPerMonth(String amount) {
    return '≈ $amount / мес. без учёта сборов';
  }

  @override
  String get bookingPayInFull => 'Полная оплата';

  @override
  String get bookPayInFullSubtitle => 'Один платёж за всё лечение';

  @override
  String get bookPayDeposit => 'Внести депозит сейчас';

  @override
  String get bookPayDepositSubtitle => 'Закрепите дату; остаток оплачивается до госпитализации';

  @override
  String get bookMonthlyInstallments => 'Ежемесячная рассрочка';

  @override
  String get bookInstallmentChoices => '3, 6 или 12 месяцев';

  @override
  String bookMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count месяца',
      many: '$count месяцев',
      few: '$count месяца',
      one: '$count месяц',
    );
    return '$_temp0';
  }

  @override
  String get bookSavePrefix => 'Экономия ';

  @override
  String get bookExistingBookingBody =>
      'По этому обращению уже есть бронирование. Продолжите с ним или отмените его на странице обращения, чтобы выбрать новые даты.';

  @override
  String get bookContinueToPayment => 'Продолжить оплату';

  @override
  String get bookCalendarPreviousMonth => 'Предыдущий месяц';

  @override
  String get bookCalendarNextMonth => 'Следующий месяц';

  @override
  String bookCalendarDaySemantics(String date, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {
      'selected': 'выбрано',
      'available': 'свободно',
      'other': 'недоступно',
    });
    return '$date, $_temp0';
  }

  @override
  String get bookDoctorHideDetails => 'Скрыть сведения о враче';

  @override
  String get bookDoctorShowDetails => 'Показать сведения о враче';

  @override
  String bookDoctorExperience(int years) {
    String _temp0 = intl.Intl.pluralLogic(
      years,
      locale: localeName,
      other: '$years года опыта',
      many: '$years лет опыта',
      few: '$years года опыта',
      one: '$years год опыта',
    );
    return '$_temp0';
  }

  @override
  String bookDoctorSpeaks(String languages) {
    return 'Языки: $languages';
  }

  @override
  String get bookProfessionCardiologist => 'Кардиолог';

  @override
  String get bookProfessionOrthopedicSurgeon => 'Хирург-ортопед';

  @override
  String get bookProfessionOncologist => 'Онколог';

  @override
  String get bookProfessionNeurologist => 'Невролог';

  @override
  String get bookProfessionDentist => 'Стоматолог';

  @override
  String get bookProfessionUrologist => 'Уролог';

  @override
  String get bookProfessionNephrologist => 'Нефролог';

  @override
  String get bookProfessionGastroenterologist => 'Гастроэнтеролог';

  @override
  String get bookProfessionOphthalmologist => 'Офтальмолог';

  @override
  String get bookProfessionDermatologist => 'Дерматолог';

  @override
  String get casesTitle => 'Мои обращения';

  @override
  String get caseFilterAll => 'Все';

  @override
  String get casesEmptyTitle => 'Обращений пока нет';

  @override
  String casesEmptyFilteredTitle(String status) {
    return 'Нет обращений со статусом «$status»';
  }

  @override
  String get casesEmptyBody => 'Запросите смету у подходящей больницы, чтобы создать обращение.';

  @override
  String get caseFindMyTreatment => 'Найти лечение';

  @override
  String casesShowingCount(int shown, int total) {
    return 'Показано $shown из $total. Используйте фильтры, чтобы сузить список.';
  }

  @override
  String get caseTitleFallback => 'Обращение';

  @override
  String get caseMessageTooltip => 'Написать по этому обращению';

  @override
  String get caseQuotesSection => 'Сметы';

  @override
  String get caseQuotePending =>
      'Больница изучает ваше обращение. Мы сообщим, когда придёт подробная смета (обычно в течение 48 часов).';

  @override
  String get caseNoQuotes => 'По этому обращению смет нет.';

  @override
  String get caseBookPackageInstead => 'Забронировать пакет с фиксированной ценой';

  @override
  String get caseMedicalSummary => 'Медицинская сводка';

  @override
  String get caseYourNotes => 'Ваши заметки';

  @override
  String get documentsTitle => 'Документы';

  @override
  String get caseDocumentsManage => 'Управлять';

  @override
  String get caseDocumentsEmpty => 'Загрузите заключения, снимки и паспорт, чтобы больница могла подготовиться.';

  @override
  String get caseStatusTimeline => 'История статусов';

  @override
  String get caseMessageCareTeam => 'Написать команде сопровождения';

  @override
  String get caseCancelThisCase => 'Отменить это обращение';

  @override
  String caseCoordinator(String name) {
    return 'Координатор: $name';
  }

  @override
  String caseAgent(String name) {
    return 'Агент: $name';
  }

  @override
  String caseOpenedOn(String date) {
    return 'Создано $date';
  }

  @override
  String get caseBookingPackage => 'Пакет';

  @override
  String get caseBookingAdmission => 'Госпитализация';

  @override
  String get caseBookingDuration => 'Длительность';

  @override
  String caseDurationDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days дня',
      many: '$days дней',
      few: '$days дня',
      one: '$days день',
    );
    return '$_temp0';
  }

  @override
  String get caseBookingPaymentPlan => 'План оплаты';

  @override
  String get caseBookingPaid => 'Оплачено';

  @override
  String get caseClaimRequested => 'Требование подано';

  @override
  String get casePayToConfirm => 'Оплатить для подтверждения';

  @override
  String get casePayBalance => 'Оплатить остаток';

  @override
  String get travelVisaAndTravel => 'Виза и поездка';

  @override
  String get caseCancelBooking => 'Отменить бронирование';

  @override
  String get caseDepositPlusBalance => 'Депозит + остаток';

  @override
  String caseMonthlyInstallments(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months ежемесячного платежа',
      many: '$months ежемесячных платежей',
      few: '$months ежемесячных платежа',
      one: '$months ежемесячный платёж',
    );
    return '$_temp0';
  }

  @override
  String get caseMonthlyInstallmentsNoCount => 'ежемесячные платежи';

  @override
  String get caseAcceptQuoteTitle => 'Принять эту смету?';

  @override
  String get caseAcceptQuoteBody =>
      'Больница зарезервирует ваш план лечения. Затем вы выберете дату госпитализации и внесёте депозит.';

  @override
  String get caseNotYet => 'Пока нет';

  @override
  String get caseAccept => 'Принять';

  @override
  String get caseQuoteAccepted => 'Смета принята';

  @override
  String get caseDeclineQuoteTitle => 'Отклонить эту смету?';

  @override
  String get caseDecline => 'Отклонить';

  @override
  String get caseCancelBookingTitle => 'Отменить бронирование?';

  @override
  String get caseReason => 'Причина';

  @override
  String get caseCancelBookingPolicy =>
      'Возврат производится по правилам отмены: чем раньше до госпитализации вы отмените, тем больше сумма возврата.';

  @override
  String get caseBookingCancelled => 'Бронирование отменено. Любой возврат поступит на исходный способ оплаты.';

  @override
  String get caseCancelCaseTitle => 'Отменить это обращение?';

  @override
  String get caseCancelCase => 'Отменить обращение';

  @override
  String get caseNextPaymentNeeded => 'Для подтверждения бронирования нужна оплата';

  @override
  String get caseNextBalanceDue => 'Остаток нужно оплатить до госпитализации';

  @override
  String get caseNextWaitingForQuote => 'Ожидается смета больницы';

  @override
  String get caseNextReviewQuote => 'Посмотрите смету';

  @override
  String get caseNextChooseDate => 'Выберите дату госпитализации';

  @override
  String get caseHospitalQuote => 'Смета больницы';

  @override
  String caseQuoteBy(String name) {
    return 'Подготовил(а): $name';
  }

  @override
  String caseQuoteTotalStay(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Итого · $days дня пребывания',
      many: 'Итого · $days дней пребывания',
      few: 'Итого · $days дня пребывания',
      one: 'Итого · $days день пребывания',
    );
    return '$_temp0';
  }

  @override
  String get caseAcceptQuote => 'Принять смету';

  @override
  String get caseChooseAdmissionDate => 'Выбрать дату госпитализации';

  @override
  String get caseReasonOptional => 'Причина (необязательно)';

  @override
  String refundTierLessThanDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Менее чем за $days дня до госпитализации',
      many: 'Менее чем за $days дней до госпитализации',
      few: 'Менее чем за $days дня до госпитализации',
      one: 'Менее чем за $days день до госпитализации',
    );
    return '$_temp0';
  }

  @override
  String refundTierDaysOrMore(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'За $days+ дня до госпитализации',
      many: 'За $days+ дней до госпитализации',
      few: 'За $days+ дня до госпитализации',
      one: 'За $days+ день до госпитализации',
    );
    return '$_temp0';
  }

  @override
  String get refundNone => 'без возврата';

  @override
  String refundPercent(int pct) {
    return 'возврат $pct%';
  }

  @override
  String refundTierLine(String when, String refund) {
    return '$when: $refund';
  }

  @override
  String get refundPolicyTitle => 'Отмена и возврат средств';

  @override
  String get refundPolicyGeneral =>
      'Действуют правила отмены, актуальные на момент подтверждения бронирования: чем раньше до госпитализации вы отмените, тем больше сумма возврата.';

  @override
  String get refundPolicyLocked =>
      'Эти условия зафиксированы для данного бронирования. Если отменит больница или Heal India Global, вы получите полный возврат.';

  @override
  String documentsUploading(String name) {
    return 'Загрузка $name';
  }

  @override
  String get documentsEmptyTitle => 'Документов пока нет';

  @override
  String get documentsEmptyBody =>
      'Загрузите паспорт, медицинские заключения, снимки и рецепты. PDF, JPG, PNG, WEBP, HEIC или DICOM до 20 МБ.';

  @override
  String get documentsUploadADocument => 'Загрузить документ';

  @override
  String get documentsSharedNote => 'Доступны только вашей команде сопровождения и больнице по вашему обращению.';

  @override
  String documentsUploaded(String name) {
    return 'Файл $name загружен';
  }

  @override
  String get documentsDeleteTitle => 'Удалить документ?';

  @override
  String documentsDeleteBody(String name) {
    return 'Файл $name будет удалён для вас и вашей команды сопровождения.';
  }

  @override
  String get documentsKeep => 'Оставить';

  @override
  String get documentsActionsTooltip => 'Действия с документом';

  @override
  String get documentsFileTooLarge => 'Файл слишком большой (максимум 20 МБ).';

  @override
  String documentsSaved(String name) {
    return 'Сохранено: $name';
  }

  @override
  String get documentsPreviewUnavailable => 'Предпросмотр этого формата изображения недоступен. Используйте «Скачать».';

  @override
  String get documentsWhatAreYouUploading => 'Что вы загружаете?';

  @override
  String get preArrivalTitle => 'Памятка перед приездом';

  @override
  String get preArrivalVisaTitle => 'Виза и документы';

  @override
  String get preArrivalVisaPassport => 'Паспорт, действительный не менее 6 месяцев, с двумя чистыми страницами.';

  @override
  String get preArrivalVisaEMedical =>
      'Индийская виза e-Medical (и виза e-Medical Attendant для сопровождающих) — мы отправим пригласительное письмо от больницы.';

  @override
  String get preArrivalVisaCopies =>
      'Распечатанные копии визы, пригласительного письма, подтверждения бронирования и медицинских заключений.';

  @override
  String get preArrivalMedicalTitle => 'Медицинские документы';

  @override
  String get preArrivalMedicalReports =>
      'Недавние снимки, результаты анализов и рецепты — загрузите их в «Документы», чтобы врач мог их изучить.';

  @override
  String get preArrivalMedicalMedicines =>
      'Список принимаемых лекарств с дозировками; возьмите их с собой в достаточном количестве на всю поездку.';

  @override
  String get preArrivalMedicalAllergies => 'Аллергии и перенесённые операции, записанные на английском языке.';

  @override
  String get preArrivalPackTitle => 'Что взять с собой';

  @override
  String get preArrivalPackClothing => 'Свободная удобная одежда на период после лечения.';

  @override
  String get preArrivalPackAdapter =>
      'Универсальный переходник для розеток (в Индии используются вилки типов C, D и M, 230 В).';

  @override
  String get preArrivalPackJacket => 'Лёгкая куртка — в больницах и самолётах работают кондиционеры.';

  @override
  String get preArrivalMoneyTitle => 'Деньги';

  @override
  String get preArrivalMoneyCards =>
      'В больницах и отелях принимают карты; держите немного рупий для такси и небольших магазинов.';

  @override
  String get preArrivalMoneyTellBank => 'Сообщите банку о поездке в Индию, чтобы карты не заблокировали.';

  @override
  String get preArrivalMoneyReceipts => 'Храните квитанции об оплате в приложении, в разделе «Документы».';

  @override
  String get preArrivalArrivalTitle => 'День прилёта';

  @override
  String get preArrivalArrivalFlight => 'Сообщите данные рейса, чтобы мы организовали встречу в аэропорту.';

  @override
  String get preArrivalArrivalDriver => 'Водитель будет ждать в зоне прилёта с табличкой Heal India Global.';

  @override
  String get preArrivalArrivalHelpline => 'Сохраните номер круглосуточной горячей линии до вылета.';

  @override
  String get preArrivalCulturalTips => 'Культурные советы';

  @override
  String get preArrivalTipsSoon => 'Советы скоро появятся здесь.';

  @override
  String get preArrivalDisclaimer => 'Только общая информация о поездке — всегда следуйте указаниям врача.';

  @override
  String journeyCallFromPhone(String number) {
    return 'Позвоните по номеру $number с телефона.';
  }

  @override
  String journeyWhatsAppFromPhone(String number) {
    return 'Напишите на $number в WhatsApp с телефона.';
  }

  @override
  String get journeyCoordinatorChatSubject => 'Мой координатор';

  @override
  String get emergencyContactsTitle => 'Экстренные контакты';

  @override
  String get emergencyContactsIntro =>
      'При неотложной медицинской ситуации в Индии сначала звоните по местному номеру экстренных служб.';

  @override
  String get emergencyContactsServicesIndia => 'Экстренные службы (Индия)';

  @override
  String get emergencyContactsHelpline => 'Круглосуточная горячая линия Heal India Global';

  @override
  String get emergencyContactsWhatsApp => 'Поддержка в WhatsApp';

  @override
  String emergencyContactsCoordinator(String name) {
    return 'Координатор — $name';
  }

  @override
  String get emergencyContactsMine => 'Мой экстренный контакт';

  @override
  String get travelRequestSent => 'Запрос отправлен. Наш туристический отдел свяжется с вами.';

  @override
  String get visaSectionTitle => 'Медицинская виза';

  @override
  String get visaEmptyText =>
      'Большинству иностранных пациентов нужна индийская виза e-Medical. Мы предоставим пригласительное письмо от больницы и поможем подать заявление.';

  @override
  String get visaRequestAssistance => 'Запросить помощь с визой';

  @override
  String get flightSectionTitle => 'Перелёты и трансферы из аэропорта';

  @override
  String get flightNoRequests => 'Запросов на перелёт или трансфер пока нет.';

  @override
  String get flightRequestChip => 'Запросить перелёт';

  @override
  String get travelAirportPickup => 'Встреча в аэропорту';

  @override
  String get travelAirportDrop => 'Трансфер в аэропорт';

  @override
  String get stayAccommodation => 'Проживание';

  @override
  String get stayEmptyText => 'Отели, гостевые дома и апартаменты рядом с вашей больницей.';

  @override
  String get stayRequestAccommodation => 'Запросить проживание';

  @override
  String get stayRequestAnother => 'Запросить ещё проживание';

  @override
  String get travelLocalServices => 'Местные услуги';

  @override
  String get travelTranslator => 'Переводчик';

  @override
  String get travelLocalGuide => 'Местный гид';

  @override
  String get travelTransport => 'Транспорт';

  @override
  String get visaHintNotStarted => 'Мы получили ваш запрос и составим список необходимых документов.';

  @override
  String get visaHintDocumentsPending => 'Загрузите паспорт и медицинские заключения в «Документы».';

  @override
  String get visaHintInvitationIssued => 'Пригласительное письмо готово. Подайте заявление на indianvisaonline.gov.in.';

  @override
  String get visaHintApplied => 'Заявление подано. Решение обычно принимается за 3–5 рабочих дней.';

  @override
  String get visaHintApproved => 'Виза одобрена. Возьмите в поездку распечатанную копию.';

  @override
  String get visaHintRejected => 'Заявление не одобрено. Координатор свяжется с вами.';

  @override
  String visaApplicationRef(String ref) {
    return 'Номер заявления: $ref';
  }

  @override
  String get visaInvitationLetter => 'Пригласительное письмо';

  @override
  String get travelRouteArrow => ' → ';

  @override
  String flightPnr(String pnr) {
    return 'PNR $pnr';
  }

  @override
  String stayGuestCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count гостя',
      many: '$count гостей',
      few: '$count гостя',
      one: '$count гость',
    );
    return '$_temp0';
  }

  @override
  String stayConfirmationCode(String code) {
    return 'Подтв. $code';
  }

  @override
  String get checklistTitle => 'Ваш чек-лист';

  @override
  String get tripsTodaySchedule => 'Расписание на сегодня';

  @override
  String get tripsQuickActions => 'Быстрые действия';

  @override
  String get tripsUploadDocuments => 'Загрузить документы';

  @override
  String get tripsChatWithCoordinator => 'Чат с\nкоординатором';

  @override
  String get tripsEmergencyContacts => 'Экстренные\nконтакты';

  @override
  String get journeySectionTitle => 'Ваш путь';

  @override
  String get tripsTravelSubtitle => 'Виза, перелёты, встреча в аэропорту, проживание, переводчик';

  @override
  String get tripsSupportTitle => 'Поддержка на месте';

  @override
  String get tripsSupportSubtitle => 'Карта, расписание, горячая линия, переводчик, SOS';

  @override
  String get tripsMyCases => 'Мои обращения';

  @override
  String tripsActiveCases(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count активного обращения',
      many: '$count активных обращений',
      few: '$count активных обращения',
      one: '$count активное обращение',
    );
    return '$_temp0';
  }

  @override
  String tripsYourCoordinator(String name) {
    return 'Ваш координатор: $name';
  }

  @override
  String get tripsMessageAnyTime => 'Пишите в любое время';

  @override
  String tripsCountdownUnit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'дня',
      many: 'дней',
      few: 'дня',
      one: 'день',
    );
    return '$_temp0';
  }

  @override
  String get tripsCountdownToday => 'Сегодня';

  @override
  String get tripsCountdownDone => 'Завершено';

  @override
  String get tripsCountdownNow => 'Сейчас';

  @override
  String get tripsTreatmentInProgress => 'Лечение идёт';

  @override
  String get tripsUntilTreatment => 'До начала лечения';

  @override
  String tripsDaysUntilTreatment(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня до начала лечения',
      many: '$count дней до начала лечения',
      few: '$count дня до начала лечения',
      one: '$count день до начала лечения',
    );
    return '$_temp0';
  }

  @override
  String get tripsPaymentNeeded => 'Для подтверждения нужна оплата';

  @override
  String get tripsBalanceDue => 'Остаток к оплате';

  @override
  String get tripsPayNow => 'Оплатить';

  @override
  String get tripsNoTripTitle => 'Предстоящего лечения пока нет';

  @override
  String get tripsNoTripBody =>
      'Подберите подходящую больницу с помощью бесплатного ИИ-скрининга или продолжите начатое обращение.';

  @override
  String get travelSelect => 'Выбрать';

  @override
  String get visaAssistanceTitle => 'Помощь с визой';

  @override
  String get visaAssistanceSubtitle =>
      'Мы подготовим пригласительное письмо от больницы и поможем оформить индийскую визу e-Medical.';

  @override
  String get visaForPatient => 'Пациент';

  @override
  String get visaForAttendant => 'Сопровождающий';

  @override
  String get visaNotesLabel => 'Примечания (гражданство, даты поездки, сопровождающие)';

  @override
  String get travelAirport => 'Аэропорт';

  @override
  String travelCityAirport(String city) {
    return 'Аэропорт $city';
  }

  @override
  String get travelHospitalOrHotel => 'Больница / отель';

  @override
  String get flightRequestTitle => 'Запросить перелёт';

  @override
  String get flightRequestSubtitle =>
      'Наш туристический отдел пришлёт варианты тарифов; деньги не списываются, пока вы не подтвердите.';

  @override
  String get flightPreferredDeparture => 'Желаемая дата вылета';

  @override
  String get travelPickupSubtitle => 'Водитель встретит вас в зоне прилёта и отвезёт в больницу или отель.';

  @override
  String get travelArrivalDateTime => 'Дата и время прилёта';

  @override
  String get travelDropSubtitle => 'Мы отвезём вас в аэропорт к рейсу домой.';

  @override
  String get travelPickupTime => 'Время подачи машины';

  @override
  String get travelLocalTransport => 'Местный транспорт';

  @override
  String get travelLocalTransportSubtitle => 'Автомобиль с водителем для поездок по городу на приёмы.';

  @override
  String get travelStart => 'Начало';

  @override
  String get travelSendRequest => 'Отправить запрос';

  @override
  String get flightFromCityOrAirport => 'Откуда (город или аэропорт)';

  @override
  String get travelFrom => 'Откуда';

  @override
  String get travelTo => 'Куда';

  @override
  String get flightNumberOptional => 'Номер рейса (необязательно)';

  @override
  String get travelPassengers => 'Пассажиры';

  @override
  String get travelFewerPassengers => 'Меньше пассажиров';

  @override
  String get travelMorePassengers => 'Больше пассажиров';

  @override
  String get travelNotesLabel => 'Примечания (кресло-коляска, багаж, пожелания)';

  @override
  String get staySheetSubtitle =>
      'Жильё рядом с вашей больницей. Наша команда подтвердит наличие мест и цену до бронирования.';

  @override
  String get stayNoPartners => 'Для этой больницы пока нет партнёрского жилья. Спросите координатора в «Сообщениях».';

  @override
  String stayDistanceKm(String km) {
    return '$km км';
  }

  @override
  String stayPerNight(String amount) {
    return '$amount/ночь';
  }

  @override
  String get stayCheckInOut => 'Заезд - выезд';

  @override
  String get stayGuests => 'Гости';

  @override
  String get stayFewerGuests => 'Меньше гостей';

  @override
  String get stayMoreGuests => 'Больше гостей';

  @override
  String get stayNotesLabel => 'Примечания (тип номера, доступность, питание)';

  @override
  String get travelTranslatorTitle => 'Заказать переводчика';

  @override
  String get travelTranslatorSubtitle => 'Медицинский переводчик для консультаций и пребывания в больнице.';

  @override
  String get travelTranslatorNotes => 'Нужный язык (например, арабский, французский)';

  @override
  String get travelGuideTitle => 'Заказать местного гида';

  @override
  String get travelGuideSubtitle => 'Надёжный гид для поручений, покупок и экскурсий в период восстановления.';

  @override
  String get travelGuideNotes => 'С чем вам нужна помощь?';

  @override
  String travelServiceRequestTitle(String service) {
    return 'Запросить: $service';
  }

  @override
  String get travelServiceSubtitle => 'Наша команда согласует с вами детали и цену.';

  @override
  String get travelNotes => 'Примечания';

  @override
  String get travelWhenNeeded => 'Когда это нужно?';

  @override
  String get travelPreferredProvider => 'Предпочтительный исполнитель (необязательно)';

  @override
  String get travelAnyAvailable => 'Любой свободный';

  @override
  String get profileMyJourney => 'Мой путь';

  @override
  String get profileMyCasesQuotes => 'Мои обращения и предложения';

  @override
  String get profileDocuments => 'Документы';

  @override
  String get profileDocumentsSubtitle => 'Паспорт, медицинские заключения, визы, счета';

  @override
  String get companionsTitle => 'Сопровождающие';

  @override
  String get companionsSubtitleDefault => 'Люди, которые едут с вами';

  @override
  String get companionsSubtitleEmpty => 'Добавьте людей, которые едут с вами';

  @override
  String get savedTitle => 'Сохранённое';

  @override
  String get profileSavedSubtitle => 'Клиники, врачи и лечение';

  @override
  String get profileAbout => 'О приложении';

  @override
  String get profileTermsOfService => 'Условия использования';

  @override
  String get profilePrivacyPolicy => 'Политика конфиденциальности';

  @override
  String get deleteAccountDoneSnack => 'Ваш аккаунт удалён.';

  @override
  String get profileGuest => 'Гость';

  @override
  String get profilePatientBadge => 'Пациент';

  @override
  String get profileEmailVerified => 'Email подтверждён';

  @override
  String get editProfileTitle => 'Редактировать профиль';

  @override
  String get profileGuestUpgradeTitle => 'Создайте бесплатный аккаунт';

  @override
  String get profileGuestUpgradeBody =>
      'Сохраняйте анкеты здоровья и подобранные клиники, запрашивайте предложения, бронируйте лечение, загружайте документы и общайтесь с координатором.';

  @override
  String get profileCreateAccount => 'Создать аккаунт';

  @override
  String get authLogIn => 'Войти';

  @override
  String get profilePersonalInfo => 'Личные данные';

  @override
  String profilePassportExpires(String date) {
    return 'действует до $date';
  }

  @override
  String get profileDateOfBirth => 'Дата рождения';

  @override
  String get profileGender => 'Пол';

  @override
  String get profileNationality => 'Гражданство';

  @override
  String get profilePhone => 'Телефон';

  @override
  String get profilePassport => 'Паспорт';

  @override
  String get profilePassportValidityWarning =>
      'Для оформления визы e-Medical паспорт должен быть действителен не менее 6 месяцев.';

  @override
  String get profileEmergencyContact => 'Контакт для экстренной связи';

  @override
  String get profileBloodGroup => 'Группа крови';

  @override
  String get profileNotSet => 'Не указано';

  @override
  String get profileNotAdded => 'Не указано';

  @override
  String profileClearField(String label) {
    return 'Очистить: $label';
  }

  @override
  String get profileRelationship => 'Кем приходится';

  @override
  String get profileNewPassportNumber => 'Новый номер паспорта';

  @override
  String get settingsPreferences => 'Настройки';

  @override
  String get settingsCurrency => 'Валюта';

  @override
  String settingsCurrencySubtitle(String currency) {
    return 'Цены показаны ориентировочно в $currency';
  }

  @override
  String get settingsPreferredCurrency => 'Предпочитаемая валюта';

  @override
  String get settingsAppearance => 'Оформление';

  @override
  String get settingsThemeDark => 'Тёмная';

  @override
  String get settingsThemeLight => 'Светлая';

  @override
  String get settingsThemeSystem => 'Как на устройстве';

  @override
  String get settingsSecurity => 'Безопасность';

  @override
  String get accountVerifyEmail => 'Подтвердите email';

  @override
  String accountVerifyEmailSubtitle(String email) {
    return 'Найдите ссылку для подтверждения в $email';
  }

  @override
  String get accountVerificationSent => 'Письмо для подтверждения отправлено';

  @override
  String get accountResend => 'Отправить снова';

  @override
  String get accountYourData => 'Ваши данные';

  @override
  String get accountYourDataSubtitle => 'Медицинские данные зашифрованы и передаются только выбранным вами клиникам.';

  @override
  String get accountExitGuestTitle => 'Выйти из гостевого режима?';

  @override
  String get accountLogOutTitle => 'Выйти?';

  @override
  String get accountExitGuestBody =>
      'Ваши анкеты здоровья в гостевом режиме будут потеряны, если сначала не создать аккаунт.';

  @override
  String get accountLogOutBody => 'Вы можете снова войти в любое время, используя email и пароль.';

  @override
  String get accountExit => 'Выйти';

  @override
  String get accountExitGuestMode => 'Выйти из гостевого режима';

  @override
  String get companionsRemoveTitle => 'Удалить сопровождающего?';

  @override
  String companionsRemoveBody(String name) {
    return '$name будет удалён(а) из списка сопровождающих.';
  }

  @override
  String get companionsRemovedSnack => 'Сопровождающий удалён';

  @override
  String companionsAddedSnack(String name) {
    return '$name: добавлен(а)';
  }

  @override
  String get companionAdd => 'Добавить сопровождающего';

  @override
  String get companionsEmptyTitle => 'Сопровождающих пока нет';

  @override
  String get companionsEmptyMessage =>
      'Добавьте родственника или друга, который едет с вами, чтобы мы оформили ему визу сопровождающего.';

  @override
  String companionsBorn(String date) {
    return 'Дата рождения: $date';
  }

  @override
  String companionsPassportLast4(String last4) {
    return 'Паспорт •••• $last4';
  }

  @override
  String companionsEditTooltip(String name) {
    return 'Изменить: $name';
  }

  @override
  String companionsRemoveTooltip(String name) {
    return 'Удалить: $name';
  }

  @override
  String get companionEditTitle => 'Изменить сопровождающего';

  @override
  String get companionFormIntro =>
      'Сопровождающие едут с вами как медицинские сопровождающие, и им нужна собственная виза.';

  @override
  String get companionFullNameRequired => 'Введите полное имя';

  @override
  String get companionFullNameLabel => 'Полное имя (как в паспорте)';

  @override
  String get companionRelationshipRequired => 'Выберите, кем вам приходится';

  @override
  String get companionRelationshipSpouse => 'Супруг(а)';

  @override
  String get companionRelationshipParent => 'Родитель';

  @override
  String get companionRelationshipChild => 'Ребёнок';

  @override
  String get companionRelationshipSibling => 'Брат/сестра';

  @override
  String get companionRelationshipRelative => 'Родственник';

  @override
  String get companionRelationshipFriend => 'Друг';

  @override
  String get companionRelationshipCaregiver => 'Помощник по уходу';

  @override
  String get companionPassportInvalid => 'Введите корректный номер паспорта';

  @override
  String get companionPassportOptional => 'Номер паспорта (необязательно)';

  @override
  String get companionPassportStoredEncrypted => 'Хранится в зашифрованном виде';

  @override
  String companionPassportCurrent(String last4) {
    return 'Текущий: •••• $last4 — оставьте пустым, чтобы сохранить';
  }

  @override
  String get companionSave => 'Сохранить сопровождающего';

  @override
  String get editProfileEcNameRequired => 'Укажите имя или очистите контакт для экстренной связи';

  @override
  String get editProfileEcRelationshipRequired => 'Укажите, кем приходится, или очистите контакт для экстренной связи';

  @override
  String get editProfileEcPhoneRequired => 'Укажите телефон или очистите контакт для экстренной связи';

  @override
  String get editProfileFixFields => 'Исправьте выделенные поля.';

  @override
  String get editProfileSaved => 'Профиль сохранён';

  @override
  String get editProfilePersonalDetails => 'Персональные данные';

  @override
  String get editProfileFirstName => 'Имя';

  @override
  String get editProfileLastName => 'Фамилия';

  @override
  String get editProfileCountryOfResidence => 'Страна проживания';

  @override
  String get editProfilePassportSubtitle => 'Нужен для приглашения на медицинскую визу';

  @override
  String get editProfilePassportInvalid => 'Используйте от 5 до 20 букв или цифр';

  @override
  String get editProfilePassportNumber => 'Номер паспорта';

  @override
  String get editProfilePassportHelperNew => 'Хранится в зашифрованном виде. Показываются только последние 4 цифры.';

  @override
  String editProfilePassportOnFile(String masked) {
    return 'Сохранён: $masked. Оставьте пустым, чтобы не менять.';
  }

  @override
  String get editProfilePassportExpiry => 'Срок действия паспорта';

  @override
  String get editProfileName => 'Имя';

  @override
  String get editProfileMedicalInfo => 'Медицинская информация';

  @override
  String get editProfileMedicalInfoSubtitle => 'Передаётся только клиникам, у которых вы запрашиваете предложения';

  @override
  String get editProfileAllergies => 'Аллергии';

  @override
  String get editProfileMedicalHistory => 'История болезни';

  @override
  String get editProfileInsurance => 'Страховка';

  @override
  String get editProfileInsuranceProvider => 'Страховая компания';

  @override
  String get editProfilePolicyNumber => 'Номер полиса';

  @override
  String get editProfileNewPolicyNumber => 'Новый номер полиса';

  @override
  String editProfilePolicyOnFile(String last4) {
    return 'Сохранён: •••• $last4. Оставьте пустым, чтобы не менять.';
  }

  @override
  String get editProfileSaveChanges => 'Сохранить изменения';

  @override
  String get savedEmptyTitle => 'Пока ничего не сохранено';

  @override
  String get savedEmptyMessage => 'Нажмите на закладку у клиники, врача или лечения, чтобы сохранить их здесь.';

  @override
  String get savedExploreHospitals => 'Смотреть клиники';

  @override
  String savedFilterAll(int count) {
    return 'Все ($count)';
  }

  @override
  String savedFilterType(String type, int count) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'Клиники ($count)',
      'doctor': 'Врачи ($count)',
      'procedure': 'Процедуры ($count)',
      'other': 'Другое ($count)',
    });
    return '$_temp0';
  }

  @override
  String get savedEmptyCategory => 'В этой категории ничего не сохранено';

  @override
  String savedNoLongerAvailable(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'Эта клиника больше недоступна',
      'doctor': 'Этот врач больше недоступен',
      'procedure': 'Эта процедура больше недоступна',
      'other': 'Этот элемент больше недоступен',
    });
    return '$_temp0';
  }

  @override
  String get passwordChangeTitle => 'Сменить пароль';

  @override
  String get passwordUpdatedSnack => 'Пароль обновлён. На других устройствах выполнен выход.';

  @override
  String get passwordCurrent => 'Текущий пароль';

  @override
  String get passwordCurrentHelper => 'Оставьте пустым, если вы зарегистрировались через Google и не задавали пароль';

  @override
  String get passwordNew => 'Новый пароль';

  @override
  String get passwordMustDiffer => 'Выберите пароль, отличный от текущего';

  @override
  String passwordPolicyHelper(int min) {
    return 'Не менее $min символов, включая букву и цифру';
  }

  @override
  String get passwordConfirmNew => 'Подтвердите новый пароль';

  @override
  String get passwordMismatch => 'Пароли не совпадают';

  @override
  String get passwordUpdateButton => 'Обновить пароль';

  @override
  String get deleteAccountGuestBody => 'Гостевой аккаунт, анкеты здоровья и сохранённое будут удалены безвозвратно.';

  @override
  String get deleteAccountBody =>
      'Ваш аккаунт, профиль, сопровождающие, сохранённое и загруженные документы будут удалены безвозвратно, а на всех устройствах будет выполнен выход. Это действие нельзя отменить.';

  @override
  String get deleteAccountRetention =>
      'Записи, которые мы обязаны хранить по закону (счета, платежи, возвраты и записи о лечении в клиниках), хранятся в течение установленного законом срока с ограниченным доступом, а затем удаляются. Возможно, сначала потребуется завершить или отменить открытые бронирования и незавершённые платежи.';

  @override
  String get deleteAccountPasswordLabel => 'Пароль';

  @override
  String get deleteAccountPasswordHelper =>
      'Оставьте пустым, если вы входили через Google или Apple и не задавали пароль';

  @override
  String get deleteAccountOtpLabel => 'Код аутентификатора';

  @override
  String get deleteAccountOtpHelper => '6-значный код из приложения-аутентификатора';

  @override
  String get deleteAccountReasonLabel => 'Почему вы уходите? (необязательно)';

  @override
  String deleteAccountConfirmLabel(String word) {
    return 'Введите $word для подтверждения';
  }

  @override
  String get deleteAccountSubmit => 'Удалить аккаунт навсегда';

  @override
  String get deleteAccountBlockerActiveCases => 'Обращения в работе';

  @override
  String get deleteAccountBlockerActiveBookings => 'Предстоящие или активные бронирования';

  @override
  String get deleteAccountBlockerPendingPayments => 'Платежи в обработке';

  @override
  String get deleteAccountBlockerHospitalsOwned => 'Размещённые клиники, которыми вы владеете';

  @override
  String get deleteAccountBlockersTitle => 'Сначала нужно закрыть следующее';

  @override
  String get deleteAccountRequestSent =>
      'Запрос на удаление отправлен. Служба поддержки закроет ваш аккаунт, когда эти вопросы будут решены, и подтвердит это по email.';

  @override
  String get deleteAccountRequestButton => 'Запросить удаление';

  @override
  String get forgotPasswordInvalidCode => 'Этот код сброса недействителен или истёк. Запросите новый.';

  @override
  String get forgotPasswordSetNewTitle => 'Задайте новый пароль';

  @override
  String get forgotPasswordTitle => 'Сброс пароля';

  @override
  String get forgotPasswordIntro => 'Введите email, указанный при регистрации, и мы отправим ссылку для сброса пароля.';

  @override
  String get forgotPasswordEmailLabel => 'Email';

  @override
  String get forgotPasswordSendLink => 'Отправить ссылку';

  @override
  String get forgotPasswordHaveCode => 'У меня уже есть код сброса';

  @override
  String get forgotPasswordCheckInbox => 'Проверьте почту';

  @override
  String forgotPasswordSentBody(String email) {
    return 'Если для $email есть аккаунт, мы отправили ссылку для сброса пароля. Письмо может прийти через несколько минут — проверьте и папку «Спам».';
  }

  @override
  String get forgotPasswordEnterCode => 'Ввести код сброса';

  @override
  String get forgotPasswordBackToLogin => 'Вернуться ко входу';

  @override
  String get forgotPasswordResetIntro => 'Вставьте код сброса из нашего письма и придумайте новый пароль.';

  @override
  String get forgotPasswordPasteFullCode => 'Вставьте код сброса полностью';

  @override
  String get forgotPasswordCodeLabel => 'Код сброса';

  @override
  String get forgotPasswordRequestNewLink => 'Запросить новую ссылку';

  @override
  String get forgotPasswordUpdatedTitle => 'Пароль обновлён';

  @override
  String get forgotPasswordUpdatedBody => 'Теперь вы можете войти с новым паролем.';

  @override
  String get validationEnterEmail => 'Введите email';

  @override
  String get validationInvalidEmail => 'Введите корректный адрес email';

  @override
  String get validationEnterPassword => 'Введите пароль';

  @override
  String get validationChoosePassword => 'Придумайте пароль';

  @override
  String validationPasswordTooShort(int min) {
    return 'Используйте не менее $min символов';
  }

  @override
  String validationPasswordTooLong(int max) {
    return 'Используйте не более $max символов';
  }

  @override
  String get validationPasswordLetterDigit => 'Добавьте хотя бы одну букву и одну цифру';

  @override
  String get validationEnterFullName => 'Введите полное имя';

  @override
  String get validationNameTooLong => 'Слишком длинное имя';

  @override
  String get validationInvalidPhone => 'Введите корректный номер телефона';

  @override
  String get validationEnterOtp => 'Введите 6-значный код';

  @override
  String get countryAF => 'Афганистан';

  @override
  String get countryDZ => 'Алжир';

  @override
  String get countryAO => 'Ангола';

  @override
  String get countryAR => 'Аргентина';

  @override
  String get countryAM => 'Армения';

  @override
  String get countryAU => 'Австралия';

  @override
  String get countryAT => 'Австрия';

  @override
  String get countryAZ => 'Азербайджан';

  @override
  String get countryBH => 'Бахрейн';

  @override
  String get countryBD => 'Бангладеш';

  @override
  String get countryBY => 'Беларусь';

  @override
  String get countryBE => 'Бельгия';

  @override
  String get countryBT => 'Бутан';

  @override
  String get countryBW => 'Ботсвана';

  @override
  String get countryBR => 'Бразилия';

  @override
  String get countryBN => 'Бруней';

  @override
  String get countryBG => 'Болгария';

  @override
  String get countryBI => 'Бурунди';

  @override
  String get countryKH => 'Камбоджа';

  @override
  String get countryCM => 'Камерун';

  @override
  String get countryCA => 'Канада';

  @override
  String get countryTD => 'Чад';

  @override
  String get countryCL => 'Чили';

  @override
  String get countryCN => 'Китай';

  @override
  String get countryCO => 'Колумбия';

  @override
  String get countryCD => 'Конго (ДРК)';

  @override
  String get countryCI => 'Кот-д’Ивуар';

  @override
  String get countryHR => 'Хорватия';

  @override
  String get countryCY => 'Кипр';

  @override
  String get countryCZ => 'Чехия';

  @override
  String get countryDK => 'Дания';

  @override
  String get countryDJ => 'Джибути';

  @override
  String get countryEG => 'Египет';

  @override
  String get countryER => 'Эритрея';

  @override
  String get countryEE => 'Эстония';

  @override
  String get countryET => 'Эфиопия';

  @override
  String get countryFJ => 'Фиджи';

  @override
  String get countryFI => 'Финляндия';

  @override
  String get countryFR => 'Франция';

  @override
  String get countryGA => 'Габон';

  @override
  String get countryGM => 'Гамбия';

  @override
  String get countryGE => 'Грузия';

  @override
  String get countryDE => 'Германия';

  @override
  String get countryGH => 'Гана';

  @override
  String get countryGR => 'Греция';

  @override
  String get countryGN => 'Гвинея';

  @override
  String get countryGY => 'Гайана';

  @override
  String get countryHK => 'Гонконг';

  @override
  String get countryHU => 'Венгрия';

  @override
  String get countryIS => 'Исландия';

  @override
  String get countryIN => 'Индия';

  @override
  String get countryID => 'Индонезия';

  @override
  String get countryIR => 'Иран';

  @override
  String get countryIQ => 'Ирак';

  @override
  String get countryIE => 'Ирландия';

  @override
  String get countryIL => 'Израиль';

  @override
  String get countryIT => 'Италия';

  @override
  String get countryJM => 'Ямайка';

  @override
  String get countryJP => 'Япония';

  @override
  String get countryJO => 'Иордания';

  @override
  String get countryKZ => 'Казахстан';

  @override
  String get countryKE => 'Кения';

  @override
  String get countryKW => 'Кувейт';

  @override
  String get countryKG => 'Киргизия';

  @override
  String get countryLA => 'Лаос';

  @override
  String get countryLV => 'Латвия';

  @override
  String get countryLB => 'Ливан';

  @override
  String get countryLS => 'Лесото';

  @override
  String get countryLR => 'Либерия';

  @override
  String get countryLY => 'Ливия';

  @override
  String get countryLT => 'Литва';

  @override
  String get countryLU => 'Люксембург';

  @override
  String get countryMG => 'Мадагаскар';

  @override
  String get countryMW => 'Малави';

  @override
  String get countryMY => 'Малайзия';

  @override
  String get countryMV => 'Мальдивы';

  @override
  String get countryML => 'Мали';

  @override
  String get countryMT => 'Мальта';

  @override
  String get countryMR => 'Мавритания';

  @override
  String get countryMU => 'Маврикий';

  @override
  String get countryMX => 'Мексика';

  @override
  String get countryMD => 'Молдова';

  @override
  String get countryMN => 'Монголия';

  @override
  String get countryMA => 'Марокко';

  @override
  String get countryMZ => 'Мозамбик';

  @override
  String get countryMM => 'Мьянма';

  @override
  String get countryNA => 'Намибия';

  @override
  String get countryNP => 'Непал';

  @override
  String get countryNL => 'Нидерланды';

  @override
  String get countryNZ => 'Новая Зеландия';

  @override
  String get countryNE => 'Нигер';

  @override
  String get countryNG => 'Нигерия';

  @override
  String get countryNO => 'Норвегия';

  @override
  String get countryOM => 'Оман';

  @override
  String get countryPK => 'Пакистан';

  @override
  String get countryPS => 'Палестина';

  @override
  String get countryPA => 'Панама';

  @override
  String get countryPG => 'Папуа — Новая Гвинея';

  @override
  String get countryPE => 'Перу';

  @override
  String get countryPH => 'Филиппины';

  @override
  String get countryPL => 'Польша';

  @override
  String get countryPT => 'Португалия';

  @override
  String get countryQA => 'Катар';

  @override
  String get countryRO => 'Румыния';

  @override
  String get countryRU => 'Россия';

  @override
  String get countryRW => 'Руанда';

  @override
  String get countrySA => 'Саудовская Аравия';

  @override
  String get countrySN => 'Сенегал';

  @override
  String get countryRS => 'Сербия';

  @override
  String get countrySC => 'Сейшельские Острова';

  @override
  String get countrySL => 'Сьерра-Леоне';

  @override
  String get countrySG => 'Сингапур';

  @override
  String get countrySK => 'Словакия';

  @override
  String get countrySI => 'Словения';

  @override
  String get countrySO => 'Сомали';

  @override
  String get countryZA => 'Южная Африка';

  @override
  String get countryKR => 'Южная Корея';

  @override
  String get countrySS => 'Южный Судан';

  @override
  String get countryES => 'Испания';

  @override
  String get countryLK => 'Шри-Ланка';

  @override
  String get countrySD => 'Судан';

  @override
  String get countrySR => 'Суринам';

  @override
  String get countrySE => 'Швеция';

  @override
  String get countryCH => 'Швейцария';

  @override
  String get countrySY => 'Сирия';

  @override
  String get countryTW => 'Тайвань';

  @override
  String get countryTJ => 'Таджикистан';

  @override
  String get countryTZ => 'Танзания';

  @override
  String get countryTH => 'Таиланд';

  @override
  String get countryTG => 'Того';

  @override
  String get countryTT => 'Тринидад и Тобаго';

  @override
  String get countryTN => 'Тунис';

  @override
  String get countryTR => 'Турция';

  @override
  String get countryTM => 'Туркменистан';

  @override
  String get countryUG => 'Уганда';

  @override
  String get countryUA => 'Украина';

  @override
  String get countryAE => 'Объединённые Арабские Эмираты';

  @override
  String get countryGB => 'Великобритания';

  @override
  String get countryUS => 'США';

  @override
  String get countryUY => 'Уругвай';

  @override
  String get countryUZ => 'Узбекистан';

  @override
  String get countryVE => 'Венесуэла';

  @override
  String get countryVN => 'Вьетнам';

  @override
  String get countryYE => 'Йемен';

  @override
  String get countryZM => 'Замбия';

  @override
  String get countryZW => 'Зимбабве';

  @override
  String get agentTabDashboard => 'Панель';

  @override
  String get agentTabPatients => 'Пациенты';

  @override
  String get agentTabCases => 'Случаи';

  @override
  String get agentTabBookings => 'Бронирования';

  @override
  String get agentTabEarnings => 'Доходы';

  @override
  String get portalNoActivityYet => 'Пока нет активности';

  @override
  String get portalPatientLabel => 'Пациент';

  @override
  String get portalHospitalLabel => 'Больница';

  @override
  String get portalDoctorLabel => 'Врач';

  @override
  String get portalBookingLabel => 'Бронирование';

  @override
  String portalCaseOpened(String when) {
    return 'Открыт $when';
  }

  @override
  String get portalTotal => 'Итого';

  @override
  String portalQuoteStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'пребывание $count дня',
      many: 'пребывание $count дней',
      few: 'пребывание $count дня',
      one: 'пребывание $count день',
    );
    return '$_temp0';
  }

  @override
  String portalQuoteValidUntil(String date) {
    return 'действительно до $date';
  }

  @override
  String portalQuotePreparedBy(String name) {
    return 'подготовил(а): $name';
  }

  @override
  String get portalFilterAll => 'Все';

  @override
  String get portalAccountDeleted => 'Ваш аккаунт удалён.';

  @override
  String get payeeStatusPending => 'В ожидании';

  @override
  String get payeeStatusEligible => 'К выплате';

  @override
  String get payeeStatusOnHold => 'Приостановлено';

  @override
  String get payeeStatusBatched => 'В пакете';

  @override
  String get payeeStatusPaid => 'Выплачено';

  @override
  String get payeeStatusReversed => 'Сторнировано';

  @override
  String get payeeStatusQueued => 'В очереди';

  @override
  String get payeeStatusProcessing => 'Обрабатывается';

  @override
  String get payeeStatusProcessed => 'Обработано';

  @override
  String get payeeStatusFailed => 'Ошибка';

  @override
  String get payeeStatusNeedsReconciliation => 'Требует сверки';

  @override
  String get payeeSettlementsTab => 'Расчёты';

  @override
  String get payeePayoutsTab => 'Выплаты';

  @override
  String get payeeStatementTab => 'Выписка';

  @override
  String get payeeItemsEmpty => 'Здесь пока ничего нет';

  @override
  String get payeePayoutsEmpty => 'Выплат пока нет';

  @override
  String payeePayoutUtr(String utr) {
    return 'UTR $utr';
  }

  @override
  String get payeeMethodManualBankTransfer => 'Ручной банковский перевод';

  @override
  String get payeeStatementTwelveMonths => '12 месяцев';

  @override
  String payeeStatementDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня',
      many: '$count дней',
      few: '$count дня',
      one: '$count день',
    );
    return '$_temp0';
  }

  @override
  String get payeeStatementPeriod => 'Период';

  @override
  String payeeStatementPeriodRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get payeeOpeningBalance => 'Начальный баланс';

  @override
  String get payeeEarned => 'Заработано';

  @override
  String get payeePaidOut => 'Выплачено';

  @override
  String get payeeClosingBalance => 'Конечный баланс';

  @override
  String get payeeStatementEmpty => 'За этот период операций нет';

  @override
  String payeeStatementBalance(String amount) {
    return 'Баланс $amount';
  }

  @override
  String get payeePaidToDate => 'Выплачено на сегодня';

  @override
  String payeeOutstanding(String amount) {
    return 'К выплате $amount';
  }

  @override
  String payeeNextPayout(String date) {
    return 'следующая выплата $date';
  }

  @override
  String get payeeKpiPending => 'В ожидании';

  @override
  String get payeeKpiEligible => 'Доступно к выплате';

  @override
  String get payeeKpiOnHold => 'Приостановлено';

  @override
  String get payeeKpiBatched => 'В пакете выплат';

  @override
  String payeeItemGrossFee(String gross, String fee) {
    return 'Брутто $gross · комиссия $fee';
  }

  @override
  String payeeItemGst(String amount) {
    return 'GST $amount';
  }

  @override
  String payeeItemTds(String amount) {
    return 'TDS $amount';
  }

  @override
  String payeeItemOnHoldReason(String reason) {
    return 'Приостановлено: $reason';
  }

  @override
  String payeeItemEligibleOn(String date) {
    return 'К выплате с $date';
  }

  @override
  String get commissionTitle => 'Комиссионные';

  @override
  String commissionRateBadge(String rate) {
    return 'ставка $rate';
  }

  @override
  String get commissionKpiPending => 'Ожидаемая комиссия';

  @override
  String get commissionKpiPaid => 'Выплаченная комиссия';

  @override
  String get commissionByMonth => 'Комиссия по месяцам';

  @override
  String get kycBannerNotSubmitted =>
      'Загрузите документы KYC на веб-портале агента, чтобы начать получать комиссионные.';

  @override
  String get kycBannerPending => 'Ваши документы KYC на проверке. Пока вы можете добавлять пациентов.';

  @override
  String get kycBannerRejected => 'KYC отклонён';

  @override
  String kycBannerRejectedWithReason(String reason) {
    return 'KYC отклонён: $reason';
  }

  @override
  String agentAccountStatusBanner(String status) {
    return 'Статус аккаунта вашего агентства: $status.';
  }

  @override
  String get agentDashboardTitle => 'Панель агента';

  @override
  String agentDashboardGreeting(String name) {
    return 'Здравствуйте, $name';
  }

  @override
  String get agentKpiPatients => 'Пациенты';

  @override
  String get agentKpiActiveCases => 'Активные случаи';

  @override
  String get agentKpiConfirmedBookings => 'Подтверждённые бронирования';

  @override
  String get agentKpiConversion => 'Конверсия';

  @override
  String get agentQuickActions => 'Быстрые действия';

  @override
  String get agentAddPatient => 'Добавить пациента';

  @override
  String get agentRunScreening => 'Провести скрининг';

  @override
  String get agentCasesByMonth => 'Случаи по месяцам';

  @override
  String get agentRecentCases => 'Недавние случаи';

  @override
  String get agentAllCases => 'Все случаи';

  @override
  String get agentDashboardNoCases => 'Случаев пока нет';

  @override
  String get agentDashboardNoCasesHint => 'Добавьте пациента, проведите скрининг и запросите предложения у больниц.';

  @override
  String agentReferralCode(String code) {
    return 'Ваш код агента $code';
  }

  @override
  String get agentCopyReferralLink => 'Копировать реферальную ссылку';

  @override
  String get agentReferralLinkCopied => 'Реферальная ссылка скопирована';

  @override
  String get agentPatientsTitle => 'Мои пациенты';

  @override
  String get agentPatientsSearchHint => 'Поиск пациентов';

  @override
  String get agentPatientsEmpty => 'Пациентов пока нет';

  @override
  String agentPatientsNoMatch(String query) {
    return 'Нет пациентов по запросу «$query»';
  }

  @override
  String get agentPatientsEmptyHint =>
      'Добавьте пациента, чтобы провести скрининг и запросить для него предложения больниц.';

  @override
  String agentPatientAgeYears(int age) {
    String _temp0 = intl.Intl.pluralLogic(
      age,
      locale: localeName,
      other: '$age года',
      many: '$age лет',
      few: '$age года',
      one: '$age год',
    );
    return '$_temp0';
  }

  @override
  String agentPatientCasesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count случая',
      many: '$count случаев',
      few: '$count случая',
      one: '$count случай',
    );
    return '$_temp0';
  }

  @override
  String agentPatientScreeningsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count скрининга',
      many: '$count скринингов',
      few: '$count скрининга',
      one: '$count скрининг',
    );
    return '$_temp0';
  }

  @override
  String get agentPatientManaged => 'Под управлением';

  @override
  String get agentPatientUpdated => 'Данные пациента обновлены';

  @override
  String get agentPatientAdded => 'Пациент добавлен';

  @override
  String get agentFormRequired => 'Обязательно';

  @override
  String get agentEditPatient => 'Изменить пациента';

  @override
  String get agentPatientFirstName => 'Имя';

  @override
  String get agentPatientLastName => 'Фамилия';

  @override
  String get agentPatientNationalityLabel => 'Гражданство (код ISO, напр. NG, AE, US)';

  @override
  String get agentPatientNationalityInvalid => 'Введите двухбуквенный код страны';

  @override
  String get agentPatientEmailOptional => 'Эл. почта (необязательно)';

  @override
  String get agentPatientEmailHelper => 'Пациент получит приглашение активировать свой аккаунт.';

  @override
  String get agentPatientEmailInvalid => 'Неверный адрес эл. почты';

  @override
  String get agentPatientPhoneOptional => 'Телефон (необязательно)';

  @override
  String get agentPatientDobOptional => 'Дата рождения (необязательно)';

  @override
  String get agentPatientMedicalHistoryOptional => 'Анамнез (необязательно)';

  @override
  String get agentPatientTravelMedicalSection => 'Поездка и медицинские данные';

  @override
  String get agentPatientPassportNumber => 'Номер паспорта';

  @override
  String get agentPatientPassportKeepHelper => 'Оставьте пустым, чтобы сохранить текущий паспорт.';

  @override
  String get agentPatientPassportExpiry => 'Срок действия паспорта';

  @override
  String agentPatientPassportExpires(String date) {
    return 'Паспорт действителен до $date';
  }

  @override
  String get agentPatientBloodGroup => 'Группа крови';

  @override
  String get agentPatientAllergies => 'Аллергии';

  @override
  String get agentSaveChanges => 'Сохранить изменения';

  @override
  String get agentRequestQuote => 'Запросить предложение';

  @override
  String get agentPatientAccountActivated => 'Аккаунт активирован';

  @override
  String get agentPatientInvitePending => 'Под вашим управлением · приглашение ожидает';

  @override
  String get agentPatientNationality => 'Гражданство';

  @override
  String get agentPatientDob => 'Дата рождения';

  @override
  String agentPatientDobWithAge(String date, int age) {
    return '$date (возраст $age)';
  }

  @override
  String get agentPatientGender => 'Пол';

  @override
  String get agentPatientEmail => 'Эл. почта';

  @override
  String get agentPatientPhone => 'Телефон';

  @override
  String get agentPatientPassport => 'Паспорт';

  @override
  String agentPatientPassportExpShort(String date) {
    return 'до $date';
  }

  @override
  String get agentPatientMedicalHistory => 'Анамнез';

  @override
  String get agentScreeningsSection => 'Скрининги';

  @override
  String get agentScreeningsEmpty =>
      'Скринингов пока нет — проведите скрининг, чтобы получить подобранные ИИ больницы и врачей.';

  @override
  String get agentGeneralScreening => 'Общий скрининг';

  @override
  String get agentCasesTitle => 'Случаи и предложения';

  @override
  String get agentCompareQuotes => 'Сравнить предложения';

  @override
  String get agentPatientCasesEmpty => 'Запросов в больницы пока нет.';

  @override
  String agentDocumentUploaded(String fileName) {
    return 'Загружено: $fileName';
  }

  @override
  String get agentDocumentsSection => 'Документы';

  @override
  String get agentDocumentUploading => 'Загрузка…';

  @override
  String get agentDocumentsEmpty =>
      'Загрузите заключения, снимки и паспорт, чтобы больницы могли составить точное предложение.';

  @override
  String get agentCasesEmpty => 'Случаев нет';

  @override
  String get agentCasesEmptyHint => 'Откройте карточку пациента и запросите предложение у больницы.';

  @override
  String get agentAcceptQuoteTitle => 'Принять это предложение?';

  @override
  String agentAcceptQuoteMessage(String hospital, String total) {
    return '$hospital · $total. Другие открытые предложения остаются доступны до бронирования.';
  }

  @override
  String get agentQuoteAccept => 'Принять';

  @override
  String get agentQuoteAccepted => 'Предложение принято';

  @override
  String get agentRejectQuoteTitle => 'Отклонить предложение';

  @override
  String get agentReasonOptional => 'Причина (необязательно)';

  @override
  String get agentQuoteReject => 'Отклонить';

  @override
  String get agentQuoteRejected => 'Предложение отклонено';

  @override
  String get agentCancelCaseTitle => 'Отменить этот случай?';

  @override
  String get agentCancelCaseMessage => 'Больница получит уведомление.';

  @override
  String get agentCancelCase => 'Отменить случай';

  @override
  String get agentCaseCancelled => 'Случай отменён';

  @override
  String get agentCaseFallbackTitle => 'Случай';

  @override
  String get agentCaseCoordinator => 'Координатор';

  @override
  String get agentCaseOpenedLabel => 'Открыт';

  @override
  String get agentCaseNotes => 'Заметки';

  @override
  String get agentBookTreatment => 'Забронировать лечение';

  @override
  String agentCaseBookingSummary(String date, String balance) {
    return 'Госпитализация $date · остаток $balance';
  }

  @override
  String get agentQuotesSection => 'Предложения';

  @override
  String get agentCompareHospitals => 'Сравнить больницы';

  @override
  String agentQuotesWaiting(String hospital) {
    return 'Ожидаем подробное предложение от $hospital.';
  }

  @override
  String agentQuoteDated(String date) {
    return 'Предложение · $date';
  }

  @override
  String get agentTimelineSection => 'Хронология';

  @override
  String get agentCompareEmpty => 'Пока нечего сравнивать';

  @override
  String get agentCompareEmptyHint =>
      'Запросите предложения у нескольких больниц — они появятся здесь, как только больницы ответят.';

  @override
  String get agentRequestAQuote => 'Запросить предложение';

  @override
  String agentCompareBestPrice(String price, String hospital) {
    return 'Лучшая цена: $price в $hospital.';
  }

  @override
  String agentCompareBestPriceSaves(String price, String hospital, String savings) {
    return 'Лучшая цена: $price в $hospital — экономия $savings по сравнению с самым дорогим предложением.';
  }

  @override
  String get agentCompareMixedCurrencies => 'Предложения в разных валютах — сравнивайте итоговые суммы внимательно.';

  @override
  String get agentCompareRequestAnother => 'Запросить другую больницу';

  @override
  String get agentCompareStay => 'Пребывание';

  @override
  String get agentCompareValidUntil => 'Действительно до';

  @override
  String agentCompareAcceptTitle(String hospital) {
    return 'Принять предложение $hospital?';
  }

  @override
  String agentCompareAcceptMessage(String total) {
    return 'Итого $total';
  }

  @override
  String get agentCompareBest => 'Лучшее';

  @override
  String agentCompareStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня',
      many: '$count дней',
      few: '$count дня',
      one: '$count день',
    );
    return '$_temp0';
  }

  @override
  String agentQuoteRequestedFrom(String hospital) {
    return 'Предложение запрошено у $hospital';
  }

  @override
  String get agentSearchHospitalsHint => 'Поиск больниц';

  @override
  String get agentNoHospitalsFound => 'Больницы не найдены';

  @override
  String get agentNotesForHospitalOptional => 'Заметки для больницы (необязательно)';

  @override
  String get agentSelectHospital => 'Выберите больницу';

  @override
  String agentRequestQuoteFrom(String hospital) {
    return 'Запросить предложение у $hospital';
  }

  @override
  String get agentBookingsTitle => 'Бронирования и платежи';

  @override
  String get agentBookingsEmpty => 'Бронирований нет';

  @override
  String get agentBookingsEmptyHint => 'Примите предложение больницы, затем забронируйте лечение для пациента.';

  @override
  String agentBookingAdmissionShort(String date) {
    return 'госпитализация $date';
  }

  @override
  String agentBookingDueShort(String amount) {
    return 'к оплате $amount';
  }

  @override
  String get agentBookingPaidInFull => 'оплачено полностью';

  @override
  String get agentTestPaymentCompleted => 'Тестовый платёж выполнен';

  @override
  String agentBankBeneficiary(String name) {
    return 'Получатель: $name';
  }

  @override
  String agentBankName(String bank) {
    return 'Банк: $bank';
  }

  @override
  String agentBankAccount(String account) {
    return 'Счёт: $account';
  }

  @override
  String agentBankReference(String reference) {
    return 'Код платежа: $reference';
  }

  @override
  String agentBankAmount(String amount) {
    return 'Сумма: $amount';
  }

  @override
  String get agentBankTransferDetailsTitle => 'Реквизиты для банковского перевода';

  @override
  String get agentCopyAndClose => 'Копировать и закрыть';

  @override
  String agentCancelBookingTitle(String bookingNumber) {
    return 'Отменить бронирование $bookingNumber?';
  }

  @override
  String get agentReason => 'Причина';

  @override
  String get agentCancelBooking => 'Отменить бронирование';

  @override
  String get agentBookingCancelledRefund => 'Бронирование отменено; возврат средств — по правилам больницы';

  @override
  String get agentBookingTreatment => 'Лечение';

  @override
  String get agentBookingAdmission => 'Госпитализация';

  @override
  String get agentBookingDischarge => 'Выписка';

  @override
  String get agentBookingPaymentPlan => 'План оплаты';

  @override
  String agentBookingMonthlyInstallments(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ежемесячного платежа',
      many: '$count ежемесячных платежей',
      few: '$count ежемесячных платежа',
      one: '$count ежемесячный платёж',
    );
    return '$_temp0';
  }

  @override
  String get agentPriceSummary => 'Сводка стоимости';

  @override
  String get agentPriceDiscount => 'Скидка';

  @override
  String get agentPriceServiceFee => 'Сервисный сбор';

  @override
  String get agentPriceTax => 'Налог';

  @override
  String get agentPriceDeposit => 'Предоплата';

  @override
  String get agentPricePaid => 'Оплачено';

  @override
  String get agentPriceRefunded => 'Возвращено';

  @override
  String get agentPriceBalanceDue => 'К оплате';

  @override
  String get agentCollectPayment => 'Принять оплату';

  @override
  String get agentPaymentsSection => 'Платежи';

  @override
  String get agentPaymentsEmpty => 'Платежей пока нет.';

  @override
  String get agentOpenCase => 'Открыть случай';

  @override
  String get agentInstallmentsSection => 'Рассрочка';

  @override
  String agentInstallmentDue(String date) {
    return 'Срок оплаты $date';
  }

  @override
  String get agentInstallmentCollect => 'Принять';

  @override
  String get agentCollectPaymentHint =>
      'Сумма рассчитывается сервером; пациент также может оплатить в своём приложении.';

  @override
  String get agentCollectBankTransferOption => 'Банковский перевод (SWIFT / NEFT)';

  @override
  String agentCollectContinueAmount(String amount) {
    return 'Продолжить · ~$amount';
  }

  @override
  String get agentAdmissionDate => 'Дата госпитализации';

  @override
  String get agentChooseDate => 'Выберите дату';

  @override
  String get agentPaymentSection => 'Оплата';

  @override
  String get agentPaymentOptionDeposit => 'Предоплата';

  @override
  String get agentPaymentOptionFull => 'Полностью';

  @override
  String get agentPaymentOptionPlan => 'Рассрочка';

  @override
  String agentInstallmentMonthsChip(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count месяца',
      many: '$count месяцев',
      few: '$count месяца',
      one: '$count месяц',
    );
    return '$_temp0';
  }

  @override
  String get agentInsuranceClaim => 'Пациент хочет воспользоваться страховкой';

  @override
  String get agentCreateBooking => 'Создать бронирование';

  @override
  String get hpTabDashboard => 'Панель';

  @override
  String get hpTabEnquiries => 'Запросы';

  @override
  String get hpTabPatients => 'Пациенты';

  @override
  String get hpTabSettlements => 'Расчёты';

  @override
  String get hpTabMore => 'Ещё';

  @override
  String get hpSettlementsTitle => 'Расчёты и выплаты';

  @override
  String get hpDashboardTitle => 'Панель больницы';

  @override
  String get hpNoHospitalTitle => 'Больница не привязана';

  @override
  String get hpNoHospitalMessage => 'Попросите администратора вашей больницы пригласить вас в качестве участника.';

  @override
  String get hpListingDraft =>
      'Ваша карточка — черновик. Заполните профиль на веб-портале больницы и отправьте его на проверку.';

  @override
  String get hpListingPendingReview => 'Ваша карточка на проверке. Пациенты увидят её после одобрения.';

  @override
  String hpListingOtherStatus(String status) {
    return 'Статус вашей карточки: $status. Обратитесь в поддержку Heal India Global.';
  }

  @override
  String get hpKpiOpenEnquiries => 'Открытые запросы';

  @override
  String get hpKpiQuotesAwaiting => 'Сметы ждут ответа пациента';

  @override
  String get hpKpiUpcomingAdmissions => 'Предстоящие госпитализации';

  @override
  String get hpKpiInTreatment => 'На лечении';

  @override
  String get hpRevenueThisMonth => 'Доход за этот месяц';

  @override
  String get hpRevenueByMonth => 'Доход по месяцам';

  @override
  String get hpBookingsByMonth => 'Бронирования по месяцам';

  @override
  String get hpRecentCases => 'Последние обращения';

  @override
  String get hpNoEnquiriesYet => 'Запросов пока нет';

  @override
  String get hpEnquiriesFilterNew => 'Новые';

  @override
  String get hpNoNewEnquiries => 'Новых запросов нет';

  @override
  String get hpNoCases => 'Обращений нет';

  @override
  String get hpEnquiriesEmptyMessage => 'Пациенты и агенты отправляют запросы из результатов подбора.';

  @override
  String hpDeclineTitle(String caseNumber) {
    return 'Отклонить $caseNumber?';
  }

  @override
  String get hpDeclineReasonLabel => 'Причина, которую увидит пациент';

  @override
  String get hpDeclineButton => 'Отклонить';

  @override
  String get hpEnquiryDeclined => 'Запрос отклонён';

  @override
  String get hpCaseFallbackTitle => 'Обращение';

  @override
  String get hpPrepareQuote => 'Подготовить смету';

  @override
  String get hpSendRevisedQuote => 'Отправить новую смету';

  @override
  String get hpPatientFallback => 'Пациент';

  @override
  String hpYearsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count года',
      many: '$count лет',
      few: '$count года',
      one: '$count год',
    );
    return '$_temp0';
  }

  @override
  String get hpInfoTreatment => 'Лечение';

  @override
  String get hpInfoDoctor => 'Врач';

  @override
  String get hpInfoViaAgent => 'Через агента';

  @override
  String get hpInfoCoordinator => 'Координатор';

  @override
  String get hpInfoReceived => 'Получено';

  @override
  String hpCaseBookingLine(String bookingNumber, String date) {
    return 'Бронирование $bookingNumber · госпитализация $date';
  }

  @override
  String get hpPatientNotes => 'Заметки пациента';

  @override
  String get hpScreening => 'Первичный опрос';

  @override
  String get hpInfoSpecialty => 'Специализация';

  @override
  String get hpInfoBodyAreas => 'Области тела';

  @override
  String get hpInfoPain => 'Боль';

  @override
  String get hpInfoSymptoms => 'Симптомы';

  @override
  String get hpInfoDuration => 'Длительность';

  @override
  String get hpInfoUrgency => 'Срочность';

  @override
  String get hpMedicalDocuments => 'Медицинские документы';

  @override
  String get hpQuotesSection => 'Сметы';

  @override
  String get hpNoQuoteYet => 'Смета ещё не отправлена.';

  @override
  String hpQuoteSentOn(String date) {
    return 'Отправлено $date';
  }

  @override
  String get hpQuoteProblemPlan => 'Опишите план лечения';

  @override
  String get hpQuoteProblemNoLines => 'Добавьте хотя бы одну позицию';

  @override
  String get hpQuoteProblemIncompleteLine => 'У каждой позиции должны быть описание и сумма';

  @override
  String get hpQuoteProblemTooManyLines => 'Не более 50 позиций';

  @override
  String get hpSendQuoteConfirmTitle => 'Отправить смету?';

  @override
  String hpSendQuoteConfirmMessage(String total) {
    return 'Итого $total — пациент получит уведомление сразу.';
  }

  @override
  String get hpQuoteSent => 'Смета отправлена';

  @override
  String hpQuoteBuilderTitle(String caseNumber) {
    return 'Смета · $caseNumber';
  }

  @override
  String get hpTreatmentPlanLabel => 'План лечения';

  @override
  String get hpCurrencyLabel => 'Валюта';

  @override
  String get hpStayDaysLabel => 'Пребывание (дни)';

  @override
  String hpValidUntil(String date) {
    return 'Действительна до $date';
  }

  @override
  String get hpLineItems => 'Позиции';

  @override
  String get hpAddLineItem => 'Добавить позицию';

  @override
  String get hpTotal => 'Итого';

  @override
  String get hpSendQuote => 'Отправить смету';

  @override
  String get hpCategoryLabel => 'Категория';

  @override
  String get hpDescriptionLabel => 'Описание';

  @override
  String hpAmountLabel(String currency) {
    return 'Сумма ($currency)';
  }

  @override
  String get hpAdmissionsTitle => 'Госпитализации';

  @override
  String get hpAdmissionsUpcoming => 'Предстоящие';

  @override
  String get hpAdmissionsDischarged => 'Выписаны';

  @override
  String get hpAdmissionsAwaitingPayment => 'Ожидают оплаты';

  @override
  String get hpAdmissionsCancelled => 'Отменены';

  @override
  String get hpAdmissionsEmptyUpcoming => 'Нет предстоящих пациентов';

  @override
  String get hpAdmissionsEmptyInTreatment => 'Нет пациентов на лечении';

  @override
  String get hpAdmissionsEmptyDischarged => 'Нет выписанных пациентов';

  @override
  String get hpAdmissionsEmptyAwaitingPayment => 'Нет пациентов, ожидающих оплаты';

  @override
  String get hpAdmissionsEmptyCancelled => 'Нет отменённых пациентов';

  @override
  String hpTileDischarged(String date) {
    return 'Выписан $date';
  }

  @override
  String hpTileAdmitted(String date) {
    return 'Госпитализирован $date';
  }

  @override
  String hpTileAdmission(String date) {
    return 'Госпитализация $date';
  }

  @override
  String hpTileInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'через $count дня',
      many: 'через $count дней',
      few: 'через $count дня',
      one: 'через $count день',
    );
    return '$_temp0';
  }

  @override
  String get hpAdmitPatientTitle => 'Госпитализировать пациента?';

  @override
  String hpAdmitNamedTitle(String name) {
    return 'Госпитализировать: $name?';
  }

  @override
  String get hpNoteOptional => 'Заметка (необязательно)';

  @override
  String get hpAdmitButton => 'Госпитализировать';

  @override
  String get hpPatientAdmitted => 'Пациент госпитализирован';

  @override
  String get hpDischargeDate => 'Дата выписки';

  @override
  String get hpDischargeNoteTitle => 'Заметка к выписке';

  @override
  String get hpDischargeButton => 'Выписать';

  @override
  String get hpPatientDischarged => 'Пациент выписан';

  @override
  String get hpAddedToItinerary => 'Добавлено в маршрут';

  @override
  String get hpBookingFallbackTitle => 'Бронирование';

  @override
  String get hpItinerary => 'Маршрут';

  @override
  String get hpInfoAdmission => 'Госпитализация';

  @override
  String get hpInfoAdmitted => 'Госпитализирован';

  @override
  String get hpInfoDischarge => 'Выписка';

  @override
  String get hpInfoLengthOfStay => 'Срок пребывания';

  @override
  String hpDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count дня',
      many: '$count дней',
      few: '$count дня',
      one: '$count день',
    );
    return '$_temp0';
  }

  @override
  String get hpInfoPaid => 'Оплачено';

  @override
  String get hpAdmitPatientButton => 'Госпитализировать';

  @override
  String get hpDischargePatientButton => 'Выписать пациента';

  @override
  String get hpAwaitingDeposit =>
      'Ожидается предоплата пациента. Госпитализация станет доступна после подтверждения бронирования.';

  @override
  String get hpOpenCase => 'Открыть обращение';

  @override
  String get hpNoItineraryYet => 'Маршрута пока нет — добавьте приёмы, время операции, трансфер и контрольные визиты.';

  @override
  String get hpItineraryMarkedDone => 'Отмечено как выполненное';

  @override
  String get hpItineraryCancelled => 'Отменено';

  @override
  String get hpItineraryRemoved => 'Удалено';

  @override
  String get hpItineraryMarkDone => 'Отметить выполненным';

  @override
  String get hpAddToItinerary => 'Добавить в маршрут';

  @override
  String get hpItineraryTypeLabel => 'Тип';

  @override
  String get hpItineraryTitleLabel => 'Название (например, предоперационная консультация)';

  @override
  String get hpItineraryDateTime => 'Дата и время';

  @override
  String get hpItineraryLocationLabel => 'Место';

  @override
  String get hpItineraryInstructionsLabel => 'Указания для пациента (необязательно)';

  @override
  String get hpItineraries => 'Маршруты';

  @override
  String get hpNobodyAdmitted => 'Сейчас никто не госпитализирован.';

  @override
  String get hpUpcomingArrivals => 'Ближайшие прибытия';

  @override
  String get hpNoConfirmedBookings => 'Нет подтверждённых бронирований.';

  @override
  String get hpMoreItinerariesSubtitle => 'Приёмы, время операций, трансферы';

  @override
  String get hpVisaLettersTitle => 'Визовые приглашения';

  @override
  String get hpMoreVisasSubtitle => 'Запросы пациентов на медицинскую визу';

  @override
  String get hpDoctorsTitle => 'Врачи';

  @override
  String get hpMoreDoctorsSubtitle => 'Ваши специалисты и их профили';

  @override
  String get hpMorePriceListSubtitle => 'Процедуры, диапазоны цен и пакеты';

  @override
  String get hpActingFor => 'Действовать от имени';

  @override
  String get hpWebPortalNote => 'Профиль, участников, доступность и цены можно изменить на веб-портале больницы.';

  @override
  String get hpNoVisaRequests => 'Запросов на визу нет';

  @override
  String get hpInvitationLetterNeeded => 'Нужно приглашение';

  @override
  String get hpVisaRequestFallback => 'Запрос на визу';

  @override
  String get hpNoInvitationLetterYet => 'Приглашения пока нет';

  @override
  String get hpInvitationLetterUploaded => 'Приглашение: загружено';

  @override
  String hpInvitationLetterNamed(String fileName) {
    return 'Приглашение: $fileName';
  }

  @override
  String get hpReplace => 'Заменить';

  @override
  String get hpStatusLabel => 'Статус';

  @override
  String get hpEvisaReferenceLabel => 'Номер заявки на электронную визу';

  @override
  String get hpNotesLabel => 'Заметки';

  @override
  String get hpNoDoctorsListed => 'Врачи не указаны';

  @override
  String get hpTeleconsultBadge => 'Телеконсультация';

  @override
  String hpConsultationFee(String fee) {
    return 'Стоимость $fee';
  }

  @override
  String get priceListTitle => 'Прайс-лист';

  @override
  String get priceListEmpty => 'Цены на процедуры ещё не указаны';

  @override
  String priceListStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'пребывание $count дня',
      many: 'пребывание $count дней',
      few: 'пребывание $count дня',
      one: 'пребывание $count день',
    );
    return '$_temp0';
  }

  @override
  String priceListSuccessRate(String rate) {
    return 'Успешность $rate%';
  }

  @override
  String get reportAnalysisTitle => 'Ваш отчёт';

  @override
  String get reportConfirmedSnack => 'Отчёт подтверждён.';

  @override
  String reportMaxPages(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'В отчёте может быть не более $max страницы.',
      many: 'В отчёте может быть не более $max страниц.',
      few: 'В отчёте может быть не более $max страниц.',
      one: 'В отчёте может быть не более $max страницы.',
    );
    return '$_temp0';
  }

  @override
  String reportFileTooLarge(String fileName) {
    return 'Файл $fileName слишком большой (не более 20 МБ).';
  }

  @override
  String get reportPermissionNeeded =>
      'Разрешите доступ к камере / фото в настройках телефона, чтобы добавить страницы.';

  @override
  String reportUploadingPage(int current, int total) {
    return 'Загрузка страницы $current из $total…';
  }

  @override
  String get reportSendingToAi => 'Отправка ИИ…';

  @override
  String get reportReviewTitle => 'Проверьте отчёт';

  @override
  String get reportCaptureTitle => 'Добавить медицинский отчёт';

  @override
  String get reportCaptureIntro => 'Сфотографируйте каждую страницу бумажного отчёта, выберите фото или загрузите PDF.';

  @override
  String get reportTakePhoto => 'Сделать фото';

  @override
  String get reportChooseFromGallery => 'Выбрать из галереи';

  @override
  String get reportUploadPdf => 'Загрузить PDF';

  @override
  String reportPagesCount(int count, int max) {
    return 'Страницы ($count/$max)';
  }

  @override
  String get reportNoPagesTip =>
      'Страниц пока нет. Совет: положите страницу ровно, при хорошем освещении, и заполните ею весь кадр.';

  @override
  String get reportKindQuestion => 'Что это за документ?';

  @override
  String get reportReadWithAi => 'Прочитать отчёт с помощью ИИ';

  @override
  String get reportAiConsentText =>
      'Наш ИИ-помощник читает страницы и составляет список ваших результатов анализов, диагнозов и лекарств. Вы проверяете и исправляете всё перед использованием, и данные передаются только выбранным вами больницам. Вы можете отключить эту функцию и просто загрузить отчёт.';

  @override
  String get reportUploadButton => 'Загрузить отчёт';

  @override
  String reportPageNumber(int number) {
    return 'Страница $number';
  }

  @override
  String reportRemovePage(int number) {
    return 'Удалить страницу $number';
  }

  @override
  String get reportDragToReorder => 'Перетащите, чтобы изменить порядок';

  @override
  String get reportAiEntryTooltip => 'Чтение отчётов с ИИ';

  @override
  String get reportSheetTitle => 'Ваши отчёты, прочитанные ИИ';

  @override
  String get reportSheetIntro =>
      'Сфотографируйте бумажный отчёт или выберите PDF. Вы проверяете и подтверждаете всё перед использованием.';

  @override
  String get reportScanButton => 'Сканировать отчёт';

  @override
  String get reportNoReadings => 'Прочитанных ИИ отчётов пока нет.';

  @override
  String get reportMedicalReportFallback => 'Медицинский отчёт';

  @override
  String get reportImportant => 'Важно';

  @override
  String get reportCriticalValues => 'Критические значения';

  @override
  String get reportSummary => 'Краткое содержание';

  @override
  String get reportKeyFindings => 'Основные находки';

  @override
  String get reportLabValues => 'Лабораторные показатели';

  @override
  String get reportMedications => 'Лекарства';

  @override
  String get reportDiagnosesMentioned => 'Упомянутые диагнозы';

  @override
  String get reportProceduresMentioned => 'Упомянутые процедуры';

  @override
  String get reportRecommendations => 'Рекомендации';

  @override
  String get reportAiDisclaimer => 'Создано ИИ — всегда уточняйте у своего врача.';

  @override
  String get reportStatusConfirmed => 'Подтверждён';

  @override
  String get reportStatusDiscarded => 'Отклонён';

  @override
  String get reportStatusReading => 'Чтение…';

  @override
  String get reportStatusNotRead => 'Не прочитан';

  @override
  String get reportStatusNeedsReview => 'Требует проверки';

  @override
  String get reportLabTest => 'Анализ';

  @override
  String get reportLabResult => 'Результат';

  @override
  String get reportLabRange => 'Норма';

  @override
  String get reportEdited => 'Изменено';

  @override
  String get reportDateLabel => 'Дата отчёта';

  @override
  String get reportCriticalValuesInReport => 'Критические значения в этом отчёте';

  @override
  String get reportAboutSection => 'Об этом отчёте';

  @override
  String get reportDocTypeLabel => 'Тип документа';

  @override
  String get reportClearDate => 'Очистить дату';

  @override
  String get reportDateNotStated => 'Не указана';

  @override
  String get reportFacilityLabel => 'Больница / лаборатория';

  @override
  String get reportSummaryHint => 'Что сказано в отчёте, простыми словами';

  @override
  String get findingAdd => 'Добавить находку';

  @override
  String findingRemove(int number) {
    return 'Удалить находку $number';
  }

  @override
  String get findingLabel => 'Находка';

  @override
  String get labAddValue => 'Добавить показатель';

  @override
  String labRemoveValue(int number) {
    return 'Удалить показатель $number';
  }

  @override
  String get labValueLabel => 'Значение';

  @override
  String get labUnitLabel => 'Единица';

  @override
  String get labReferenceRangeLabel => 'Референсный диапазон';

  @override
  String get reportAddMedication => 'Добавить лекарство';

  @override
  String reportRemoveMedication(int number) {
    return 'Удалить лекарство $number';
  }

  @override
  String get reportMedicineLabel => 'Лекарство';

  @override
  String get reportDoseLabel => 'Доза';

  @override
  String get reportFrequencyLabel => 'Как часто';

  @override
  String get reportAddDiagnosis => 'Добавить диагноз';

  @override
  String get reportAddProcedure => 'Добавить процедуру';

  @override
  String get reportAddRecommendation => 'Добавить рекомендацию';

  @override
  String get reportNone => 'Нет';
}
