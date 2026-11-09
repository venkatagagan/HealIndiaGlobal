"""Application-level field encryption (AES-256-GCM) with key rotation.

Ciphertext format: ``"v1:<key id>:" + urlsafe_b64(nonce[12] | ciphertext | tag[16])``. Values written before
key ids existed have no key id (``"v1:" + b64``) and are decrypted by trying every configured key (the GCM tag
proves which one is right).

Keys come from settings (imported lazily so this module and the models that use :class:`EncryptedString`
can be imported without a fully configured environment):

* ``FIELD_ENCRYPTION_KEY`` / ``FIELD_ENCRYPTION_KEY_ID`` - the current key; new values are encrypted with it;
* ``FIELD_ENCRYPTION_OLD_KEYS`` - ``<key id>:<base64 key>`` pairs that are only used to decrypt.

Rotation: add the old key to ``FIELD_ENCRYPTION_OLD_KEYS``, set a new key + key id, deploy, then run the
``privacy.reencrypt_fields`` job (daily, or enqueue it by hand) until it reports nothing left, and finally
drop the old key. :func:`needs_reencrypt` tells whether a stored value is under the current key.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
from functools import lru_cache
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

__all__ = [
    "CryptoError",
    "EncryptedJSON",
    "EncryptedString",
    "EncryptedText",
    "current_key_id",
    "decrypt_str",
    "encrypt_str",
    "is_encrypted",
    "mask",
    "needs_reencrypt",
]

_PREFIX = "v1:"
_NONCE_LEN = 12
_KID_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")


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


@lru_cache(maxsize=16)
def _aead_for(raw_key: str) -> AESGCM:
    return AESGCM(_decode_key(raw_key))


def _secret(value: Any) -> str:
    if hasattr(value, "get_secret_value"):
        value = value.get_secret_value()
    return str(value or "")


def _keyring() -> tuple[str, dict[str, str]]:
    """``(current key id, {key id: raw key})``; the current key is always present in the mapping."""
    from app.core.config import settings  # lazy: avoid import cycles / env requirements at import time

    current_id = str(getattr(settings, "FIELD_ENCRYPTION_KEY_ID", "k1") or "k1")
    keys: dict[str, str] = {}
    for entry in getattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", None) or []:
        kid, sep, raw = str(entry).partition(":")
        if not sep or not _KID_RE.match(kid.strip()) or not raw.strip():
            raise CryptoError("FIELD_ENCRYPTION_OLD_KEYS entries must look like <key id>:<base64 key>")
        keys[kid.strip()] = raw.strip()
    keys[current_id] = _secret(settings.FIELD_ENCRYPTION_KEY)
    return current_id, keys


def current_key_id() -> str:
    return _keyring()[0]


def is_encrypted(value: str | None) -> bool:
    return bool(value) and str(value).startswith(_PREFIX)


def _split(token: str) -> tuple[str | None, str]:
    """``(key id or None for legacy values, base64 payload)``. Base64url never contains ``:``."""
    body = token[len(_PREFIX) :]
    kid, sep, payload = body.partition(":")
    if sep:
        return kid, payload
    return None, body


def needs_reencrypt(token: str | None) -> bool:
    """True for plaintext, legacy (no key id) and old-key values; False for NULL and current-key values."""
    if token is None:
        return False
    if not is_encrypted(token):
        return True
    kid, _ = _split(token)
    return kid != current_key_id()


def encrypt_str(plaintext: str) -> str:
    """Encrypt a UTF-8 string with the current key; every call uses a fresh random 96-bit nonce."""
    current_id, keys = _keyring()
    nonce = os.urandom(_NONCE_LEN)
    ct = _aead_for(keys[current_id]).encrypt(nonce, plaintext.encode("utf-8"), None)
    return f"{_PREFIX}{current_id}:" + base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt_str(token: str) -> str:
    """Decrypt a value produced by :func:`encrypt_str`. Raises :class:`CryptoError` on any failure."""
    if not token.startswith(_PREFIX):
        raise CryptoError("unsupported ciphertext format")
    kid, payload = _split(token)
    try:
        blob = base64.urlsafe_b64decode(payload.encode("ascii"))
    except (binascii.Error, ValueError, UnicodeEncodeError) as exc:
        raise CryptoError("malformed ciphertext") from exc
    if len(blob) < _NONCE_LEN + 16:
        raise CryptoError("malformed ciphertext")
    current_id, keys = _keyring()
    if kid is not None:
        if kid not in keys:
            raise CryptoError(f"unknown encryption key id {kid!r}")
        candidates = [keys[kid]]
    else:
        candidates = [keys[current_id]] + [raw for k, raw in keys.items() if k != current_id]
    for raw in candidates:
        try:
            plain = _aead_for(raw).decrypt(blob[:_NONCE_LEN], blob[_NONCE_LEN:], None)
        except InvalidTag:
            continue
        return plain.decode("utf-8")
    raise CryptoError("ciphertext authentication failed")


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
    #: accept values stored before the column was encrypted (plaintext) on read
    lenient = False

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            value = str(value)
        return encrypt_str(value)

    def process_result_value(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        text = str(value)
        if self.lenient and not is_encrypted(text):
            return text
        return decrypt_str(text)

    def process_literal_param(self, value: Any, dialect: Dialect) -> str:
        raise CryptoError("EncryptedString values cannot be rendered as SQL literals")

    @property
    def python_type(self) -> type[str]:
        return str


class EncryptedText(EncryptedString):
    """Encrypted health free text (medical history, notes, AI summaries, transcripts).

    Same as :class:`EncryptedString` but tolerant of plaintext written before the column was encrypted (the
    ``privacy.reencrypt_fields`` job encrypts those rows)."""

    cache_ok = True
    lenient = True


class EncryptedJSON(TypeDecorator[Any]):
    """A JSON document (dict/list) stored as encrypted TEXT. Not queryable in SQL.

    Reads accept the plaintext JSON left behind by the JSONB -> TEXT migration until it is re-encrypted."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        return encrypt_str(json.dumps(value, separators=(",", ":"), ensure_ascii=False, default=str))

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        text = str(value)
        if not is_encrypted(text):
            return json.loads(text)
        return json.loads(decrypt_str(text))

    def process_literal_param(self, value: Any, dialect: Dialect) -> str:
        raise CryptoError("EncryptedJSON values cannot be rendered as SQL literals")
