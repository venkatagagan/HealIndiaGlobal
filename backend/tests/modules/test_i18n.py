"""Multi-language support: languages/overrides API, admin Translations API, request locale, server strings
(``t``), translated notifications/emails/errors, voice language hints and bilingual AI summaries."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select

import app.i18n as i18n
from app.core.config import settings
from app.core.email import render_template
from app.i18n import Msg, parse_accept_language, resolve_locale, t
from app.i18n import runtime as i18n_runtime
from app.models import AuditLog, Notification
from app.models.i18n import Language, TranslationOverride
from app.modules.i18n.service import clean_text
from app.modules.messaging.notifications import notify, notify_many
from app.modules.screening.ai.schema import TriageResult
from app.modules.screening.service import _localize_result
from app.modules.voice import stt
from tests.factories import create_patient, create_specialty, create_user
from tests.modules.test_docai import add_document, ai_payload, fake_response, page_image
from tests.modules.test_voice import FakeSTT, stt_result, upload

API = "/api/v1"


# ------------------------------------------------------------------------------------------- helpers
async def enable(db: Any, *codes: str) -> None:
    """Switch languages on directly in the DB and reload the in-process snapshot."""
    for code in codes:
        default = next(lang for lang in i18n.DEFAULT_LANGUAGES if lang.code == code)
        row = await db.get(Language, code)
        if row is None:
            db.add(
                Language(
                    code=code,
                    name=default.name,
                    native_name=default.native_name,
                    rtl=default.rtl,
                    enabled=True,
                    sort=default.sort,
                )
            )
        else:
            row.enabled = True
    await db.commit()
    i18n_runtime.invalidate()
    await i18n_runtime.refresh()


@pytest.fixture
def catalogs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A temporary ``catalogs/`` directory with a small patient_web export."""
    data = {
        "app": "patient_web",
        "locales": {
            "en": {
                "common:actions.save": "Save",
                "patient:bookings.title": "My bookings",
                "patient:nav.home": "Home",
            },
            "ar": {"patient:nav.home": "الرئيسية"},
        },
    }
    (tmp_path / "patient_web.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(i18n, "CATALOGS_DIR", tmp_path)
    return tmp_path


@pytest.fixture
async def admin(make_user: Any) -> Any:
    return await make_user(role="admin")


# ------------------------------------------------------------------------------------------- locale + t()
def test_accept_language_and_resolution_order() -> None:
    assert parse_accept_language("fr-CA,fr;q=0.9,ar;q=0.8,*;q=0.1") == ["fr", "ar"]
    assert parse_accept_language("ar;q=0.2, ru;q=0.9, en;q=0") == ["ru", "ar"]
    assert parse_accept_language("") == []
    enabled = {"en", "ar", "fr"}
    kw: dict[str, Any] = {"enabled": enabled}
    assert resolve_locale(query="ar", user_language="fr", accept_language="fr", **kw) == "ar"
    assert resolve_locale(query="ru", user_language="fr", accept_language="ar", **kw) == "fr"
    assert resolve_locale(user_language="bn", accept_language="fr-CA,ar;q=0.5", **kw) == "fr"
    assert resolve_locale(accept_language="ru, bn", **kw) == "en"
    assert resolve_locale(**kw) == "en"


def test_t_fallback_params_and_msg() -> None:
    assert t("notifications.payment_failed.title", "en") == "Payment failed"
    assert t("notifications.payment_failed.title", "ar") != "Payment failed"
    assert t("notifications.payment_failed.title", "fr-CA") == t("notifications.payment_failed.title", "fr")
    assert t("no.such.key", "ar") == "no.such.key"
    assert t("email.common.greeting", "en", name="Amara") == "Hello Amara,"
    assert "{name}" in t("email.common.greeting", "en")  # missing params never raise
    assert t("common.reason", "en", reason=Msg("common.the_patient")) == "Reason: the patient."
    for lng in ("ar", "fr", "bn", "ru"):
        assert "Heal India Global" in t("notifications.user_registered.title", lng)


def test_server_catalogs_have_the_same_keys_and_placeholders() -> None:
    import re

    english = i18n.server_catalog("en")
    assert len(english) > 100
    for lng in ("ar", "fr", "bn", "ru"):
        catalog = i18n.server_catalog(lng)
        assert set(catalog) == set(english), lng
        for key, text in english.items():
            assert set(re.findall(r"{(\w+)}", catalog[key])) == set(re.findall(r"{(\w+)}", text)), (lng, key)


async def test_t_uses_server_overrides(client: Any, db: Any, auth_headers: Any, admin: Any) -> None:
    r = await client.put(
        f"{API}/admin/i18n/overrides",
        json={"app": "server", "locale": "fr", "key": "notifications.payment_failed.title", "text": "Échec"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    assert t("notifications.payment_failed.title", "fr") == "Échec"
    assert t("notifications.payment_failed.title", "en") == "Payment failed"


async def test_content_language_and_user_preference(
    client: Any, db: Any, auth_headers: Any, make_user: Any
) -> None:
    r = await client.get(f"{API}/i18n/languages", headers={"Accept-Language": "ar"})
    assert r.headers["content-language"] == "en"  # Arabic is not enabled yet
    await enable(db, "ar", "fr")
    r = await client.get(f"{API}/i18n/languages", headers={"Accept-Language": "ar"})
    assert r.headers["content-language"] == "ar"
    r = await client.get(f"{API}/i18n/languages?lang=fr", headers={"Accept-Language": "ar"})
    assert r.headers["content-language"] == "fr"

    user = await make_user(role="patient", preferred_language="fr")
    r = await client.get(f"{API}/auth/me", headers={**auth_headers(user), "Accept-Language": "ar"})
    assert r.status_code == 200
    assert r.headers["content-language"] == "fr"  # the signed-in user's language beats Accept-Language


async def test_error_message_translated_code_unchanged(client: Any, db: Any) -> None:
    r = await client.get(f"{API}/auth/me", headers={"Accept-Language": "ar"})
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Authentication required"  # Arabic not enabled

    await enable(db, "ar")
    r = await client.get(f"{API}/auth/me", headers={"Accept-Language": "ar"})
    err = r.json()["error"]
    assert r.status_code == 401 and err["code"] == "unauthorized"
    assert err["message"] == t("errors.unauthorized", "ar") and err["message"] != "Authentication required"
    assert err["message_en"] == "Authentication required"

    r = await client.post(f"{API}/admin/i18n/overrides", json={}, headers={"Accept-Language": "ar"})
    assert r.status_code in (401, 405)
    r = await client.get(f"{API}/i18n/overrides?locale=ar&app=nope", headers={"Accept-Language": "ar"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["message"] == t("errors.validation_error", "ar")


# ------------------------------------------------------------------------------------------- public API
async def test_public_languages_only_enabled_and_toggle_invalidates(
    client: Any, db: Any, auth_headers: Any, admin: Any
) -> None:
    r = await client.get(f"{API}/i18n/languages")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=60"
    assert r.json() == [
        {"code": "en", "name": "English", "native_name": "English", "rtl": False, "enabled": True}
    ]

    r = await client.patch(
        f"{API}/admin/i18n/languages/ar", json={"enabled": True}, headers=auth_headers(admin)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["code"] == "ar" and body["enabled"] is True and body["rtl"] is True
    assert set(body["completeness"]) == set(i18n.APPS) and body["completeness"]["server"] == 100.0

    r = await client.get(f"{API}/i18n/languages")
    assert [lang["code"] for lang in r.json()] == ["en", "ar"]
    assert r.json()[1] == {
        "code": "ar",
        "name": "Arabic",
        "native_name": "العربية",
        "rtl": True,
        "enabled": True,
    }

    await client.patch(f"{API}/admin/i18n/languages/ar", json={"enabled": False}, headers=auth_headers(admin))
    r = await client.get(f"{API}/i18n/languages")
    assert [lang["code"] for lang in r.json()] == ["en"]

    actions = (await db.execute(select(AuditLog.action).where(AuditLog.entity_type == "language"))).scalars()
    assert sorted(actions) == ["i18n.language_disabled", "i18n.language_enabled"]


async def test_english_cannot_be_disabled_and_permissions(
    client: Any, auth_headers: Any, admin: Any, make_user: Any
) -> None:
    r = await client.patch(
        f"{API}/admin/i18n/languages/en", json={"enabled": False}, headers=auth_headers(admin)
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "default_language_required"
    r = await client.patch(
        f"{API}/admin/i18n/languages/xx", json={"enabled": True}, headers=auth_headers(admin)
    )
    assert r.status_code == 404 and r.json()["error"]["code"] == "unknown_locale"

    assert (await client.get(f"{API}/admin/i18n/languages")).status_code == 401
    for role in ("patient", "support", "finance"):
        user = await make_user(role=role)
        r = await client.get(f"{API}/admin/i18n/languages", headers=auth_headers(user))
        assert r.status_code == 403, role
    super_admin = await make_user(role="super_admin")
    r = await client.get(f"{API}/admin/i18n/languages", headers=auth_headers(super_admin))
    assert r.status_code == 200
    rows = {lang["code"]: lang for lang in r.json()}
    assert list(rows) == ["en", "ar", "fr", "bn", "ru"]
    assert rows["en"]["completeness_overall"] == 100.0 and rows["en"]["enabled"] is True
    assert rows["ru"]["enabled"] is False


async def test_public_overrides_shape_etag_and_since(
    client: Any, db: Any, auth_headers: Any, admin: Any, catalogs: Path
) -> None:
    r = await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web")
    assert r.status_code == 200
    assert r.json() == {"locale": "ar", "app": "patient_web", "version": 0, "strings": {}}
    assert r.headers["etag"] == 'W/"patient_web-ar-0"'
    assert r.headers["cache-control"] == "public, max-age=60"

    r = await client.put(
        f"{API}/admin/i18n/overrides",
        json={"app": "patient_web", "locale": "ar", "key": "patient:bookings.title", "text": "حجوزاتي"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    r = await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web")
    body = r.json()
    assert body["strings"] == {"patient:bookings.title": "حجوزاتي"} and body["version"] > 0
    etag = r.headers["etag"]
    assert etag == f'W/"patient_web-ar-{body["version"]}"'

    r = await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web", headers={"If-None-Match": etag})
    assert r.status_code == 304 and r.headers["etag"] == etag
    v = body["version"]
    assert (await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web&since={v}")).status_code == 304
    assert (
        await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web&since={v - 1}")
    ).status_code == 200
    # other apps/locales are separate
    other = (await client.get(f"{API}/i18n/overrides?locale=fr&app=patient_web")).json()
    assert other["strings"] == {} and other["version"] == 0

    r = await client.get(f"{API}/i18n/overrides?locale=xx&app=patient_web")
    assert r.status_code == 404 and r.json()["error"]["code"] == "unknown_locale"
    r = await client.get(f"{API}/i18n/overrides?locale=ar&app=nope")
    assert r.status_code == 422

    # delete -> gone from the public strings, version moves forward
    r = await client.delete(
        f"{API}/admin/i18n/overrides?app=patient_web&locale=ar&key=patient:bookings.title",
        headers=auth_headers(admin),
    )
    assert r.status_code == 204
    after = (await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web")).json()
    assert after["strings"] == {} and after["version"] >= v
    assert (await client.get(f"{API}/i18n/overrides?locale=ar&app=patient_web&since={v}")).status_code in (
        200,
        304,
    )


# ------------------------------------------------------------------------------------------- admin strings
async def test_strings_listing_filters_search_counts(
    client: Any, db: Any, auth_headers: Any, admin: Any, catalogs: Path
) -> None:
    headers = auth_headers(admin)
    await client.put(
        f"{API}/admin/i18n/overrides",
        json={"app": "patient_web", "locale": "ar", "key": "common:actions.save", "text": "حفظ"},
        headers=headers,
    )
    r = await client.get(f"{API}/admin/i18n/strings?app=patient_web&locale=ar", headers=headers)
    assert r.status_code == 200, r.text
    page = r.json()
    assert page["counts"] == {"total": 3, "missing": 1, "overridden": 1}
    assert page["total"] == 3 and page["pages"] == 1 and page["page_size"] == 50
    items = {i["key"]: i for i in page["items"]}
    assert [i["key"] for i in page["items"]] == sorted(items)
    save = items["common:actions.save"]
    assert save["source"] == "Save" and save["shipped"] is None and save["override"] == "حفظ"
    assert save["effective"] == "حفظ" and save["updated_by"] and save["updated_at"]
    home = items["patient:nav.home"]
    assert home["shipped"] == "الرئيسية" and home["override"] is None and home["effective"] == "الرئيسية"
    missing = items["patient:bookings.title"]
    assert missing["shipped"] is None and missing["effective"] == "My bookings"

    async def keys(**params: Any) -> list[str]:
        r = await client.get(
            f"{API}/admin/i18n/strings",
            params={"app": "patient_web", "locale": "ar", **params},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        return [i["key"] for i in r.json()["items"]]

    assert await keys(status="missing") == ["patient:bookings.title"]
    assert await keys(status="overridden") == ["common:actions.save"]
    assert await keys(status="translated") == ["common:actions.save", "patient:nav.home"]
    assert await keys(q="BOOKINGS") == ["patient:bookings.title"]  # key / English text
    assert await keys(q="حفظ") == ["common:actions.save"]  # override text
    assert await keys(q="الرئيسية") == ["patient:nav.home"]  # shipped text
    assert await keys(page_size=2, page=2) == ["patient:nav.home"]

    r = await client.get(f"{API}/admin/i18n/strings?app=patient_web&locale=xx", headers=headers)
    assert r.status_code == 404
    r = await client.get(f"{API}/admin/i18n/strings?app=website&locale=ar", headers=headers)
    assert r.json()["total"] == 0  # no export yet -> empty catalog

    r = await client.get(f"{API}/admin/i18n/languages", headers=headers)
    ar = next(lang for lang in r.json() if lang["code"] == "ar")
    assert ar["completeness"]["patient_web"] == 66.7  # shipped home + overridden save, of 3 keys


async def test_override_upsert_sanitises_validates_and_audits(
    client: Any, db: Any, auth_headers: Any, admin: Any, catalogs: Path
) -> None:
    headers = auth_headers(admin)
    url = f"{API}/admin/i18n/overrides"
    base = {"app": "patient_web", "locale": "fr", "key": "patient:nav.home"}

    r = await client.put(
        url, json={**base, "text": "  <b>Accueil</b><script>alert(1)</script>\x07 "}, headers=headers
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["text"] == "Accueilalert(1)" and out["key"] == "patient:nav.home" and out["locale"] == "fr"
    assert out["updated_by"] and out["updated_at"]

    r = await client.put(url, json={**base, "text": "Page d'accueil"}, headers=headers)  # upsert
    assert r.json()["text"] == "Page d'accueil"
    rows = (await db.execute(select(TranslationOverride))).scalars().all()
    assert len(rows) == 1 and rows[0].text == "Page d'accueil"

    r = await client.put(url, json={**base, "text": "<br><p></p>  "}, headers=headers)
    assert r.status_code == 422
    r = await client.put(url, json={**base, "text": "x" * 5001}, headers=headers)
    assert r.status_code == 422
    r = await client.put(url, json={**base, "text": "<i>" + "x" * 5000 + "</i>"}, headers=headers)
    assert r.status_code == 200  # 5000 once the tags are gone
    r = await client.put(url, json={**base, "key": "patient:nope", "text": "x"}, headers=headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "unknown_translation_key"
    r = await client.put(url, json={**base, "locale": "xx", "text": "x"}, headers=headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "unknown_locale"
    r = await client.put(url, json={**base, "app": "nope", "text": "x"}, headers=headers)
    assert r.status_code == 422

    r = await client.delete(url, params=base, headers=headers)
    assert r.status_code == 204
    r = await client.delete(url, params=base, headers=headers)  # idempotent
    assert r.status_code == 204

    actions = list(
        (
            await db.execute(
                select(AuditLog.action)
                .where(AuditLog.entity_type == "translation_override")
                .order_by(AuditLog.created_at)
            )
        ).scalars()
    )
    assert actions == ["i18n.override_set"] * 3 + ["i18n.override_delete"]


def test_clean_text() -> None:
    assert clean_text("<b>Hi</b> there") == "Hi there"
    assert clean_text("a <!-- c --> b") == "a  b"
    assert "<" not in clean_text("<<b>script>x")
    assert clean_text("line1\r\nline2\x00") == "line1\nline2"
    assert clean_text("Tom & Jerry &lt;3") == "Tom & Jerry &lt;3"
    assert clean_text("trailing <img src=x onerror=") == "trailing"


# ------------------------------------------------------------------------------------------- notifications
async def test_notifications_in_recipient_language(db: Any, make_user: Any) -> None:
    await enable(db, "ar")
    arabic = await make_user(role="patient", preferred_language="ar")
    english = await make_user(role="patient", preferred_language="en")
    french = await make_user(role="patient", preferred_language="fr")  # French is not enabled
    created = await notify_many(
        db,
        [arabic.id, english.id, french.id],
        "booking.confirmed",
        title_key="notifications.booking_confirmed.title",
        body_key=[
            "notifications.booking_confirmed.body",
            Msg("notifications.booking_confirmed.admission", {"date": "2026-12-01"}),
            None,
        ],
        params={"booking_number": "BK-1", "hospital": "Apollo"},
        email=False,
    )
    await db.commit()
    by_user = {n.user_id: n for n in created}
    assert by_user[english.id].title == "Booking BK-1 confirmed"
    assert by_user[english.id].body == "Your treatment at Apollo is confirmed. Admission: 2026-12-01."
    assert by_user[french.id].title == "Booking BK-1 confirmed"
    ar_note = by_user[arabic.id]
    assert ar_note.title == t("notifications.booking_confirmed.title", "ar", booking_number="BK-1")
    assert ar_note.title != by_user[english.id].title and "BK-1" in ar_note.title
    assert "Apollo" in (ar_note.body or "") and "2026-12-01" in (ar_note.body or "")

    # plain strings still work unchanged
    plain = await notify(db, english.id, "custom.kind", "Plain title", "Plain body", email=False)
    assert plain is not None and plain.title == "Plain title"


async def test_notification_email_in_arabic_with_rtl(
    db: Any, make_user: Any, run_jobs: Any, email_outbox: Any
) -> None:
    await enable(db, "ar")
    user = await make_user(role="patient", preferred_language="ar", full_name="Leila")
    await notify(
        db,
        user.id,
        "payment.failed",
        title_key="notifications.payment_failed.title",
        body_key="notifications.payment_failed.body",
        params={"amount": "₹1,000.00", "order_number": "ORD-7"},
        data={"link": "/payments"},
    )
    await db.commit()
    assert await run_jobs() >= 1
    (mail,) = [m for m in email_outbox if user.email in m["to"]]
    assert mail["subject"] == t("notifications.payment_failed.title", "ar")
    assert '<html lang="ar" dir="rtl">' in mail["html"]
    assert t("email.common.view_details", "ar") in mail["html"]
    assert "ORD-7" in mail["html"]
    note = (await db.execute(select(Notification).where(Notification.user_id == user.id))).scalar_one()
    assert note.title == mail["subject"]


def test_email_templates_render_in_every_language() -> None:
    for lng in i18n.SUPPORTED_LANGUAGES:
        html = render_template(
            "verify_email.html", locale=lng, name="Omar", url="https://x.test/v#t", expires_hours=24
        )
        assert f'lang="{lng}"' in html
        assert ('dir="rtl"' in html) == (lng == "ar")
        assert t("email.verify.heading", lng) in html.replace("&#39;", "'")
        assert "Heal India Global" in html
    html = render_template(
        "invite.html", locale="en", name="", url="https://x", organization_name="Org", role="patient"
    )
    assert "Hello," in html and "invited you to join Org" in html
    english = render_template("reset_password.html", name="there", url="https://x")
    assert 'lang="en" dir="ltr"' in english and "Reset your password" in english


async def test_registration_email_follows_preferred_language(db: Any, client: Any, email_outbox: Any) -> None:
    await enable(db, "fr")
    from app.modules.auth.service import send_verification_email

    user = await create_user(db, role="patient", preferred_language="fr")
    await send_verification_email(db, user)
    await db.commit()
    from app.core.jobs import run_pending_jobs

    await run_pending_jobs(max_jobs=10)
    mail = next(m for m in email_outbox if user.email in m["to"])
    assert mail["subject"] == t("email.verify.subject", "fr", app_name=settings.APP_NAME)
    assert 'lang="fr"' in mail["html"]


# ------------------------------------------------------------------------------------------- voice
async def test_voice_language_hint_passed_to_stt(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any
) -> None:
    await create_specialty(db, slug="orthopedics", name="Orthopedics")
    user = await create_user(db, role="patient")
    await create_patient(db, user)
    await enable(db, "ar")
    fake = FakeSTT(stt_result("عندي ألم شديد في الركبة منذ ثلاثة أشهر", language="ar"))
    stt.set_provider(fake)
    try:
        r = await upload(client, auth_headers(user), language="ar")
        assert r.status_code == 202, r.text
        assert r.json()["language_hint"] == "ar"
        assert await run_jobs() >= 1
        done = (
            await client.get(f"{API}/voice/transcriptions/{r.json()['id']}", headers=auth_headers(user))
        ).json()
    finally:
        stt.set_provider(None)
    assert [c["language"] for c in fake.calls] == ["ar"]
    assert done["status"] == "completed" and done["language_detected"] == "ar"
    sug = done["intake_suggestion"]
    assert sug["engine"] == "rules" and sug["language_detected"] == "ar"
    assert sug["transcript_en"] == "" and done["transcript_en"] is None  # no AI -> no translation
    assert sug["notes_patient"].startswith("عندي")


async def test_voice_detected_language_not_enabled_falls_back_to_english(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any
) -> None:
    user = await create_user(db, role="patient")
    await create_patient(db, user)
    fake = FakeSTT(stt_result("Болит колено", language="ru"))
    stt.set_provider(fake)
    try:
        r = await upload(client, auth_headers(user))
        assert r.json()["language_hint"] is None
        assert await run_jobs() >= 1
        done = (
            await client.get(f"{API}/voice/transcriptions/{r.json()['id']}", headers=auth_headers(user))
        ).json()
    finally:
        stt.set_provider(None)
    assert [c["language"] for c in fake.calls] == [None, "en"]
    assert done["language_detected"] == "en"


async def test_intake_extract_language(client: Any, db: Any, auth_headers: Any) -> None:
    user = await create_user(db, role="patient")
    await create_patient(db, user)
    await enable(db, "fr")
    r = await client.post(
        f"{API}/voice/intake-extract",
        json={"text": "J'ai une douleur thoracique écrasante depuis une heure", "language": "fr"},
        headers=auth_headers(user),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["language_detected"] == "fr" and body["transcript_en"] == ""
    assert body["urgency_hint"] == "emergency"  # multilingual red flags work without AI


async def test_voice_claude_request_names_language(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.voice import ai as voice_ai

    captured: list[dict[str, Any]] = []

    async def _fake(**kwargs: Any) -> Any:
        captured.append(kwargs)
        payload = {
            "specialty_slug": None,
            "body_areas": [],
            "pain_intensity": None,
            "symptoms": [{"name": "Knee pain", "answer": "yes"}],
            "duration_value": None,
            "duration_unit": None,
            "severity": None,
            "previous_treatments": [],
            "notes": "Knee pain for three months.",
            "notes_patient": "ألم في الركبة منذ ثلاثة أشهر.",
            "transcript_en": "I have knee pain for three months.",
            "red_flags": [],
            "urgency_hint": "routine",
        }
        return fake_response(json.dumps(payload))

    monkeypatch.setattr(voice_ai, "create_message", _fake)
    outcome = await voice_ai.extract_with_claude("عندي ألم في الركبة", ["orthopedics"], "ar")
    assert outcome.ok and outcome.suggestion is not None
    assert outcome.suggestion.transcript_en == "I have knee pain for three months."
    assert outcome.suggestion.language_detected == "ar"
    assert outcome.suggestion.notes_patient.startswith("ألم")
    (req,) = captured
    assert "Arabic (ar)" in req["messages"][0]["content"][0]["text"]
    assert "transcript_en" in req["output_config"]["format"]["schema"]["required"]


# ------------------------------------------------------------------------------------------- AI summaries
async def test_docai_summary_in_patient_language_and_english_for_staff(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.docai import ai as docai_ai

    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")
    await create_specialty(db, slug="cardiology", name="Cardiology")
    await enable(db, "ar")
    user = await create_user(db, role="patient", preferred_language="ar")
    patient = await create_patient(db, user)
    staff = await create_user(db, role="admin")
    calls: list[dict[str, Any]] = []
    arabic = "كان مستوى السكر في الدم أعلى من المعدل الطبيعي. سيراجع الطبيب هذا التقرير."

    async def _fake(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return fake_response(json.dumps(ai_payload(summary_patient_localized=arabic)))

    monkeypatch.setattr(docai_ai, "create_message", _fake)
    doc = await add_document(db, user, patient, page_image())
    r = await client.post(
        f"{API}/documents/analyses",
        json={"document_ids": [str(doc.id)], "consent_ai": True},
        headers=auth_headers(user),
    )
    assert r.status_code == 202, r.text
    analysis_id = r.json()["id"]
    assert r.json()["summary_language"] == "ar"
    assert await run_jobs() >= 1

    mine = (await client.get(f"{API}/documents/analyses/{analysis_id}", headers=auth_headers(user))).json()
    assert mine["status"] == "completed", mine
    assert mine["summary_patient"] == arabic and mine["summary_language"] == "ar"
    assert mine["summary_patient_en"].startswith("Your blood sugar")
    assert mine["edited_by_patient"] is False

    theirs = (await client.get(f"{API}/documents/analyses/{analysis_id}", headers=auth_headers(staff))).json()
    assert theirs["summary_patient"].startswith("Your blood sugar") and theirs["summary_language"] == "en"

    (req,) = calls
    schema = req["output_config"]["format"]["schema"]
    assert "summary_patient_localized" in schema["required"]
    assert "Arabic (ar)" in req["messages"][0]["content"][-1]["text"]


async def test_docai_english_patient_single_generation(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.docai import ai as docai_ai

    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")
    user = await create_user(db, role="patient")
    patient = await create_patient(db, user)
    calls: list[dict[str, Any]] = []

    async def _fake(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return fake_response(json.dumps(ai_payload()))

    monkeypatch.setattr(docai_ai, "create_message", _fake)
    doc = await add_document(db, user, patient, page_image())
    r = await client.post(
        f"{API}/documents/analyses",
        json={"document_ids": [str(doc.id)], "consent_ai": True, "language": "ar"},  # ar not enabled
        headers=auth_headers(user),
    )
    assert r.json()["summary_language"] == "en"
    await run_jobs()
    out = (await client.get(f"{API}/documents/analyses/{r.json()['id']}", headers=auth_headers(user))).json()
    assert out["summary_patient"] == out["summary_patient_en"]
    assert "summary_patient_localized" not in calls[0]["output_config"]["format"]["schema"]["properties"]


def test_screening_summary_per_audience() -> None:
    result = TriageResult(
        summary="See a cardiologist.", summary_localized="راجع طبيب القلب.", summary_language="ar"
    )
    patient = type("U", (), {"role": "patient"})()
    agent = type("U", (), {"role": "agent"})()
    mine = _localize_result(result, patient)  # type: ignore[arg-type]
    assert mine.summary == "راجع طبيب القلب." and mine.summary_en == "See a cardiologist."
    assert mine.summary_language == "ar"
    theirs = _localize_result(result, agent)  # type: ignore[arg-type]
    assert theirs.summary == "See a cardiologist." and theirs.summary_language == "en"
    english = _localize_result(TriageResult(summary="Rest."), patient)  # type: ignore[arg-type]
    assert english.summary == "Rest." and english.summary_language == "en"


async def test_screening_claude_request_asks_for_localized_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.screening.ai import claude
    from app.modules.screening.ai.schema import CatalogSnapshot

    captured: list[dict[str, Any]] = []
    payload = {
        "summary": "Knee pain; an orthopaedic review is suggested.",
        "summary_localized": "Douleur au genou ; un avis orthopédique est conseillé.",
        "suggested_specialties": [],
        "possible_conditions": [],
        "recommended_procedures": [],
        "urgency": "routine",
        "red_flags": [],
        "recommended_tests": [],
        "questions_for_doctor": [],
        "travel_advice": "",
        "disclaimer": "Not a diagnosis.",
    }

    async def _fake(**kwargs: Any) -> Any:
        captured.append(kwargs)
        return fake_response(json.dumps(payload))

    monkeypatch.setattr(claude, "create_message", _fake)
    catalog = CatalogSnapshot()
    outcome = await claude.triage_with_claude({"notes": "genou"}, catalog, [], language="fr")
    assert outcome.ok and outcome.result is not None
    assert outcome.result.summary_language == "fr"
    assert outcome.result.summary_localized.startswith("Douleur")
    assert "summary_localized" in captured[0]["output_config"]["format"]["schema"]["required"]
    english = await claude.triage_with_claude({"notes": "knee"}, catalog, [], language="en")
    assert english.result is not None and english.result.summary_localized == ""
    assert "summary_localized" not in captured[1]["output_config"]["format"]["schema"]["properties"]
