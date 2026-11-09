"""Claude triage call (PLAN section 7).

``triage_with_claude`` performs one Messages API request with structured JSON output and returns a
``ClaudeOutcome``. It never raises for API problems: refusals, SDK errors and unparsable output come back as
``ok=False`` with a status for ``ai_request_logs`` so the caller can fall back to the rules engine.

Tests replace ``create_message`` (the only function that touches the network) with a fake.
"""

from __future__ import annotations

import base64
import inspect
import json
import time
from dataclasses import dataclass, field
from typing import Any

import anthropic
import structlog
from anthropic.resources.beta.messages import AsyncMessages
from pydantic import ValidationError

from app.core.config import settings
from app.core.enums import AIRequestStatus
from app.modules.screening.ai.prompts import build_system_prompt, build_user_text
from app.modules.screening.ai.schema import (
    TRIAGE_JSON_SCHEMA,
    CatalogSnapshot,
    TriageResult,
    sanitize_result,
)

logger = structlog.get_logger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 16000
MAX_ATTACHMENTS = 3
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})
PDF_TYPE = "application/pdf"

_SUPPORTS_FALLBACKS_KWARG = "fallbacks" in inspect.signature(AsyncMessages.create).parameters
_client: anthropic.AsyncAnthropic | None = None
_client_key: tuple[str, float] | None = None


@dataclass(slots=True)
class Attachment:
    content_type: str
    data: bytes


@dataclass(slots=True)
class ClaudeOutcome:
    ok: bool
    status: AIRequestStatus
    model: str
    result: TriageResult | None = None
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int = 0
    extra: dict[str, Any] = field(default_factory=dict)


def get_client() -> anthropic.AsyncAnthropic:
    """Process-wide AsyncAnthropic client (re-created if the key or timeout setting changes)."""
    global _client, _client_key
    key = (settings.ANTHROPIC_API_KEY, float(settings.AI_TIMEOUT_SECONDS))
    if _client is None or _client_key != key:
        _client = anthropic.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY, timeout=float(settings.AI_TIMEOUT_SECONDS), max_retries=2
        )
        _client_key = key
    return _client


async def create_message(**kwargs: Any) -> Any:
    """Send the request through the beta Messages API with server-side refusal fallbacks."""
    client = get_client()
    if _SUPPORTS_FALLBACKS_KWARG:
        return await client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
    extra_body = dict(kwargs.pop("extra_body", None) or {})
    extra_body["fallbacks"] = "default"
    return await client.beta.messages.create(betas=[FALLBACK_BETA], extra_body=extra_body, **kwargs)


def build_attachment_blocks(attachments: list[Attachment]) -> list[dict[str, Any]]:
    """PDF -> document block, image -> image block (base64); at most 3, each at most 10 MB."""
    blocks: list[dict[str, Any]] = []
    for att in attachments:
        if len(blocks) >= MAX_ATTACHMENTS:
            break
        if not att.data or len(att.data) > MAX_ATTACHMENT_BYTES:
            continue
        ctype = att.content_type.lower().split(";")[0].strip()
        if ctype == "image/jpg":
            ctype = "image/jpeg"
        encoded = base64.standard_b64encode(att.data).decode("ascii")
        if ctype == PDF_TYPE:
            blocks.append(
                {"type": "document", "source": {"type": "base64", "media_type": PDF_TYPE, "data": encoded}}
            )
        elif ctype in IMAGE_TYPES:
            blocks.append(
                {"type": "image", "source": {"type": "base64", "media_type": ctype, "data": encoded}}
            )
    return blocks


def build_request(
    intake: dict[str, Any], catalog: CatalogSnapshot, attachments: list[Attachment] | None = None
) -> dict[str, Any]:
    """Keyword arguments for ``create_message`` (no thinking/temperature/prefill: rejected by this model)."""
    attachment_blocks = build_attachment_blocks(attachments or [])
    content: list[dict[str, Any]] = [
        *attachment_blocks,
        {"type": "text", "text": build_user_text(intake, len(attachment_blocks))},
    ]
    return {
        "model": settings.AI_MODEL,
        "max_tokens": MAX_TOKENS,
        "system": [
            {"type": "text", "text": build_system_prompt(catalog), "cache_control": {"type": "ephemeral"}}
        ],
        "messages": [{"role": "user", "content": content}],
        "output_config": {
            "effort": settings.AI_EFFORT,
            "format": {"type": "json_schema", "schema": TRIAGE_JSON_SCHEMA},
        },
    }


