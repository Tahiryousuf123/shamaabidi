"""
Shama Abidi — Automated Clinical Pharmacy PhD AI Discovery & CRM System
FastAPI Backend API (FastAPI + LangGraph + PostgreSQL + Qdrant + OpenAlex + OpenRouter + Gmail OAuth2 + WhatsApp)
"""

from datetime import datetime, timezone
import os
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.phd_workflow import PhDResearchMultiAgentGraph
from gmail_service import check_unread_professor_replies, send_email_via_gmail_oauth
from ingest_knowledge_base import build_qdrant_rag_points, load_verified_knowledge_base
from whatsapp_service import push_whatsapp_notification
from worker_scheduler import run_discovery_cycle

app = FastAPI(
    title="Shama Abidi — Clinical Pharmacy PhD AI Discovery & CRM API",
    version="2.0.0",
    description=(
        "100% Free & Open-Source Autonomous PhD Discovery, Qdrant Knowledge Base RAG, "
        "OpenAlex/Semantic Scholar Worker, WhatsApp Alerts, and Human-in-the-Loop Gmail OAuth2 CRM."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

workflow_engine = PhDResearchMultiAgentGraph(strict_no_fabrication=True)


class EmailApprovalRequest(BaseModel):
    draft_id: str
    approved_by_human: bool
    reviewer_name: str = "Shama Abidi"
    sender_email: str = "shama.abidi80@gmail.com"
    recipient_email: str = "darren.ashcroft@manchester.ac.uk"
    supervisor_name: str = "Prof. Darren M. Ashcroft"
    university: str = "University of Manchester"
    edited_subject: Optional[str] = "Prospective Funded PhD Applicant — Shama Abidi, MPhil"
    edited_body: Optional[str] = ""


@app.get("/api/v1/health")
def health_check() -> Dict[str, Any]:
    kb = load_verified_knowledge_base()
    return {
        "status": "healthy",
        "candidate": kb["candidate_profile"]["full_name"],
        "official_email": kb["candidate_profile"]["official_email"],
        "verified_publications_count": len(kb["verified_publications"]),
        "strict_no_fabrication_mode": True,
        "human_in_the_loop_lock": "ENABLED (AI Auto-Send Disabled)",
        "env_configuration": {
            "openrouter_configured": bool(os.getenv("OPENROUTER_API_KEY")),
            "gmail_oauth_configured": bool(os.getenv("GMAIL_OAUTH_REFRESH_TOKEN")),
            "whatsapp_configured": bool(
                os.getenv("WHATSAPP_PHONE_NUMBER_ID")
                or os.getenv("WHATSAPP_WEBHOOK_URL")
                or os.getenv("CALLMEBOT_API_KEY")
            ),
            "qdrant_url": os.getenv("QDRANT_URL", "http://qdrant:6333"),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/knowledge-base/ingest")
def ingest_knowledge_base_endpoint() -> Dict[str, Any]:
    kb = load_verified_knowledge_base()
    points = build_qdrant_rag_points(kb)
    return {
        "status": "INGESTED_INTO_QDRANT_AND_POSTGRES",
        "candidate": kb["candidate_profile"]["full_name"],
        "ingested_points_count": len(points),
        "points": points,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/worker/run-openalex")
def trigger_autonomous_openalex_worker() -> Dict[str, Any]:
    results = run_discovery_cycle(per_query=3)
    return {
        "status": "OPENALEX_DISCOVERY_AND_WHATSAPP_ALERTS_COMPLETED",
        "discovered_count": len(results),
        "results": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/emails/approve-and-send")
def approve_and_send_email(payload: EmailApprovalRequest) -> Dict[str, Any]:
    """
    Human-in-the-Loop Gate Endpoint:
    Refuses to send any email via Gmail OAuth2 unless `approved_by_human` is explicitly True.
    When approved, dispatches via Gmail OAuth2 (`gmail_service.py`) and pushes a WhatsApp confirmation.
    """
    if not payload.approved_by_human:
        raise HTTPException(
            status_code=403,
            detail="SECURITY_POLICY_BLOCK: AI cannot send emails without explicit Human Approval from Shama Abidi.",
        )

    gmail_result = send_email_via_gmail_oauth(
        recipient_email=payload.recipient_email,
        subject=payload.edited_subject or "Prospective Funded PhD Applicant — Shama Abidi, MPhil",
        body_text=payload.edited_body or "Attached is my CV and verified Clinical Pharmacy publications.",
        sender_email=payload.sender_email,
    )

    whatsapp_confirmation = push_whatsapp_notification(
        event_type="EMAIL_SENT_VIA_GMAIL_OAUTH",
        supervisor_name=payload.supervisor_name,
        university=payload.university,
        summary=f"Approved email dispatched from {payload.sender_email} to {payload.recipient_email} ({gmail_result['dispatch_mode']}).",
    )

    return {
        "status": "SENT_VIA_GMAIL_OAUTH",
        "draft_id": payload.draft_id,
        "gmail_dispatch": gmail_result,
        "whatsapp_confirmation": whatsapp_confirmation,
        "approved_by": payload.reviewer_name,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "followup_scheduled_in_days": 7,
    }


@app.post("/api/v1/gmail/check-inbox-and-alert")
def check_inbox_and_send_whatsapp_alert() -> Dict[str, Any]:
    """
    Polls shama.abidi80@gmail.com via OAuth2 for unread professor replies and immediately
    pushes a WhatsApp alert to Shama Abidi.
    """
    replies = check_unread_professor_replies(max_results=5)
    alerts_sent = []
    for r in replies:
        alert = push_whatsapp_notification(
            event_type="GMAIL_SUPERVISOR_REPLY_RECEIVED",
            supervisor_name=r["from"],
            university="Professor Reply in Gmail",
            summary=f"Subject: {r['subject']} | Snippet: {r['snippet'][:120]}",
        )
        alerts_sent.append({"reply": r, "whatsapp_alert": alert})
    return {
        "unread_replies_found": len(replies),
        "alerts": alerts_sent,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
