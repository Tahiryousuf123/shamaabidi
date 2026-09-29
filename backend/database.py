"""
Shama Abidi — Autonomous AI Research Agent & CRM System
Persistent Relational Database Manager (Section 26)

Manages all 19 required database tables in SQLite (`data/shama_production.db`) and
automatically exports a synchronized cloud state snapshot (`data/production_state.json`)
so desktop, mobile, Netlify serverless functions, and GitHub Actions workflows
always share the exact same persistent database state.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from typing import Any, Dict, List, Optional


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "shama_production.db"
STATE_JSON_PATH = DATA_DIR / "production_state.json"
INIT_SQL_PATH = Path(__file__).resolve().parent / "db" / "init.sql"
KB_JSON_PATH = Path(__file__).resolve().parent / "knowledge_base" / "shama_verified_kb.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_id(prefix: str, raw_key: str) -> str:
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def normalize_name_uni(name: str, university: str) -> str:
    clean_n = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    clean_u = re.sub(r"[^a-z0-9]", "", (university or "").lower())
    return f"{clean_n}::{clean_u}"


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_database() -> None:
    """Initializes all 19 tables from backend/db/init.sql and seeds default user & settings."""
    conn = get_connection()
    with open(INIT_SQL_PATH, "r", encoding="utf-8") as f:
        sql_script = f.read()
    conn.executescript(sql_script)

    now = utc_now_iso()
    # 1. Seed primary user: Dr. Shama Abidi
    conn.execute(
        """
        INSERT OR IGNORE INTO users (
            id, full_name, degree_title, designation, institution,
            city, country, official_email, whatsapp_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "user_shama_abidi",
            "Dr. Shama Abidi",
            "PharmD, MPhil in Pharmacy Practice",
            "Senior Clinical Pharmacist & Academic Researcher",
            "Liaquat National Hospital and Medical College & University of Karachi",
            "Karachi",
            "Pakistan",
            "shama.abidi80@gmail.com",
            "+923002460274",
            now,
            now,
        ),
    )

    # 19. Seed default system_settings (Section 23.11)
    default_settings = [
        ("target_countries", "United Kingdom, Germany, Australia, Sweden, Netherlands, Canada, United States, Switzerland, Denmark, New Zealand, Ireland, Belgium, Norway, Finland, Singapore, Japan", "Target countries outside Pakistan for PhD supervisor discovery"),
        ("excluded_countries", "Pakistan", "Countries strictly excluded from professor discovery"),
        ("daily_discovery_target", "60", "Target number of new international candidates discovered per daily batch (30-100)"),
        ("daily_draft_limit", "10", "Maximum personalized Gmail outreach drafts created per day"),
        ("followup_days", "7", "Days without professor reply before generating a follow-up Gmail draft"),
        ("initial_email_auto_send", "DISABLED", "HARD SAFETY LOCK: AI only creates Gmail Drafts; Shama manually clicks Send"),
        ("followup_email_auto_send", "DISABLED", "HARD SAFETY LOCK: Follow-up emails are generated as drafts only"),
        ("professor_reply_auto_send", "DISABLED", "HARD SAFETY LOCK: AI never auto-replies to professors"),
        ("whatsapp_recipient_number", "+923002460274", "Dr. Shama Abidi's WhatsApp alert number"),
        ("gmail_account", "shama.abidi80@gmail.com", "Dr. Shama Abidi's Gmail account for drafts and reply monitoring"),
        ("discovery_cursor_page", "1", "Rotating pagination cursor so every daily batch discovers fresh professors"),
    ]
    for k, v, desc in default_settings:
        conn.execute(
            """
            INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (k, v, desc, now),
        )

    # Seed the 7 required scheduled jobs in automation_jobs if not present
    required_jobs = [
        ("job_research_discovery", "Research Discovery", "0 3 * * * (Daily 08:00 PKT)"),
        ("job_professor_matching", "Professor Matching", "15 3 * * * (Daily 08:15 PKT)"),
        ("job_funding_verification", "Funding Verification", "25 3 * * * (Daily 08:25 PKT)"),
        ("job_email_draft_generation", "Email Draft Generation", "35 3 * * * (Daily 08:35 PKT)"),
        ("job_gmail_reply_monitoring", "Gmail Reply Monitoring", "0 */6 * * * (Every 6 Hours)"),
        ("job_followup_detection", "Follow-up Detection", "0 5 * * * (Daily 10:00 PKT)"),
        ("job_system_health_check", "Health Check", "*/30 * * * * (Every 30 Minutes)"),
    ]
    for job_id, job_name, cron_expr in required_jobs:
        conn.execute(
            """
            INSERT OR IGNORE INTO automation_jobs (
                job_id, job_name, schedule_cron, start_time, end_time,
                status, retry_count, error_info, items_processed,
                last_successful_run, next_scheduled_run, execution_summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                job_name,
                cron_expr,
                now,
                now,
                "IDLE",
                0,
                "",
                0,
                now,
                "Scheduled via Cloud Cron",
                "Initialized and ready for autonomous batch execution.",
            ),
        )

    conn.commit()
    conn.close()


