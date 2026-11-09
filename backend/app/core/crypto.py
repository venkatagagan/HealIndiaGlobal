"""Application-level field encryption (AES-256-GCM).

Ciphertext format: ``"v1:" + urlsafe_b64(nonce[12] | ciphertext | tag[16])``. The key is the base64-decoded
``settings.FIELD_ENCRYPTION_KEY`` (32 bytes). Settings are imported lazily so this module (and the models that
use :class:`EncryptedString`) can be imported without a fully configured environment.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
from functools import lru_cache
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

__all__ = ["CryptoError", "EncryptedString", "decrypt_str", "encrypt_str", "is_encrypted", "mask"]

_PREFIX = "v1:"
_NONCE_LEN = 12


class CryptoError(Exception):
    """Raised when a value cannot be encrypted/decrypted (bad key, tampered or foreign ciphertext)."""


def _decode_key(raw: str) -> bytes:
    raw = raw.strip()
    if not raw:
        raise CryptoError("FIELD_ENCRYPTION_KEY is not configured")
    padded = raw + "=" * (-len(raw) % 4)
    for decoder in (base64.b64decode, base64.urlsafe_b64decode):
        try:
            key = decoder(padded.encode("ascii"))
        except (binascii.Error, ValueError, UnicodeEncodeError):
            continue
        if len(key) == 32:
            return key
    raise CryptoError("FIELD_ENCRYPTION_KEY must be 32 bytes, base64 encoded")


@lru_cache(maxsize=4)
def _aead_for(raw_key: str) -> AESGCM:
    return AESGCM(_decode_key(raw_key))


def _aead() -> AESGCM:
    from app.core.config import settings  # lazy: avoid import cycles / env requirements at import time

    raw: Any = settings.FIELD_ENCRYPTION_KEY
    if hasattr(raw, "get_secret_value"):
        raw = raw.get_secret_value()
    return _aead_for(str(raw or ""))


def is_encrypted(value: str | None) -> bool:
    return bool(value) and str(value).startswith(_PREFIX)


def encrypt_str(plaintext: str) -> str:
    """Encrypt a UTF-8 string; every call uses a fresh random 96-bit nonce."""
    nonce = os.urandom(_NONCE_LEN)
    ct = _aead().encrypt(nonce, plaintext.encode("utf-8"), None)
    return _PREFIX + base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt_str(token: str) -> str:
    """Decrypt a value produced by :func:`encrypt_str`. Raises :class:`CryptoError` on any failure."""
    if not token.startswith(_PREFIX):
        raise CryptoError("unsupported ciphertext format")
    try:
        blob = base64.urlsafe_b64decode(token[len(_PREFIX) :].encode("ascii"))
    except (binascii.Error, ValueError, UnicodeEncodeError) as exc:
        raise CryptoError("malformed ciphertext") from exc
    if len(blob) < _NONCE_LEN + 16:
        raise CryptoError("malformed ciphertext")
    try:
        plain = _aead().decrypt(blob[:_NONCE_LEN], blob[_NONCE_LEN:], None)
    except InvalidTag as exc:
        raise CryptoError("ciphertext authentication failed") from exc
    return plain.decode("utf-8")


def keyed_fingerprint(value: str | None, purpose: str = "fingerprint") -> str | None:
    """Keyed HMAC-SHA256 (hex, 32 chars) of ``value`` for audit rows: lets investigators tell whether two
    values are the same (e.g. which bank account was shown to patients) without storing the value itself.
    The key is derived from ``FIELD_ENCRYPTION_KEY`` (falls back to ``JWT_SECRET`` when unset)."""
    if not value:
        return None
    from app.core.config import settings

    raw: Any = settings.FIELD_ENCRYPTION_KEY or settings.JWT_SECRET
    if hasattr(raw, "get_secret_value"):
        raw = raw.get_secret_value()
    key = hashlib.sha256(f"hig-{purpose}:{raw}".encode()).digest()
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def mask(value: str | None, keep: int = 4, char: str = "*") -> str:
    """Mask all but the last ``keep`` characters (``"AB1234567" -> "*****4567"``).

    Values not longer than ``keep`` are fully masked so short secrets are never revealed. ``None`` -> ``""``.
    """
    if not value:
        return ""
    if keep <= 0 or len(value) <= keep:
        return char * len(value)
    return char * (len(value) - keep) + value[-keep:]


class EncryptedString(TypeDecorator[str]):
    """TEXT column transparently encrypted with AES-256-GCM.

    Python side always sees plaintext ``str`` (or ``None``); the database stores ``v1:...`` ciphertext.
    Encrypted columns cannot be searched or compared in SQL; keep a ``*_last4`` column for display/lookup.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            value = str(value)
        return encrypt_str(value)

    def process_result_value(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        return decrypt_str(str(value))

    def process_literal_param(self, value: Any, dialect: Dialect) -> str:
        raise CryptoError("EncryptedString values cannot be rendered as SQL literals")

    @property
    def python_type(self) -> type[str]:
        return str
