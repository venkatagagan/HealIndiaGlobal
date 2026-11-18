"""AWS integrations used by the starter deployment (deploy/starter): SMS codes through Amazon SNS, email
through the SES API and the S3 server-side-encryption setting. Every AWS client is replaced by a fake:
nothing here talks to AWS."""

from __future__ import annotations

import re
from typing import Any

import pytest
from botocore.exceptions import ClientError

from app.core import email as email_module
from app.core import sms
from app.core.config import settings
from app.core.enums import ContactChannel
from app.core.errors import AppError, BadRequest
from app.core.storage import S3Storage
from app.modules.guests import service as guest_service
from tests.modules.auth_helpers import MOBILE, bearer

API = "/api/v1"


class FakeSNS:
    def __init__(self, error: Exception | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.error = error

    def publish(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"MessageId": f"msg-{len(self.calls)}"}


@pytest.fixture
def fake_sns(monkeypatch: pytest.MonkeyPatch) -> FakeSNS:
    fake = FakeSNS()
    monkeypatch.setattr(settings, "SMS_PROVIDER", "sns")
    monkeypatch.setattr(settings, "SNS_SMS_ORIGINATION_NUMBER", "")
    monkeypatch.setattr(settings, "SNS_SMS_SENDER_ID", "")
    monkeypatch.setattr(settings, "SMS_ALLOWED_COUNTRY_CODES", [])
    monkeypatch.setattr(sms, "_sns_client", lambda: fake)
    return fake


# ----------------------------------------------------------------------------------------------------- SMS
async def test_sns_sms_publishes_with_attributes(fake_sns: FakeSNS, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SNS_SMS_ORIGINATION_NUMBER", "+18885550100")
    monkeypatch.setattr(settings, "SNS_SMS_SENDER_ID", "HealIndia")
    message_id = await sms.send_sms("+14155550123", "Your code is 123456.")
    assert message_id == "msg-1"
    call = fake_sns.calls[0]
    assert call["PhoneNumber"] == "+14155550123"
    assert call["Message"] == "Your code is 123456."
    attrs = call["MessageAttributes"]
    assert attrs["AWS.SNS.SMS.SMSType"]["StringValue"] == "Transactional"
    assert attrs["AWS.MM.SMS.OriginationNumber"]["StringValue"] == "+18885550100"
    assert attrs["AWS.SNS.SMS.SenderID"]["StringValue"] == "HealIndia"


async def test_sns_sms_rejects_bad_numbers_and_other_providers(
    fake_sns: FakeSNS, monkeypatch: pytest.MonkeyPatch
) -> None:
    with pytest.raises(sms.SmsError):
        await sms.send_sms("0803 123 4567", "x")
    monkeypatch.setattr(settings, "SMS_PROVIDER", "console")
    with pytest.raises(sms.SmsError):
        await sms.send_sms("+14155550123", "x")
    assert fake_sns.calls == []


async def test_sns_client_error_becomes_sms_error(fake_sns: FakeSNS) -> None:
    fake_sns.error = ClientError({"Error": {"Code": "Throttling", "Message": "slow down"}}, "Publish")
    with pytest.raises(sms.SmsError, match="Throttling"):
        await sms.send_sms("+14155550123", "x")


def test_country_allow_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SMS_ALLOWED_COUNTRY_CODES", [])
    assert sms.destination_allowed("+2348031234567")
    monkeypatch.setattr(settings, "SMS_ALLOWED_COUNTRY_CODES", ["1", "+44"])
    assert sms.destination_allowed("+14155550123")
    assert sms.destination_allowed("+447700900123")
    assert not sms.destination_allowed("+2348031234567")
    assert sms.mask_number("+2348031234567") == "+234*******567"


async def test_guest_code_text_is_translated(fake_sns: FakeSNS, db: Any) -> None:
    await guest_service._send_code(ContactChannel.PHONE, "+33612345678", "482913", db, locale="fr")
    await guest_service._send_code(ContactChannel.PHONE, "+79161234567", "482914", db, locale="ru")
    await guest_service._send_code(ContactChannel.PHONE, "+14155550123", "482915", db, locale=None)
    fr, ru, en = (c["Message"] for c in fake_sns.calls)
    assert "482913" in fr and "Votre code" in fr and "10 minutes" in fr
    assert "482914" in ru and "Ваш код" in ru
    assert en == f"Your {settings.APP_NAME} code is 482915. It expires in 10 minutes. Do not share it."


async def test_guest_code_country_guard_and_provider_failure(
    fake_sns: FakeSNS, db: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMS_ALLOWED_COUNTRY_CODES", ["1"])
    with pytest.raises(BadRequest) as refused:
        await guest_service._send_code(ContactChannel.PHONE, "+2348031234567", "111111", db)
    assert refused.value.code == "sms_unavailable"
    assert fake_sns.calls == []

    fake_sns.error = ClientError({"Error": {"Code": "OptedOut", "Message": "no"}}, "Publish")
    with pytest.raises(AppError) as failed:
        await guest_service._send_code(ContactChannel.PHONE, "+14155550123", "111111", db)
    assert failed.value.status_code == 503 and failed.value.code == "service_unavailable"


async def test_phone_verification_through_sns(client: Any, fake_sns: FakeSNS) -> None:
    r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
    assert r.status_code == 201, r.text
    headers = {**MOBILE, **bearer(r.json())}
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "phone", "contact": "+1 415 555 0123"}, headers=headers
    )
    assert r.status_code == 201, r.text
    call = fake_sns.calls[-1]
    assert call["PhoneNumber"] == "+14155550123"
    code = re.search(r"\d{6}", call["Message"]).group(0)
    r = await client.post(
        f"{API}/guest/verify/confirm",
        json={"verification_id": r.json()["verification_id"], "code": code},
        headers=headers,
    )
    assert r.status_code == 200 and r.json()["verified"] is True

    # SNS down: 503, and no code row is left behind (the caller can retry)
    fake_sns.error = ClientError({"Error": {"Code": "InternalError", "Message": "boom"}}, "Publish")
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "phone", "contact": "+1 415 555 0199"}, headers=headers
    )
    assert r.status_code == 503, r.text
    assert r.json()["error"]["code"] == "service_unavailable"


