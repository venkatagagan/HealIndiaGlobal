# WhatsApp updates (Meta WhatsApp Cloud API)

Many of our patients in Africa and the Middle East use WhatsApp more than e-mail or app notifications. Patients
who opt in get short journey updates on WhatsApp, such as "your quote is ready", "booking confirmed",
"consultation in 1 hour" with the join link, "payment received" and "check-in due".
WhatsApp is **another notification channel**, alongside in-app, e-mail and push. It never replaces them, and it
never carries clinical content.

Code: `backend/app/modules/messaging/whatsapp.py` (service, job, webhook), `whatsapp_router.py` (routes),
`whatsapp_templates/templates.json` (template registry and texts), models `whatsapp_optins` and
`whatsapp_messages` (migration `0010a`).

## 1. How it works

| Step | What happens |
| --- | --- |
| Opt-in | Patient web (Profile → Preferences → WhatsApp updates) or the mobile app (Profile → WhatsApp updates). The patient enters a number in E.164 format. `POST /api/v1/me/whatsapp/verify` sends a 6-digit code as the authentication template `hig_verification_code`. `POST /me/whatsapp/confirm` checks the code; the status becomes `active` and consent `whatsapp_updates` (version `2026-11`) is recorded with IP and user agent. A code expires after 10 minutes and allows 5 attempts. Limits: 3 codes per 10 minutes, 10 per day, and 5 verify calls per hour per user. |
| Sending | `notify()` creates the in-app notification. If WhatsApp is configured, the kind has a template for the recipient's role and the user opted in, it enqueues `messaging.send_whatsapp`, deduplicated per notification. The job picks the template in the recipient's language (en/ar/fr/bn/ru mapped to Meta language codes), fills the parameters, calls `POST https://graph.facebook.com/<version>/<phone-number-id>/messages` and logs the result in `whatsapp_messages`. |
| Log | `whatsapp_messages` stores the template name, language, masked number, status (`queued/sent/delivered/read/failed/skipped`), Meta's message id, error code and timestamps. It **never stores the message text or its parameters**. |
| Limits | At most `WHATSAPP_USER_DAILY_LIMIT` (default 10) template messages per user per day; further ones are logged as `skipped / daily_limit`. A message with a missing parameter is `skipped / missing_param`. Retryable errors (HTTP 429/5xx, Meta codes 130429, 131056, 131000) are retried with backoff. Other errors mark the message `failed`, for example template not approved (132001), bad parameter (132000/132012), undeliverable (131026) or auth (190). |
| Delivery status | Meta calls `POST /api/v1/webhooks/whatsapp`. The body is verified with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). Statuses `sent → delivered → read` / `failed` update the log, and late webhooks never move a status backwards. |
| Opt-out | Reply **STOP** (also: UNSUBSCRIBE, ARRET/ARRÊT, توقف/إيقاف, বন্ধ, СТОП/ОТПИСАТЬСЯ), or switch it off in settings (`DELETE /me/whatsapp`). Both record `whatsapp_updates` with `granted=false` and an audit entry, and stop messages at once. Inbound messages are otherwise ignored and **not stored**. |
| Admin | Admin portal → System → WhatsApp (`/settings/whatsapp`): provider configuration (set or not set, never the secrets), templates, opt-in counts, sent/failed in the last 24 h and the message log. API: `GET /admin/whatsapp/status`, `GET /admin/whatsapp/messages`. |

Template kinds: `quote.sent`, `quote.overdue` (patient: "we are chasing the hospital"; hospital members: "quote
due"), `quote.reminder_due` (hospital), `booking.confirmed`, `consultation.reminder` (24 h and 1 h, with the
join link), `visa.invitation_issued`, `payment.captured`, `installment.due`, `aftercare.checkin_due` (new hourly
job `discharge.checkin_due_notifications`), `sos.updated` (only when acknowledged) and
`discharge_summary.finalized` (generic "a new document is ready").

## 2. Configuration