def _usage(response: Any) -> tuple[int | None, int | None]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    inp = getattr(usage, "input_tokens", None)
    for extra in ("cache_read_input_tokens", "cache_creation_input_tokens"):
        val = getattr(usage, extra, None)
        if isinstance(val, int) and isinstance(inp, int):
            inp += val
    out = getattr(usage, "output_tokens", None)
    return (inp if isinstance(inp, int) else None), (out if isinstance(out, int) else None)


def _first_text(response: Any) -> str | None:
    for block in getattr(response, "content", None) or []:
        if getattr(block, "type", None) == "text":
            text = getattr(block, "text", None)
            if isinstance(text, str):
                return text
    return None


def _error_text(exc: BaseException) -> str:
    status = getattr(exc, "status_code", None)
    name = type(exc).__name__
    message = str(getattr(exc, "message", "") or exc)[:300]
    return f"{name}{f' ({status})' if status else ''}: {message}"


async def triage_with_claude(
    intake: dict[str, Any], catalog: CatalogSnapshot, attachments: list[Attachment] | None = None
) -> ClaudeOutcome:
    request = build_request(intake, catalog, attachments)
    model = str(request["model"])
    started = time.perf_counter()

    def elapsed() -> int:
        return int((time.perf_counter() - started) * 1000)

    try:
        response = await create_message(**request)
    except anthropic.RateLimitError as exc:
        return ClaudeOutcome(
            False, AIRequestStatus.ERROR, model, error=_error_text(exc), latency_ms=elapsed()
        )
    except anthropic.APIStatusError as exc:
        return ClaudeOutcome(
            False, AIRequestStatus.ERROR, model, error=_error_text(exc), latency_ms=elapsed()
        )
    except anthropic.APITimeoutError as exc:  # subclass of APIConnectionError: must come first
        return ClaudeOutcome(
            False, AIRequestStatus.ERROR, model, error=_error_text(exc), latency_ms=elapsed()
        )
    except anthropic.APIConnectionError as exc:
        return ClaudeOutcome(
            False, AIRequestStatus.ERROR, model, error=_error_text(exc), latency_ms=elapsed()
        )

    latency = elapsed()
    in_tok, out_tok = _usage(response)
    served_model = str(getattr(response, "model", None) or model)

    if getattr(response, "stop_reason", None) == "refusal":
        details = getattr(response, "stop_details", None)
        category = getattr(details, "category", None) if details is not None else None
        return ClaudeOutcome(
            False,
            AIRequestStatus.REFUSAL,
            served_model,
            error=f"Model declined the request (category: {category or 'unspecified'})",
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_ms=latency,
        )

    text = _first_text(response)
    if text is None:
        return ClaudeOutcome(
            False,
            AIRequestStatus.ERROR,
            served_model,
            error=f"No text block in response (stop_reason={getattr(response, 'stop_reason', None)})",
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_ms=latency,
        )
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("top-level JSON value is not an object")
        data.pop("engine", None)
        result = TriageResult.model_validate({**data, "engine": "claude"})
    except (ValueError, ValidationError) as exc:
        logger.warning("screening_ai_invalid_output", error=str(exc)[:300], stop_reason=response.stop_reason)
        return ClaudeOutcome(
            False,
            AIRequestStatus.ERROR,
            served_model,
            error=f"Invalid triage JSON: {str(exc)[:300]}",
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_ms=latency,
        )

    return ClaudeOutcome(
        True,
        AIRequestStatus.OK,
        served_model,
        result=sanitize_result(result, catalog),
        input_tokens=in_tok,
        output_tokens=out_tok,
        latency_ms=latency,
    )