# --------------------------------------------------------------------------------------------------- email
class FakeSES:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def send_email(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {"MessageId": "ses-1"}


async def test_ses_backend_sends_raw_mime(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeSES()
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "ses")
    monkeypatch.setattr(settings, "EMAIL_FROM", "Heal India Global <no-reply@healindiaglobal.example>")
    monkeypatch.setattr(settings, "SES_CONFIGURATION_SET", "hig-production")
    monkeypatch.setattr(email_module, "_get_ses_client", lambda: fake)
    outbox_before = len(email_module.outbox)
    await email_module.send_email(["patient@example.test"], "Welcome", "<p>Hello <b>there</b></p>")
    assert len(email_module.outbox) == outbox_before  # not the console backend
    call = fake.calls[0]
    assert call["FromEmailAddress"] == "Heal India Global <no-reply@healindiaglobal.example>"
    assert call["Destination"] == {"ToAddresses": ["patient@example.test"]}
    assert call["ConfigurationSetName"] == "hig-production"
    raw = call["Content"]["Raw"]["Data"].decode()
    assert "Subject: Welcome" in raw and "text/html" in raw and "Hello there" in raw


# ----------------------------------------------------------------------------------------------- storage
class FakeS3:
    def __init__(self) -> None:
        self.puts: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> dict[str, Any]:
        self.puts.append(kwargs)
        return {}


@pytest.mark.parametrize(
    ("sse", "key_id", "expected"),
    [
        ("AES256", "", {"ServerSideEncryption": "AES256"}),
        (
            "aws:kms",
            "arn:aws:kms:us-east-2:111122223333:key/abc",
            {
                "ServerSideEncryption": "aws:kms",
                "BucketKeyEnabled": True,
                "SSEKMSKeyId": "arn:aws:kms:us-east-2:111122223333:key/abc",
            },
        ),
        ("aws:kms", "", {"ServerSideEncryption": "aws:kms", "BucketKeyEnabled": True}),
        ("bucket_default", "", {}),
    ],
)
async def test_s3_server_side_encryption(sse: str, key_id: str, expected: dict[str, Any]) -> None:
    storage = S3Storage("bucket", region="us-east-2", sse=sse, sse_kms_key_id=key_id)
    fake = FakeS3()
    storage._client = fake
    await storage.save("documents/2026/11/a.pdf", b"%PDF", "application/pdf")
    put = fake.puts[0]
    encryption = {
        k: v for k, v in put.items() if k in ("ServerSideEncryption", "BucketKeyEnabled", "SSEKMSKeyId")
    }
    assert encryption == expected
    assert put["ContentType"] == "application/pdf" and put["Bucket"] == "bucket"
