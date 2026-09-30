"""
Shama Abidi PhD System — Production FastAPI Application Entry Point
Implements:
- Layered architecture with versioned REST API (/api/v1/*)
- Standardized JSON error envelopes without stack trace leakage (Section 8)
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options), CORS allowlist,
  request size limit, and sliding-window rate limiting middleware (Section 5)
- Structured JSON logging & observability endpoints (/health, /ready, /metrics) (Section 18)
- Backward compatibility for legacy prototype endpoints (/api/state, /api/jobs/run)
"""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
import sys
import time
from typing import Any, Dict, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select, text

from backend.app.api_v1 import router as api_v1_router
from backend.app.config import settings
from backend.app.db_session import SessionLocal, init_orm_schema
from backend.app.logging_audit import emit_structured_log, logger, observability_metrics
from backend.app.models import Professor, University, User
from backend.app.services import seed_roles_users_and_jobs

from autonomous_pipeline import (
    mark_draft_as_manually_sent_and_track_thread,
    run_all_scheduled_jobs,
    run_job_email_draft_generation,
    run_job_followup_detection,
    run_job_funding_and_candidate_verification,
    run_job_gmail_reply_monitoring,
    run_job_professor_matching,
    run_job_research_discovery,
    run_job_system_health_check,
)
from database import (
    export_production_state_snapshot,
    init_database,
    update_setting,
)
from document_processor import (
    delete_research_document,
    ingest_verified_knowledge_base_to_db,
    upload_custom_research_document,
)
from gmail_service import create_gmail_draft

app = FastAPI(
    title="Dr. Shama Abidi — PhD Research & Application Management System",
    version="5.0.0",
    description=(
        "Production-grade PhD research, professor verification, funding provenance, "
        "application CRM, and human-approved email workflow system."
    ),
)

# ==============================================================================
# CORS ALLOWLIST (Section 5)
# ==============================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Idempotency-Key"],
)

# ==============================================================================
# RATE LIMITER STATE & SECURITY MIDDLEWARE (Section 5 & Section 18)
# ==============================================================================
_rate_limit_buckets: dict[str, deque[float]] = defaultdict(deque)
RATE_LIMIT_OVERRIDE_MAX: int | None = None


def reset_rate_limiter() -> None:
    _rate_limit_buckets.clear()


@app.middleware("http")
async def security_and_observability_middleware(request: Request, call_next):
    start_ts = time.perf_counter()

    # 1. Request Size Limit Check (Default 10 MB max for uploads)
    max_bytes = settings.MAX_UPLOAD_SIZE_BYTES
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > max_bytes:
        observability_metrics.record_request(0.0, 413)
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "success": False,
                "error": {
                    "code": "PAYLOAD_TOO_LARGE",
                    "message": f"Request payload exceeds maximum limit of {max_bytes} bytes.",
                    "details": {"max_bytes": max_bytes},
                },
            },
        )

    # 2. Sliding-Window Rate Limiting (60-second window per client IP)
    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time.monotonic()
    limit = RATE_LIMIT_OVERRIDE_MAX if RATE_LIMIT_OVERRIDE_MAX is not None else settings.RATE_LIMIT_PER_MINUTE
    bucket = _rate_limit_buckets[client_ip]
    while bucket and (now - bucket[0]) > 60.0:
        bucket.popleft()
    if len(bucket) >= limit:
        observability_metrics.record_request(0.0, 429)
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "success": False,
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please slow down and retry later.",
                    "details": {"limit_per_minute": limit},
                },
            },
        )
    bucket.append(now)

    # 3. Execute Request
    response = await call_next(request)

    # 4. Inject Production Security Headers (Section 5)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.openalex.org https://aspnetaptech-cyber.github.io;"
    )

    elapsed_ms = (time.perf_counter() - start_ts) * 1000.0
    response.headers["X-Response-Time-Ms"] = str(int(elapsed_ms))
    observability_metrics.record_request(elapsed_ms, response.status_code)
    return response


# ==============================================================================
# STANDARDIZED ERROR HANDLERS (Section 8 — Never Leak Stack Traces)
# ==============================================================================
@app.exception_handler(HTTPException)
async def standardized_http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", f"HTTP_{exc.status_code}")
        message = detail.get("message", "Request error")
        extra_details = {k: v for k, v in detail.items() if k not in ("code", "message")}
    else:
        code = f"HTTP_{exc.status_code}"
        message = str(detail)
        extra_details = {}

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": code,
                "message": message,
                "details": extra_details,
            },
        },
    )


@app.exception_handler(RequestValidationError)
async def standardized_validation_exception_handler(request: Request, exc: RequestValidationError):
    sanitized_errors = []
    for err in exc.errors():
        sanitized_errors.append(
            {
                "loc": [str(x) for x in err.get("loc", [])],
                "msg": err.get("msg", "Invalid value"),
                "type": err.get("type", "validation_error"),
            }
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request payload validation failed.",
                "details": {"fields": sanitized_errors},
            },
        },
    )


@app.exception_handler(Exception)
async def standardized_unhandled_exception_handler(request: Request, exc: Exception):
    emit_structured_log(
        event="UNHANDLED_SERVER_ERROR",
        endpoint=request.url.path,
        status_code=500,
        error_type=type(exc).__name__,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected internal error occurred. Reference logs for details.",
                "details": {},
            },
        },
    )


# Mount the 14 versioned /api/v1/* endpoints
app.include_router(api_v1_router)


