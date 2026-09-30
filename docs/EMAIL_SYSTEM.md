# Shama Abidi PhD System — Safe Human-Approved Email System (`docs/EMAIL_SYSTEM.md`)

## 1. Safety-First Design (Section 14 & Section 15)
To protect Dr. Shama Abidi's academic reputation and prevent accidental or duplicate outreach:
1. **`EMAIL_AUTOMATION_ENABLED=false` by Default**: The system never dispatches cold emails or follow-ups automatically.
2. **Mandatory Human Approval State Machine**:
   ```
   DRAFT ──(Human Review: POST /api/v1/emails/{id}/approve)──► APPROVED ──(POST /api/v1/emails/{id}/send)──► SENT ──► REPLIED
   ```
3. **Hard Guard Against Unapproved Sends**:
   - Calling `POST /api/v1/emails/{id}/send` on an email in `DRAFT` status (or without `approved_by_user_id`) is rejected with `400 EMAIL_SEND_BLOCKED`.
4. **Idempotent Dispatch**:
   - Every email draft carries a deterministic `idempotency_key` (`SHA-256(professor_id :: subject)`).
   - If `POST /api/v1/emails/{id}/send` is called multiple times on an already `SENT` email, the service returns `newly_sent: false` and never transmits a duplicate message.

---

## 2. Thread Tracking, Reply Classification & 7-Day Follow-Ups
- **Threads (`email_threads`)**: Created automatically when an approved email transitions to `SENT`.
- **Replies (`email_replies`)**: Recorded via `POST /api/v1/emails/{id}/reply` and classified into controlled categories (`CV_REQUESTED`, `MEETING_REQUEST`, `INTERESTED`, `MORE_INFORMATION`, `DECLINED`), automatically updating the linked PhD `Application` status (`INTERVIEW` or `REPLIED`).
- **Follow-Ups (`followups`)**: Scheduled via `POST /api/v1/followups` (default 7 days after initial send) as `DRAFT` follow-up messages requiring human review.
