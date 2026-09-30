# Shama Abidi PhD System — Production Architecture (`docs/ARCHITECTURE.md`)

## 1. Layered Production Architecture (Section 3)
The Shama Abidi PhD System follows a strict 5-tier layered architecture:

```
Frontend (Modular ES Modules: frontend/js/* + app.js)
    │
    ▼  HTTPS / REST JSON (/api/v1/*) + Security & Rate-Limiting Middleware
API Layer (FastAPI Routers: backend/main.py & backend/app/api_v1.py)
    │
    ▼  Pydantic Schema Validation + RBAC Role Guards + XSS Sanitization
Service Layer (Business Rules & State Machines: backend/app/services.py)
    │
    ▼  Deterministic Normalization, Duplicate Detection & Provenance Scoring
Data Access / ORM Layer (SQLAlchemy 2.0 + Alembic: backend/app/models.py)
    │
    ▼  Connection Pooling (pool_pre_ping=True, Foreign Keys Enforced)
Relational Database (PostgreSQL in Production / SQLAlchemy SQLite in Local/CI)
```

---

## 2. Core Engineering Guarantees
1. **Strict Separation of Concerns**:
   - No SQL queries inside frontend JavaScript or FastAPI route decorators.
   - All domain mutations (universities, professors, verification records, applications, emails, follow-ups, jobs) execute through `backend/app/services.py` and emit immutable `AuditLog` records.
2. **Real Provenance Verification (Section 12)**:
   - Unverified entities default to `UNVERIFIED` (`confidence_score = 0.0`).
   - Records transition to `VERIFIED` only when backed by an official academic or scholarly registry domain (`.edu`, `.ac.uk`, `.de`, `.ch`, `.se`, `doi.org`, `orcid.org`, `ebi.ac.uk`, `openalex.org`) and an extracted evidence reference.
3. **Human-in-the-Loop Safe Email State Machine (Section 14)**:
   - `EMAIL_AUTOMATION_ENABLED=false` by default.
   - Every outreach email starts in `DRAFT` and requires explicit human approval (`APPROVED`) before `send_approved_email()` permits dispatch (`SENT`).
4. **Separated Background Job Execution (Section 10)**:
   - Background jobs (`job_research_discovery`, `job_source_verification`, `job_funding_verification`, `job_email_draft_generation`, `job_followup_scheduler`, `job_system_health_monitor`) run with unique `idempotency_key` tracking in `job_runs` and exponential backoff retries.
