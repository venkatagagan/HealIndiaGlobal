"""Binary object storage (local filesystem or S3/MinIO).

Usage::

    from app.core.storage import get_storage, make_key

    storage = get_storage()
    key = make_key("documents", "pdf")             # "documents/2026/10/<uuid>.pdf"
    await storage.save(key, data, "application/pdf")
    data = await storage.open(key)
    await storage.delete(key)

Keys are relative POSIX paths made of ``[A-Za-z0-9._-]`` segments; absolute paths, ``..`` and backslashes
are rejected (``ValueError``). Never build keys from user-supplied file names.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import structlog
from starlette.concurrency import run_in_threadpool

from app.core.config import BACKEND_DIR, settings

logger = structlog.get_logger(__name__)

_SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class StorageError(Exception):
    pass


class ObjectNotFound(StorageError):
    pass


def validate_key(key: str) -> str:
    if not key or len(key) > 512:
        raise ValueError("Invalid storage key")
    if key.startswith("/") or "\\" in key or ":" in key or "\x00" in key:
        raise ValueError("Invalid storage key")
    parts = key.split("/")
    for part in parts:
        if part in ("", ".", "..") or not _SEGMENT_RE.match(part):
            raise ValueError("Invalid storage key")
    return key


def make_key(prefix: str, extension: str | None = None, *, now: datetime | None = None) -> str:
    """Random, date-partitioned key: ``<prefix>/YYYY/MM/<uuid>[.<ext>]``."""
    ts = now or datetime.now(UTC)
    ext = (extension or "").lower().lstrip(".")
    if ext and not re.fullmatch(r"[a-z0-9]{1,10}", ext):
        raise ValueError("Invalid extension")
    name = uuid.uuid4().hex + (f".{ext}" if ext else "")
    return validate_key(f"{prefix.strip('/')}/{ts:%Y}/{ts:%m}/{name}")


@runtime_checkable
class Storage(Protocol):
    async def save(self, key: str, data: bytes, content_type: str | None = None) -> str: ...

    async def open(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...

    async def exists(self, key: str) -> bool: ...


class LocalStorage:
    """Stores objects under ``root`` (``STORAGE_LOCAL_DIR``; relative paths resolve against ``backend/``)."""

    def __init__(self, root: str | os.PathLike[str]) -> None:
        path = Path(root)
        if not path.is_absolute():
            path = BACKEND_DIR / path
        self.root = path.resolve()

    def _path(self, key: str) -> Path:
        validate_key(key)
        target = (self.root / key).resolve()
        if not target.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return target

    def _save_sync(self, key: str, data: bytes) -> None:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(target.name + f".{uuid.uuid4().hex}.tmp")
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, target)

    async def save(self, key: str, data: bytes, content_type: str | None = None) -> str:
        await run_in_threadpool(self._save_sync, key, data)
        return key

    def _open_sync(self, key: str) -> bytes:
        target = self._path(key)
        try:
            return target.read_bytes()
        except FileNotFoundError as exc:
            raise ObjectNotFound(key) from exc

    async def open(self, key: str) -> bytes:
        return await run_in_threadpool(self._open_sync, key)

    def _delete_sync(self, key: str) -> None:
        target = self._path(key)
        try:
            target.unlink()
        except FileNotFoundError:
            return

    async def delete(self, key: str) -> None:
        await run_in_threadpool(self._delete_sync, key)

    async def exists(self, key: str) -> bool:
        target = self._path(key)
        return await run_in_threadpool(target.is_file)


class S3Storage:
    """S3/MinIO via boto3 (sync client executed in the threadpool)."""

    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None = None,
        region: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
    ) -> None:
        import boto3
        from botocore.config import Config

        if not bucket:
            raise StorageError("S3_BUCKET is required for the s3 storage backend")
        self.bucket = bucket
        self._client: Any = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            region_name=region or None,
            aws_access_key_id=access_key_id or None,
            aws_secret_access_key=secret_access_key or None,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
        )

    async def save(self, key: str, data: bytes, content_type: str | None = None) -> str:
        validate_key(key)
        extra: dict[str, Any] = {"ServerSideEncryption": "AES256"}
        if content_type:
            extra["ContentType"] = content_type
        await run_in_threadpool(
            lambda: self._client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
        )
        return key

    async def open(self, key: str) -> bytes:
        validate_key(key)

        def _get() -> bytes:
            try:
                obj = self._client.get_object(Bucket=self.bucket, Key=key)
            except self._client.exceptions.NoSuchKey as exc:
                raise ObjectNotFound(key) from exc
            body: bytes = obj["Body"].read()
            return body

        return await run_in_threadpool(_get)

    async def delete(self, key: str) -> None:
        validate_key(key)
        await run_in_threadpool(lambda: self._client.delete_object(Bucket=self.bucket, Key=key))

    async def exists(self, key: str) -> bool:
        validate_key(key)
        from botocore.exceptions import ClientError

        def _head() -> bool:
            try:
                self._client.head_object(Bucket=self.bucket, Key=key)
                return True
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                    return False
                raise

        return await run_in_threadpool(_head)


_storage: Storage | None = None


def get_storage() -> Storage:
    """Process-wide storage singleton built from settings."""
    global _storage
    if _storage is None:
        if settings.STORAGE_BACKEND == "s3":
            _storage = S3Storage(
                settings.S3_BUCKET,
                endpoint_url=settings.S3_ENDPOINT_URL,
                region=settings.S3_REGION,
                access_key_id=settings.S3_ACCESS_KEY_ID,
                secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            )
        else:
            _storage = LocalStorage(settings.STORAGE_LOCAL_DIR)
    return _storage


def set_storage(storage: Storage | None) -> None:
    """Override (or reset with ``None``) the singleton - used by tests."""
    global _storage
    _storage = storage


class _StorageProxy:
    """``from app.core.storage import storage`` - lazily delegates to ``get_storage()``."""

    def __getattr__(self, name: str) -> Any:
        return getattr(get_storage(), name)


storage: Any = _StorageProxy()