# ==============================================================================
# HEALTH, READINESS & OBSERVABILITY METRICS (Section 18)
# ==============================================================================
@app.on_event("startup")
def on_startup() -> None:
    init_orm_schema()
    db = SessionLocal()
    try:
        seed_roles_users_and_jobs(db)
    finally:
        db.close()
    init_database()


@app.get("/health")
@app.get("/api/health")
@app.get("/api/v1/health")
def health_endpoint() -> Dict[str, Any]:
    return {
        "success": True,
        "status": "healthy",
        "version": "5.0.0",
        "environment": settings.ENVIRONMENT,
        "email_automation_enabled": settings.EMAIL_AUTOMATION_ENABLED,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready")
@app.get("/api/v1/ready")
def readiness_endpoint() -> Dict[str, Any]:
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        uni_count = db.scalar(select(func.count(University.id))) or 0
        prof_count = db.scalar(select(func.count(Professor.id))) or 0
        user_count = db.scalar(select(func.count(User.id))) or 0
        return {
            "success": True,
            "status": "ready",
            "database_connected": True,
            "counts": {
                "users": user_count,
                "universities": uni_count,
                "professors": prof_count,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()


@app.get("/metrics")
@app.get("/api/v1/metrics")
def metrics_endpoint() -> Dict[str, Any]:
    return {
        "success": True,
        "metrics": observability_metrics.snapshot(),
    }


# ==============================================================================
# BACKWARD-COMPATIBLE PROTOTYPE ENDPOINTS
# ==============================================================================
class DocumentUploadPayload(BaseModel):
    filename: str
    title: str
    extracted_text: str
    document_type: str = "PUBLICATION_PDF"
    publication_year: int = 2025
    journal_or_venue: str = "Uploaded Research Document"
    doi: str = ""
    page_count: int = 1


class JobRunPayload(BaseModel):
    job_id: str = "ALL"


class SettingUpdatePayload(BaseModel):
    setting_key: str
    setting_value: str
    description: Optional[str] = None


class DraftComposePayload(BaseModel):
    recipient_email: str
    subject: str
    body_text: str


@app.get("/api/state")
@app.get("/api/v1/state")
def get_full_crm_state() -> Dict[str, Any]:
    init_database()
    snapshot = export_production_state_snapshot()
    health = run_job_system_health_check()
    snapshot["service_health_matrix"] = health["services"]
    return snapshot


@app.post("/api/documents/upload")
@app.post("/api/v1/knowledge-base/upload")
def upload_document_endpoint(payload: DocumentUploadPayload) -> Dict[str, Any]:
    res = upload_custom_research_document(
        filename=payload.filename,
        title=payload.title,
        extracted_text=payload.extracted_text,
        document_type=payload.document_type,
        publication_year=payload.publication_year,
        journal_or_venue=payload.journal_or_venue,
        doi=payload.doi,
        page_count=payload.page_count,
    )
    run_job_professor_matching()
    snapshot = export_production_state_snapshot()
    return {"result": res, "state": snapshot}


@app.delete("/api/documents/{doc_id}")
def delete_document_endpoint(doc_id: str) -> Dict[str, Any]:
    res = delete_research_document(doc_id)
    snapshot = export_production_state_snapshot()
    return {"result": res, "state": snapshot}


@app.post("/api/documents/reprocess")
@app.post("/api/v1/knowledge-base/ingest")
def reprocess_knowledge_base_endpoint() -> Dict[str, Any]:
    res = ingest_verified_knowledge_base_to_db(force_reprocess=True)
    run_job_professor_matching()
    snapshot = export_production_state_snapshot()
    return {"result": res, "state": snapshot}


@app.post("/api/jobs/run")
@app.post("/api/v1/worker/run-openalex")
def trigger_scheduled_job(payload: Optional[JobRunPayload] = None) -> Dict[str, Any]:
    job_id = payload.job_id if payload else "ALL"
    init_database()
    if job_id == "job_research_discovery":
        res = run_job_research_discovery()
    elif job_id == "job_professor_matching":
        res = run_job_professor_matching()
    elif job_id == "job_funding_verification":
        res = run_job_funding_and_candidate_verification()
    elif job_id == "job_email_draft_generation":
        res = run_job_email_draft_generation()
    elif job_id == "job_gmail_reply_monitoring":
        res = run_job_gmail_reply_monitoring()
    elif job_id == "job_followup_detection":
        res = run_job_followup_detection()
    elif job_id == "job_system_health_check":
        res = run_job_system_health_check()
    else:
        res = run_all_scheduled_jobs()

    snapshot = export_production_state_snapshot()
    return {"job_id": job_id, "execution_result": res, "state": snapshot}


@app.post("/api/drafts/{draft_id}/mark-sent")
def mark_draft_sent_endpoint(draft_id: str) -> Dict[str, Any]:
    try:
        res = mark_draft_as_manually_sent_and_track_thread(draft_id)
        snapshot = export_production_state_snapshot()
        return {"result": res, "state": snapshot}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/drafts/create-gmail")
def create_gmail_draft_endpoint(payload: DraftComposePayload) -> Dict[str, Any]:
    return create_gmail_draft(
        recipient_email=payload.recipient_email,
        subject=payload.subject,
        body_text=payload.body_text,
    )


@app.post("/api/settings/update")
def update_settings_endpoint(payload: SettingUpdatePayload) -> Dict[str, Any]:
    if payload.setting_key in ("initial_email_auto_send", "followup_email_auto_send", "professor_reply_auto_send"):
        update_setting(payload.setting_key, "DISABLED", payload.description)
    else:
        update_setting(payload.setting_key, payload.setting_value, payload.description)
    snapshot = export_production_state_snapshot()
    return {"status": "UPDATED", "state": snapshot}
