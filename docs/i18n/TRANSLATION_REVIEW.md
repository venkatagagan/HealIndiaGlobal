# Translation review

Machine-assisted translations that a fluent, preferably medically literate, reviewer should check before a
language is switched on in production. Admins can fix any string without a deploy: Admin portal ->
Translations (overrides win over the shipped text; app `server` covers everything below).

## Server (emails, notifications, API errors)

Source: `backend/app/i18n/en.json` (159 keys). Translations: `ar.json`, `fr.json`, `bn.json`, `ru.json`
(same keys and `{placeholders}`; enforced by `tests/modules/test_i18n.py`). "Heal India Global" and SOS / KYC /
UTR / AI / 24/7 are kept as-is.

What the keys cover:

- `email.*` - verify email, password reset, password changed, invitations, hospital member added, shared
  layout (greeting, footer, button fallback). Emails go out in the recipient's `preferred_language` when that
  language is enabled, otherwise English. Arabic emails render with `<html lang="ar" dir="rtl">`.
- `notifications.*` - every in-app notification (and its email) sent by `messaging/handlers.py`.
- `errors.<code>` - translated `message` for common API errors when the request language is not English;
  `code` never changes and the English text stays available as `message_en`.
- `common.*` - fragments joined into notification bodies ("Reason: ...", "Note: ...").

Review priorities:

1. `notifications.screening.emergency_title` / `emergency_body` (must be unambiguous: contact local emergency
   services / nearest hospital now).
2. Money, refund and payout texts (`payment_*`, `refund_processed.*`, `payout_*`, `booking_cancelled.refund`).
3. `errors.*` (short, neutral).

### Arabic (ar)

- Register: polite plural (أنتم / ـكم) throughout, which is formal and avoids choosing a gender.
- `email.common.greeting`: "مرحبًا {name}،" - neutral; عزيزي/عزيزتي avoided because they need a gender.
- `email.invite.body*`, `email.hospital_member_added.body`, `case_created.body`, `quote_sent.body`,
  `quote_accepted.body`, `sos_created.body`: rephrased ("تلقّيتم دعوة من {inviter}", "من قِبل {x}") so the verb does
  not have to agree with the gender of the inserted name.
- `hospital_approved.title`: "أصبحت صفحة {hospital} متاحة الآن" ("the {hospital} page is now available").
- `sos_updated.acknowledged_body_named`: "قيد المتابعة لدى {name}" avoids a gendered verb.
- `verify.expiry` / `invite.expiry` / `reset.expiry`: singular noun after the number ("{hours} ساعة") - correct
  for 24 / 72 / 60, not strictly for 3-10.
- Screening is "تقييم أولي" (preliminary assessment) rather than "فحص" (suggests a physical exam).
- `booking_completed.hospital_body`: "hold period" -> "فترة الانتظار المحددة".
- `user_registered.body_patient`: "بالذكاء الاصطناعي (AI)".

### French (fr)

- `common.the_patient` = "le patient"; sentences built to avoid "de le patient" ("pour {patient}",
  "envoyée par {patient}").
- `quote_sent.title`, `message_created.title`: "envoyé par {x}" instead of "de {x}" (elision before vowels).
- `user_registered.body_patient`: "par intelligence artificielle (AI)" - French normally writes "IA"; decide.
- `hospital_member_added.body`: inclusive "ajouté(e)"; invite heading rephrased ("Vous avez une invitation").
- `quote_sent.valid_until`: "Date limite de validité : {date}" (works with ISO dates).
- Vocabulary: screening = "pré-évaluation", case = "dossier", quote = "devis", payout = "versement",
  hold period = "période de retenue" (finance to confirm).
- Typography: normal space before ":" and "?" (a non-breaking space would be stricter); "24/7" kept.

### Bengali (bn)

- `email.common.greeting`: "প্রিয় {name}," (religion-neutral); `greeting_anonymous`: "প্রিয় ব্যবহারকারী,".
- Case endings are hyphenated onto placeholders ("{hospital}-এ", "{patient}-এর"); with the fallback words this
  gives e.g. "হাসপাতাল-এ" - readable, not the usual spelling.
- Loanwords kept: কোটেশন (quote), পেআউট (payout), বুকিং, কেস, স্ক্রিনিং, সাপোর্ট টিম, হোল্ড পিরিয়ড.
- `refund_processed.timing` uses Bengali digits (৫–১০); inserted values (amounts, dates) stay in Western digits.
- Honorific verb for a person inviting ("জানিয়েছেন"); `invite.subject_agent` uses "জানিয়েছে" (an organisation).

### Russian (ru)

- Capitalised "Вы/Ваш" (formal letter style); many modern UIs use lowercase "вы" - decide.
- `common.the_hospital` = "клиника"; the emergency text says "ближайшую больницу" (natural in an emergency).
- Name placeholders always in the nominative via "Label: {x}" forms ("Клиника: {hospital}", "Пациент: {patient}",
  "Сигнал SOS: {patient}", "Новое сообщение: {sender}").
- `hospital_member_added.body`: "Пригласил(а): {inviter}"; invitations use present tense "приглашает" to avoid
  the gendered past tense.
- Expiry texts use "{hours} ч." / "{minutes} мин." to avoid number agreement.
- Quote = "предложение" / "расчёт стоимости лечения", case = "обращение", hold period = "период удержания".
- `user_registered.body_patient`: "AI-скрининг" - Russian normally says "ИИ"; decide.

### Not translated on the server (by design)

- Free text written by people (messages, rejection reasons, notes) and data values (names, amounts, dates)
  are inserted unchanged.
- Voice/document-AI user messages stored on records (e.g. "No speech was recognised ...") and other
  `AppError` messages without an `errors.<code>` key stay English (the client can translate by `code`).
- Notification handlers added after this change in `messaging/handlers.py` still pass English `title`/`body`
  strings until they are converted to `title_key`/`body_key`.
