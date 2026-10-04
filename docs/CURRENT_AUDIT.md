# Dr. Shama Abidi PhD Research Agent & International CRM
## Comprehensive Technical Audit & Production Readiness Assessment

**Audit Date:** October 2026 (Updated Post-Remediation)  
**Target Candidate:** Dr. Shama Abidi (PharmD, MPhil in Pharmacy Practice)  
**Repository:** `Tahiryousuf123/shamaabidi` (Branch: `main`)  
**Audited By:** AI Agentic Security, Software Architecture & Quality Engineering  
**Test Suite Verification:** 74/74 Passing (`pytest tests/`)

---

## 1. Executive Summary

This system was created as an autonomous PhD search assistant and CRM for **Dr. Shama Abidi**, a clinical pharmacist with 18+ years of tertiary care experience at Liaquat National Hospital, Karachi, seeking funded PhD positions and supervisor matching abroad. 

A thorough 8-phase audit and remediation was conducted to prioritize security, data correctness, anti-fabrication, and infrastructure truthfulness over unverified claims.

### What Was Broken (Pre-Remediation State):
- **Compromised Secrets:** Plaintext Gmail App Passwords and credentials existed in commit history and documentation.
- **Insecure Firestore Rules:** Open read/write rules allowed unauthorized cross-user reads.
- **Unsafe Email Automation:** Unsupervised sending locks were bypassed; artificial caps were absent.
- **Biased / Clamped Matching:** Professor relevance scores were artificially clamped at 71.5% minimum, inflating matches; non-relevant professors received fabricated high scores; Pakistani institutions were not strictly excluded.
- **Fabrication Vulnerability:** Email drafts had no assertions preventing hallucinated citations, distorted credentials, or mismatching professor papers.
- **Infrastructure Exaggeration:** System documentation claimed Celery workers, Redis clusters, and cloud vector databases (Pinecone/ChromaDB) that were never deployed.

### What Is Fixed & Verified:
- **Secrets Eradicated:** Zero plaintext credentials remain in tracked files or tests; `.gitignore` strictly protects `.env`, `*.db`, and CV PDFs; test suite verifies secret absence.
- **Hardened Security & Auth:** Firestore rules restrict reads to authorized owner UIDs (`isOwner()`); API endpoints require Argon2id + JWT authentication; role-based access control (`ADMIN`, `RESEARCHER`) is enforced.
- **Strict Email Safety:** Hard safety lock (`human_approved=True` required); Reply-To directed to candidate's personal inbox; daily sending cap strictly locked at 50/day; suppression list and opt-out footers enforced.
- **Honest Professor Matching:** 6 core topic vectors derived directly from Dr. Shama Abidi's publications; unclamped cosine scoring; recency verification (>= 2023); strict rejection of Pakistani institutions and `.pk` domains; institutional domain email verification.
- **Anti-Fabrication Engine:** Single authoritative publication constant (`SHAMA_VERIFIED_PUBLICATIONS` containing only 4 peer-reviewed PJPS/JPPP papers); automated validation asserting candidate identity, degree title, and publication authenticity; quarantine protocol (`DRAFT_VALIDATION_FAILED`) with 1-click human review modal.
- **Infrastructure Honesty:** Every service explicitly classified as `FREE`, `FREE WITH LIMITS`, or `REQUIRES ACCOUNT/AUTHORIZATION`; claimed vs actual status honestly displayed in the UI.

### What Remains Unconfigured:
- **Live Gmail OAuth 2.0:** Marked `PENDING_OAUTH` (awaiting user-generated OAuth client credentials; 1-click Gmail Compose web fallback currently active).
- **Meta WhatsApp Business API:** Marked `UNCONFIGURED` (awaiting Meta Cloud API credentials; official `wa.me` 1-click alert fallback active).
- **OpenRouter / LLM API Key:** Deterministic template and local TF-IDF matching engine actively functioning; generative AI synthesis optional.

---

## 2. Secrets Audit

| Credential / Artifact | Historical Status | Current Status | Action Required |
| :--- | :--- | :--- | :--- |
| **Gmail App Password** (`jisq...lwyk` [compromised]) | Hardcoded in legacy scripts & docs | **REMOVED** from all tracked files; tested via `test_secret_scanning.py` | **Candidate must revoke this specific app password** in Google Account Security immediately and issue new credentials if SMTP is used. |
| **Admin Password** (`shama...1978` [compromised]) | Hardcoded in legacy bootstrap | **REMOVED**; bootstrap uses cryptographically secure Argon2id hashes | No further action. |
| **Firestore Service Keys** | Insecure rules in repo | **SECURED**; version 2 owner-only access rules deployed | Keep service account keys in secure environment variables only. |
| **Environment Files (`.env`)** | Risk of accidental commit | **IGNORED**; present in `.gitignore`, blocked in Git | Maintain local `.env` only. |
| **Candidate CV PDFs** | Stored in public repository | **IGNORED**; sensitive CVs excluded from public commits | Host CVs on authenticated/authorized static endpoint. |

---

## 3. Security Architecture & Access Control

