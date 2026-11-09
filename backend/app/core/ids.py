"""UUIDv7 generation (RFC 9562, section 5.7).

Layout (128 bits):
    48 bits  unix_ts_ms   big-endian milliseconds since the Unix epoch
     4 bits  version      0b0111
    12 bits  rand_a       ┐
     2 bits  variant      │ 0b10
    62 bits  rand_b       ┘ rand_a + rand_b form a 74-bit "random tail"

Monotonicity (RFC 9562 section 6.2, method 2 "monotonic random"): when several ids are generated within
the same millisecond (or the wall clock moves backwards), the previous 74-bit tail is incremented by a
random amount in [1, 2**32) instead of being drawn fresh, so ids from one process always sort strictly
increasing. On tail overflow the timestamp is advanced by one millisecond.
"""

from __future__ import annotations

import secrets
import threading
import time
import uuid

__all__ = ["uuid7", "uuid7_timestamp_ms"]

_TAIL_BITS = 74
_TAIL_MAX = (1 << _TAIL_BITS) - 1
_TS_MAX = (1 << 48) - 1

_lock = threading.Lock()
_last_ms = -1
_last_tail = 0


def _pack(ms: int, tail: int) -> uuid.UUID:
    rand_a = tail >> 62  # top 12 bits of the tail
    rand_b = tail & ((1 << 62) - 1)  # low 62 bits
    value = (ms & _TS_MAX) << 80
    value |= 0x7 << 76
    value |= rand_a << 64
    value |= 0b10 << 62
    value |= rand_b
    return uuid.UUID(int=value)


def uuid7() -> uuid.UUID:
    """Return a new, time-ordered UUID version 7 (monotonic within this process)."""
    global _last_ms, _last_tail
    now_ms = time.time_ns() // 1_000_000
    with _lock:
        if now_ms > _last_ms:
            ms = now_ms
            # Leave head-room in the tail so same-millisecond increments rarely overflow.
            tail = secrets.randbits(_TAIL_BITS - 1)
        else:
            ms = _last_ms
            tail = _last_tail + 1 + secrets.randbits(32)
            if tail > _TAIL_MAX:
                ms += 1
                tail = secrets.randbits(_TAIL_BITS - 1)
        _last_ms = ms
        _last_tail = tail
    return _pack(ms, tail)


def uuid7_timestamp_ms(value: uuid.UUID) -> int:
    """Extract the 48-bit unix-millisecond timestamp embedded in a UUIDv7."""
    if value.version != 7:
        raise ValueError("not a UUIDv7")
    return value.int >> 80
