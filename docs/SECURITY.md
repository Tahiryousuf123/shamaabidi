# Shama Abidi PhD System — Security Architecture & Controls (`docs/SECURITY.md`)

## 1. Authentication & Password Security (Section 6)
- **Password Hashing**: Argon2id (`argon2-cffi`, `time_cost=2`, `memory_cost=65536`, `parallelism=2`).
- **Password Policy**: Minimum 10 characters with mandatory uppercase, lowercase, numeric digit, and special character.
- **JWT Session Management**: Signed `HS256` access tokens (`60m` expiry) and refresh tokens (`7d` expiry) with unique `jti` claims.
- **Logout Revocation**: `POST /api/v1/auth/logout` adds the token's `jti` to the revocation registry; any subsequent use returns `401 TOKEN_REVOKED`.
- **Brute-Force Lockout**: Accounts lock for `15` minutes (`423 ACCOUNT_LOCKED`) after `5` consecutive failed login attempts.
- **Administrator 2FA**: RFC 6238 TOTP two-factor authentication (`POST /api/v1/auth/2fa/enable`).

---

## 2. Role-Based Access Control (RBAC)
- **`ADMIN`**: Full access to `/api/v1/users`, job enable/disable toggles, system settings, and all research/email endpoints.
- **`RESEARCHER`**: Can create/verify universities, professors, publications, funding, applications, email drafts, approvals, and view audit logs. Blocked (`403`) from user administration.
- **`VIEWER`**: Read-only access to dashboard, universities, professors, publications, and funding. Blocked (`403`) from all mutations and audit logs.

---

## 3. HTTP Security Middleware & Input Validation (Section 5)
- **Security Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy: default-src 'self'; ...`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- **Rate Limiting**: Sliding-window per-IP rate limiter (`120 req/min` default) returning `429 RATE_LIMIT_EXCEEDED`.
- **SQL Injection Defense**: 100% parameterized SQLAlchemy 2.0 ORM queries.
- **XSS Defense**: Server-side HTML/script tag stripping (`sanitize_text_against_xss`) + frontend DOM escaping (`escapeHtml`).
- **File Upload Hardening**:
  - Blocks executable/script extensions (`.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.php`, `.py`, `.js`, `.dll`).
  - Enforces `%PDF-` magic header on PDF uploads and records SHA-256 checksums.
