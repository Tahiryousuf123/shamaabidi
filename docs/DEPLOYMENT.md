# Shama Abidi PhD System — Production Deployment Guide (`docs/DEPLOYMENT.md`)

## 1. Environment Configuration (Section 16)
Copy [.env.example](file:///c:/Users/Lenovo/Desktop/demo%20p/.env.example) to `.env` and populate production secrets:
- `ENVIRONMENT=production`
- `DATABASE_URL=postgresql+psycopg://user:password@db-host:5432/shama_phd_production` (or `sqlite:///data/shama_production_orm.db` for single-node persistence)
- `SECRET_KEY` and `JWT_SECRET` (minimum 32-byte cryptographically random hex strings)
- `EMAIL_AUTOMATION_ENABLED=false` (enforces human-in-the-loop approval before sending any email)

---

## 2. Database Migration & Seeding
```bash
# 1. Apply Alembic schema migrations (all 26 production tables)
python -m alembic upgrade head

# 2. Migrate and validate existing prototype data (140 verified professors, 98 universities, 89 publications)
python scripts/migrate_existing_data.py

# 3. Verify backup & disaster recovery restore integrity
python scripts/backup_and_restore_test.py
```

---

## 3. Running the Production Application
### Option A: Uvicorn / Gunicorn Production Workers
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Option B: Docker Compose Production Stack
```bash
docker compose up -d --build
```

---

## 4. Health, Readiness & Observability Checks (Section 18)
- **Liveness Probe**: `GET /health` -> `{"success": true, "status": "healthy", "email_automation_enabled": false}`
- **Readiness Probe**: `GET /ready` -> Verifies live SQLAlchemy DB connection and entity counts (`users`, `universities`, `professors`).
- **Metrics Telemetry**: `GET /metrics` -> Exposes request count, average latency (`avg_response_time_ms`), error counters, and job/email/auth failure counters.