| Setting | Value |
| --- | --- |
| `WHATSAPP_PROVIDER` | `none` (default: WhatsApp off, opt-in endpoints answer `whatsapp_unavailable`) or `meta` |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Manager → Phone numbers → *Phone number ID* (not the phone number itself) |
| `WHATSAPP_ACCESS_TOKEN` | **Secret.** A permanent *System User* token with `whatsapp_business_messaging` and `whatsapp_business_management`; store it in the secret manager, never in the repo |
| `WHATSAPP_APP_SECRET` | **Secret.** Meta app → Settings → Basic → App secret. Without it the webhook answers 503 |
| `WHATSAPP_VERIFY_TOKEN` | A random string you choose; enter the same value as the *Verify token* in the app's WhatsApp → Configuration → Webhook |
| `WHATSAPP_GRAPH_API_VERSION` | `v21.0` (move forward when Meta deprecates it; the payload is stable) |
| `WHATSAPP_USER_DAILY_LIMIT` | 10 |

Webhook URL: `https://<api host>/api/v1/webhooks/whatsapp`. Subscribe to the **messages** field, which carries
both statuses and inbound replies. The route is rate-limited to 1200 requests per minute per IP.

## 3. What the business must set up (one-off)

1. **Meta Business portfolio** (business.facebook.com) in the legal name of the company, then **business
   verification**: certificate of incorporation, GST or utility bill, a website on the same domain as the
   business e-mail, and a phone number. This usually takes 2 to 10 working days. Without verification you are
   limited to 250 business-initiated conversations per day and cannot raise the limit or get a display name
   approved.
2. **Meta developer app** (developers.facebook.com, type *Business*) with the **WhatsApp** product, linked to
   the portfolio. This creates the WhatsApp Business Account (WABA).
3. **Phone number**: a number that is **not** registered on the WhatsApp or WhatsApp Business app (or delete
   that account first). It needs to receive an SMS or voice call for verification. Use a dedicated Indian
   landline or mobile, such as the international patient desk. Set the **display name** "Heal India Global"; it
   must match the brand on the website and is reviewed by Meta. Two-step verification PIN: keep it in the
   password manager.
4. **System user + permanent token**: Business settings → Users → System users → add (Admin) → assign the app
   and the WABA → *Generate token* with the permissions above → `WHATSAPP_ACCESS_TOKEN`.
5. **Payment method** on the WABA (WhatsApp Manager → Account tools → Payment methods). A card in INR or USD.
6. **Submit the templates** below (WhatsApp Manager → Message templates → Create). For each template use the
   exact **name**, **category** and each **language**, paste the body and add the sample values. Approval usually
   takes minutes to 24 h. A template rejected in one language does not block the others, and the code falls back
   to nothing for that language (logged as `failed / 132001`), so fix and resubmit. **Never edit an approved
   template's meaning**: edits need re-approval, and Meta may re-categorise utility templates that read like
   marketing.
7. **Webhook**: app → WhatsApp → Configuration → callback URL + verify token (section 2) → *Verify and save* →
   subscribe to `messages`.
8. Set the five settings in the API's environment, restart, and check Admin portal → System → WhatsApp shows
   *configured* and *webhook configured*. Then test with a staff phone: opt in from the patient web, make a test
   booking, and watch the message log.
9. **Quality rating and limits**: keep an eye on WhatsApp Manager → Insights. Many blocks or reports lower the
   quality rating and can pause templates. The messaging limit grows automatically (1K → 10K → 100K unique users
   per 24 h) with good quality.

### Twilio as an alternative

Twilio is an official WhatsApp Business Solution Provider. It is useful if you already use Twilio for SMS/voice
or want one bill and support contract. You still need Meta business verification, and templates are submitted
through Twilio's *Content Template Builder*. Twilio adds about USD 0.005 per message on top of Meta's fee. It
is not wired in this release: adding it means a second `send_template` implementation (Twilio Messages API with
`ContentSid` + `ContentVariables`) and a status-callback route signed with `X-Twilio-Signature`. The registry,
opt-in, log and job stay the same.

## 4. Costs

Meta charges **per delivered template message** (pricing model since 1 July 2025; before that it was per
24-hour conversation). The price depends on the **recipient's country** and the template **category**:

- **Utility** (all our journey templates): from about USD 0.004 to 0.03 per message depending on the country.
  Utility templates sent while a customer-service window is open (the user wrote to us in the last 24 h) are
  free.
