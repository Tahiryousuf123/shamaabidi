# Shama Abidi PhD System — Relational Database & Schema Guide (`docs/DATABASE.md`)

## 1. Database Engine & Migrations (Section 7)
- **ORM**: SQLAlchemy 2.0 Declarative ORM (`backend/app/models.py`).
- **Migrations**: Alembic (`alembic/versions/0001_initial_production_schema.py`).
  - Apply migrations: `python -m alembic upgrade head`
  - Rollback migration: `python -m alembic downgrade -1`
- **Connection Pooling**: `pool_pre_ping=True`, `pool_size=10`, `max_overflow=20`, `pool_recycle=1800` for PostgreSQL (`postgresql+psycopg://...`), and `PRAGMA foreign_keys=ON` for SQLite.

---

## 2. All 26 Production Entities
1. `roles` (`id`, `name`, `description`, timestamps)
2. `permissions` (`id`, `code`, `role_name`, timestamps)
3. `users` (`id`, `email`, `password_hash`, `role`, `failed_login_attempts`, `locked_until`, `totp_secret`, `totp_enabled`)
4. `universities` (`UniqueConstraint(normalized_name, country)`, provenance columns, `verification_status`, `is_deleted`)
5. `departments` (`UniqueConstraint(university_id, normalized_name)`)
6. `research_areas` (`name`, `normalized_name`, `category`)
7. `professors` (`UniqueConstraint(normalized_name, university_id)`, `relevance_score`, `verification_status`, `confidence_score`, provenance columns, `is_deleted`)
8. `professor_research_areas` (`UniqueConstraint(professor_id, research_area_id)`)
9. `publications` (`normalized_title_hash` unique, `doi`, `pmid`, provenance columns)
10. `funding_opportunities` (`UniqueConstraint(provider, normalized_title, deadline)`, provenance columns)
11. `funding_evidence` (grant agency, grant code, evidence quote, source URL)
12. `verification_records` (entity verification history, confidence score, evidence reference)
13. `applications` (`UniqueConstraint(applicant_user_id, professor_id)`, status pipeline)
14. `application_status_history` (audit log of every status transition)
15. `application_documents` (SHA-256 checksum, safe storage path, MIME type, size)
16. `email_templates` (reusable academic outreach templates)
17. `emails` (`idempotency_key` unique, `status`, `approved_by_user_id`, `approved_at`, `sent_at`)
18. `email_threads` (`provider_thread_id` unique, thread tracking)
19. `email_replies` (classified replies: `CV_REQUESTED`, `MEETING_REQUEST`, `INTERESTED`, `DECLINED`)
20. `followups` (7-day scheduled follow-up drafts)
21. `tasks` (todo items linked to applications and professors)
22. `jobs` (registered scheduled job definitions)
23. `job_runs` (`idempotency_key` unique, `execution_duration_ms`, `retry_count`, row counters)
24. `activity_logs` (system activity timeline)
25. `audit_logs` (immutable security and mutation audit trail with before/after JSON snapshots)
26. `system_settings` (runtime safety flags including `EMAIL_AUTOMATION_ENABLED=false`)
