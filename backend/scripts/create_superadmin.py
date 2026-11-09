"""Create (or promote) the first super_admin: the controlled one-off command from docs/DEPLOYMENT.md.

Run from ``backend/`` (or inside the API container, working dir ``/app``)::

    python -m scripts.create_superadmin --email ops.lead@example.com --name "Ops Lead"

* The password is read interactively with ``getpass`` (twice) - never from argv or the environment - and must
  satisfy the password policy.
* Refuses when an active super_admin already exists, unless ``--force-additional``.
* An existing non-staff account with that email is NOT promoted (public-door accounts stay separate);
  an existing staff account is promoted to super_admin (its password is replaced by the one entered).
* Writes an ``auth.superadmin_bootstrap`` audit-log entry and issues a one-time MFA enrolment code (24 h):
  sign in at the staff door (``/gahi``) with email + password + that code, scan the QR/secret with an
  authenticator app and enter the 6-digit code. With ``ADMIN_MFA_REQUIRED=true`` (mandatory in production) no
  staff account can enrol MFA with the password alone (INTEGRATION_BACKLOG #23).
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.deps import is_staff
from app.core.enums import UserRole, UserStatus
from app.core.security import hash_password, password_strength_errors
from app.models import User
from app.modules.auth.service import issue_mfa_enrolment_token, normalize_email


class BootstrapError(Exception):
    """A refusal that the CLI prints without a traceback."""


@dataclass(frozen=True, slots=True)
class BootstrapResult:
    user_id: str
    email: str
    created: bool
    enrolment_token: str
    enrolment_expires_at: datetime


async def create_superadmin(
    db: AsyncSession, *, email: str, full_name: str, password: str, force_additional: bool = False
) -> BootstrapResult:
    """Core of the command (commits). Raises ``BootstrapError`` on any refusal."""
    errors = password_strength_errors(password)
    if errors:
        raise BootstrapError("; ".join(errors))
    email = normalize_email(email)
    if "@" not in email or not full_name.strip():
        raise BootstrapError("A valid --email and a non-empty --name are required")
    existing_admin = (
        await db.execute(
            select(User.id).where(
                User.role == UserRole.SUPER_ADMIN,
                User.status == UserStatus.ACTIVE,
                User.deleted_at.is_(None),
            )
        )
    ).first()
    if existing_admin is not None and not force_additional:
        raise BootstrapError(
            "An active super_admin already exists; use the admin console, or pass --force-additional"
        )
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    created = user is None
    if user is None:
        user = User(
            email=email,
            full_name=" ".join(full_name.split())[:200],
            role=UserRole.SUPER_ADMIN,
            status=UserStatus.ACTIVE,
            email_verified_at=datetime.now(UTC),
            is_guest=False,
        )
        db.add(user)
    elif not is_staff(user) or user.deleted_at is not None:
        raise BootstrapError(
            "This email belongs to a non-staff (or deleted) account; use a dedicated staff email address"
        )
    before_role = None if created else str(getattr(user.role, "value", user.role))
    user.role = UserRole.SUPER_ADMIN
    user.status = UserStatus.ACTIVE
    user.password_hash = hash_password(password)
    user.mfa_enabled = False
    user.mfa_secret = None
    user.failed_login_count = 0
    user.locked_until = None
    await db.flush()
    await audit_log(
        db,
        actor=None,
        actor_role="system",
        action="auth.superadmin_bootstrap",
        entity_type="user",
        entity_id=user.id,
        before={"role": before_role} if before_role else None,
        after={"role": UserRole.SUPER_ADMIN.value, "created": created, "force_additional": force_additional},
    )
    await db.commit()
    # reset=True also revokes any existing sessions of a promoted account.
    raw, expires_at = await issue_mfa_enrolment_token(db, None, user.id, None, reset=not created)
    return BootstrapResult(
        user_id=str(user.id),
        email=email,
        created=created,
        enrolment_token=raw,
        enrolment_expires_at=expires_at,
    )


def _read_password(prompt: Callable[[str], str] = getpass.getpass) -> str:
    first = prompt("Password for the super_admin: ")
    second = prompt("Repeat the password: ")
    if first != second:
        raise BootstrapError("The passwords do not match")
    return first


async def _run(args: argparse.Namespace, password: str) -> BootstrapResult:
    from app.core.db import session_scope

    async with session_scope() as db:
        return await create_superadmin(
            db,
            email=args.email,
            full_name=args.name,
            password=password,
            force_additional=args.force_additional,
        )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.create_superadmin", description=__doc__.split("\n")[0]
    )
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True, help="full name")
    parser.add_argument(
        "--force-additional", action="store_true", help="allow creating another super_admin when one exists"
    )
    args = parser.parse_args(argv)
    try:
        password = _read_password()
        result = asyncio.run(_run(args, password))
    except BootstrapError as exc:
        print(f"error: {exc}", file=sys.stderr)  # noqa: T201 - CLI output
        return 2
    action = "Created" if result.created else "Promoted"
    print(  # noqa: T201 - CLI output
        f"{action} super_admin {result.email} (id {result.user_id}).\n\n"
        "Two-factor enrolment (one-time code, valid until "
        f"{result.enrolment_expires_at:%Y-%m-%d %H:%M} UTC):\n\n    {result.enrolment_token}\n\n"
        "1. Open the staff door (/gahi) and sign in with this email and password.\n"
        "2. Enter the enrolment code when asked; scan the QR code / secret with an authenticator app.\n"
        "3. Enter the 6-digit code. The enrolment code then stops working.\n"
        "Keep this code secret; issue codes for other staff from the admin console "
        "(POST /api/v1/auth/staff/mfa/enrolment-token)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
