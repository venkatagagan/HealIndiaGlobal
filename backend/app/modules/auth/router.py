"""HTTP routes for the auth module (PLAN 8.1). Paths are written in full; the router has no prefix.

Web vs mobile (PLAN 3): web clients get the refresh token as the httpOnly ``hig_refresh`` cookie
(Path ``/api/v1/auth``, SameSite=Strict, Secure when ``COOKIE_SECURE``); mobile clients send
``X-Client-Type: mobile`` and receive ``refresh_token`` in the body. Refresh/logout that rely on the cookie
require ``X-Requested-With: XMLHttpRequest`` (CSRF defence).

Staff door (PLAN 3.1): ``/auth/staff/*`` is web-only (``X-Client-Type: mobile`` gets the generic 401), uses
the ``hig_staff_refresh`` cookie (Path ``/api/v1/auth/staff``) and honours ``STAFF_ALLOWED_IPS``.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, ensure_staff_ip_allowed, require_roles
from app.core.enums import AuthPortal, ConsentKind, UserRole
from app.core.errors import AppError, Forbidden, Unauthorized
from app.core.rate_limit import rate_limit
from app.core.security import decode_access_token
from app.models import User
from app.modules.auth import service
from app.modules.auth.schemas import (
    AcceptInviteIn,
    AccountDeleteIn,
    AppleIn,
    ChangePasswordIn,
    ConsentIn,
    ConsentOut,
    DeletionPolicyOut,
    DeletionRequestIn,
    DeletionRequestOut,
    DeviceIn,
    EmailIn,
    GoogleIn,
    GuestUpgradeIn,
    LoginIn,
    MeUpdateIn,
    MfaCodeIn,
    MfaEnrolmentTokenOut,
    MfaSetupOut,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    StaffLoginIn,
    StaffUserIn,
    TokenIn,
    TokenOut,
    UserOut,
)

router = APIRouter(tags=["auth"])

_optional_bearer = HTTPBearer(auto_error=False)


# --- helpers ---------------------------------------------------------------------------------------------
def is_mobile_client(request: Request) -> bool:
    return request.headers.get("x-client-type", "").strip().lower() == "mobile"


def _require_xhr(request: Request) -> None:
    if request.headers.get("x-requested-with", "").strip().lower() != "xmlhttprequest":
        raise Forbidden("Missing X-Requested-With header", code="csrf_check_failed")


def _cookie_name_path(portal: AuthPortal) -> tuple[str, str]:
    if portal == AuthPortal.STAFF:
        return service.STAFF_REFRESH_COOKIE_NAME, service.STAFF_REFRESH_COOKIE_PATH
    return service.REFRESH_COOKIE_NAME, service.REFRESH_COOKIE_PATH


def _cookie_domain(portal: AuthPortal) -> str | None:
    """SEC-022: the staff refresh cookie is always host-only (never shared with sibling sub-domains)."""
    return None if portal == AuthPortal.STAFF else settings.COOKIE_DOMAIN


def set_refresh_cookie(response: Response, raw_token: str, portal: AuthPortal = AuthPortal.PUBLIC) -> None:
    name, path = _cookie_name_path(portal)
    response.set_cookie(
        key=name,
        value=raw_token,
        max_age=int(service.refresh_ttl(portal).total_seconds()),
        path=path,
        domain=_cookie_domain(portal),
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite="strict",
    )


def clear_refresh_cookie(response: Response, portal: AuthPortal = AuthPortal.PUBLIC) -> None:
    name, path = _cookie_name_path(portal)
    response.delete_cookie(
        key=name,
        path=path,
        domain=_cookie_domain(portal),
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite="strict",
    )


async def _token_out(
    db: DbSession, request: Request, response: Response, issued: service.IssuedSession, *, body_token: bool
) -> TokenOut:
    user_out = await service.build_user_out(db, issued.user)
    # The staff door is web-only: its refresh token never leaves the httpOnly cookie.
    staff = issued.portal == AuthPortal.STAFF
    deliver_in_body = not staff and (body_token or is_mobile_client(request))
    if not deliver_in_body:
        set_refresh_cookie(response, issued.refresh_token, issued.portal)
    response.headers["Cache-Control"] = "no-store"
    return TokenOut(
        access_token=issued.access_token,
        expires_in=issued.expires_in,
        refresh_token=issued.refresh_token if deliver_in_body else None,
        user=user_out,
    )


def _current_family(request: Request) -> uuid.UUID | None:
    return service.token_claims_family(getattr(request.state, "token_payload", None))


# --- registration / sign-in ------------------------------------------------------------------------------
@router.post(
    "/auth/register",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenOut,
    response_model_exclude_none=False,
    dependencies=[Depends(rate_limit("auth.register", 5, 60))],
)
async def register(body: RegisterIn, request: Request, response: Response, db: DbSession) -> TokenOut:
    issued = await service.register(db, body, request)
    return await _token_out(db, request, response, issued, body_token=False)


@router.post("/auth/login", response_model=TokenOut, dependencies=[Depends(rate_limit("auth.login", 10, 60))])
async def login(body: LoginIn, request: Request, response: Response, db: DbSession) -> TokenOut:
    issued = await service.login(db, str(body.email), body.password, body.otp_code, request)
    return await _token_out(db, request, response, issued, body_token=False)


@router.post(
    "/auth/google", response_model=TokenOut, dependencies=[Depends(rate_limit("auth.google", 10, 60))]
)
async def google(body: GoogleIn, request: Request, response: Response, db: DbSession) -> TokenOut:
    issued, created = await service.google_sign_in(db, body, request)
    if created:
        response.status_code = status.HTTP_201_CREATED
    return await _token_out(db, request, response, issued, body_token=False)


@router.post("/auth/apple", response_model=TokenOut, dependencies=[Depends(rate_limit("auth.apple", 10, 60))])
async def apple(body: AppleIn, request: Request, response: Response, db: DbSession) -> TokenOut:
    issued, created = await service.apple_sign_in(db, body, request)
    if created:
        response.status_code = status.HTTP_201_CREATED
    return await _token_out(db, request, response, issued, body_token=False)


@router.post(
    "/auth/guest",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenOut,
    dependencies=[Depends(rate_limit("auth.guest", 10, 60))],
)
async def guest(
    request: Request,
    response: Response,
    db: DbSession,
    _body: Annotated[dict[str, Any] | None, Body()] = None,
) -> TokenOut:
    issued = await service.create_guest(db, request)
    return await _token_out(db, request, response, issued, body_token=False)


@router.post(
    "/auth/guest/upgrade",
    response_model=TokenOut,
    dependencies=[Depends(rate_limit("auth.guest_upgrade", 5, 60, key="user"))],
)
async def guest_upgrade(
    body: GuestUpgradeIn, request: Request, response: Response, db: DbSession, user: CurrentUser
) -> TokenOut:
    issued = await service.upgrade_guest(db, user, body, request, _current_family(request))
    return await _token_out(db, request, response, issued, body_token=False)


@router.post(
    "/auth/refresh", response_model=TokenOut, dependencies=[Depends(rate_limit("auth.refresh", 60, 60))]
)
async def refresh(
    request: Request,
    response: Response,
    db: DbSession,
    body: Annotated[RefreshIn | None, Body()] = None,
) -> TokenOut:
    raw = body.refresh_token if body is not None and body.refresh_token else None
    from_body = raw is not None
    if raw is None:
        raw = request.cookies.get(service.REFRESH_COOKIE_NAME)
        if not raw:
            raise Unauthorized("No active session", code="invalid_refresh_token")
        _require_xhr(request)
    try:
        issued = await service.refresh(db, raw, request, AuthPortal.PUBLIC)
    except AppError as exc:
        if not from_body and exc.status_code == 401:
            exc.headers["Set-Cookie"] = _expired_cookie_header()
        raise
    return await _token_out(db, request, response, issued, body_token=from_body)


def _expired_cookie_header(portal: AuthPortal = AuthPortal.PUBLIC) -> str:
    probe = Response()
    clear_refresh_cookie(probe, portal)
    return probe.headers["set-cookie"]


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def logout(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
    body: Annotated[RefreshIn | None, Body()] = None,
) -> Response:
    raw = body.refresh_token if body is not None and body.refresh_token else None
    if raw is None:
        cookie = request.cookies.get(service.REFRESH_COOKIE_NAME)
        if cookie:
            _require_xhr(request)
            raw = cookie
    actor: User | None = None
    family: uuid.UUID | None = None
    if credentials is not None and credentials.credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            actor = await db.get(User, uuid.UUID(str(payload["sub"])))
            family = service.token_claims_family(payload)
        except AppError:
            actor, family = None, None
    if actor is None and raw is None:
        raise Unauthorized("Authentication required")
    await service.logout(
        db, raw_refresh=raw, session_family=family, actor=actor, request=request, portal=AuthPortal.PUBLIC
    )
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(response)
    return response


# --- me --------------------------------------------------------------------------------------------------
@router.get("/auth/me", response_model=UserOut)
async def get_me(db: DbSession, user: CurrentUser) -> UserOut:
    return await service.build_user_out(db, user)


@router.patch("/auth/me", response_model=UserOut)
async def patch_me(body: MeUpdateIn, request: Request, db: DbSession, user: CurrentUser) -> UserOut:
    updated = await service.update_me(db, user, body, request)
    return await service.build_user_out(db, updated)


@router.post(
    "/auth/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.change_password", 5, 60, key="user"))],
)
async def change_password(
    body: ChangePasswordIn, request: Request, db: DbSession, user: CurrentUser
) -> Response:
    await service.change_password(
        db, user, body.current_password, body.new_password, request, _current_family(request)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- email verification / password reset -----------------------------------------------------------------
@router.post(
    "/auth/verify-email",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.verify_email", 10, 60))],
)
async def verify_email(body: TokenIn, request: Request, db: DbSession) -> Response:
    await service.verify_email(db, body.token, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/auth/resend-verification",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.resend_verification", 3, 60, key="user"))],
)
async def resend_verification(db: DbSession, user: CurrentUser) -> Response:
    await service.resend_verification(db, user)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/auth/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.forgot_password", 3, 60))],
)
async def forgot_password(body: EmailIn, request: Request, db: DbSession) -> Response:
    await service.forgot_password(db, str(body.email), request)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/auth/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.reset_password", 10, 60))],
)
async def reset_password(body: ResetPasswordIn, request: Request, db: DbSession) -> Response:
    await service.reset_password(db, body.token, body.new_password, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- MFA -------------------------------------------------------------------------------------------------
@router.post(
    "/auth/mfa/setup",
    response_model=MfaSetupOut,
    dependencies=[Depends(rate_limit("auth.mfa_setup", 10, 60, key="user"))],
)
async def mfa_setup(request: Request, db: DbSession, user: CurrentUser) -> MfaSetupOut:
    secret, url = await service.mfa_setup(db, user, request)
    return MfaSetupOut(secret=secret, otpauth_url=url)


@router.post(
    "/auth/mfa/enable",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.mfa_verify", 10, 60, key="user"))],
)
async def mfa_enable(body: MfaCodeIn, request: Request, db: DbSession, user: CurrentUser) -> Response:
    await service.mfa_enable(db, user, body.code, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/auth/mfa/disable",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.mfa_verify", 10, 60, key="user"))],
)
async def mfa_disable(body: MfaCodeIn, request: Request, db: DbSession, user: CurrentUser) -> Response:
    await service.mfa_disable(db, user, body.code, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- devices / consents ----------------------------------------------------------------------------------
@router.post(
    "/auth/devices",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.devices", 30, 60, key="user"))],
)
async def register_device(body: DeviceIn, db: DbSession, user: CurrentUser) -> Response:
    await service.register_device(db, user, body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/auth/devices", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def remove_device(
    db: DbSession, user: CurrentUser, token: Annotated[str, Query(min_length=8, max_length=512)]
) -> Response:
    await service.remove_device(db, user, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/auth/consents", status_code=status.HTTP_201_CREATED, response_model=ConsentOut)
async def add_consent(body: ConsentIn, request: Request, db: DbSession, user: CurrentUser) -> ConsentOut:
    row = await service.add_consent(db, user, body, request)
    return ConsentOut.model_validate(row)


@router.get("/auth/consents", response_model=list[ConsentOut])
async def list_consents(
    db: DbSession, user: CurrentUser, history: Annotated[bool, Query()] = False
) -> list[ConsentOut]:
    rows = await service.list_consents(db, user, history=history)
    return [ConsentOut.model_validate(r) for r in rows]


@router.get("/auth/consents/versions", response_model=dict[ConsentKind, str])
async def consent_versions() -> dict[ConsentKind, str]:
    """Current version of each versioned legal text; agreements must be accepted at exactly this version."""
    return dict(service.CONSENT_VERSIONS)


# --- invites / account deletion --------------------------------------------------------------------------
@router.post(
    "/auth/accept-invite",
    response_model=TokenOut,
    dependencies=[Depends(rate_limit("auth.accept_invite", 10, 60))],
)
async def accept_invite(
    body: AcceptInviteIn, request: Request, response: Response, db: DbSession
) -> TokenOut:
    issued = await service.accept_invite(db, body, request)
    return await _token_out(db, request, response, issued, body_token=False)


@router.get("/auth/me/deletion-policy", response_model=DeletionPolicyOut)
async def deletion_policy(_user: CurrentUser) -> DeletionPolicyOut:
    """What account deletion keeps (statutory retention) - shown before the user confirms."""
    return DeletionPolicyOut(retained=list(service.RETENTION_RULES))


@router.post(
    "/auth/me/deletion-request",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DeletionRequestOut,
    dependencies=[Depends(rate_limit("auth.deletion_request", 3, 3600, key="user"))],
)
async def deletion_request(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    body: Annotated[DeletionRequestIn | None, Body()] = None,
) -> DeletionRequestOut:
    """Ask support to delete the account after ``DELETE /auth/me`` answered 409 (deletion blocked)."""
    entry = await service.request_account_deletion(db, user, body or DeletionRequestIn(), request)
    return DeletionRequestOut(id=entry.id, created_at=entry.created_at)


@router.delete(
    "/auth/me",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(rate_limit("auth.delete_account", 5, 300, key="user"))],
)
async def delete_me(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    body: Annotated[AccountDeleteIn | None, Body()] = None,
) -> Response:
    """Erase the account (App Store / Play requirement). Body ``{password?, reason?, otp_code?}``; password
    is required when the account has one. All sessions are revoked; see ``/auth/me/deletion-policy``."""
    await service.delete_account(db, user, body or AccountDeleteIn(), request)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(response)
    return response


# --- staff door (PLAN 3.1) -------------------------------------------------------------------------------
async def staff_door_guard(request: Request) -> None:
    """Web-only door: mobile clients get the generic 401; ``STAFF_ALLOWED_IPS`` is enforced."""
    if is_mobile_client(request):
        raise Unauthorized(service.GENERIC_LOGIN_ERROR, code="invalid_credentials")
    ensure_staff_ip_allowed(request)
    expected = (settings.STAFF_CONSOLE_ORIGIN or "").strip().rstrip("/").lower()
    if expected:
        # SEC-022: with a separate console origin, a script on the public site or a portal (same site,
        # another origin) cannot drive the staff door, even though the browser would attach the cookie.
        origin = request.headers.get("origin", "").strip().rstrip("/").lower()
        if origin != expected:
            raise Forbidden("This request is not allowed from here", code="staff_origin_mismatch")


@router.post(
    "/auth/staff/login",
    response_model=TokenOut,
    dependencies=[Depends(staff_door_guard), Depends(rate_limit("auth.staff_login", 5, 60))],
)
async def staff_login(body: StaffLoginIn, request: Request, response: Response, db: DbSession) -> TokenOut:
    issued = await service.staff_login(
        db, str(body.email), body.password, body.otp_code, body.enrolment_token, request
    )
    return await _token_out(db, request, response, issued, body_token=False)


@router.post(
    "/auth/staff/refresh",
    response_model=TokenOut,
    dependencies=[Depends(staff_door_guard), Depends(rate_limit("auth.staff_refresh", 30, 60))],
)
async def staff_refresh(request: Request, response: Response, db: DbSession) -> TokenOut:
    raw = request.cookies.get(service.STAFF_REFRESH_COOKIE_NAME)
    if not raw:
        raise Unauthorized("No active session", code="invalid_refresh_token")
    _require_xhr(request)
    try:
        issued = await service.refresh(db, raw, request, AuthPortal.STAFF)
    except AppError as exc:
        if exc.status_code == 401:
            exc.headers["Set-Cookie"] = _expired_cookie_header(AuthPortal.STAFF)
        raise
    return await _token_out(db, request, response, issued, body_token=False)


@router.post(
    "/auth/staff/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(staff_door_guard)],
)
async def staff_logout(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
) -> Response:
    raw = request.cookies.get(service.STAFF_REFRESH_COOKIE_NAME)
    if raw:
        _require_xhr(request)
    actor: User | None = None
    family: uuid.UUID | None = None
    if credentials is not None and credentials.credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            actor = await db.get(User, uuid.UUID(str(payload["sub"])))
            family = service.token_claims_family(payload)
        except AppError:
            actor, family = None, None
    if actor is None and not raw:
        raise Unauthorized("Authentication required")
    await service.logout(
        db, raw_refresh=raw, session_family=family, actor=actor, request=request, portal=AuthPortal.STAFF
    )
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(response, AuthPortal.STAFF)
    return response


_SuperAdmin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]


@router.post(
    "/auth/staff/mfa/enrolment-token",
    status_code=status.HTTP_201_CREATED,
    response_model=MfaEnrolmentTokenOut,
    dependencies=[Depends(staff_door_guard)],
)
async def staff_mfa_enrolment_token(
    body: StaffUserIn, request: Request, response: Response, db: DbSession, actor: _SuperAdmin
) -> MfaEnrolmentTokenOut:
    """super_admin: one-time MFA enrolment code for a staff user who has no authenticator yet."""
    raw, expires_at = await service.issue_mfa_enrolment_token(db, actor, body.user_id, request)
    response.headers["Cache-Control"] = "no-store"
    return MfaEnrolmentTokenOut(user_id=body.user_id, enrolment_token=raw, expires_at=expires_at)


@router.post(
    "/auth/staff/mfa/reset",
    response_model=MfaEnrolmentTokenOut,
    dependencies=[Depends(staff_door_guard)],
)
async def staff_mfa_reset(
    body: StaffUserIn, request: Request, response: Response, db: DbSession, actor: _SuperAdmin
) -> MfaEnrolmentTokenOut:
    """super_admin: remove a staff user's authenticator (lost device), sign them out everywhere and return the
    one-time enrolment code they need to set up a new one."""
    raw, expires_at = await service.issue_mfa_enrolment_token(db, actor, body.user_id, request, reset=True)
    response.headers["Cache-Control"] = "no-store"
    return MfaEnrolmentTokenOut(user_id=body.user_id, enrolment_token=raw, expires_at=expires_at)
