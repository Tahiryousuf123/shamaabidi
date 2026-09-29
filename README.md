# Dr. Shama Abidi — Autonomous AI Research Agent & International PhD CRM

**Live Production Application:** [https://aspnetaptech-cyber.github.io/shama-abidi-phd-system/](https://aspnetaptech-cyber.github.io/shama-abidi-phd-system/)  
**Repository:** [https://github.com/aspnetaptech-cyber/shama-abidi-phd-system](https://github.com/aspnetaptech-cyber/shama-abidi-phd-system)

An autonomous, cloud-scheduled AI Research Assistant & 12-module CRM engineered for **Dr. Shama Abidi** (*PharmD, MPhil in Pharmacy Practice, University of Karachi; Senior Clinical Pharmacist at Liaquat National Hospital and Medical College, Karachi*).

---

## 1. System Architecture & Autonomous Cloud Execution

The system operates **100% independently of the developer's laptop** using event-driven scheduled batch jobs (`SCHEDULE → START JOB → PROCESS BATCH → SAVE RESULTS → EXIT`):

- **Cloud Schedulers:**
  - **GitHub Actions Cron Workflow** ([`.github/workflows/daily_phd_worker.yml`](.github/workflows/daily_phd_worker.yml)) — runs twice daily (`0 3 * * *` and `0 15 * * *` UTC) on Ubuntu cloud runners, executes all 7 scheduled batch jobs via [`backend/autonomous_pipeline.py`](backend/autonomous_pipeline.py), updates the persistent relational database ([`data/shama_production.db`](data/shama_production.db)) and cloud-synchronized state snapshot ([`data/production_state.json`](data/production_state.json)), and commits the updated state back to the repository.
  - **Netlify Serverless & Scheduled Functions** ([`netlify.toml`](netlify.toml), [`netlify/functions/api.js`](netlify/functions/api.js), [`netlify/functions/scheduled-discovery.js`](netlify/functions/scheduled-discovery.js), [`netlify/functions/scheduled-gmail-monitor.js`](netlify/functions/scheduled-gmail-monitor.js)).
  - **FastAPI Backend Server** ([`backend/main.py`](backend/main.py)) — exposes REST endpoints for local/container deployments.

---

## 2. 19-Entity Production Relational Database Schema

Defined in [`backend/db/init.sql`](backend/db/init.sql) and managed by [`backend/database.py`](backend/database.py):

1. `users` — Primary user record for Dr. Shama Abidi (`shama.abidi80@gmail.com`, `+923002460274`).
2. `research_profiles` — Structured research bio, topics, clinical/statistical methods, keywords, and specializations derived strictly from uploaded documents.
3. `research_documents` — Tracks uploaded PDFs through all 7 stages (`UPLOAD → PROCESSING → TEXT EXTRACTION → RESEARCH INFORMATION EXTRACTION → EMBEDDINGS → INDEXING → READY`).
4. `research_facts` — Source-attributed empirical facts, cohort sizes ($N=110$, $N=134$, $N=60$), and statistical results ($p=0.036$) linked to `document_id`.
5. `research_embeddings` — 64-dimensional clinical pharmacy semantic vectors cached by SHA-256 `content_hash` ([`backend/vector_engine.py`](backend/vector_engine.py)).
6. `universities` — International universities strictly outside Pakistan (`is_outside_pakistan = 1`).
7. `professors` — Discovered international supervisors deduplicated across runs by `ORCID`, `normalized_name_uni_key`, `official_email`, and `profile_url`.
8. `professor_publications` — Recent peer-reviewed papers (2023–2026) with DOIs, PMIDs, shared keywords, and cosine similarity scores.
9. `funding_evidence` — Grant agency, award ID, and strict classification (`VERIFIED`, `PARTIALLY VERIFIED`, `NOT CONFIRMED`, `NO EVIDENCE FOUND`).
10. `verification_records` — 6-point verification audit (`VERIFIED`, `PARTIALLY VERIFIED`, `NEEDS REVIEW`, `NOT VERIFIED`).
11. `email_addresses` — Public corresponding-author emails and domain provenance.
12. `email_drafts` — Personalized outreach & follow-up drafts (`auto_send_disabled = 1`).
13. `email_threads` — Active thread tracker for emails manually sent by Shama Abidi.
14. `email_replies` — Incoming professor replies classified into 8 categories (`INTERESTED`, `CV REQUESTED`, `MEETING REQUEST`, `MORE INFORMATION`, `POSITIVE`, `DECLINED`, `NOT RELEVANT`, `OTHER`).
15. `followups` — 7-day follow-up draft queue (never auto-sent).
16. `whatsapp_notifications` — Grouped WhatsApp Business Cloud API notification logs.
17. `automation_jobs` — Execution telemetry (`job_id`, `start_time`, `end_time`, `status`, `retry_count`, `items_processed`, `last_successful_run`, `next_scheduled_run`).
18. `activity_logs` — Audit trail across all modules.
19. `system_settings` — Persistent runtime configuration & locked safety switches.

---

## 3. Quick Start & Commands

```bash
# 1. Initialize database & ingest Shama Abidi's verified publications
python backend/document_processor.py

# 2. Execute all 7 scheduled autonomous batch jobs end-to-end
python backend/autonomous_pipeline.py --run-all-jobs

# 3. Run the 20-point production verification suite
python backend/test_production_suite.py

# 4. Optional: Start the FastAPI server locally
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
