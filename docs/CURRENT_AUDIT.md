# Shama Abidi PhD System — Comprehensive Production Codebase Audit (`docs/CURRENT_AUDIT.md`)

**Audit Date:** 2026-09-30  
**Target Repository:** `https://github.com/aspnetaptech-cyber/shama-abidi-phd-system`  
**Live Deployment:** `https://aspnetaptech-cyber.github.io/shama-abidi-phd-system/`  
**Audited By:** Principal Software Architect, Backend/Database Engineer, DevOps & Application Security Engineer

---

## 1. Executive Summary & 20-Point Inspection Scope

Before modifying any code, a complete 20-point audit was performed across the entire repository:
1. **Repository Structure:** Flat root frontend (`index.html`, `styles.css`, monolithic `app.js`), flat `backend/` Python scripts (`main.py`, `database.py`, `autonomous_pipeline.py`, `document_processor.py`, `gmail_service.py`, `whatsapp_service.py`, `worker_scheduler.py`, `vector_engine.py`, `agents/phd_workflow.py`), `netlify/functions/`, and `data/` binary/JSON files committed directly into Git.
2. **Frontend:** Single 1,585-line monolithic `app.js` file mixing API calls, DOM rendering, sessionStorage overlays, PDF parsing, and direct external API queries (`ebi.ac.uk`).
3. **Backend:** Flat procedural scripts in `backend/` without a layered architecture (`Controller/Router -> Service Layer -> Repository/DAO Layer -> ORM Models`).
4. **Database / Schema:** Raw SQLite (`data/shama_production.db`) and a 1.2 MB JSON dump (`data/production_state.json`) used as the primary runtime store, with no SQLAlchemy ORM models and no Alembic migration history.
5. **API Endpoints:** Unauthenticated endpoints in `backend/main.py` (`/api/state`, `/api/documents/upload`, `/api/jobs/run`, `/api/drafts/{id}/mark-sent`, `/api/settings/update`) lacking versioned resource routing (`/api/v1/auth`, `/api/v1/users`, `/api/v1/universities`, `/api/v1/departments`, `/api/v1/professors`, `/api/v1/publications`, `/api/v1/funding`, `/api/v1/applications`, `/api/v1/emails`, `/api/v1/followups`, `/api/v1/tasks`, `/api/v1/dashboard`, `/api/v1/jobs`, `/api/v1/audit`), pagination, standardized error envelopes, and RBAC checks.
6. **Scheduled Jobs:** Long-running discovery/matching tasks are executed synchronously inside HTTP `POST /api/jobs/run` handlers and persisted by committing binary SQLite/JSON files back into Git via `.github/workflows/daily_phd_worker.yml`.
7. **GitHub Actions:** `.github/workflows/daily_phd_worker.yml` uses Git commits as a database synchronization mechanism rather than performing CI/CD quality gates (linting, unit/integration/security tests, migration checks, and staged deployment).
8. **Netlify Functions:** `netlify/functions/api.js` reads a static JSON file from disk (`data/production_state.json`) and returns `200 OK` for unknown routes without authentication or database persistence.
9. **Environment Variables:** `.env.example` lacks production security variables (`SECRET_KEY`, `JWT_SECRET`, `DATABASE_URL` for PostgreSQL, `CORS_ALLOWED_ORIGINS`, `EMAIL_AUTOMATION_ENABLED`, `RATE_LIMIT_PER_MINUTE`, `SENTRY_DSN`).
10. **Authentication:** **None implemented.** Anyone with network access to the API can read, modify, or delete documents, trigger jobs, and change system settings.
11. **Authorization:** **None implemented.** No `ADMIN`, `RESEARCHER`, or `VIEWER` roles, no `roles` or `permissions` tables, and no endpoint-level RBAC guards.
12. **Email Functionality:** `backend/gmail_service.py` uses raw `urllib.request` calls without idempotency keys, without an `email_templates` table, and without the required controlled state machine (`DRAFT`, `APPROVED`, `QUEUED`, `SENT`, `FAILED`, `REPLIED`).
13. **AI & Research Verification Functionality:** In `backend/autonomous_pipeline.py` and `app.js`, candidates discovered from Europe PMC / OpenAlex were automatically assigned `verification_status = 'VERIFIED'` even when no official university domain check or email verification occurred (violating Section 10 & Section 33: unverified records must default to `UNVERIFIED`).
14. **Logging:** Uses `print()` and basic table inserts without structured JSON request logging (`request_id`, `user_id`, `endpoint`, `status_code`, `duration_ms`, `job_id`, `error_type`) or sensitive-data redaction.
15. **Tests:** `backend/test_production_suite.py` only tests happy-path SQLite counts; there are zero unit/integration tests for authentication, RBAC privilege escalation, SQL injection, XSS, IDOR, rate limiting, malformed payloads, file upload validation, or the critical 11-step application workflow.
16. **Deployment Configuration:** Single-branch deployment with no separation of `development`, `staging`, and `production` environments and no backup/restore verification script.
17. **Dependency Versions:** `backend/requirements.txt` omits `sqlalchemy`, `alembic`, `argon2-cffi`, `pyjwt`, and `pytest`.
18. **Data Storage:** Large PDF documents (`data/documents/*.pdf`) and `data/shama_production.db` are stored inside the Git repository instead of isolated object storage with strict MIME/magic-byte validation.
19. **Security Risks:** Wildcard CORS (`allow_origins=["*"]` with `allow_credentials=True`), no security headers (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`), no rate limiting, no request body size limits, and unvalidated file upload text fields.
20. **Duplicate/Conflicting Implementations:** Two parallel architectures exist in `backend/`: an older `backend/agents/phd_workflow.py` + `backend/ingest_knowledge_base.py` (expecting PostgreSQL `candidate_profiles`/`supervisors`) and a newer `backend/autonomous_pipeline.py` + `backend/database.py` (using SQLite `professors`/`research_documents`).

---

## 2. Severity-Classified Findings

### 2.1 Critical Problems (P0 — Must Fix Immediately)
1. **Complete Absence of Authentication & RBAC Authorization:**
   - Every endpoint in `backend/main.py` is publicly accessible without authentication.
   - No `roles` (`ADMIN`, `RESEARCHER`, `VIEWER`) or `permissions` enforcement exists.
2. **SQLite & Git-Commit Used as Primary Database Sync:**
   - Relying on `git commit` + `git push` of `data/shama_production.db` and `data/production_state.json` inside GitHub Actions causes race conditions, repository bloat, and data loss under concurrent writes.
   - Production requires **PostgreSQL-compatible SQLAlchemy 2.0 ORM** and **Alembic migrations**.
3. **Synchronous Long-Running Jobs Inside HTTP Request Handlers:**
   - `POST /api/jobs/run` in `backend/main.py` synchronously runs multi-minute external HTTP scraping and vector indexing inside the web worker thread, causing HTTP timeouts and denial-of-service under load.
4. **Over-Optimistic "VERIFIED" Status Assignment (Violation of Section 10 & 33):**
   - `backend/autonomous_pipeline.py` and `app.js` mark newly discovered professors as `VERIFIED` based solely on having a DOI or ORCID in Europe PMC, without verifying official university domain provenance. Unconfirmed records must strictly default to `UNVERIFIED` or `PENDING`.

### 2.2 High-Risk Problems (P1)
1. **Wildcard CORS with Credentials (`allow_origins=["*"]`, `allow_credentials=True`):**
   - Violates CORS security specifications and exposes the API to cross-origin abuse.
2. **Missing Core PhD Application & Task Management Entities:**
   - The current schema lacks dedicated tables for `departments`, `research_areas`, `professor_research_areas`, `funding_opportunities`, `applications`, `application_status_history`, `application_documents`, `email_templates`, `tasks`, `jobs`, `job_runs`, `roles`, `permissions`, and immutable `audit_logs`.
3. **Monolithic Frontend (`app.js` — 1,585 lines):**
   - All API communication, state management, DOM rendering, and event listeners are coupled inside a single file without modular separation (`api.js`, `auth.js`, `dashboard.js`, `universities.js`, `professors.js`, `applications.js`, `emails.js`, `funding.js`, `jobs.js`, `settings.js`, `utils.js`).
4. **Unpaginated Dataset Responses:**
   - `GET /api/state` dumps the entire database (all 140+ professors, publications, embeddings, drafts, and logs) in a single multi-megabyte payload instead of using paginated, filterable, sortable REST endpoints.

### 2.3 Medium Problems (P2)
1. **Missing Standardized Error Envelope:**
   - FastAPI default errors leak internal field structures and differ from the required `{"success": false, "error": {"code": "...", "message": "...", "details": {}}}` contract.
2. **No Email Idempotency Key Enforcement:**
   - `email_drafts` / `emails` lack an `idempotency_key` column and unique constraint to guarantee that retries can never send duplicate emails.
3. **Missing File Upload Validation:**
   - Document upload accepts arbitrary strings without checking file size limits, allowed extensions (`.pdf`, `.txt`, `.md`), MIME types, or PDF magic bytes (`%PDF-`), and does not block executable uploads (`.exe`, `.sh`, `.bat`, `.js`, `.php`).

### 2.4 Low-Priority Improvements (P3)
1. **Consolidate Legacy Unused Modules:**
   - `backend/agents/phd_workflow.py` and `backend/ingest_knowledge_base.py` should be superseded by the unified service/repository layer while preserving all 5 verified publications and all 140 discovered international professor records via `scripts/migrate_existing_data.py`.
2. **Privacy Redaction on Public/Viewer Views:**
   - Private phone numbers and credentials must be masked/protected according to user role.

---

## 3. Summary Audit Matrix

| Category | Current State | Target Production State |
| :--- | :--- | :--- |
| **Architecture** | Procedural scripts in `backend/` | Layered: `FastAPI Routers -> Services -> Repositories -> SQLAlchemy 2.0 ORM` |
| **Database** | Raw SQLite + JSON file in Git | PostgreSQL + SQLAlchemy 2.0 ORM + Alembic Migrations (`alembic/`) |
| **Authentication** | None | Argon2id password hashing + JWT Access/Refresh tokens + Account lockout + Optional Admin TOTP 2FA |
| **Authorization** | None | Strict RBAC (`ADMIN`, `RESEARCHER`, `VIEWER`) enforced on every endpoint |
| **API Design** | Unversioned `/api/state` dump | 14 Versioned `/api/v1/*` routers with pagination, filtering, sorting, search & rate limiting |
| **Frontend** | Single 1,585-line `app.js` | 11 ES Modules under `frontend/js/` (`api.js`, `auth.js`, `dashboard.js`, etc.) |
| **Research Pipeline** | Marks unconfirmed records `VERIFIED` | 9-Stage Provenance Pipeline defaulting to `UNVERIFIED` until evidence is verified |
| **Background Jobs** | Synchronous in request + Git commits | Asynchronous Background Job Queue (`jobs` & `job_runs` tables) with exponential backoff & idempotency |
| **Testing** | 1 script checking SQLite counts | Comprehensive `pytest` suite: Unit, Integration, API, Auth, RBAC, Duplicate, Email Safety, Security & E2E Workflow |
| **Backups & DR** | None | Automated `pg_dump` / snapshot backup + verified restore test script & `docs/DISASTER_RECOVERY.md` |
