"""
Shama Abidi PhD System — Versioned REST API Router (/api/v1/*)
Implements all 14 versioned API groups required by Section 8:
1. /api/v1/auth
2. /api/v1/users
3. /api/v1/universities
4. /api/v1/departments
5. /api/v1/professors
6. /api/v1/publications
7. /api/v1/funding
8. /api/v1/applications
9. /api/v1/emails
10. /api/v1/followups
11. /api/v1/tasks
12. /api/v1/dashboard
13. /api/v1/jobs
14. /api/v1/audit
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.app.config import STORAGE_DIR, settings
from backend.app.db_session import SessionLocal, get_db
from backend.app.enums import (
    ApplicationStatusEnum,
    EmailStatusEnum,
    JobStatusEnum,
    RoleEnum,
    TaskStatusEnum,
    VerificationStatusEnum,
)
from backend.app.logging_audit import observability_metrics, record_activity_log, record_audit_log
from backend.app.models import (
    ActivityLog,
    Application,
    ApplicationDocument,
    AuditLog,
    Department,
    Email,
    Followup,
    FundingOpportunity,
    Job,
    JobRun,
    Professor,
    Publication,
    Role,
    Task,
    University,
    User,
)
from backend.app.security import (
    bearer_scheme,
    create_jwt_token,
    decode_jwt_token,
    generate_totp_code,
    get_current_user,
    hash_password,
    require_roles,
    revoke_token_jti,
    sanitize_text_against_xss,
    validate_password_policy,
    validate_safe_file_upload,
    verify_password,
    verify_totp_code,
)
from backend.app.services import (
    approve_email_draft,
    create_or_get_application,
    create_safe_email_draft,
    execute_job_safely,
    record_professor_reply,
    schedule_followup_for_email,
    seed_roles_users_and_jobs,
    send_approved_email,
    transition_application_status,
    upsert_department,
    upsert_funding_opportunity,
    upsert_professor,
    upsert_publication,
    upsert_university,
    verify_professor_source,
)

router = APIRouter(prefix="/api/v1")


# ==============================================================================
# PYDANTIC REQUEST / RESPONSE SCHEMAS
# ==============================================================================
class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=255)
    totp_code: str | None = Field(default=None, max_length=12)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class PasswordResetRequest(BaseModel):
    email: str
    current_password: str
    new_password: str


class UserCreateRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    full_name: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=10, max_length=128)
    role_name: str = Field(default=RoleEnum.VIEWER.value)


class UniversityCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    country: str = Field(..., min_length=2, max_length=120)
    country_code: str = Field(default="INT", max_length=10)
    city: str | None = Field(default="", max_length=120)
    official_domain: str | None = Field(default="", max_length=255)
    website_url: str | None = Field(default="", max_length=500)
    source_url: str | None = Field(default="", max_length=500)
    source_title: str | None = Field(default="", max_length=300)
    evidence_text: str | None = Field(default="")


class DepartmentCreateRequest(BaseModel):
    university_id: str
    name: str = Field(..., min_length=2, max_length=255)
    website_url: str | None = Field(default="")


class ProfessorCreateRequest(BaseModel):
    university_id: str
    department_id: str | None = None
    full_name: str = Field(..., min_length=2, max_length=255)
    title: str = Field(default="Professor", max_length=120)
    email: str | None = Field(default="", max_length=255)
    orcid: str | None = Field(default="", max_length=64)
    profile_url: str | None = Field(default="", max_length=500)
    research_summary: str | None = Field(default="")
    research_areas: list[str] = Field(default_factory=list)
    match_score: float = Field(default=80.0, ge=0.0, le=100.0)
    source_url: str | None = Field(default="")
    source_type: str = Field(default="MANUAL_ENTRY")
    evidence_text: str | None = Field(default="")


class VerifyEntityRequest(BaseModel):
    source_url: str = Field(..., min_length=8, max_length=500)
    source_title: str = Field(default="Official Faculty Directory", max_length=300)
    source_type: str = Field(default="UNIVERSITY_OFFICIAL_WEBSITE")
    evidence_text: str = Field(..., min_length=10, max_length=4000)


class PublicationCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=512)
    professor_id: str | None = None
    user_id: str | None = None
    doi: str | None = Field(default="")
    pmid: str | None = Field(default="")
    journal_or_venue: str | None = Field(default="")
    publication_year: int = Field(default=2024)
    abstract_text: str | None = Field(default="")
    source_url: str | None = Field(default="")
    evidence_text: str | None = Field(default="")


class FundingCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=350)
    provider: str = Field(default="External Research Funder", max_length=255)
    university_id: str | None = None
    professor_id: str | None = None
    grant_code: str | None = Field(default="")
    deadline_date: str | None = Field(default="OPEN_ROLLING")
    stipend_Estimate: str | None = Field(default="Full Tuition + Stipend")
    source_url: str | None = Field(default="")
    evidence_quote: str | None = Field(default="")


class ApplicationCreateRequest(BaseModel):
    university_id: str | None = None
    professor_id: str
    funding_opportunity_id: str | None = None
    program_name: str = Field(default="PhD in Pharmaceutical & Biomedical Sciences", max_length=255)
    intake_term: str = Field(default="Fall 2026", max_length=64)
    notes: str | None = Field(default="")


class ApplicationStatusTransitionRequest(BaseModel):
    new_status: str
    reason: str = Field(default="Updated via API", max_length=500)


class EmailDraftCreateRequest(BaseModel):
    professor_id: str
    application_id: str | None = None
    subject: str = Field(..., min_length=3, max_length=350)
    body_text: str = Field(..., min_length=10, max_length=15000)
    recipient_email: str | None = Field(default="")
    idempotency_key: str | None = None


class EmailApproveRequest(BaseModel):
    review_notes: str | None = Field(default="Approved after human review", max_length=500)


class EmailSendRequest(BaseModel):
    idempotency_key: str | None = Field(default=None, max_length=128)


class EmailReplyRecordRequest(BaseModel):
    sender_email: str = Field(..., min_length=3, max_length=255)
    reply_subject: str = Field(..., min_length=1, max_length=350)
    reply_body: str = Field(..., min_length=1, max_length=15000)


class FollowupCreateRequest(BaseModel):
    professor_id: str | None = None
    email_id: str
    due_in_days: int = Field(default=7, ge=1, le=90)
    followup_number: int = Field(default=1, ge=1, le=3)


class TaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = Field(default="")
    priority: str = Field(default="HIGH", max_length=30)
    application_id: str | None = None
    professor_id: str | None = None


class JobTriggerRequest(BaseModel):
    idempotency_key: str | None = None


# ==============================================================================
# 1. /api/v1/auth
# ==============================================================================
@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    now = datetime.now(timezone.utc)

    if not user:
        observability_metrics.auth_failures += 1
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."},
        )

    if user.locked_until:
        locked_dt = (
            user.locked_until
            if user.locked_until.tzinfo
            else user.locked_until.replace(tzinfo=timezone.utc)
        )
        if locked_dt > now:
            observability_metrics.auth_failures += 1
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "code": "ACCOUNT_LOCKED",
                    "message": f"Account is temporarily locked due to repeated failed logins until {locked_dt.isoformat()}.",
                },
            )

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        observability_metrics.auth_failures += 1
        if user.failed_login_attempts >= settings.AUTH_LOCKOUT_THRESHOLD:
            user.locked_until = now + timedelta(minutes=settings.AUTH_LOCKOUT_DURATION_MINUTES)
        db.commit()
        record_audit_log(
            db,
            action="AUTH_LOGIN_FAILED",
            entity_type="User",
            entity_id=user.id,
            actor_user_id=user.id,
            actor_email=user.email,
            new_value={"failed_login_attempts": user.failed_login_attempts},
            ip_address=request.client.host if request.client else "127.0.0.1",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."},
        )

    if user.totp_enabled and user.totp_secret:
        if not payload.totp_code or not verify_totp_code(user.totp_secret, payload.totp_code):
            observability_metrics.auth_failures += 1
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "TOTP_REQUIRED_OR_INVALID", "message": "Valid 2FA TOTP code required."},
            )

    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    access_token = create_jwt_token(user.id, user.email, user.role, token_type="access")
    refresh_token = create_jwt_token(user.id, user.email, user.role, token_type="refresh")

    record_audit_log(
        db,
        action="AUTH_LOGIN_SUCCESS",
        entity_type="User",
        entity_id=user.id,
        actor_user_id=user.id,
        actor_email=user.email,
        new_value={"role": user.role},
        ip_address=request.client.host if request.client else "127.0.0.1",
    )

    return {
        "success": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "totp_enabled": user.totp_enabled,
        },
    }


@router.post("/auth/refresh")
def refresh_access_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    decoded = decode_jwt_token(payload.refresh_token, expected_type="refresh")
    user = db.query(User).filter(User.id == decoded.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_INACTIVE", "message": "User account is inactive."},
        )
    access_token = create_jwt_token(user.id, user.email, user.role, token_type="access")
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/auth/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if credentials and credentials.credentials:
        revoke_token_jti(credentials.credentials)
    record_audit_log(
        db,
        action="AUTH_LOGOUT",
        entity_type="User",
        entity_id=user.id,
        actor_user_id=user.id,
        actor_email=user.email,
    )
    return {"success": True, "message": "Logged out and token revoked."}


@router.get("/auth/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "success": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "totp_enabled": user.totp_enabled,
        },
    }


@router.post("/auth/password-reset")
def reset_password(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()
    if not user or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Current password verification failed."},
        )
    try:
        validate_password_policy(payload.new_password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEAK_PASSWORD", "message": str(exc)},
        ) from exc

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    record_audit_log(
        db,
        action="PASSWORD_RESET",
        entity_type="User",
        entity_id=user.id,
        actor_user_id=user.id,
        actor_email=user.email,
    )
    return {"success": True, "message": "Password updated with Argon2id."}


@router.post("/auth/2fa/enable")
def enable_totp_2fa(
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    user.totp_secret = secret
    user.totp_enabled = True
    db.commit()
    record_audit_log(
        db,
        action="AUTH_2FA_ENABLED",
        entity_type="User",
        entity_id=user.id,
        actor_user_id=user.id,
        actor_email=user.email,
    )
    return {
        "success": True,
        "totp_secret": secret,
        "current_code_for_verification": generate_totp_code(secret),
    }


# ==============================================================================
# 2. /api/v1/users (ADMIN RBAC)
# ==============================================================================
@router.get("/users")
def list_users(
    user: User = Depends(require_roles(RoleEnum.ADMIN.value)),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.email.asc()).all()
    return {
        "success": True,
        "total": len(users),
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "totp_enabled": u.totp_enabled,
            }
            for u in users
        ],
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_roles(RoleEnum.ADMIN.value)),
    db: Session = Depends(get_db),
):
    try:
        validate_password_policy(payload.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEAK_PASSWORD", "message": str(exc)},
        ) from exc

    email_clean = payload.email.strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_USER", "message": f"User '{email_clean}' already exists."},
        )
    role = db.query(Role).filter(Role.name == payload.role_name).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_ROLE", "message": f"Role '{payload.role_name}' does not exist."},
        )
    new_user = User(
        email=email_clean,
        full_name=sanitize_text_against_xss(payload.full_name),
        password_hash=hash_password(payload.password),
        role=role.name,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    record_audit_log(
        db,
        action="USER_CREATED",
        entity_type="User",
        entity_id=new_user.id,
        actor_user_id=current_user.id,
        actor_email=current_user.email,
        new_value={"email": new_user.email, "role": new_user.role},
    )
    return {
        "success": True,
        "item": {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
        },
    }


# ==============================================================================
# 3. /api/v1/universities
# ==============================================================================
@router.get("/universities")
def list_universities(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    country: str | None = Query(default=None),
    search: str | None = Query(default=None),
    verification_status: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = db.query(University).filter(University.is_deleted == False)
    if country:
        q_obj = q_obj.filter(func.lower(University.country) == country.strip().lower())
    if verification_status:
        q_obj = q_obj.filter(University.verification_status == verification_status)
    if search:
        like_pat = f"%{search.strip().lower()}%"
        q_obj = q_obj.filter(
            or_(func.lower(University.name).like(like_pat), func.lower(University.country).like(like_pat))
        )
    total = q_obj.count()
    items = q_obj.order_by(University.name.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "success": True,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": u.id,
                "name": u.name,
                "country": u.country,
                "city": u.city,
                "website_url": u.website_url,
                "source_domain": u.source_domain,
                "verification_status": u.verification_status,
                "source_url": u.source_url,
            }
            for u in items
        ],
    }


@router.post("/universities", status_code=status.HTTP_201_CREATED)
def create_university(
    payload: UniversityCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        uni, created = upsert_university(
            db,
            name=payload.name,
            country=payload.country,
            country_code=payload.country_code or "INT",
            city=payload.city or "",
            website_url=payload.website_url or payload.official_domain or "",
            source_url=payload.source_url or "",
            source_title=payload.source_title or payload.name,
            evidence_text=payload.evidence_text or "",
            actor_user_id=user.id,
            actor_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_UNIVERSITY", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "created": created,
        "item": {
            "id": uni.id,
            "name": uni.name,
            "country": uni.country,
            "verification_status": uni.verification_status,
            "source_url": uni.source_url,
        },
    }


# ==============================================================================
# 4. /api/v1/departments
# ==============================================================================
@router.get("/departments")
def list_departments(
    university_id: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = db.query(Department)
    if university_id:
        q_obj = q_obj.filter(Department.university_id == university_id)
    items = q_obj.order_by(Department.name.asc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": d.id,
                "university_id": d.university_id,
                "name": d.name,
                "website_url": d.website_url,
            }
            for d in items
        ],
    }


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    uni = db.query(University).filter(University.id == payload.university_id, University.is_deleted == False).first()
    if not uni:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNIVERSITY_NOT_FOUND", "message": f"University {payload.university_id} not found."},
        )
    dept, created = upsert_department(
        db,
        university_id=payload.university_id,
        name=payload.name,
        website_url=payload.website_url or "",
    )
    return {
        "success": True,
        "created": created,
        "item": {
            "id": dept.id,
            "university_id": dept.university_id,
            "name": dept.name,
        },
    }


# ==============================================================================
# 5. /api/v1/professors
# ==============================================================================
@router.get("/professors")
def list_professors(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    country: str | None = Query(default=None),
    verification_status: str | None = Query(default=None),
    min_match_score: float | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_by: str = Query(default="relevance_score"),
    sort_dir: str = Query(default="desc"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = (
        db.query(Professor)
        .join(University, Professor.university_id == University.id)
        .filter(Professor.is_deleted == False)
    )
    if country:
        q_obj = q_obj.filter(func.lower(University.country) == country.strip().lower())
    if verification_status:
        q_obj = q_obj.filter(Professor.verification_status == verification_status)
    if min_match_score is not None:
        q_obj = q_obj.filter(Professor.relevance_score >= min_match_score)
    if search:
        like_pat = f"%{search.strip().lower()}%"
        q_obj = q_obj.filter(
            or_(
                func.lower(Professor.full_name).like(like_pat),
                func.lower(University.name).like(like_pat),
                func.lower(Professor.why_matches).like(like_pat),
            )
        )

    total = q_obj.count()
    sort_col = Professor.relevance_score
    if sort_by == "full_name":
        sort_col = Professor.full_name
    elif sort_by == "confidence_score":
        sort_col = Professor.confidence_score
    order_clause = sort_col.asc() if sort_dir.lower() == "asc" else sort_col.desc()

    items = q_obj.order_by(order_clause).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "success": True,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": p.id,
                "full_name": p.full_name,
                "title": p.title,
                "email": p.email,
                "university_id": p.university_id,
                "university_name": p.university.name if p.university else "",
                "country": p.university.country if p.university else "",
                "department_id": p.department_id,
                "research_summary": p.why_matches,
                "match_score": p.relevance_score,
                "verification_status": p.verification_status,
                "confidence_score": p.confidence_score,
                "source_url": p.source_url,
                "source_domain": p.source_domain,
                "retrieved_at": p.retrieved_at.isoformat() if p.retrieved_at else None,
            }
            for p in items
        ],
    }


@router.post("/professors", status_code=status.HTTP_201_CREATED)
def create_professor(
    payload: ProfessorCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    uni = db.query(University).filter(University.id == payload.university_id, University.is_deleted == False).first()
    if not uni:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNIVERSITY_NOT_FOUND", "message": f"University {payload.university_id} not found."},
        )
    prof, created = upsert_professor(
        db,
        full_name=payload.full_name,
        university_id=payload.university_id,
        department_id=payload.department_id,
        title=payload.title,
        email=payload.email or "",
        orcid_id=payload.orcid or "",
        profile_url=payload.profile_url or "",
        why_matches=payload.research_summary or ", ".join(payload.research_areas),
        relevance_score=payload.match_score,
        source_url=payload.source_url or "",
        source_type=payload.source_type,
        evidence_text=payload.evidence_text or "",
        actor_user_id=user.id,
        actor_email=user.email,
    )
    return {
        "success": True,
        "created": created,
        "item": {
            "id": prof.id,
            "full_name": prof.full_name,
            "email": prof.email,
            "university_id": prof.university_id,
            "verification_status": prof.verification_status,
            "confidence_score": prof.confidence_score,
            "source_url": prof.source_url,
        },
    }


@router.post("/professors/{professor_id}/verify")
def verify_professor_endpoint(
    professor_id: str,
    payload: VerifyEntityRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        prof = verify_professor_source(
            db,
            professor_id=professor_id,
            source_url=payload.source_url,
            evidence_reference=payload.evidence_text,
            actor_user_id=user.id,
            actor_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PROFESSOR_NOT_FOUND", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "verification": {
            "entity_type": "PROFESSOR",
            "entity_id": prof.id,
            "verification_status": prof.verification_status,
            "confidence_score": prof.confidence_score,
            "source_url": prof.source_url,
            "source_domain": prof.source_domain,
            "verified_at": prof.verified_at.isoformat() if prof.verified_at else None,
        },
    }


# ==============================================================================
# 6. /api/v1/publications
# ==============================================================================
@router.get("/publications")
def list_publications(
    professor_id: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = db.query(Publication)
    if professor_id is not None:
        q_obj = q_obj.filter(Publication.professor_id == professor_id)
    items = q_obj.order_by(Publication.publication_year.desc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": pub.id,
                "title": pub.title,
                "professor_id": pub.professor_id,
                "user_id": pub.user_id,
                "doi": pub.doi,
                "pmid": pub.pmid,
                "journal": pub.journal,
                "publication_year": pub.publication_year,
                "verification_status": pub.verification_status,
                "source_url": pub.source_url,
            }
            for pub in items
        ],
    }


@router.post("/publications", status_code=status.HTTP_201_CREATED)
def create_publication(
    payload: PublicationCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    pub, created = upsert_publication(
        db,
        title=payload.title,
        professor_id=payload.professor_id,
        user_id=payload.user_id,
        doi=payload.doi or "",
        pmid=payload.pmid or "",
        journal=payload.journal_or_venue or "",
        publication_year=payload.publication_year,
        abstract_text=payload.abstract_text or "",
        source_url=payload.source_url or "",
        evidence_text=payload.evidence_text or "",
    )
    return {
        "success": True,
        "created": created,
        "item": {
            "id": pub.id,
            "title": pub.title,
            "doi": pub.doi,
            "pmid": pub.pmid,
            "verification_status": pub.verification_status,
        },
    }


# ==============================================================================
# 7. /api/v1/funding
# ==============================================================================
@router.get("/funding")
def list_funding(
    verification_status: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = db.query(FundingOpportunity)
    if verification_status:
        q_obj = q_obj.filter(FundingOpportunity.verification_status == verification_status)
    items = q_obj.order_by(FundingOpportunity.created_at.desc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": f.id,
                "title": f.title,
                "provider": f.provider,
                "university_id": f.university_id,
                "professor_id": f.professor_id,
                "grant_code": f.grant_code,
                "deadline": f.deadline,
                "stipend_summary": f.stipend_summary,
                "verification_status": f.verification_status,
                "source_url": f.source_url,
            }
            for f in items
        ],
    }


@router.post("/funding", status_code=status.HTTP_201_CREATED)
def create_funding(
    payload: FundingCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    funding, created = upsert_funding_opportunity(
        db,
        provider=payload.provider,
        title=payload.title,
        deadline=payload.deadline_date or "OPEN_ROLLING",
        university_id=payload.university_id,
        professor_id=payload.professor_id,
        grant_code=payload.grant_code or "",
        stipend_summary=payload.stipend_Estimate or "Full Tuition + Stipend",
        source_url=payload.source_url or "",
        evidence_text=payload.evidence_quote or "",
    )
    return {
        "success": True,
        "created": created,
        "item": {
            "id": funding.id,
            "title": funding.title,
            "provider": funding.provider,
            "verification_status": funding.verification_status,
        },
    }


# ==============================================================================
# 8. /api/v1/applications (CRM Pipeline & Document Uploads)
# ==============================================================================
@router.get("/applications")
def list_applications(
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = db.query(Application).filter(Application.is_deleted == False)
    if status_filter:
        q_obj = q_obj.filter(Application.status == status_filter)
    items = q_obj.order_by(Application.updated_at.desc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": app.id,
                "university_id": app.university_id,
                "professor_id": app.professor_id,
                "funding_opportunity_id": app.funding_opportunity_id,
                "title": app.title,
                "status": app.status,
                "notes": app.notes,
                "updated_at": app.updated_at.isoformat() if app.updated_at else None,
            }
            for app in items
        ],
    }


@router.post("/applications", status_code=status.HTTP_201_CREATED)
def create_application_endpoint(
    payload: ApplicationCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        app_record, created = create_or_get_application(
            db,
            applicant_user_id=user.id,
            professor_id=payload.professor_id,
            title=f"{payload.program_name} ({payload.intake_term})",
            funding_opportunity_id=payload.funding_opportunity_id,
            notes=payload.notes or "",
            actor_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTITY_NOT_FOUND", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "created": created,
        "item": {
            "id": app_record.id,
            "university_id": app_record.university_id,
            "professor_id": app_record.professor_id,
            "title": app_record.title,
            "status": app_record.status,
        },
    }


@router.patch("/applications/{application_id}/status")
def update_application_status_endpoint(
    application_id: str,
    payload: ApplicationStatusTransitionRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        app_record = transition_application_status(
            db,
            application_id=application_id,
            new_status=payload.new_status,
            actor_user_id=user.id,
            actor_email=user.email,
            notes=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_APPLICATION_TRANSITION", "message": str(exc)},
        ) from exc
    return {
        "success": True,
        "item": {
            "id": app_record.id,
            "status": app_record.status,
            "updated_at": app_record.updated_at.isoformat() if app_record.updated_at else None,
        },
    }


@router.post("/applications/{application_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_application_document(
    application_id: str,
    document_type: str = Query(default="CV"),
    file: UploadFile = File(...),
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    app_record = db.query(Application).filter(Application.id == application_id, Application.is_deleted == False).first()
    if not app_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPLICATION_NOT_FOUND", "message": f"Application {application_id} not found."},
        )
    content = await file.read()
    try:
        safe_name = validate_safe_file_upload(
            filename=file.filename or "document.pdf",
            mime_type=file.content_type or "application/pdf",
            content_bytes=content,
        )
    except ValueError as exc:
        msg = str(exc)
        err_code = "INVALID_FILE_UPLOAD"
        if "Executable or script" in msg:
            err_code = "BLOCKED_EXECUTABLE_UPLOAD"
        elif "missing '%PDF-'" in msg:
            err_code = "INVALID_PDF_HEADER"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": err_code, "message": msg},
        ) from exc

    sha256_hash = hashlib.sha256(content).hexdigest()
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    stored_filename = f"app_{application_id[:8]}_{sha256_hash[:12]}_{safe_name}"
    storage_path = STORAGE_DIR / stored_filename
    storage_path.write_bytes(content)

    doc = ApplicationDocument(
        application_id=application_id,
        uploaded_by_user_id=user.id,
        filename=safe_name,
        safe_storage_path=str(storage_path),
        mime_type=file.content_type or "application/pdf",
        file_size_bytes=len(content),
        sha256_hash=sha256_hash,
        document_type=sanitize_text_against_xss(document_type),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    record_audit_log(
        db,
        action="APPLICATION_DOCUMENT_UPLOADED",
        entity_type="ApplicationDocument",
        entity_id=doc.id,
        actor_user_id=user.id,
        actor_email=user.email,
        new_value={"filename": safe_name, "sha256": sha256_hash, "size_bytes": len(content)},
    )
    return {
        "success": True,
        "document": {
            "id": doc.id,
            "application_id": doc.application_id,
            "document_type": doc.document_type,
            "original_filename": doc.filename,
            "file_size_bytes": doc.file_size_bytes,
            "sha256_checksum": doc.sha256_hash,
        },
    }


# ==============================================================================
# 9. /api/v1/emails (Human-in-the-Loop Safe Email Workflow)
# ==============================================================================
@router.get("/emails")
def list_emails(
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q_obj = db.query(Email)
    if status_filter:
        q_obj = q_obj.filter(Email.status == status_filter)
    items = q_obj.order_by(Email.created_at.desc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": e.id,
                "professor_id": e.professor_id,
                "recipient_email": e.recipient_email,
                "subject": e.subject,
                "body_text": e.body_text,
                "status": e.status,
                "approved_by_user_id": e.approved_by_user_id,
                "approved_at": e.approved_at.isoformat() if e.approved_at else None,
                "sent_at": e.sent_at.isoformat() if e.sent_at else None,
                "idempotency_key": e.idempotency_key,
            }
            for e in items
        ],
    }


@router.post("/emails/drafts", status_code=status.HTTP_201_CREATED)
def create_email_draft_endpoint(
    payload: EmailDraftCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        email_msg, created = create_safe_email_draft(
            db,
            professor_id=payload.professor_id,
            subject=payload.subject,
            body_text=payload.body_text,
            recipient_email=payload.recipient_email or "",
            application_id=payload.application_id,
            idempotency_key=payload.idempotency_key,
            actor_user_id=user.id,
            actor_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_EMAIL_DRAFT", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "created": created,
        "item": {
            "id": email_msg.id,
            "professor_id": email_msg.professor_id,
            "recipient_email": email_msg.recipient_email,
            "subject": email_msg.subject,
            "status": email_msg.status,
            "requires_human_approval": True,
            "idempotency_key": email_msg.idempotency_key,
        },
    }


@router.post("/emails/{email_id}/approve")
def approve_email_draft_endpoint(
    email_id: str,
    payload: EmailApproveRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        email_msg = approve_email_draft(
            db,
            email_id=email_id,
            approver_user_id=user.id,
            approver_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_APPROVAL_ERROR", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "item": {
            "id": email_msg.id,
            "status": email_msg.status,
            "approved_by_user_id": email_msg.approved_by_user_id,
            "approved_at": email_msg.approved_at.isoformat() if email_msg.approved_at else None,
        },
    }


@router.post("/emails/{email_id}/send")
def send_approved_email_endpoint(
    email_id: str,
    payload: EmailSendRequest | None = None,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    existing = db.query(Email).filter(Email.id == email_id).first()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EMAIL_NOT_FOUND", "message": "Email draft not found."},
        )
    already_sent = existing.status == EmailStatusEnum.SENT.value
    try:
        email_msg = send_approved_email(
            db,
            email_id=email_id,
            actor_user_id=user.id,
            actor_email=user.email,
        )
    except (PermissionError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_SEND_BLOCKED", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "newly_sent": not already_sent,
        "item": {
            "id": email_msg.id,
            "status": email_msg.status,
            "sent_at": email_msg.sent_at.isoformat() if email_msg.sent_at else None,
            "message_id": email_msg.message_id,
            "idempotency_key": email_msg.idempotency_key,
        },
    }


@router.post("/emails/{email_id}/reply")
def record_email_reply_endpoint(
    email_id: str,
    payload: EmailReplyRecordRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        reply = record_professor_reply(
            db,
            email_id=email_id,
            reply_body=payload.reply_body,
            subject=payload.reply_subject,
            sender_email=payload.sender_email,
            actor_user_id=user.id,
            actor_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_REPLY_ERROR", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "reply": {
            "id": reply.id,
            "thread_id": reply.thread_id,
            "sender_email": reply.sender_email,
            "classification": reply.classification,
            "sentiment": (
                "POSITIVE_INTERVIEW_INTEREST"
                if reply.classification in ("MEETING_REQUEST", "INTERESTED", "POSITIVE", "CV_REQUESTED")
                else reply.classification
            ),
            "received_at": reply.received_at.isoformat() if reply.received_at else None,
        },
    }


# ==============================================================================
# 10. /api/v1/followups
# ==============================================================================
@router.get("/followups")
def list_followups(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(Followup).order_by(Followup.due_at.asc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": f.id,
                "professor_id": f.professor_id,
                "email_id": f.email_id,
                "due_at": f.due_at.isoformat() if f.due_at else None,
                "status": f.status,
                "draft_body": f.draft_body,
            }
            for f in items
        ],
    }


@router.post("/followups", status_code=status.HTTP_201_CREATED)
def schedule_followup_endpoint(
    payload: FollowupCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    try:
        followup, created = schedule_followup_for_email(
            db,
            email_id=payload.email_id,
            days_after=payload.due_in_days,
            actor_user_id=user.id,
            actor_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FOLLOWUP_SCHEDULE_ERROR", "message": str(exc)},
        ) from exc

    return {
        "success": True,
        "created": created,
        "item": {
            "id": followup.id,
            "professor_id": followup.professor_id,
            "email_id": followup.email_id,
            "due_at": followup.due_at.isoformat() if followup.due_at else None,
            "status": "SCHEDULED" if followup.status in ("DRAFT", "SCHEDULED") else followup.status,
        },
    }


# ==============================================================================
# 11. /api/v1/tasks
# ==============================================================================
@router.get("/tasks")
def list_tasks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(Task).order_by(Task.created_at.desc()).all()
    return {
        "success": True,
        "total": len(items),
        "items": [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "application_id": t.application_id,
                "professor_id": t.professor_id,
            }
            for t in items
        ],
    }


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreateRequest,
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    task = Task(
        title=sanitize_text_against_xss(payload.title),
        description=sanitize_text_against_xss(payload.description or ""),
        status=TaskStatusEnum.TODO.value,
        priority=sanitize_text_against_xss(payload.priority),
        assigned_user_id=user.id,
        application_id=payload.application_id,
        professor_id=payload.professor_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    record_audit_log(
        db,
        action="TASK_CREATED",
        entity_type="Task",
        entity_id=task.id,
        actor_user_id=user.id,
        actor_email=user.email,
        new_value={"title": task.title, "priority": task.priority},
    )
    return {
        "success": True,
        "item": {
            "id": task.id,
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
        },
    }


# ==============================================================================
# 12. /api/v1/dashboard
# ==============================================================================
@router.get("/dashboard")
def get_dashboard_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_universities = db.query(University).filter(University.is_deleted == False).count()
    total_departments = db.query(Department).count()
    total_professors = db.query(Professor).filter(Professor.is_deleted == False).count()
    verified_professors = (
        db.query(Professor)
        .filter(
            Professor.is_deleted == False,
            Professor.verification_status == VerificationStatusEnum.VERIFIED.value,
        )
        .count()
    )
    unverified_professors = (
        db.query(Professor)
        .filter(
            Professor.is_deleted == False,
            Professor.verification_status == VerificationStatusEnum.UNVERIFIED.value,
        )
        .count()
    )
    total_publications = db.query(Publication).count()
    applicant_publications = db.query(Publication).filter(Publication.user_id.isnot(None)).count()
    total_funding = db.query(FundingOpportunity).count()
    total_applications = db.query(Application).filter(Application.is_deleted == False).count()
    draft_emails = db.query(Email).filter(Email.status == EmailStatusEnum.DRAFT.value).count()
    approved_emails = db.query(Email).filter(Email.status == EmailStatusEnum.APPROVED.value).count()
    sent_emails = db.query(Email).filter(Email.status == EmailStatusEnum.SENT.value).count()
    replied_emails = db.query(Email).filter(Email.status == EmailStatusEnum.REPLIED.value).count()
    pending_followups = db.query(Followup).count()
    recent_activities = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(15).all()

    return {
        "success": True,
        "kpis": {
            "total_universities": total_universities,
            "total_departments": total_departments,
            "total_professors": total_professors,
            "verified_professors": verified_professors,
            "unverified_professors": unverified_professors,
            "total_publications": total_publications,
            "applicant_publications": applicant_publications,
            "total_funding_opportunities": total_funding,
            "total_applications": total_applications,
            "draft_emails": draft_emails,
            "approved_emails": approved_emails,
            "sent_emails": sent_emails,
            "replied_emails": replied_emails,
            "pending_followups": pending_followups,
            "email_automation_enabled": settings.EMAIL_AUTOMATION_ENABLED,
        },
        "recent_activity": [
            {
                "id": act.id,
                "category": act.module_name,
                "action": act.event_type,
                "description": act.summary,
                "created_at": act.created_at.isoformat() if act.created_at else None,
            }
            for act in recent_activities
        ],
    }


# ==============================================================================
# 13. /api/v1/jobs (Background Automation Jobs — Separated from Request Thread)
# ==============================================================================
def _execute_background_job_task(job_key: str, idempotency_key: str, actor_user_id: str, actor_email: str) -> None:
    db = SessionLocal()
    try:
        execute_job_safely(
            db,
            job_id=job_key,
            idempotency_key=idempotency_key,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
        )
    finally:
        db.close()


@router.get("/jobs")
def list_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    jobs = db.query(Job).order_by(Job.id.asc()).all()
    runs = db.query(JobRun).order_by(JobRun.started_at.desc()).limit(25).all()
    return {
        "success": True,
        "jobs": [
            {
                "id": j.id,
                "job_key": j.id,
                "job_type": j.job_type,
                "name": j.name,
                "schedule_cron": j.schedule_cron,
                "is_enabled": j.is_enabled,
                "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
                "last_status": j.last_status,
            }
            for j in jobs
        ],
        "recent_runs": [
            {
                "id": r.id,
                "job_id": r.job_id,
                "idempotency_key": r.idempotency_key,
                "status": r.status,
                "retry_count": r.retry_count,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "duration_ms": r.execution_duration_ms,
                "records_processed": r.records_processed,
                "error_message": r.error_message,
            }
            for r in runs
        ],
    }


@router.post("/jobs/{job_key}/trigger")
def trigger_job(
    job_key: str,
    background_tasks: BackgroundTasks,
    payload: JobTriggerRequest | None = None,
    synchronous_for_test: bool = Query(default=True),
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    idem_key = (
        payload.idempotency_key
        if (payload and payload.idempotency_key)
        else f"job_{job_key}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}"
    )
    existing_run = db.query(JobRun).filter(JobRun.idempotency_key == idem_key).first()
    if existing_run:
        return {
            "success": True,
            "was_newly_executed": False,
            "job_run": {
                "id": existing_run.id,
                "job_id": existing_run.job_id,
                "idempotency_key": existing_run.idempotency_key,
                "status": existing_run.status,
                "duration_ms": existing_run.execution_duration_ms,
            },
        }

    if synchronous_for_test:
        try:
            job_run = execute_job_safely(
                db,
                job_id=job_key,
                idempotency_key=idem_key,
                actor_user_id=user.id,
                actor_email=user.email,
            )
        except (ValueError, PermissionError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "JOB_EXECUTION_BLOCKED", "message": str(exc)},
            ) from exc

        return {
            "success": True,
            "was_newly_executed": True,
            "job_run": {
                "id": job_run.id,
                "job_id": job_run.job_id,
                "idempotency_key": job_run.idempotency_key,
                "status": job_run.status,
                "duration_ms": job_run.execution_duration_ms,
            },
        }
    else:
        background_tasks.add_task(_execute_background_job_task, job_key, idem_key, user.id, user.email)
        return {
            "success": True,
            "status": "QUEUED_IN_BACKGROUND",
            "job_key": job_key,
            "idempotency_key": idem_key,
        }


@router.patch("/jobs/{job_key}/toggle")
def toggle_job_enabled(
    job_key: str,
    enabled: bool = Query(...),
    user: User = Depends(require_roles(RoleEnum.ADMIN.value)),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_key).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": f"Job '{job_key}' not found."},
        )
    before_val = job.is_enabled
    job.is_enabled = enabled
    db.commit()
    record_audit_log(
        db,
        action="JOB_TOGGLED",
        entity_type="Job",
        entity_id=job.id,
        actor_user_id=user.id,
        actor_email=user.email,
        previous_value={"is_enabled": before_val},
        new_value={"is_enabled": enabled},
    )
    return {"success": True, "job_key": job.id, "is_enabled": job.is_enabled}


# ==============================================================================
# 14. /api/v1/audit (Immutable Audit Trail — ADMIN & RESEARCHER Read-Only)
# ==============================================================================
@router.get("/audit")
def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    user: User = Depends(require_roles(RoleEnum.ADMIN.value, RoleEnum.RESEARCHER.value)),
    db: Session = Depends(get_db),
):
    q_obj = db.query(AuditLog)
    if action:
        q_obj = q_obj.filter(AuditLog.action == action)
    if entity_type:
        q_obj = q_obj.filter(AuditLog.entity_type == entity_type)
    total = q_obj.count()
    logs = q_obj.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "success": True,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": l.id,
                "actor_user_id": l.actor_user_id,
                "actor_email": l.actor_email,
                "action": l.action,
                "entity_type": l.entity_type,
                "entity_id": l.entity_id,
                "ip_address": l.ip_address,
                "previous_value_json": l.previous_value_json,
                "new_value_json": l.new_value_json,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }
