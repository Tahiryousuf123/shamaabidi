"""
Shama Abidi — Autonomous AI Research Agent & CRM System
Official Gmail OAuth 2.0 Service (Sections 14, 15, 16, 17, 19)

Hard Safety & Honesty Rules:
  1. NEVER auto-send initial outreach emails (`initial_email_auto_send = DISABLED`).
     Creates Gmail Drafts via `POST /gmail/v1/users/me/drafts` so Shama Abidi reviews
     and manually clicks SEND in Gmail.
  2. NEVER auto-send follow-up emails or auto-reply to professors.
  3. NEVER fake "Connected" status if OAuth credentials are not configured or invalid.
"""

import base64
from email.mime.text import MIMEText
import json
import os
from typing import Any, Dict, List
import urllib.parse
import urllib.request


GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"


def check_gmail_oauth_status() -> Dict[str, Any]:
    """
    Honestly inspects whether Gmail OAuth 2.0 credentials are configured and valid.
    Classifies service as REQUIRES ACCOUNT/AUTHORIZATION (Section 19).
    """
    client_id = os.getenv("GMAIL_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GMAIL_OAUTH_CLIENT_SECRET", "").strip()
    refresh_token = os.getenv("GMAIL_OAUTH_REFRESH_TOKEN", "").strip()

    has_keys = bool(
        client_id
        and client_secret
        and refresh_token
        and not client_id.startswith("your_")
        and not refresh_token.startswith("your_")
    )
    if not has_keys:
        return {
            "service": "Gmail API (Drafts & Reply Monitor)",
            "classification": "REQUIRES ACCOUNT/AUTHORIZATION",
            "connected": False,
            "status_label": "REQUIRES GMAIL OAUTH AUTHORIZATION",
            "account": "shamaabidiphd@gmail.com",
            "detail": "Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN in .env / Cloud Secrets to enable automatic syncing directly into Gmail Drafts folder. Until authorized, drafts are saved in the CRM database with 1-click 'Open in Gmail Compose' links.",
        }

    try:
        token = get_gmail_access_token()
        req = urllib.request.Request(
            GMAIL_PROFILE_URL,
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            prof = json.loads(resp.read().decode("utf-8"))
            return {
                "service": "Gmail API (Drafts & Reply Monitor)",
                "classification": "REQUIRES ACCOUNT/AUTHORIZATION",
                "connected": True,
                "status_label": "CONNECTED (LIVE OAUTH 2.0)",
                "account": prof.get("emailAddress", "shamaabidiphd@gmail.com"),
                "detail": "Live Gmail OAuth 2.0 verified for Draft creation and Reply monitoring.",
            }
    except Exception as e:
        return {
            "service": "Gmail API (Drafts & Reply Monitor)",
            "classification": "REQUIRES ACCOUNT/AUTHORIZATION",
            "connected": False,
            "status_label": "OAUTH TOKEN INVALID OR EXPIRED",
            "account": "shamaabidiphd@gmail.com",
            "detail": f"OAuth token exchange failed: {e}",
        }


def get_gmail_access_token() -> str:
    """Exchanges GMAIL_OAUTH_REFRESH_TOKEN for a short-lived OAuth 2.0 Access Token."""
    client_id = os.getenv("GMAIL_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GMAIL_OAUTH_CLIENT_SECRET", "").strip()
    refresh_token = os.getenv("GMAIL_OAUTH_REFRESH_TOKEN", "").strip()

    if (
        not client_id
        or not client_secret
        or not refresh_token
        or client_id.startswith("your_")
        or refresh_token.startswith("your_")
    ):
        raise ValueError("GMAIL_OAUTH_CREDENTIALS_NOT_CONFIGURED")

    payload = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        GMAIL_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["access_token"]


def create_gmail_draft(
    recipient_email: str,
    subject: str,
    body_text: str,
    sender_email: str = "shamaabidiphd@gmail.com",
) -> Dict[str, Any]:
    """
    Section 14 & 15: Creates an email draft inside Shama Abidi's Gmail Drafts folder
    using `users.drafts.create`. NEVER sends the email automatically.
    If Gmail OAuth is not yet configured, returns honest status `LOCAL_CRM_DRAFT_PENDING_OAUTH`
    along with a direct Gmail Web Compose URL.
    """
    gmail_compose_url = (
        "https://mail.google.com/mail/?view=cm&fs=1"
        f"&to={urllib.parse.quote(recipient_email)}"
        f"&su={urllib.parse.quote(subject)}"
        f"&body={urllib.parse.quote(body_text)}"
    )

    try:
        access_token = get_gmail_access_token()
    except ValueError:
        return {
            "gmail_sync_status": "LOCAL_CRM_DRAFT_PENDING_OAUTH",
            "gmail_draft_id": "",
            "gmail_compose_url": gmail_compose_url,
            "auto_send_disabled": True,
            "note": "Stored in CRM Database & ready to open in Gmail Compose (Configure GMAIL_OAUTH_* to push directly into Gmail Drafts via API).",
        }
    except Exception as e:
        return {
            "gmail_sync_status": "LOCAL_CRM_DRAFT_PENDING_OAUTH",
            "gmail_draft_id": "",
            "gmail_compose_url": gmail_compose_url,
            "auto_send_disabled": True,
            "note": f"OAuth error ({e}); stored in CRM Database with 1-click Gmail Compose link.",
        }

    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication

    mime_msg = MIMEMultipart()
    mime_msg["to"] = recipient_email
    mime_msg["from"] = f"Dr. Shama Abidi <{sender_email}>"
    mime_msg["subject"] = subject

    # Attach message body
    mime_msg.attach(MIMEText(body_text, "plain", "utf-8"))

    # Automatically attach Dr. Shama Abidi Academic CV PDF
    cv_candidates = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "documents", "Dr_Shama_Abidi_Academic_CV_2026.pdf"),
        os.path.join(os.getcwd(), "data", "documents", "Dr_Shama_Abidi_Academic_CV_2026.pdf"),
    ]
    for cv_path in cv_candidates:
        if os.path.exists(cv_path):
            try:
                with open(cv_path, "rb") as f:
                    pdf_attachment = MIMEApplication(f.read(), _subtype="pdf")
                    pdf_attachment.add_header(
                        "Content-Disposition",
                        "attachment",
                        filename="Dr_Shama_Abidi_Academic_CV_2026.pdf",
                    )
                    mime_msg.attach(pdf_attachment)
                break
            except Exception as e:
                pass

    raw_base64 = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")
    req_body = json.dumps({"message": {"raw": raw_base64}}).encode("utf-8")

    try:
        req = urllib.request.Request(
            GMAIL_DRAFTS_URL,
            data=req_body,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            return {
                "gmail_sync_status": "GMAIL_DRAFT_CREATED",
                "gmail_draft_id": res_data.get("id", ""),
                "gmail_compose_url": gmail_compose_url,
                "auto_send_disabled": True,
                "note": "Created in Gmail Drafts folder via OAuth 2.0. Waiting for Shama Abidi to click SEND in Gmail.",
            }
    except Exception as e:
        return {
            "gmail_sync_status": "LOCAL_CRM_DRAFT_PENDING_OAUTH",
            "gmail_draft_id": "",
            "gmail_compose_url": gmail_compose_url,
            "auto_send_disabled": True,
            "note": f"Gmail Draft API error ({e}); saved locally with Gmail Compose link.",
        }


def classify_professor_reply_text(subject: str, body_text: str) -> Dict[str, str]:
    """
    Section 16: Classifies a professor's reply into one of the 8 authoritative categories:
      - INTERESTED
      - CV REQUESTED
      - MEETING REQUEST
      - MORE INFORMATION
      - POSITIVE
      - DECLINED
      - NOT RELEVANT
      - OTHER
    """
    text = f"{subject} {body_text}".lower()

    if any(k in text for k in ["zoom", "teams", "skype", "meet", "interview", "call", "schedule a chat", "calendar"]):
        return {
            "classification": "MEETING REQUEST",
            "ai_summary": "Professor invited Shama Abidi to schedule an online interview/meeting to discuss PhD supervision.",
            "suggested_next_action": "Reply manually in Gmail with 3 available time slots (PKT/UTC) and attach full CV + PJPS PDFs.",
        }
    if any(k in text for k in ["send your cv", "attach your cv", "curriculum vitae", "transcripts", "research proposal", "share your cv"]):
        return {
            "classification": "CV REQUESTED",
            "ai_summary": "Professor requested Shama Abidi's full CV, academic transcripts, or a 1-page PhD research concept note.",
            "suggested_next_action": "Reply manually in Gmail with updated CV, MPhil transcript, and PJPS 2022/2024 publications.",
        }
    if any(k in text for k in ["encouraged to apply", "interested in supervising", "strong fit", "vacancies available", "phd opening", "happy to support"]):
        return {
            "classification": "INTERESTED",
            "ai_summary": "Professor expressed strong interest in Shama's antimicrobial stewardship and clinical pharmacy research background.",
            "suggested_next_action": "Review the professor's guidance and prepare formal application materials.",
        }
    if any(k in text for k in ["tell me more", "additional information", "which funding", "clarify", "elaborate", "further details"]):
        return {
            "classification": "MORE INFORMATION",
            "ai_summary": "Professor asked for additional details regarding research methodology, timeline, or scholarship track.",
            "suggested_next_action": "Draft a detailed manual reply addressing the professor's specific questions.",
        }
    if any(k in text for k in ["thank you for reaching out", "impressive profile", "keep in touch", "good luck", "best wishes"]):
        if any(neg in text for neg in ["unfortunately", "not taking", "no funding", "full", "retiring", "cannot supervise", "no capacity"]):
            return {
                "classification": "DECLINED",
                "ai_summary": "Professor politely declined due to lack of current lab capacity or PhD funding.",
                "suggested_next_action": "Mark thread closed; no follow-up needed.",
            }
        return {
            "classification": "POSITIVE",
            "ai_summary": "Professor responded positively to Shama's inquiry.",
            "suggested_next_action": "Review message in Gmail and follow up manually.",
        }
    if any(neg in text for neg in ["unfortunately", "not accepting", "no positions", "no funding", "cannot take", "not recruiting"]):
        return {
            "classification": "DECLINED",
            "ai_summary": "Professor indicated no open PhD positions or funding for the upcoming intake.",
            "suggested_next_action": "Archive candidate so no follow-up is generated.",
        }
    if any(k in text for k in ["out of office", "automatic reply", "auto-reply", "vacation"]):
        return {
            "classification": "OTHER",
            "ai_summary": "Automated out-of-office responder detected.",
            "suggested_next_action": "Wait until professor's return date before following up.",
        }

    return {
        "classification": "MORE INFORMATION",
        "ai_summary": "Professor replied to PhD inquiry; manual review recommended.",
        "suggested_next_action": "Open thread in Gmail and respond personally.",
    }


def check_unread_professor_replies(max_results: int = 10) -> List[Dict[str, Any]]:
    """
    Polls shamaabidiphd@gmail.com via OAuth2 for unread replies and classifies them.
    """
    try:
        access_token = get_gmail_access_token()
    except Exception:
        return []

    query = urllib.parse.urlencode({"q": "is:unread -from:me", "maxResults": max_results})
    req = urllib.request.Request(
        f"{GMAIL_MESSAGES_URL}?{query}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        listing = json.loads(resp.read().decode("utf-8"))

    replies: List[Dict[str, Any]] = []
    for msg_meta in listing.get("messages", []):
        msg_id = msg_meta["id"]
        detail_req = urllib.request.Request(
            f"{GMAIL_MESSAGES_URL}/{msg_id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(detail_req, timeout=15) as d_resp:
            detail = json.loads(d_resp.read().decode("utf-8"))
            headers = {
                h["name"]: h["value"]
                for h in detail.get("payload", {}).get("headers", [])
            }
            subj = headers.get("Subject", "PhD Inquiry Reply")
            snip = detail.get("snippet", "")
            cls_info = classify_professor_reply_text(subj, snip)
            replies.append(
                {
                    "message_id": msg_id,
                    "thread_id": detail.get("threadId", ""),
                    "from": headers.get("From", "Unknown Professor"),
                    "subject": subj,
                    "snippet": snip,
                    "classification": cls_info["classification"],
                    "ai_summary": cls_info["ai_summary"],
                    "suggested_next_action": cls_info["suggested_next_action"],
                }
            )
    return replies


def send_gmail_message(
    recipient_email: str,
    subject: str,
    body_text: str,
    sender_email: str = "shamaabidiphd@gmail.com",
) -> Dict[str, Any]:
    """
    Sends an email directly from shamaabidiphd@gmail.com via Gmail API
    when explicitly commanded by Dr. Shama Abidi clicking 'Send Now' in the dashboard.
    Attaches Dr. Shama Abidi Academic CV PDF.
    """
    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication

    mime_msg = MIMEMultipart()
    mime_msg["to"] = recipient_email
    mime_msg["from"] = f"Dr. Shama Abidi <{sender_email}>"
    mime_msg["subject"] = subject

    mime_msg.attach(MIMEText(body_text, "plain", "utf-8"))

    # Automatically attach Dr. Shama Abidi Academic CV PDF
    cv_candidates = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "documents", "Dr_Shama_Abidi_Academic_CV_2026.pdf"),
        os.path.join(os.getcwd(), "data", "documents", "Dr_Shama_Abidi_Academic_CV_2026.pdf"),
    ]
    for cv_path in cv_candidates:
        if os.path.exists(cv_path):
            try:
                with open(cv_path, "rb") as f:
                    pdf_attachment = MIMEApplication(f.read(), _subtype="pdf")
                    pdf_attachment.add_header(
                        "Content-Disposition",
                        "attachment",
                        filename="Dr_Shama_Abidi_Academic_CV_2026.pdf",
                    )
                    mime_msg.attach(pdf_attachment)
                break
            except Exception:
                pass

    app_password = os.getenv("GMAIL_APP_PASSWORD", "").strip() or "jisqsragwerolwyk"
    if app_password:
        import smtplib
        import ssl
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                server.login(sender_email, app_password.replace(" ", ""))
                server.sendmail(sender_email, recipient_email, mime_msg.as_string())
            msg_id = f"msg_smtp_{int(time.time())}_{secrets.token_hex(4)}"
            th_id = f"th_smtp_{int(time.time())}_{secrets.token_hex(4)}"
            return {
                "status": "SENT",
                "message_id": msg_id,
                "thread_id": th_id,
            }
        except Exception as smtp_err:
            logger.warning(f"SMTP send failed, falling back to Gmail API: {smtp_err}")

    access_token = get_gmail_access_token()
    raw_base64 = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")
    req_body = json.dumps({"raw": raw_base64}).encode("utf-8")

    req = urllib.request.Request(
        GMAIL_SEND_URL,
        data=req_body,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        return {
            "status": "SENT",
            "message_id": res_data.get("id", ""),
            "thread_id": res_data.get("threadId", ""),
        }


def send_email_via_gmail_oauth(
    recipient_email: str,
    subject: str,
    body_text: str,
    sender_email: str = "shamaabidiphd@gmail.com",
) -> Dict[str, Any]:
    """
    Backward-compatible helper that sends or creates a Gmail Draft.
    """
    return create_gmail_draft(
        recipient_email=recipient_email,
        subject=subject,
        body_text=body_text,
        sender_email=sender_email,
    )
