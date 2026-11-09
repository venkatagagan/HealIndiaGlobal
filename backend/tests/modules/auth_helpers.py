"""Helpers shared by the auth / patients / documents tests (be-auth)."""

from __future__ import annotations

import struct
import zlib
from typing import Any

import httpx
import pyotp

API = "/api/v1"
PASSWORD = "Sunrise2026travel"
MOBILE = {"X-Client-Type": "mobile"}
XHR = {"X-Requested-With": "XMLHttpRequest"}


def register_payload(role: str = "patient", **overrides: Any) -> dict[str, Any]:
    from tests.factories import rand_suffix

    payload: dict[str, Any] = {
        "email": f"{role}.{rand_suffix()}@example.test",
        "password": PASSWORD,
        "full_name": "Amara Okafor",
        "role": role,
        "phone": "+1-202-555-0143",
        "country_code": "US",
        "accept_terms": True,
    }
    if role == "agent":
        payload["agency_name"] = f"Lagos MedTravel {rand_suffix(4)}"
        payload["country_code"] = "NG"
    if role == "hospital":
        payload["hospital_name"] = f"Sunrise Speciality Hospital {rand_suffix(4)}"
        payload["city"] = "Chennai"
        payload["country_code"] = "IN"
    payload.update(overrides)
    return payload


async def register(
    client: httpx.AsyncClient, role: str = "patient", *, mobile: bool = True, **overrides: Any
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Register through the API; returns ``(payload, TokenOut)``."""
    payload = register_payload(role, **overrides)
    r = await client.post(f"{API}/auth/register", json=payload, headers=MOBILE if mobile else {})
    assert r.status_code == 201, r.text
    return payload, r.json()


async def login(
    client: httpx.AsyncClient, email: str, password: str = PASSWORD, *, mobile: bool = True, **extra: Any
) -> httpx.Response:
    return await client.post(
        f"{API}/auth/login",
        json={"email": email, "password": password, **extra},
        headers=MOBILE if mobile else {},
    )


def bearer(token_out: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_out['access_token']}"}


def totp_now(secret: str) -> str:
    return pyotp.TOTP(secret).now()


# --- file fixtures ---------------------------------------------------------------------------------------
def pdf_bytes(text: str = "Medical report") -> bytes:
    body = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n"
        + f"% {text}\n".encode()
        + b"trailer<</Root 1 0 R>>\n%%EOF\n"
    )
    return body


def png_bytes() -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def dicom_bytes() -> bytes:
    return b"\x00" * 128 + b"DICM" + b"\x02\x00\x00\x00UL\x04\x00" + b"\x00" * 64


async def upload(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    kind: str = "medical_report",
    content: bytes | None = None,
    file_name: str = "report.pdf",
    content_type: str = "application/pdf",
    **form: Any,
) -> httpx.Response:
    data = {"kind": kind, **{k: str(v) for k, v in form.items() if v is not None}}
    files = {"file": (file_name, content if content is not None else pdf_bytes(), content_type)}
    return await client.post(f"{API}/documents", headers=headers, data=data, files=files)