- **Authentication** (`hig_verification_code`): similar to utility in most markets; some countries have a
  higher "authentication-international" rate when the business is registered in another country.
- **Marketing**: the most expensive tier. We send **no** marketing templates.
- Replies to users within 24 h of their message (service messages) are free. We do not send free-form
  messages today.

Check the current **rate card** (Meta for Developers → WhatsApp → Pricing; CSV per currency) before
budgeting. Budget roughly 6 to 12 messages per patient journey with the default kinds, so typically under
USD 0.30 per patient. The per-user daily limit caps runaway costs.

## 5. Privacy and compliance

- **Consent**: explicit, separate opt-in (`whatsapp_updates`), recorded with version, time, IP and user agent;
  withdrawal is as easy as opting in (STOP or one switch). The number is verified, so messages never go to a
  mistyped number. Only users with `active` status receive anything. The generic consent endpoint refuses
  `whatsapp_updates` so it cannot be set without verification.
- **Data minimisation**: templates are generic and **non-clinical**. They never contain diagnoses, procedures,
  symptoms, document contents or other health details. Parameters are limited to the first name, case/booking
  numbers, dates/times, amounts and a video link. The rendered text is not stored. The phone number is
  encrypted at rest (AES-256-GCM); a keyed hash is used to match STOP replies; the log shows a masked number.
- **Processor**: Meta (WhatsApp Cloud API) processes message content and metadata as a data processor and stores
  messages for up to 30 days to deliver them. Name Meta as a sub-processor in the privacy policy and the
  DPDP/GDPR records of processing, with a cross-border transfer to the US/EU. Note that Cloud API messages are
  not end-to-end encrypted between the business and Meta: another reason to keep templates non-clinical.
- **Retention**: `whatsapp_messages` rows have no message content. Purge or anonymise them with the
  notifications retention (`NOTIFICATION_RETENTION_DAYS`) when the privacy purge jobs are extended. The opt-in
  row is deleted with the account (`ON DELETE CASCADE`).
- **Children**: patients under 18 are handled through their guardian's account; do not opt in a minor's own
  number.

## 6. Template texts to submit (all 5 languages)

Source of truth: `backend/app/modules/messaging/whatsapp_templates/templates.json`. The test
`tests/modules/test_whatsapp.py::test_template_registry_is_complete` checks that every template has all 5
languages, examples and matching `{{n}}` placeholders, and that no utility template starts or ends with a
variable (Meta rejects those). Authentication templates in WhatsApp Manager use Meta's preset text ("*{{1}} is
your verification code.*" + "*For your security, do not share this code.*"). Pick those options and the
**Copy code** button; the bodies below are the expected preset texts per language. Medical or legal wording in
the translations should go through the native-speaker review in `docs/i18n/TRANSLATION_REVIEW.md` before
submission.

### `hig_verification_code` (AUTHENTICATION)

Sent for: `whatsapp.verification`

Parameters: `{{1}}` = code (example: 482913)

Button: **Copy code** (one-time password button, type COPY_CODE).

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | {{1}} is your verification code. For your security, do not share this code. |
| Arabic (`ar`) | {{1}} هو رمز التحقق الخاص بكم. حفاظًا على أمانكم، لا تشاركوا هذا الرمز. |
| French (`fr`) | {{1}} est votre code de vérification. Pour votre sécurité, ne communiquez pas ce code. |
| Bengali (`bn`) | {{1}} আপনার যাচাইকরণ কোড। আপনার নিরাপত্তার জন্য এই কোডটি কারও সঙ্গে শেয়ার করবেন না। |
| Russian (`ru`) | {{1}} — ваш код подтверждения. В целях безопасности никому не сообщайте этот код. |

### `hig_quote_ready` (UTILITY)