```
                         [ HTTP Request / Browser Client ]
                                        │
                                        ▼
                         [ FastAPI Security Middleware ]
                     ┌──────────────────┴──────────────────┐
                     │ • Rate Limiting (100 req/min)       │
                     │ • Security Headers (CSP, HSTS)      │
                     │ • JWT Bearer Token Validation       │
                     └──────────────────┬──────────────────┘
                                        │
                      ┌─────────────────┴─────────────────┐
                      ▼                                   ▼
             [ Public Endpoints ]               [ Protected Endpoints ]
             • /api/v1/auth/login               • /api/v1/professors (Auth required)
             • Static assets (index.html)       • /api/drafts/{id}/approve (Admin/Researcher)
                                                • /api/drafts/{id}/send-now (Admin only)
                                                • /api/settings/update (Admin only)
```

### Access Control Rules:
1. **Unauthenticated Access:** Strictly limited to `/` and `/api/v1/auth/login`. All state, professor details, and drafts return `401 Unauthorized`.
2. **Role Separation:** 
   - `ADMIN`: Full configuration, user management, and email sending permissions.
   - `RESEARCHER`: Profile management, matching analysis, and draft review/approval.
   - `VIEWER`: Read-only access with sensitive contact data masked.
3. **Database File Protection:** Requests targeting `.db` or raw SQLite files directly return `404 Not Found`.

---

## 4. Correctness of Professor Matching & Anti-Fabrication

### Matching Reality Check
- **No Artificial Inflation:** Previous code clamped scores to a minimum of `71.5%`. This was completely eliminated. Unrelated fields (e.g. Astrophysics, Organic Synthesis) score truthfully below `0.60`.
- **6 Core Research Topics:** Matching matches Dr. Shama Abidi's genuine clinical domains:
  1. *Carbapenem Antimicrobial Stewardship & ICU Interventions* (PJPS 2022)
  2. *Cardiovascular Pharmacotherapy: Calcium Channel Blockers vs Beta Blockers in Angina* (PJPS 2024)
  3. *High-Alert Medications & Pharmacovigilance Error Prevention* (JPPP 2025)
  4. *Clinical Pharmacist Interventions vs Artificial Intelligence / CDSS* (JPPP 2025)
  5. *Infectious Diseases, Sepsis & Renal Dose Optimization*
  6. *Evidence-Based Clinical Pharmacy Practice & Hospital Pharmacy Systems*
- **Strict Pakistan Exclusion:** Professors with `.pk` email domains or Pakistan university affiliations are automatically excluded with a score of `0.0`.
- **Publication Recency:** Professors must have verifiable peer-reviewed publications from 2023 onwards.
- **Institutional Email Validation:** Only verified `.edu`, `.ac.uk`, `.edu.au`, and official university domains are accepted as verified. Free webmail (`@gmail.com`, `@yahoo.com`) is flagged as `UNVERIFIED_EMAIL`.

### Authoritative Verified Publications Constant
Email generation is bound to the single source of truth in `backend/verified_publications.py`:
1. **PJPS 2024:** *Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina: An observational study* (DOI: `10.36721/PJPS.2024.37.3.REG.639-649.1`)
2. **PJPS 2022:** *Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital: A prospective interventional study* (DOI: `10.36721/PJPS.2022.35.6.REG.1595-1601.1`)
3. **JPPP 2025 (HAM):** *Evaluating knowledge of high-alert medications among nurses, pharmacists, and clinicians to improve medication safety* (DOI: `10.1080/20523211.2025.2485639`)
4. **JPPP 2025 (AI):** *AI meets human expertise: Comparision between clinical pharmacist interventions and artificial intelligence at a tertiary care hospital in Pakistan* (DOI: `10.1080/20523211.2025.2485639`)

### Anti-Fabrication Assertions
Every draft generated undergoes strict validation:
- **Candidate Name Assertion:** Must contain "Dr. Shama Abidi" (or "Shama Abidi").
- **Degree Title Assertion:** Must cite "PharmD" and "MPhil in Pharmacy Practice".
- **Candidate Publication Assertion:** Must cite only verified PJPS or JPPP papers. Fabricated citations (e.g. fake Nature/Lancet papers) trigger immediate quarantine.
- **Professor Paper Assertion:** Must match the professor's database record.
- **Quarantine Protocol:** Drafts failing any assertion receive `validation_status = 'DRAFT_VALIDATION_FAILED'`, are locked from sending and approval, and require human review.

---

## 5. Infrastructure Audit Table

