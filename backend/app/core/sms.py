"""Outgoing SMS (one-time codes) through Amazon SNS.

``SMS_PROVIDER=sns`` publishes directly to an E.164 phone number with the SNS ``Publish`` API. Credentials
come from the standard AWS chain (EC2 instance role / ECS task role); no static keys are read from settings.
The region is ``SNS_REGION`` (empty = the AWS default chain, e.g. ``AWS_REGION``).

Delivery rules that live outside the code (see ``deploy/starter/README.md`` "SMS"):

* New accounts are in the SNS SMS *sandbox*: only verified destination numbers receive messages until AWS
  approves production access, and the account monthly spend limit starts at USD 1.
* US destinations need a registered origination identity (toll-free number or 10DLC); set
  ``SNS_SMS_ORIGINATION_NUMBER``. Some countries need a registered sender ID (``SNS_SMS_SENDER_ID``).
* ``SMS_ALLOWED_COUNTRY_CODES`` limits which country calling codes may receive codes (SMS pumping guard).

Callers decide the text (translated with ``app.i18n.t`` in the recipient's language) and never log it.
"""

from __future__ import annotations

import re
import threading
from typing import Any

import structlog
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

logger = structlog.get_logger(__name__)

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")

_client: Any = None
_client_key: tuple[str, ...] | None = None
_client_lock = threading.Lock()


class SmsError(Exception):
    """The SMS could not be handed to the provider (configuration, throttling, provider error)."""


def mask_number(number: str) -> str:
    """``+2348031234567`` -> ``+234******567`` (for logs)."""
    if len(number) <= 6:
        return "***"
    return f"{number[:4]}{'*' * (len(number) - 7)}{number[-3:]}"


def destination_allowed(number: str) -> bool:
    """True when ``SMS_ALLOWED_COUNTRY_CODES`` is empty or the E.164 ``number`` starts with one of them."""
    allowed = [c.strip().lstrip("+") for c in settings.SMS_ALLOWED_COUNTRY_CODES if c.strip()]
    if not allowed:
        return True
    digits = number.lstrip("+")
    return any(digits.startswith(code) for code in allowed)


def _sns_client() -> Any:
    """One boto3 SNS client per (region) configuration; boto3 clients are thread-safe."""
    global _client, _client_key
    key = (settings.SNS_REGION,)
    with _client_lock:
        if _client is None or _client_key != key:
            import boto3
            from botocore.config import Config

            _client = boto3.client(
                "sns",
                region_name=settings.SNS_REGION or None,
                config=Config(
                    retries={"max_attempts": 3, "mode": "standard"}, connect_timeout=5, read_timeout=10
                ),
            )
            _client_key = key
        return _client


def reset_client() -> None:
    """Forget the cached client (tests, configuration changes)."""
    global _client, _client_key
    with _client_lock:
        _client = None
        _client_key = None


def _message_attributes() -> dict[str, dict[str, str]]:
    attributes: dict[str, dict[str, str]] = {
        "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": settings.SNS_SMS_TYPE},
    }
    if settings.SNS_SMS_SENDER_ID:
        attributes["AWS.SNS.SMS.SenderID"] = {"DataType": "String", "StringValue": settings.SNS_SMS_SENDER_ID}
    if settings.SNS_SMS_ORIGINATION_NUMBER:
        attributes["AWS.MM.SMS.OriginationNumber"] = {
            "DataType": "String",
            "StringValue": settings.SNS_SMS_ORIGINATION_NUMBER,
        }
    return attributes


async def send_sms(to: str, text: str) -> str:
    """Send ``text`` to the E.164 number ``to`` with Amazon SNS; returns the SNS message id.

    Raises :class:`SmsError` when the provider is not ``sns``, the number is not E.164 or SNS refuses the
    message. The text is never logged (it carries a one-time code)."""
    if settings.SMS_PROVIDER != "sns":
        raise SmsError(f"SMS_PROVIDER={settings.SMS_PROVIDER} cannot send SMS")
    if not _E164_RE.match(to):
        raise SmsError("destination is not an E.164 phone number")

    def _publish() -> str:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            response = _sns_client().publish(
                PhoneNumber=to, Message=text, MessageAttributes=_message_attributes()
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "ClientError")
            raise SmsError(f"SNS refused the SMS ({code})") from exc
        except BotoCoreError as exc:
            raise SmsError(f"SNS is unreachable ({type(exc).__name__})") from exc
        return str(response.get("MessageId", ""))

    try:
        message_id = await run_in_threadpool(_publish)
    except SmsError as exc:
        logger.warning("sms.failed", provider="sns", to=mask_number(to), error=str(exc))
        raise
    logger.info("sms.sent", provider="sns", to=mask_number(to), message_id=message_id)
    return message_id