Sent for: `quote.sent` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara), `{{2}}` = case_number (example: HIG-C-2026-000123)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, a new treatment quote is ready for your case {{2}}. Please open the Heal India Global app to review it. |
| Arabic (`ar`) | مرحبًا {{1}}، عرض سعر جديد للعلاج جاهز لحالتكم {{2}}. يُرجى فتح تطبيق Heal India Global لمراجعته. |
| French (`fr`) | Bonjour {{1}}, un nouveau devis de traitement est prêt pour votre dossier {{2}}. Ouvrez l'application Heal India Global pour le consulter. |
| Bengali (`bn`) | হ্যালো {{1}}, আপনার কেস {{2}}-এর জন্য চিকিৎসার একটি নতুন কোটেশন প্রস্তুত। এটি দেখতে Heal India Global অ্যাপটি খুলুন। |
| Russian (`ru`) | Здравствуйте, {{1}}! По вашему обращению {{2}} готово новое предложение по стоимости лечения. Откройте приложение Heal India Global, чтобы ознакомиться с ним. |

### `hig_quote_followup` (UTILITY)

Sent for: `quote.overdue` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara), `{{2}}` = case_number (example: HIG-C-2026-000123)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, the quote for your case {{2}} is taking longer than expected. Our team is following up with the hospital and will update you soon. |
| Arabic (`ar`) | مرحبًا {{1}}، يستغرق عرض السعر لحالتكم {{2}} وقتًا أطول من المتوقع. يتابع فريقنا الأمر مع المستشفى وسنوافيكم بالمستجدات قريبًا. |
| French (`fr`) | Bonjour {{1}}, le devis de votre dossier {{2}} prend plus de temps que prévu. Notre équipe relance l'hôpital et vous tiendra informé très bientôt. |
| Bengali (`bn`) | হ্যালো {{1}}, আপনার কেস {{2}}-এর কোটেশন আসতে প্রত্যাশার চেয়ে বেশি সময় লাগছে। আমাদের টিম হাসপাতালের সঙ্গে যোগাযোগ করছে এবং শীঘ্রই আপনাকে জানাবে। |
| Russian (`ru`) | Здравствуйте, {{1}}! Подготовка предложения по обращению {{2}} занимает больше времени, чем ожидалось. Наша команда связалась с клиникой и скоро сообщит вам новости. |

### `hig_quote_due_hospital` (UTILITY)

Sent for: `quote.reminder_due`, `quote.overdue` (roles: hospital)

Parameters: `{{1}}` = case_number (example: HIG-C-2026-000123)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Reminder: a patient is waiting for your quote for case {{1}}. Please send it from the Heal India Global hospital portal. |
| Arabic (`ar`) | تذكير: مريض بانتظار عرض السعر الخاص بكم للحالة {{1}}. يُرجى إرساله من بوابة المستشفيات في Heal India Global. |
| French (`fr`) | Rappel : un patient attend votre devis pour le dossier {{1}}. Merci de l'envoyer depuis le portail hôpital Heal India Global. |
| Bengali (`bn`) | রিমাইন্ডার: একজন রোগী কেস {{1}}-এর জন্য আপনার কোটেশনের অপেক্ষায় আছেন। অনুগ্রহ করে Heal India Global হাসপাতাল পোর্টাল থেকে এটি পাঠান। |
| Russian (`ru`) | Напоминание: пациент ждёт вашего предложения по обращению {{1}}. Пожалуйста, отправьте его через портал клиники Heal India Global. |

### `hig_booking_confirmed` (UTILITY)

Sent for: `booking.confirmed` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara), `{{2}}` = booking_number (example: HIG-B-2026-000045)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, your booking {{2}} is confirmed. Open the Heal India Global app to see the next steps for your trip. |
| Arabic (`ar`) | مرحبًا {{1}}، تم تأكيد حجزكم {{2}}. افتحوا تطبيق Heal India Global للاطلاع على الخطوات التالية لرحلتكم. |
| French (`fr`) | Bonjour {{1}}, votre réservation {{2}} est confirmée. Ouvrez l'application Heal India Global pour voir les prochaines étapes de votre voyage. |
| Bengali (`bn`) | হ্যালো {{1}}, আপনার বুকিং {{2}} নিশ্চিত হয়েছে। আপনার যাত্রার পরবর্তী ধাপগুলো দেখতে Heal India Global অ্যাপটি খুলুন। |
| Russian (`ru`) | Здравствуйте, {{1}}! Ваше бронирование {{2}} подтверждено. Откройте приложение Heal India Global, чтобы узнать следующие шаги вашей поездки. |

### `hig_consultation_reminder` (UTILITY)

Sent for: `consultation.reminder` (roles: patient, agent, hospital)