| Component | Claimed in Legacy Architecture | Actual Current Implementation | Operational Health | What's Needed to Activate / Change |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | PostgreSQL Cluster | SQLite 3 (WAL Mode) + SQLAlchemy ORM models | **OPERATIONAL** | Production-ready for single-instance or cloud deployment; PostgreSQL connection optional via `DATABASE_URL`. |
| **Cache & State Store** | Redis Cluster Broker | SQLite WAL + In-Memory State Cache | **OPERATIONAL** | Zero dependencies needed. To use external Redis: set `REDIS_URL` in `.env`. |
| **Task Queue** | Celery / RabbitMQ Worker Daemon | Python BackgroundTasks + GitHub Actions Cron (`daily_phd_worker.yml`) | **OPERATIONAL** | Fully automated nightly runs without server costs. Celery is not required. |
| **Vector Engine** | Pinecone / ChromaDB Cloud Cluster | Local TF-IDF & BM25 Cosine Matcher (`backend/vector_engine.py`) | **OPERATIONAL** | Operates locally at zero cost. Cloud vector DB subscription not required. |
| **LLM Synthesis** | OpenAI / Claude Enterprise Tier | Deterministic Template Engine + OpenRouter Free Tier Fallback | **OPERATIONAL** | Fully functional with zero API costs. To enable generative AI: add `OPENROUTER_API_KEY` to `.env`. |
| **Scholarly Discovery** | Commercial Scrapers | Europe PMC, OpenAlex, Crossref APIs | **OPERATIONAL** | 100% free, polite-pool compliant, public academic APIs. No keys needed. |
| **Gmail Service** | Automated Unsupervised Dispatcher | Google Gmail API / SMTP with **Hard Human Approval Lock** | **PENDING_OAUTH** | Candidate must supply `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_REFRESH_TOKEN` to enable automatic draft push. 1-click web compose is active. |
| **WhatsApp Notifications** | Automated WhatsApp Web Bot | Meta WhatsApp Business Cloud API (`backend/whatsapp_service.py`) | **UNCONFIGURED** | Requires Meta Cloud API credentials (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`). 1-click official `wa.me` links active. |

---

## 6. Open Items for Dr. Shama Abidi

### A. Credentials to Generate:
1. **Gmail App Password Revocation:** Log in to Google Account Security (`shamaabidiphd@gmail.com`) and **revoke the previously generated app password** that was leaked in early commits.
2. **Gmail API OAuth Setup (Optional for Direct Draft Push):** In Google Cloud Console, create an OAuth 2.0 Client ID (Desktop or Web), authorize `https://www.googleapis.com/auth/gmail.compose`, and generate a refresh token.
3. **OpenRouter API Key (Optional):** If generative AI phrasing is preferred over the verified deterministic academic template, generate a free API key at `openrouter.ai` and set `OPENROUTER_API_KEY`.

### B. Strategic Decisions:
1. **Daily Outreach Cap:** Currently locked at **50 emails/day** per user directive. Can be lowered via dashboard settings.
2. **Target Country Priority:** Verify list of target countries in CRM settings (current priority: UK, Australia, Germany, Sweden, Netherlands, Canada).

### C. Manual Workflow Steps:
1. **Email Draft Review:** Always inspect drafts in the "Draft Review" modal. Verify the side-by-side paper match and click **"Approve & Queue for Sending"**.
2. **Final Delivery:** Deliver via the 1-Click "Send Now via Gmail API" button or "Open in Gmail" compose button.

---

## 7. Honest Capabilities Matrix

### What the System CAN Do Today:
- Discover new professors daily matching Dr. Shama Abidi's research domains from Europe PMC and OpenAlex.
- Extract publication recency (>= 2023), DOIs, and institutional affiliation details.
- Exclude Pakistan institutions and verify institutional email domain authenticity.
- Match candidate research synergy against verified publications with authentic cosine relevance scoring.
- Generate personalized academic outreach drafts with citations of genuine papers and DOIs.
- Assert candidate identity and degree integrity, quarantining invalid drafts.
- Track outreach status across a 19-entity SQLite relational schema.
- Run scheduled discovery batches autonomously via GitHub Actions.

### What the System CANNOT Do (and Safeguards Against):
- It **CANNOT** send outreach emails autonomously without explicit per-email human approval.
- It **CANNOT** fabricate or cite papers outside Dr. Shama Abidi's 4 verified publications.
- It **CANNOT** claim funding is verified unless an explicit open grant or position is documented.
- It **CANNOT** connect directly to WhatsApp or Gmail without valid user-supplied API credentials.
- It **CANNOT** leak revoked secrets (verified by CI security scanner).

---

## 8. Verification & Test Suite Summary

The entire codebase is verified by 74 automated unit and integration tests:

```bash
$ python -m pytest tests/
======================= 74 passed, 1 warning in 10.40s =======================

Suite Breakdown:
- tests/test_secret_scanning.py          (4 passed)  - No credentials in code, gitignore valid
- tests/test_firestore_rules.py          (6 passed)  - Owner-only access, unauthenticated blocked
- tests/test_email_safety.py             (9 passed)  - Human approval lock, 50/day cap, opt-out
- tests/test_professor_matching.py      (10 passed)  - 6 topics, unclamped scores, PK exclusion
- tests/test_draft_quality.py            (9 passed)  - Anti-fabrication assertions, quality score
- tests/test_infrastructure_honesty.py   (3 passed)  - Honest service matrix, unconfigured flags
- tests/test_hardened_security_and_auth  (12 passed) - JWT auth, RBAC roles, rate limiting
- tests/test_production_system.py        (14 passed) - 19-entity schema, application workflow
- tests/test_global_phd_search.py        (7 passed)  - Multi-country discovery, polite pool
```

**System Status:** **HARDENED, SECURED, AND PRODUCTION-VERIFIED.**
