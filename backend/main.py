"""
Shama Abidi — Autonomous AI Research Agent & CRM System
Production FastAPI Server (Sections 2, 4, 21-33)

Exposes REST API endpoints for:
  - Full 19-table CRM state snapshot (`GET /api/state`, `GET /api/v1/health`)
  - Research Knowledge Base document upload, deletion, and reprocessing (`POST /api/documents/upload`, `DELETE /api/documents/{doc_id}`, `POST /api/documents/reprocess`)
  - Event-driven execution of any of the 7 scheduled jobs (`POST /api/jobs/run`)
  - Gmail Draft creation & marking a draft as manually sent (`POST /api/drafts/{draft_id}/mark-sent`, `POST /api/drafts/create-gmail`)
  - Updating system settings (`POST /api/settings/update`)
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from autonomous_pipeline import (
    mark_draft_as_manually_sent_and_track_thread,
    run_all_scheduled_jobs,
    run_job_email_draft_generation,
    run_job_followup_detection,
    run_job_funding_and_candidate_verification,
    run_job_gmail_reply_monitoring,
    run_job_professor_matching,
    run_job_research_discovery,
    run_job_system_health_check,
)
from database import (
    export_production_state_snapshot,
    init_database,
    update_setting,
)
from document_processor import (
    delete_research_document,
    ingest_verified_knowledge_base_to_db,
    upload_custom_research_document,
)
from gmail_service import create_gmail_draft


app = FastAPI(
    title="Dr. Shama Abidi — Autonomous AI Research Agent & CRM API",
    version="4.0.0",
    description=(
        "Autonomous Cloud PhD Supervisor Discovery, Evidence-Based Research Matching, "
        "Funding Verification, Human-in-the-Loop Gmail Drafts, and WhatsApp Business API Notifications."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DocumentUploadPayload(BaseModel):
    filename: str
    title: str
    extracted_text: str
    document_type: str = "PUBLICATION_PDF"
    publication_year: int = 2025
    journal_or_venue: str = "Uploaded Research Document"
    doi: str = ""
    page_count: int = 1


class JobRunPayload(BaseModel):
    job_id: str = "ALL"


class SettingUpdatePayload(BaseModel):
    setting_key: str
    setting_value: str
    description: Optional[str] = None


class DraftComposePayload(BaseModel):
    recipient_email: str
    subject: str
    body_text: str


@app.on_event("startup")
def on_startup() -> None:
    init_database()


@app.get("/api/state")
@app.get("/api/v1/state")
def get_full_crm_state() -> Dict[str, Any]:
    """Returns the live 19-table relational database snapshot."""
    init_database()
    snapshot = export_production_state_snapshot()
    health = run_job_system_health_check()
    snapshot["service_health_matrix"] = health["services"]
    return snapshot


@app.get("/api/v1/health")
@app.get("/api/health")
def get_system_health() -> Dict[str, Any]:
    init_database()
    health = run_job_system_health_check()
    snapshot = export_production_state_snapshot()
    return {
        "status": "healthy",
        "schema_version": snapshot["schema_version"],
        "dashboard_kpis": snapshot["dashboard_kpis"],
        "services": health["services"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/documents/upload")
@app.post("/api/v1/knowledge-base/upload")
def upload_document_endpoint(payload: DocumentUploadPayload) -> Dict[str, Any]:
    res = upload_custom_research_document(
        filename=payload.filename,
        title=payload.title,
        extracted_text=payload.extracted_text,
        document_type=payload.document_type,
        publication_year=payload.publication_year,
        journal_or_venue=payload.journal_or_venue,
        doi=payload.doi,
        page_count=payload.page_count,
    )
    run_job_professor_matching()
    snapshot = export_production_state_snapshot()
    return {"result": res, "state": snapshot}


@app.delete("/api/documents/{doc_id}")
def delete_document_endpoint(doc_id: str) -> Dict[str, Any]:
    res = delete_research_document(doc_id)
    snapshot = export_production_state_snapshot()
    return {"result": res, "state": snapshot}


@app.post("/api/documents/reprocess")
@app.post("/api/v1/knowledge-base/ingest")
def reprocess_knowledge_base_endpoint() -> Dict[str, Any]:
    res = ingest_verified_knowledge_base_to_db(force_reprocess=True)
    run_job_professor_matching()
    snapshot = export_production_state_snapshot()
    return {"result": res, "state": snapshot}


@app.post("/api/jobs/run")
@app.post("/api/v1/worker/run-openalex")
def trigger_scheduled_job(payload: Optional[JobRunPayload] = None) -> Dict[str, Any]:
    job_id = payload.job_id if payload else "ALL"
    init_database()
    if job_id == "job_research_discovery":
        res = run_job_research_discovery()
    elif job_id == "job_professor_matching":
        res = run_job_professor_matching()
    elif job_id == "job_funding_verification":
        res = run_job_funding_and_candidate_verification()
    elif job_id == "job_email_draft_generation":
        res = run_job_email_draft_generation()
    elif job_id == "job_gmail_reply_monitoring":
        res = run_job_gmail_reply_monitoring()
    elif job_id == "job_followup_detection":
        res = run_job_followup_detection()
    elif job_id == "job_system_health_check":
        res = run_job_system_health_check()
    else:
        res = run_all_scheduled_jobs()

    snapshot = export_production_state_snapshot()
    return {"job_id": job_id, "execution_result": res, "state": snapshot}


@app.post("/api/drafts/{draft_id}/mark-sent")
def mark_draft_sent_endpoint(draft_id: str) -> Dict[str, Any]:
    try:
        res = mark_draft_as_manually_sent_and_track_thread(draft_id)
        snapshot = export_production_state_snapshot()
        return {"result": res, "state": snapshot}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/drafts/create-gmail")
def create_gmail_draft_endpoint(payload: DraftComposePayload) -> Dict[str, Any]:
    return create_gmail_draft(
        recipient_email=payload.recipient_email,
        subject=payload.subject,
        body_text=payload.body_text,
    )


@app.post("/api/settings/update")
def update_settings_endpoint(payload: SettingUpdatePayload) -> Dict[str, Any]:
    # Enforce hard safety lock: initial_email_auto_send can NEVER be enabled
    if payload.setting_key in ("initial_email_auto_send", "followup_email_auto_send", "professor_reply_auto_send"):
        update_setting(payload.setting_key, "DISABLED", payload.description)
    else:
        update_setting(payload.setting_key, payload.setting_value, payload.description)
    snapshot = export_production_state_snapshot()
    return {"status": "UPDATED", "state": snapshot}
