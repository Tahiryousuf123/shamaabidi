# Shama Abidi PhD System — Versioned REST API Reference (`docs/API.md`)

## 1. API Versioning & Standardized Error Format (Section 8)
All production endpoints are versioned under `/api/v1/*`.

### Standardized Error Envelope
Every `4xx` and `5xx` error returns a deterministic JSON envelope without exposing internal stack traces:
```json
{
  "success": false,
  "error": {
    "code": "EMAIL_SEND_BLOCKED",
    "message": "EMAIL_SAFETY_BLOCK: Email must be explicitly APPROVED by a human before sending.",
    "details": {}
  }
}
```

---

## 2. Endpoint Groups (`/api/v1/*`)

| Group | Base Path | Methods | RBAC Roles | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **1. Auth** | `/api/v1/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `POST /password-reset`, `POST /2fa/enable` | Public / Authenticated | Argon2id login, JWT access/refresh tokens, JTI revocation on logout, 5-attempt lockout, RFC 6238 TOTP 2FA |
| **2. Users** | `/api/v1/users` | `GET`, `POST` | `ADMIN` | List and create RBAC-governed user accounts |
| **3. Universities** | `/api/v1/universities` | `GET`, `POST` | Read: All · Write: `ADMIN`, `RESEARCHER` | Paginated, searchable international universities directory (Pakistan excluded) |
| **4. Departments** | `/api/v1/departments` | `GET`, `POST` | Read: All · Write: `ADMIN`, `RESEARCHER` | University department catalog with duplicate prevention |
| **5. Professors** | `/api/v1/professors` | `GET`, `POST`, `POST /{id}/verify` | Read: All · Write: `ADMIN`, `RESEARCHER` | Verified international supervisors, match scores, and provenance verification |
| **6. Publications** | `/api/v1/publications` | `GET`, `POST` | Read: All · Write: `ADMIN`, `RESEARCHER` | DOI/PMID/title-hash deduplicated publications |
| **7. Funding** | `/api/v1/funding` | `GET`, `POST` | Read: All · Write: `ADMIN`, `RESEARCHER` | Scholarships, fellowships, and grant evidence provenance |
| **8. Applications** | `/api/v1/applications` | `GET`, `POST`, `PATCH /{id}/status`, `POST /{id}/documents` | Read: All · Write: `ADMIN`, `RESEARCHER` | PhD CRM pipeline, status history, and magic-byte validated PDF uploads |
| **9. Emails** | `/api/v1/emails` | `GET`, `POST /drafts`, `POST /{id}/approve`, `POST /{id}/send`, `POST /{id}/reply` | Read: All · Write: `ADMIN`, `RESEARCHER` | Human-approved email workflow (`DRAFT -> APPROVED -> SENT -> REPLIED`) |
| **10. Follow-ups** | `/api/v1/followups` | `GET`, `POST` | Read: All · Write: `ADMIN`, `RESEARCHER` | 7-day follow-up scheduling and draft tracking |
| **11. Tasks** | `/api/v1/tasks` | `GET`, `POST` | Read: All · Write: `ADMIN`, `RESEARCHER` | Research and application task management |
| **12. Dashboard** | `/api/v1/dashboard` | `GET` | `ADMIN`, `RESEARCHER`, `VIEWER` | Live KPI counters and recent activity stream |
| **13. Jobs** | `/api/v1/jobs` | `GET`, `POST /{key}/trigger`, `PATCH /{key}/toggle` | Trigger: `ADMIN`, `RESEARCHER` · Toggle: `ADMIN` | Idempotent background job execution and run telemetry |
| **14. Audit** | `/api/v1/audit` | `GET` | `ADMIN`, `RESEARCHER` | Immutable security and data mutation audit trail |
