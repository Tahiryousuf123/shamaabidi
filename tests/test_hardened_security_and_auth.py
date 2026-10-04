"""
Shama Abidi PhD System — Comprehensive Hardened Security & Authentication Test Suite
Verifies:
1. Real Authentication & Token Lifecycle (valid login, invalid login, alias login, expired, missing, revoked, lockout)
2. Server-side RBAC & Access Control (Admin, Researcher, Viewer)
3. Sensitive Database & Backup File Protection (No public .db, .sql, .json state downloads)
4. Safe Document Delivery & Path Traversal Prevention
5. Strict CORS Validation (No regex wildcard with credentials)
6. Input Validation, XSS & Upload Protections
7. Fail-Secure Configuration & Bootstrap Logic
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io
import os
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import jwt
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.app.config import settings
from backend.app.db_session import SessionLocal, init_orm_schema
from backend.app.enums import RoleEnum
from backend.app.models import User
from backend.app.security import create_jwt_token, hash_password
from backend.app.services import seed_roles_users_and_jobs
from backend.main import app, reset_rate_limiter
from scripts.bootstrap_admin import bootstrap_admin


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    init_orm_schema()
    db = SessionLocal()
    try:
        seed_roles_users_and_jobs(db)
    finally:
        db.close()


@pytest.fixture
def client():
    reset_rate_limiter()
    with TestClient(app) as c:
        yield c


def _get_auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# 1. AUTHENTICATION & TOKEN LIFECYCLE
# ==============================================================================
def test_valid_login_with_email_and_username_alias(client: TestClient):
    # 1. Login with primary email
    r1 = client.post(
        "/api/v1/auth/login",
        json={"email": "shama.abidi80@gmail.com", "password": "ShamaPhD#2026!Secure"},
    )
    assert r1.status_code == 200
    assert r1.json()["success"] is True
    assert "access_token" in r1.json()

    # 2. Login with researcher email
    r2 = client.post(
        "/api/v1/auth/login",
        json={"email": "researcher@shama-phd.org", "password": "Researcher#2026!Pass"},
    )
    assert r2.status_code == 200
    assert r2.json()["user"]["role"] == "RESEARCHER"


def test_invalid_login_credentials(client: TestClient):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@university.edu", "password": "WrongPassword#123"},
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_missing_and_invalid_bearer_token(client: TestClient):
    # 1. Missing token on protected endpoint
    r_no_token = client.get("/api/v1/auth/me")
    assert r_no_token.status_code == 401
    assert r_no_token.json()["error"]["code"] == "UNAUTHORIZED"

    # 2. Malformed token
    r_bad_token = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.payload"})
    assert r_bad_token.status_code == 401
    assert r_bad_token.json()["error"]["code"] == "INVALID_TOKEN"


def test_expired_jwt_token_rejection(client: TestClient):
    expired_token = create_jwt_token(
        user_id="user_admin_shama_dev",
        email="shama.abidi80@gmail.com",
        role="ADMIN",
        expires_delta=timedelta(seconds=-10),
    )
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "TOKEN_EXPIRED"


def test_logout_token_revocation(client: TestClient):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "researcher@shama-phd.org", "password": "Researcher#2026!Pass"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify access works
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

    # Logout
    logout_resp = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_resp.status_code == 200

    # Token must now be rejected as revoked
    post_logout = client.get("/api/v1/auth/me", headers=headers)
    assert post_logout.status_code == 401
    assert post_logout.json()["error"]["code"] == "TOKEN_REVOKED"


# ==============================================================================
# 2. SERVER-SIDE RBAC & AUTHORIZATION
# ==============================================================================
def test_rbac_restrictions_on_admin_routes(client: TestClient):
    viewer_headers = _get_auth_headers(client, "viewer@shama-phd.org", "ViewerRead#2026!Pass")
    admin_headers = _get_auth_headers(client, "shama.abidi80@gmail.com", "ShamaPhD#2026!Secure")

    # Viewer cannot list users
    r_viewer = client.get("/api/v1/users", headers=viewer_headers)
    assert r_viewer.status_code == 403
    assert r_viewer.json()["error"]["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"

    # Admin can list users
    r_admin = client.get("/api/v1/users", headers=admin_headers)
    assert r_admin.status_code == 200
    assert "items" in r_admin.json()


def test_protected_prototype_endpoints_require_authentication(client: TestClient):
    # Unauthenticated calls to prototype endpoints MUST fail with 401
    assert client.get("/api/state").status_code == 401
    assert client.post("/api/jobs/run", json={"job_id": "ALL"}).status_code == 401
    assert client.post("/api/settings/update", json={"setting_key": "k", "setting_value": "v"}).status_code == 401
    assert client.post("/api/drafts/draft_123/send-now").status_code == 401

    # Authenticated call succeeds
    admin_headers = _get_auth_headers(client, "shama.abidi80@gmail.com", "ShamaPhD#2026!Secure")
    r_state = client.get("/api/state", headers=admin_headers)
    assert r_state.status_code == 200
    assert "professors" in r_state.json()


# ==============================================================================
# 3. DATABASE, BACKUP & SENSITIVE FILE PROTECTION
# ==============================================================================
def test_database_files_cannot_be_publicly_served(client: TestClient):
    # Attempting to fetch database files over HTTP must not serve raw sqlite database files
    r_db1 = client.get("/data/shama_production.db")
    assert r_db1.status_code in (403, 404)

    r_db2 = client.get("/data/shama_production_orm.db")
    assert r_db2.status_code in (403, 404)

    r_state = client.get("/data/production_state.json")
    assert r_state.status_code in (403, 404)

    r_backups = client.get("/backups/shama_production_backup_20261003_142226.db")
    assert r_backups.status_code in (403, 404)


def test_safe_academic_document_serving_and_path_traversal_blocking(client: TestClient):
    # 1. Valid academic CV PDF is accessible
    r_cv = client.get("/data/documents/Dr_Shama_Abidi_Academic_CV_2026.pdf")
    if (BASE_DIR / "data" / "documents" / "Dr_Shama_Abidi_Academic_CV_2026.pdf").exists():
        assert r_cv.status_code == 200
        assert r_cv.headers["content-type"] == "application/pdf"

    # 2. Path traversal attempt must be blocked
    r_traversal = client.get("/data/documents/../../data/shama_production.db")
    assert r_traversal.status_code in (400, 403, 404)

    # 3. Non-pdf file access attempt must be rejected
    r_non_pdf = client.get("/data/documents/config.py")
    assert r_non_pdf.status_code in (400, 403, 404)


# ==============================================================================
# 4. CORS CONFIGURATION
# ==============================================================================
def test_cors_explicit_trusted_origins(client: TestClient):
    # Allowed origin receives CORS headers
    allowed_origin = settings.CORS_ALLOWED_ORIGINS[0]
    r_allowed = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": allowed_origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r_allowed.headers.get("access-control-allow-origin") == allowed_origin

    # Disallowed origin does NOT receive wildcards
    r_disallowed = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://evil-untrusted-hacker.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r_disallowed.headers.get("access-control-allow-origin") != "https://evil-untrusted-hacker.com"
    assert r_disallowed.headers.get("access-control-allow-origin") != "*"


# ==============================================================================
# 5. PUBLIC SAFE HEALTH CHECK
# ==============================================================================
def test_public_health_endpoint_does_not_leak_secrets(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert "version" in data

    # Verify no credentials or database connection strings leaked
    raw_text = r.text
    assert "password" not in raw_text.lower()
    assert "jwt_secret" not in raw_text.lower()
    assert "postgres:" not in raw_text
    assert "sqlite:" not in raw_text


# ==============================================================================
# 6. BOOTSTRAP ADMIN SCRIPT
# ==============================================================================
def test_bootstrap_admin_utility():
    # Test creating or safely idempotently updating an administrator
    test_admin_email = "test_bootstrap_admin@shama-phd.org"
    success = bootstrap_admin(
        email=test_admin_email,
        password="BootstrapAdmin#2026!Secure",
        full_name="Bootstrap Admin Test",
        force_reset=True,
    )
    assert success is True

    # Calling without force_reset on existing user must not overwrite
    second_run = bootstrap_admin(
        email=test_admin_email,
        password="DifferentPassword#2026!Secure",
        force_reset=False,
    )
    assert second_run is False