Parameters: `{{1}}` = first_name (example: Amara), `{{2}}` = when (example: 12 Dec 2026, 10:30 IST), `{{3}}` = join_link (example: https://meet.jit.si/hig-3f9c2a7d)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, reminder: your video consultation is on {{2}}. Join the call with this link: {{3}} (please join a few minutes early). |
| Arabic (`ar`) | مرحبًا {{1}}، تذكير: موعد استشارتكم بالفيديو {{2}}. انضموا إلى المكالمة عبر هذا الرابط: {{3}} (يُرجى الانضمام قبل الموعد ببضع دقائق). |
| French (`fr`) | Bonjour {{1}}, rappel : votre téléconsultation vidéo a lieu le {{2}}. Rejoignez l'appel avec ce lien : {{3}} (connectez-vous quelques minutes en avance). |
| Bengali (`bn`) | হ্যালো {{1}}, রিমাইন্ডার: আপনার ভিডিও কনসালটেশন {{2}}-এ। এই লিঙ্ক দিয়ে কলে যোগ দিন: {{3}} (অনুগ্রহ করে কয়েক মিনিট আগে যোগ দিন)। |
| Russian (`ru`) | Здравствуйте, {{1}}! Напоминаем: ваша видеоконсультация состоится {{2}}. Подключитесь к звонку по ссылке: {{3}} (пожалуйста, подключитесь за несколько минут). |

### `hig_visa_letter_ready` (UTILITY)

Sent for: `visa.invitation_issued` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, the hospital invitation letter for your visa application is ready. You can download it from your documents in the Heal India Global app. |
| Arabic (`ar`) | مرحبًا {{1}}، رسالة الدعوة من المستشفى لطلب التأشيرة جاهزة. يمكنكم تنزيلها من مستنداتكم في تطبيق Heal India Global. |
| French (`fr`) | Bonjour {{1}}, la lettre d'invitation de l'hôpital pour votre demande de visa est prête. Vous pouvez la télécharger depuis vos documents dans l'application Heal India Global. |
| Bengali (`bn`) | হ্যালো {{1}}, আপনার ভিসার আবেদনের জন্য হাসপাতালের আমন্ত্রণপত্র প্রস্তুত। Heal India Global অ্যাপে আপনার নথি থেকে এটি ডাউনলোড করতে পারবেন। |
| Russian (`ru`) | Здравствуйте, {{1}}! Приглашение от клиники для оформления визы готово. Вы можете скачать его в разделе документов в приложении Heal India Global. |

### `hig_payment_received` (UTILITY)

Sent for: `payment.captured` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara), `{{2}}` = amount (example: USD 1,200.00)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, we have received your payment of {{2}}. Thank you! Your receipt is available in the Heal India Global app. |
| Arabic (`ar`) | مرحبًا {{1}}، استلمنا دفعتكم بمبلغ {{2}}. شكرًا لكم! الإيصال متاح في تطبيق Heal India Global. |
| French (`fr`) | Bonjour {{1}}, nous avons bien reçu votre paiement de {{2}}. Merci ! Votre reçu est disponible dans l'application Heal India Global. |
| Bengali (`bn`) | হ্যালো {{1}}, আমরা আপনার {{2}} পেমেন্ট পেয়েছি। ধন্যবাদ! আপনার রসিদ Heal India Global অ্যাপে পাওয়া যাবে। |
| Russian (`ru`) | Здравствуйте, {{1}}! Мы получили ваш платёж на сумму {{2}}. Спасибо! Квитанция доступна в приложении Heal India Global. |

### `hig_installment_due` (UTILITY)

