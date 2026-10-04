"""
Phase 6: Infrastructure Honesty Tests
Verifies that all services and architectural components are audited and honestly classified:
- Redis: Audited as not running, gracefully falling back to SQLite + In-Memory cache.
- Celery: Audited as not running, using Python BackgroundTasks + GitHub Actions cron.
- Vector Engine: Audited as local TF-IDF / BM25 with zero cloud DB lock-in.
- WhatsApp: Marked UNCONFIGURED when credentials are absent.
- Gmail: Marked PENDING_OAUTH when OAuth refresh token is absent.
- Service status matrix includes claimed vs actual status and activation instructions.
"""

import os
import pytest

from backend.autonomous_pipeline import run_job_system_health_check
from backend.gmail_service import check_gmail_oauth_status
from backend.whatsapp_service import check_whatsapp_api_status


def test_gmail_oauth_status_marks_pending_oauth_when_unconfigured(monkeypatch):
    monkeypatch.delenv("GMAIL_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GMAIL_OAUTH_REFRESH_TOKEN", raising=False)

    status = check_gmail_oauth_status()
    assert status["connected"] is False
    assert status["status_label"] == "PENDING_OAUTH"
    assert "PENDING_OAUTH" in status["actual_status"]
    assert "activation_instructions" in status
    assert "GMAIL_OAUTH_CLIENT_ID" in status["activation_instructions"]


def test_whatsapp_status_marks_unconfigured_when_no_credentials(monkeypatch):
    monkeypatch.delenv("WHATSAPP_PHONE_NUMBER_ID", raising=False)
    monkeypatch.delenv("WHATSAPP_API_TOKEN", raising=False)

    status = check_whatsapp_api_status()
    assert status["connected"] is False
    assert status["status_label"] == "UNCONFIGURED"
    assert "UNCONFIGURED" in status["actual_status"]
    assert "activation_instructions" in status
    assert "WHATSAPP_PHONE_NUMBER_ID" in status["activation_instructions"]


def test_system_health_audit_all_services_honesty():
    health = run_job_system_health_check()
    assert health["status"] == "HEALTHY"
    services = health["services"]

    service_names = [s["service"] for s in services]

    # Verify Redis is audited honestly
    redis_service = next((s for s in services if "Cache" in s["service"]), None)
    assert redis_service is not None
    assert "Redis" in redis_service["claimed_legacy"]
    assert "SQLITE" in redis_service["actual_status"]
    assert "REDIS_URL" in redis_service["activation_instructions"]

    # Verify Celery is audited honestly
    celery_service = next((s for s in services if "Task Queue" in s["service"]), None)
    assert celery_service is not None
    assert "Celery" in celery_service["claimed_legacy"]
    assert "PYTHON ASYNC" in celery_service["actual_status"]

    # Verify Vector DB is audited honestly
    vector_service = next((s for s in services if "Vector Search" in s["service"]), None)
    assert vector_service is not None
    assert "Pinecone" in vector_service["claimed_legacy"]
    assert "LOCAL TF-IDF" in vector_service["actual_status"]

    # Verify every service has required honesty fields
    for srv in services:
        assert "service" in srv
        assert "claimed_legacy" in srv
        assert "actual_status" in srv
        assert "activation_instructions" in srv
        assert "classification" in srv
        assert isinstance(srv["connected"], bool)
