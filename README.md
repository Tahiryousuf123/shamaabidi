# Shama Abidi PhD System — Production Application (v5.0.0)

**Dr. Shama Abidi — PharmD, MPhil in Pharmacy Practice**  
**Live Deployment:** [https://aspnetaptech-cyber.github.io/shama-abidi-phd-system/](https://aspnetaptech-cyber.github.io/shama-abidi-phd-system/)

---

## 1. System Overview
Production-grade PhD research, supervisor provenance verification, funding evidence audit, PhD application CRM, and human-approved email workflow system.

### Key Architectural & Security Features
- **5-Tier Layered Architecture**: Modular ES Frontend (`frontend/js/*`) → FastAPI Versioned REST API (`/api/v1/*`) → Service Layer (`backend/app/services.py`) → SQLAlchemy 2.0 ORM (`backend/app/models.py`) → Relational Database + Alembic Migrations (`alembic/`).
- **26 Normalized Relational Entities**: `roles`, `permissions`, `users`, `universities`, `departments`, `research_areas`, `professors`, `professor_research_areas`, `publications`, `funding_opportunities`, `funding_evidence`, `verification_records`, `applications`, `application_status_history`, `application_documents`, `email_templates`, `emails`, `email_threads`, `email_replies`, `followups`, `tasks`, `jobs`, `job_runs`, `activity_logs`, `audit_logs`, `system_settings`.
- **Argon2id Authentication, JWT Revocation, Account Lockout & RBAC**:
  - Roles: `ADMIN`, `RESEARCHER`, `VIEWER`
  - Account lockout after 5 failed attempts (`423 ACCOUNT_LOCKED`)
  - JTI token revocation on logout (`401 TOKEN_REVOKED`)
  - Optional RFC 6238 TOTP 2FA (`POST /api/v1/auth/2fa/enable`)
- **Real Provenance Verification**:
  - Unverified records default to `UNVERIFIED`.
  - Records transition to `VERIFIED` only when backed by official academic/scholarly domains and extracted evidence quotes.
- **Human-in-the-Loop Safe Email Workflow**:
  - `EMAIL_AUTOMATION_ENABLED=false` by default.
  - Mandatory `DRAFT -> APPROVED -> SENT -> REPLIED` state machine with deterministic `idempotency_key` deduplication.

---

## 2. Production Documentation (`docs/`)
- [Current Codebase Security & Architecture Audit](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/CURRENT_AUDIT.md)
- [Production Architecture Guide](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/ARCHITECTURE.md)
- [Versioned `/api/v1/*` REST API Reference](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/API.md)
- [Security Controls & Hardening Guide](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/SECURITY.md)
- [Relational Database & Alembic Schema Guide](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/DATABASE.md)
- [Background Jobs & Idempotency Guide](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/JOBS.md)
- [Human-Approved Email System Guide](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/EMAIL_SYSTEM.md)
- [Production Deployment Guide](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/DEPLOYMENT.md)
- [Backups & Disaster Recovery Plan](file:///c:/Users/Lenovo/Desktop/demo%20p/docs/DISASTER_RECOVERY.md)

---

## 3. Quick Start & Verification Commands
```bash
# 1. Install pinned dependencies
python -m pip install -r backend/requirements.txt

# 2. Apply Alembic database migrations
python -m alembic upgrade head

# 3. Migrate and validate existing prototype records
python scripts/migrate_existing_data.py

# 4. Run disaster recovery backup & restore verification
python scripts/backup_and_restore_test.py

# 5. Run automated unit, integration, E2E, and security tests
python -m pytest tests/ -v

# 6. Start the production API server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