Sent for: `installment.due` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara), `{{2}}` = amount (example: USD 400.00), `{{3}}` = booking_number (example: HIG-B-2026-000045), `{{4}}` = date (example: 2026-12-15)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, a payment of {{2}} for booking {{3}} is due on {{4}}. You can pay securely in the Heal India Global app. |
| Arabic (`ar`) | مرحبًا {{1}}، يستحق سداد دفعة بمبلغ {{2}} للحجز {{3}} في {{4}}. يمكنكم الدفع بأمان في تطبيق Heal India Global. |
| French (`fr`) | Bonjour {{1}}, un paiement de {{2}} pour la réservation {{3}} est dû le {{4}}. Vous pouvez payer en toute sécurité dans l'application Heal India Global. |
| Bengali (`bn`) | হ্যালো {{1}}, বুকিং {{3}}-এর জন্য {{2}} পেমেন্ট {{4}} তারিখে দিতে হবে। Heal India Global অ্যাপে নিরাপদে পেমেন্ট করতে পারবেন। |
| Russian (`ru`) | Здравствуйте, {{1}}! Платёж на сумму {{2}} по бронированию {{3}} нужно внести до {{4}}. Оплатить можно безопасно в приложении Heal India Global. |

### `hig_aftercare_checkin` (UTILITY)

Sent for: `aftercare.checkin_due` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, it is time for your recovery check-in. Please answer a few short questions in the Heal India Global app so your care team can follow your progress. |
| Arabic (`ar`) | مرحبًا {{1}}، حان وقت متابعة تعافيكم. يُرجى الإجابة عن بضعة أسئلة قصيرة في تطبيق Heal India Global ليتمكن فريق الرعاية من متابعة تقدّمكم. |
| French (`fr`) | Bonjour {{1}}, c'est le moment de votre suivi de convalescence. Répondez à quelques questions rapides dans l'application Heal India Global pour que votre équipe soignante suive vos progrès. |
| Bengali (`bn`) | হ্যালো {{1}}, আপনার সেরে ওঠার চেক-ইনের সময় হয়েছে। আপনার চিকিৎসা দল যাতে আপনার অগ্রগতি জানতে পারে, সেজন্য Heal India Global অ্যাপে কয়েকটি ছোট প্রশ্নের উত্তর দিন। |
| Russian (`ru`) | Здравствуйте, {{1}}! Пора пройти контроль восстановления. Ответьте на несколько коротких вопросов в приложении Heal India Global, чтобы ваша медицинская команда могла следить за вашим состоянием. |

### `hig_sos_acknowledged` (UTILITY)

Sent for: `sos.updated` (roles: patient, agent) when status=acknowledged

Parameters: `{{1}}` = first_name (example: Amara)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, our support team has received your SOS and is following up now. Please keep your phone with you. |
| Arabic (`ar`) | مرحبًا {{1}}، استلم فريق الدعم لدينا نداء SOS الخاص بكم ويتابعه الآن. يُرجى إبقاء هاتفكم بالقرب منكم. |
| French (`fr`) | Bonjour {{1}}, notre équipe d'assistance a bien reçu votre SOS et s'en occupe dès maintenant. Gardez votre téléphone près de vous. |
| Bengali (`bn`) | হ্যালো {{1}}, আমাদের সাপোর্ট টিম আপনার SOS পেয়েছে এবং এখনই ব্যবস্থা নিচ্ছে। আপনার ফোন সবসময় সাথে রাখুন। |
| Russian (`ru`) | Здравствуйте, {{1}}! Наша служба поддержки получила ваш сигнал SOS и уже занимается им. Пожалуйста, держите телефон при себе. |

### `hig_document_ready` (UTILITY)

Sent for: `discharge_summary.finalized` (roles: patient, agent)

Parameters: `{{1}}` = first_name (example: Amara)

| Language (Meta code) | Body |
| --- | --- |
| English (`en`) | Hello {{1}}, your hospital has shared a new document with you. Open the Heal India Global app to view and download it. |
| Arabic (`ar`) | مرحبًا {{1}}، شارك المستشفى معكم مستندًا جديدًا. افتحوا تطبيق Heal India Global لعرضه وتنزيله. |
| French (`fr`) | Bonjour {{1}}, votre hôpital a partagé un nouveau document avec vous. Ouvrez l'application Heal India Global pour le consulter et le télécharger. |
| Bengali (`bn`) | হ্যালো {{1}}, আপনার হাসপাতাল আপনার সঙ্গে একটি নতুন নথি শেয়ার করেছে। এটি দেখতে ও ডাউনলোড করতে Heal India Global অ্যাপটি খুলুন। |
| Russian (`ru`) | Здравствуйте, {{1}}! Клиника отправила вам новый документ. Откройте приложение Heal India Global, чтобы просмотреть и скачать его. |

