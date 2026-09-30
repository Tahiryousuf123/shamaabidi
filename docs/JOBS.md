# Shama Abidi PhD System — Background Jobs & Idempotency Guide (`docs/JOBS.md`)

## 1. Background Job Architecture (Section 10)
Long-running discovery, verification, draft generation, and follow-up tasks are decoupled from HTTP request threads and tracked in two relational tables:
- `jobs`: Registered job definitions, cron schedules, `is_enabled` flag, and last execution status.
- `job_runs`: Individual execution records with a unique `idempotency_key`, `status` (`PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `CANCELLED`), `execution_duration_ms`, `retry_count`, and row telemetry (`records_processed`, `records_created`, `records_updated`, `records_skipped`).

---

## 2. Registered Production Jobs
| Job ID | Job Type | Default Schedule | Purpose |
| :--- | :--- | :--- | :--- |
| `job_research_discovery` | `RESEARCH_DISCOVERY` | `0 3 * * *` | International professor & university discovery outside Pakistan |
| `job_source_verification` | `SOURCE_VERIFICATION` | `20 3 * * *` | Provenance domain validation & confidence scoring |
| `job_funding_verification` | `FUNDING_VERIFICATION` | `35 3 * * *` | Scholarship & grant evidence verification |
| `job_email_draft_generation` | `EMAIL_DRAFT_GENERATION` | `45 3 * * *` | Generates personalized drafts in `DRAFT` state (never auto-sends) |
| `job_followup_scheduler` | `FOLLOWUP_SCHEDULER` | `0 5 * * *` | Schedules 7-day follow-up drafts for sent inquiries awaiting reply |
| `job_system_health_monitor` | `SYSTEM_HEALTH_MONITOR` | `*/30 * * * *` | Database, API, and observability health verification |

---

## 3. Idempotency & Retry Guarantees
- Every call to `execute_job_safely(db, job_id, idempotency_key=...)` checks `job_runs.idempotency_key`.
- If a run with the same `idempotency_key` already exists, the existing `JobRun` is returned without re-executing or duplicating records.
- Transient failures automatically retry up to `max_retries` times with exponential backoff (`0.1 * 2^attempt` seconds) and log failures to `audit_logs` and `observability_metrics.job_failures`.
