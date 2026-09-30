"""
Shama Abidi PhD System — Structured Logging, Immutable Audit Trail & Observability (`backend/app/logging_audit.py`)
Implements Section 16 (Structured Logging), Section 17 (Audit Log), and Section 31 (Observability).
"""

from datetime import datetime, timezone
import json
import logging
import re
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from backend.app.models import ActivityLog, AuditLog


SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "secret",
    "secret_key",
    "jwt_secret",
    "token",
    "access_token",
    "refresh_token",
    "api_key",
    "authorization",
    "totp_secret",
}

logger = logging.getLogger("shama_phd_production")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class ObservabilityMetrics:
    """In-memory + DB-backed observability counters for Section 31 Production Monitoring."""

    def __init__(self) -> None:
        self.total_requests: int = 0
        self.api_errors: int = 0
        self.database_errors: int = 0
        self.job_failures: int = 0
        self.email_failures: int = 0
        self.auth_failures: int = 0
        self.external_api_failures: int = 0
        self.response_times_ms: list[float] = []

    def record_request(self, duration_ms: float, status_code: int) -> None:
        self.total_requests += 1
        self.response_times_ms.append(round(duration_ms, 2))
        if len(self.response_times_ms) > 500:
            self.response_times_ms = self.response_times_ms[-500:]
        if status_code >= 500:
            self.api_errors += 1

    def snapshot(self) -> Dict[str, Any]:
        avg_ms = (
            round(sum(self.response_times_ms) / len(self.response_times_ms), 2)
            if self.response_times_ms
            else 0.0
        )
        return {
            "total_requests": self.total_requests,
            "avg_response_time_ms": avg_ms,
            "api_errors": self.api_errors,
            "database_errors": self.database_errors,
            "job_failures": self.job_failures,
            "email_failures": self.email_failures,
            "auth_failures": self.auth_failures,
            "external_api_failures": self.external_api_failures,
        }


observability_metrics = ObservabilityMetrics()


def redact_sensitive_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively redacts passwords, tokens, API keys, and secrets from logs."""
    redacted: Dict[str, Any] = {}
    for k, v in (data or {}).items():
        if any(sk in k.lower() for sk in SENSITIVE_KEYS):
            redacted[k] = "***REDACTED***"
        elif isinstance(v, dict):
            redacted[k] = redact_sensitive_dict(v)
        elif isinstance(v, str) and len(v) > 20 and ("Bearer " in v or "sk-or-" in v):
            redacted[k] = "***REDACTED***"
        else:
            redacted[k] = v
    return redacted


def emit_structured_log(
    event: str,
    request_id: str = "",
    user_id: Optional[str] = None,
    endpoint: str = "",
    status_code: int = 200,
    duration_ms: float = 0.0,
    job_id: Optional[str] = None,
    error_type: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Outputs a structured JSON log line with sensitive fields redacted."""
    entry: Dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "request_id": request_id,
        "user_id": user_id,
        "endpoint": endpoint,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
        "job_id": job_id,
        "error_type": error_type,
    }
    if extra:
        entry["details"] = redact_sensitive_dict(extra)
    logger.info(json.dumps(entry, ensure_ascii=False))
    return entry


def record_audit_log(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: str = "",
    actor_user_id: Optional[str] = None,
    actor_email: str = "SYSTEM",
    previous_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None,
    ip_address: str = "127.0.0.1",
    request_id: str = "",
) -> AuditLog:
    """
    Section 17: Writes an immutable audit log record tracking who performed an action,
    what changed, previous value, new value, timestamp, and IP/request metadata.
    """
    safe_prev = redact_sensitive_dict(previous_value or {})
    safe_new = redact_sensitive_dict(new_value or {})

    audit = AuditLog(
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id or ""),
        previous_value_json=json.dumps(safe_prev, ensure_ascii=False, default=str),
        new_value_json=json.dumps(safe_new, ensure_ascii=False, default=str),
        ip_address=ip_address,
        request_id=request_id,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


def record_activity_log(
    db: Session,
    event_type: str,
    module_name: str,
    actor: str,
    summary: str,
    details: Optional[Dict[str, Any]] = None,
) -> ActivityLog:
    act = ActivityLog(
        event_type=event_type,
        module_name=module_name,
        actor=actor,
        summary=summary,
        details_json=json.dumps(redact_sensitive_dict(details or {}), ensure_ascii=False, default=str),
    )
    db.add(act)
    db.commit()
    db.refresh(act)
    return act