def log_activity(
    event_type: str,
    module_name: str,
    actor: str,
    summary: str,
    details: Optional[Dict[str, Any]] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> None:
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    now = utc_now_iso()
    log_id = make_id("log", f"{now}_{event_type}_{summary[:40]}")
    conn.execute(
        """
        INSERT OR REPLACE INTO activity_logs (
            id, event_type, module_name, actor, summary, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            log_id,
            event_type,
            module_name,
            actor,
            summary,
            json.dumps(details or {}, ensure_ascii=False),
            now,
        ),
    )
    if close_after:
        conn.commit()
        conn.close()


def is_professor_already_known(
    conn: sqlite3.Connection,
    full_name: str,
    university_name: str,
    orcid_id: str = "",
    official_email: str = "",
    profile_url: str = "",
) -> bool:
    """
    Section 6 Duplicate Prevention:
    Checks whether a professor already exists in the database by:
      1. ORCID
      2. Normalized (name + university)
      3. Email address
      4. Profile URL
    """
    norm_key = normalize_name_uni(full_name, university_name)
    cur = conn.execute(
        "SELECT id FROM professors WHERE normalized_name_uni_key = ?",
        (norm_key,),
    )
    if cur.fetchone():
        return True

    if orcid_id and orcid_id.strip():
        cur = conn.execute(
            "SELECT id FROM professors WHERE orcid_id = ? AND orcid_id != ''",
            (orcid_id.strip(),),
        )
        if cur.fetchone():
            return True

    if official_email and official_email.strip() and "@" in official_email:
        cur = conn.execute(
            "SELECT id FROM professors WHERE LOWER(official_email) = LOWER(?)",
            (official_email.strip(),),
        )
        if cur.fetchone():
            return True

    if profile_url and profile_url.strip():
        cur = conn.execute(
            "SELECT id FROM professors WHERE profile_url = ? AND profile_url != ''",
            (profile_url.strip(),),
        )
        if cur.fetchone():
            return True

    return False


def get_setting(key: str, default: str = "") -> str:
    conn = get_connection()
    row = conn.execute(
        "SELECT setting_value FROM system_settings WHERE setting_key = ?",
        (key,),
    ).fetchone()
    conn.close()
    return row["setting_value"] if row else default


def update_setting(key: str, value: str, description: Optional[str] = None) -> None:
    conn = get_connection()
    now = utc_now_iso()
    if description:
        conn.execute(
            """
            INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value = excluded.setting_value,
                description = excluded.description,
                updated_at = excluded.updated_at
            """,
            (key, str(value), description, now),
        )
    else:
        conn.execute(
            """
            UPDATE system_settings SET setting_value = ?, updated_at = ?
            WHERE setting_key = ?
            """,
            (str(value), now, key),
        )
    conn.commit()
    conn.close()


def export_production_state_snapshot() -> Dict[str, Any]:
    """
    Serializes the entire 19-table relational database into `data/production_state.json`
    so static hosts, Netlify Functions, and mobile/desktop browsers always render
    real database records with zero reliance on localStorage-only state.
    """
    conn = get_connection()

    def fetch_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    users = fetch_all("SELECT * FROM users")
    profiles = fetch_all("SELECT * FROM research_profiles")
    documents = fetch_all("SELECT * FROM research_documents ORDER BY publication_year DESC, uploaded_at DESC")
    facts = fetch_all("SELECT * FROM research_facts ORDER BY created_at DESC")
    embeddings_meta = fetch_all(
        "SELECT id, source_type, source_id, collection_name, vector_dimension, content_hash, created_at FROM research_embeddings"
    )
    universities = fetch_all("SELECT * FROM universities ORDER BY country ASC, name ASC")
    professors = fetch_all("SELECT * FROM professors ORDER BY relevance_score DESC, discovered_at DESC")
    prof_pubs = fetch_all("SELECT * FROM professor_publications ORDER BY publication_year DESC")
    funding = fetch_all("SELECT * FROM funding_evidence ORDER BY verified_at DESC")
    verifications = fetch_all("SELECT * FROM verification_records ORDER BY verified_at DESC")
    emails = fetch_all("SELECT * FROM email_addresses")
    drafts = fetch_all("SELECT * FROM email_drafts ORDER BY created_at DESC")
    threads = fetch_all("SELECT * FROM email_threads ORDER BY sent_at DESC")
    replies = fetch_all("SELECT * FROM email_replies ORDER BY received_at DESC")
    followups = fetch_all("SELECT * FROM followups ORDER BY due_date ASC")
    whatsapp_logs = fetch_all("SELECT * FROM whatsapp_notifications ORDER BY created_at DESC LIMIT 50")
    jobs = fetch_all("SELECT * FROM automation_jobs ORDER BY job_id ASC")
    logs = fetch_all("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 80")
    settings_rows = fetch_all("SELECT * FROM system_settings ORDER BY setting_key ASC")

    conn.close()

    # Enrich professors with their publications, funding_evidence, and verification_record
    pubs_by_prof: Dict[str, List[Dict[str, Any]]] = {}
    for p in prof_pubs:
        p["shared_keywords"] = json.loads(p.get("shared_keywords_json") or "[]")
        pubs_by_prof.setdefault(p["professor_id"], []).append(p)

    funding_by_prof: Dict[str, Dict[str, Any]] = {}
    for f_rec in funding:
        funding_by_prof[f_rec["professor_id"]] = f_rec

    verif_by_prof: Dict[str, Dict[str, Any]] = {}
    for v_rec in verifications:
        verif_by_prof[v_rec["professor_id"]] = v_rec

    prof_by_id: Dict[str, Dict[str, Any]] = {}
    for prof in professors:
        prof["research_areas"] = json.loads(prof.get("research_areas_json") or "[]")
        prof["publications"] = pubs_by_prof.get(prof["id"], [])
        prof["funding_detail"] = funding_by_prof.get(prof["id"], {})
        prof["verification_detail"] = verif_by_prof.get(prof["id"], {})
        prof_by_id[prof["id"]] = prof

    for d in drafts:
        p_obj = prof_by_id.get(d["professor_id"], {})
        d["professor_name"] = p_obj.get("full_name", "International Professor")
        d["university_name"] = p_obj.get("university_name", "")
        d["country"] = p_obj.get("country", "")
        d["funding_status"] = p_obj.get("funding_status", "NO EVIDENCE FOUND")
        d["verification_status"] = p_obj.get("verification_status", "VERIFIED")
        d["relevance_score"] = p_obj.get("relevance_score", 90.0)

    for t in threads:
        p_obj = prof_by_id.get(t["professor_id"], {})
        t["professor_name"] = p_obj.get("full_name", "International Professor")
        t["university_name"] = p_obj.get("university_name", "")
        t["country"] = p_obj.get("country", "")

    for r in replies:
        p_obj = prof_by_id.get(r["professor_id"], {})
        r["professor_name"] = p_obj.get("full_name", "International Professor")
        r["university_name"] = p_obj.get("university_name", "")
        r["country"] = p_obj.get("country", "")

    for fl in followups:
        p_obj = prof_by_id.get(fl["professor_id"], {})
        fl["professor_name"] = p_obj.get("full_name", "International Professor")
        fl["university_name"] = p_obj.get("university_name", "")
        fl["country"] = p_obj.get("country", "")
        fl["recipient_email"] = p_obj.get("official_email", "")

    profile_obj = profiles[0] if profiles else {}
    if profile_obj:
        profile_obj["research_topics"] = json.loads(profile_obj.get("research_topics_json") or "[]")
        profile_obj["methods_used"] = json.loads(profile_obj.get("methods_used_json") or "[]")
        profile_obj["keywords"] = json.loads(profile_obj.get("keywords_json") or "[]")
        profile_obj["specializations"] = json.loads(profile_obj.get("specializations_json") or "[]")
        profile_obj["target_phd_themes"] = json.loads(profile_obj.get("target_phd_themes_json") or "[]")

    for doc in documents:
        doc["authors"] = json.loads(doc.get("authors_json") or "[]")
        # Omit full extracted_text in JSON snapshot if huge, keep first 1800 chars for fast mobile loading
        doc["extracted_text_preview"] = (doc.get("extracted_text") or "")[:1800]

    # Compute the 10 Required Dashboard KPI Cards (Section 23.1)
    new_candidates_count = len(professors)
    verified_professors_count = sum(
        1 for p in professors if p.get("verification_status") in ("VERIFIED", "PARTIALLY VERIFIED")
    )
    funding_opportunities_count = sum(
        1 for p in professors if p.get("funding_status") in ("VERIFIED", "PARTIALLY VERIFIED")
    )
    drafts_waiting_count = sum(
        1 for d in drafts if d.get("gmail_sync_status") != "MANUALLY_SENT_IN_GMAIL"
    )
    sent_emails_count = len(threads)
    replies_count = len(replies)
    interested_count = sum(
        1 for r in replies if r.get("classification") in ("INTERESTED", "POSITIVE", "MEETING REQUEST")
    )
    cv_requests_count = sum(
        1 for r in replies if r.get("classification") == "CV REQUESTED"
    )
    followups_count = len(followups)
    failed_jobs_count = sum(1 for j in jobs if j.get("status") == "FAILED")

    settings_dict = {row["setting_key"]: row["setting_value"] for row in settings_rows}

    snapshot: Dict[str, Any] = {
        "schema_version": "4.0.0-production",
        "generated_at": utc_now_iso(),
        "database_engine": "SQLite / PostgreSQL 19-Table Production Relational Schema",
        "dashboard_kpis": {
            "new_candidates": new_candidates_count,
            "verified_professors": verified_professors_count,
            "funding_opportunities": funding_opportunities_count,
            "drafts_waiting": drafts_waiting_count,
            "sent_emails": sent_emails_count,
            "replies": replies_count,
            "interested": interested_count,
            "cv_requests": cv_requests_count,
            "followups": followups_count,
            "failed_jobs": failed_jobs_count,
        },
        "user": users[0] if users else {},
        "research_profile": profile_obj,
        "research_documents": documents,
        "research_facts": facts,
        "research_embeddings_summary": {
            "total_vectors": len(embeddings_meta),
            "vector_dimension": 64,
            "collection_name": "shama_research_vectors",
            "records": embeddings_meta[:40],
        },
        "universities": universities,
        "professors": professors,
        "funding_evidence": funding,
        "verification_records": verifications,
        "email_addresses": emails,
        "email_drafts": drafts,
        "email_threads": threads,
        "email_replies": replies,
        "followups": followups,
        "whatsapp_notifications": whatsapp_logs,
        "automation_jobs": jobs,
        "activity_logs": logs,
        "system_settings": settings_dict,
        "system_settings_list": settings_rows,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(STATE_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)

    return snapshot
