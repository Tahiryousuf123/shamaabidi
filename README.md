# Shama Abidi PhD System — Production Application (v5.1.0)

**Candidate:** Dr. Shama Abidi (PharmD, MPhil in Pharmacy Practice)  
**System Purpose:** International PhD Supervisor Discovery, Semantic Publication Matching, Funding Provenance Verification, Human-in-the-Loop Gmail Outreach & Application CRM  
**Primary Production URL:** [https://shamaabidiphd.sbs](https://shamaabidiphd.sbs)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Single Page Application (SPA)               │
│         (HTML5, Vanilla CSS, Authenticated ES6 Modules)     │
└───────────────┬─────────────────────────────────────────────┘
                │ Authorization: Bearer <JWT>
                ▼
┌─────────────────────────────────────────────────────────────┐
│                FastAPI Production API (v5.1.0)               │
│  - Strict CORS allowlist (No regex wildcards)               │
│  - Sliding-Window Rate Limiting (120 req/min, 429 status)   │
│  - Fail-Secure Config (No fallback deterministic secrets)   │
│  - Security Headers: CSP, HSTS, X-Frame DENY, nosniff       │
└───────┬──────────────────────┬──────────────────────┬───────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌────────────────┐     ┌───────────────┐     ┌────────────────┐
│ Authentication │     │ Service Layer │     │ Background Job │
│   & RBAC       │     │  & Provenance │     │   Scheduler    │
│ - Argon2id     │     │ - Europe PMC  │     │ - Daily Batch  │
│ - JWT Tokens   │     │ - OpenAlex    │     │ - Idempotent   │
│ - Lockout      │     │ - Gmail OAuth │     │   Execution    │
└───────┬────────┘     └───────┬───────┘     └────────┬───────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Relational Database (PostgreSQL / SQLite)       │
│  - 26 Relational Tables, Foreign Keys, Indexes & Auditing   │
│  - Storage outside public web directories (Never served)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Local Development Setup

### Prerequisites
- Python 3.10+ (Tested on Python 3.12 / 3.14)
- Pip and virtualenv

### Setup Steps
```bash
# 1. Clone repository
git clone https://github.com/tahiryousuf123/shamaabidi.git
cd shamaabidi

# 2. Create and activate a virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# 3. Install dependencies
pip install -r backend/requirements.txt

# 4. Configure local environment variables
cp .env.example .env
# Edit .env and set strong secrets or leave defaults for local SQLite development

# 5. Initialize database & bootstrap administrator
python scripts/bootstrap_admin.py --email shamaabidiphd@gmail.com --password "YourStrongPassword#2026!"

# 6. Start development server
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

---

## 3. Environment Variables Reference

All credentials must be supplied via environment variables. **Never commit real secrets to Git.**

| Variable Name | Required | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Yes | `development` / `production` | Enforces production fail-secure mode |
| `DATABASE_URL` | In Prod | `postgresql+psycopg://user:pass@host:5432/dbname` | Database connection string |
| `SECRET_KEY` | In Prod | 64-char hex string | Application cryptographic key |
| `JWT_SECRET` | In Prod | 64-char hex string | JWT signing secret (HMAC-SHA256) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | Access token lifespan |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Refresh token lifespan |
| `INITIAL_ADMIN_EMAIL` | No | `shamaabidiphd@gmail.com` | Initial admin email on clean DB |
| `INITIAL_ADMIN_PASSWORD` | In Prod (clean) | Strong password | Initial admin password on clean DB |
| `CORS_ALLOWED_ORIGINS` | No | `https://shamaabidiphd.sbs` | Explicit trusted origin allowlist |
| `RATE_LIMIT_PER_MINUTE` | No | `120` | Request rate limit per IP |
| `AUTH_LOCKOUT_THRESHOLD` | No | `5` | Failed attempts before lockout |
| `AUTH_LOCKOUT_DURATION_MINUTES` | No | `15` | Lockout duration |
| `EMAIL_AUTOMATION_ENABLED` | No | `false` | Hard safety lock (Drafts only) |
| `GMAIL_SENDER_EMAIL` | No | `shamaabidiphd@gmail.com` | Official outreach sender email |
| `GMAIL_OAUTH_CLIENT_ID` | Optional | Google Cloud Client ID | Required for Gmail OAuth |
| `GMAIL_OAUTH_CLIENT_SECRET` | Optional | Google Cloud Client Secret | Required for Gmail OAuth |
| `GMAIL_OAUTH_REFRESH_TOKEN` | Optional | Google OAuth Refresh Token | Required for Gmail OAuth |
| `OPENROUTER_API_KEY` | Optional | OpenRouter API Key | Optional LLM synthesis |
| `OPENROUTER_MODEL` | No | `openrouter/free` | Model identifier |

---

## 4. Secure Administrator Creation

To create or reset an administrator account with Argon2id password hashing and policy enforcement:

```bash
# Interactive mode (prompts for password securely without echoing)
python scripts/bootstrap_admin.py

# CLI mode with custom email
python scripts/bootstrap_admin.py --email shamaabidiphd@gmail.com --password "SecureAdmin#2026!" --force-reset
```

Password Policy Requirements:
- Minimum 10 characters
- At least one uppercase letter (`A-Z`)
- At least one lowercase letter (`a-z`)
- At least one numeric digit (`0-9`)
- At least one special character (`!@#$%^&*...`)

---

## 5. Database Setup & Migrations

```bash
# 1. Apply Alembic migrations to target database
alembic upgrade head

# 2. Check current migration revision
alembic current

# 3. Create a new revision after model changes
alembic revision --autogenerate -m "Add new field to professor"
```

In production, `DATABASE_URL` must point to a PostgreSQL instance. The application refuses to start in `ENVIRONMENT=production` if SQLite is detected.

---

## 6. Gmail OAuth 2.0 Configuration

The application uses Google OAuth 2.0 to create drafts in Dr. Shama's Gmail Drafts folder.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable the **Gmail API**.
3. Create an **OAuth 2.0 Client ID** (Application Type: Desktop or Web).
4. Add redirect URI: `http://localhost:8080/` or `https://developers.google.com/oauthplayground`.
5. Run the helper setup script to obtain a refresh token:
   ```bash
   python backend/gmail_oauth_setup.py
   ```
6. Set `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, and `GMAIL_OAUTH_REFRESH_TOKEN` in deployment secret storage.
7. **Safety Guarantee**: `EMAIL_AUTOMATION_ENABLED=false` ensures emails are **NEVER auto-sent**. The system only creates drafts for human review.

---

## 7. OpenRouter AI Configuration

1. Obtain an API key from [OpenRouter](https://openrouter.ai/settings/keys).
2. Set `OPENROUTER_API_KEY` in environment variables.
3. The server validates and filters AI responses before storing.
4. If no key is set, the system seamlessly uses the zero-cost **Deterministic Synthesis Engine** based on Dr. Shama's verified publications.

---

## 8. Backup and Disaster Recovery Procedure

### Automated Backup
Database snapshots and state exports are stored in the secure `backups/` directory (strictly excluded from Git and static web paths).

```bash
# Verify backup and restore cycle
python scripts/backup_and_restore_test.py
```

### Manual Backup (PostgreSQL)
```bash
pg_dump -Fc -v --host=$PGHOST --username=$PGUSER --dbname=$PGDATABASE -f backups/shama_prod_$(date +%Y%m%d_%H%M%S).dump
```

### Restoration Procedure
```bash
pg_restore -v --clean --no-owner --dbname=$DATABASE_URL backups/shama_prod_YYYYMMDD_HHMMSS.dump
```

---

## 9. Testing & Quality Assurance

Run the comprehensive 53-point test suite:

```bash
# 1. Run all unit, security, RBAC, and integration tests
python -m pytest tests/ -v

# 2. Run the 20-point production verification suite
python backend/test_production_suite.py
```

---

## 10. Production Deployment Guide

### Option A: Docker Deployment (Recommended)
```bash
# 1. Populate production secrets in .env
# 2. Build and run containers
docker-compose up -d --build

# 3. Verify health
curl -f http://localhost:8000/health
```

### Option B: Cloud VM / Container Deployment
```bash
# 1. Set environment variables on server (e.g. via systemd or cloud secrets)
export ENVIRONMENT=production
export DATABASE_URL="postgresql+psycopg://shama_user:SECRET@db.internal:5432/shama_prod"
export JWT_SECRET="$(openssl rand -hex 32)"
export SECRET_KEY="$(openssl rand -hex 32)"
export CORS_ALLOWED_ORIGINS="https://shamaabidiphd.sbs,https://www.shamaabidiphd.sbs"

# 2. Run migrations
alembic upgrade head

# 3. Start Gunicorn / Uvicorn workers
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Option C: Frontend on Netlify / Vercel + Backend on Server
- Netlify / Vercel: hosts static files (`index.html`, `styles.css`, `app.js`, `frontend/`).
- Set `FASTAPI_BACKEND_URL` in Netlify environment variables so Netlify proxies `/api/*` to the FastAPI backend.
- Direct database access and `.env` files are blocked via `netlify.toml` security redirects.
