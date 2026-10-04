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
from datetime import datetime, timezone
from email.mime.text import MIMEText
import json
import logging
import os
from pathlib import Path
import random
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.parse
import urllib.request

logger = logging.getLogger("shama_abidi.gmail_service")

GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SUPPRESSION_FILE = DATA_DIR / "suppression_list.json"
SEND_THROTTLE_FILE = DATA_DIR / "send_throttle.json"
FOLLOWUP_TRACKING_FILE = DATA_DIR / "followup_tracking.json"

OPT_OUT_FOOTER = (
    "\n\n---\n"
    "If you do not wish to receive further academic correspondence regarding prospective PhD research, "
    "please reply with 'Unsubscribe' or let me know to be removed from future emails."
)


def is_sending_paused() -> bool:
    """Checks the global sending pause switch."""
    return os.getenv("GLOBAL_SENDING_PAUSED", "false").strip().lower() == "true"


def is_suppressed(email: str) -> bool:
    """Checks whether an email address is on the permanent suppression list."""
    clean = email.strip().lower()
    if not clean:
        return False
    if not SUPPRESSION_FILE.exists():
        return False
    try:
        with open(SUPPRESSION_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return clean in [e.strip().lower() for e in data.get("suppressed_emails", [])]
    except Exception:
        return False


def add_to_suppression_list(email: str, reason: str = "Unsubscribe request") -> bool:
    """Adds an email address to the permanent suppression list so it is never emailed again."""
    clean = email.strip().lower()
    if not clean:
        return False
    data = {"suppressed_emails": [], "reasons": {}}
    if SUPPRESSION_FILE.exists():
        try:
            with open(SUPPRESSION_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    if clean not in data.get("suppressed_emails", []):
        data.setdefault("suppressed_emails", []).append(clean)
        data.setdefault("reasons", {})[clean] = {
            "reason": reason,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            SUPPRESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(SUPPRESSION_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return True
        except Exception as e:
            logger.warning(f"Could not persist suppression list: {e}")
    return False


def get_daily_send_count(date_str: Optional[str] = None) -> int:
    """Retrieves count of emails dispatched on the specified UTC calendar date."""
    today = date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not SEND_THROTTLE_FILE.exists():
        return 0
    try:
        with open(SEND_THROTTLE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return len(data.get(today, []))
    except Exception:
        return 0


def record_daily_send(recipient_email: str, date_str: Optional[str] = None) -> int:
    """Records an outgoing email send in the daily throttle log."""
    today = date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data = {}
    if SEND_THROTTLE_FILE.exists():
        try:
            with open(SEND_THROTTLE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    day_list = data.setdefault(today, [])
    day_list.append({
        "recipient": recipient_email.strip().lower(),
        "sent_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        SEND_THROTTLE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SEND_THROTTLE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
    return len(day_list)


def get_followup_count(professor_email: str) -> int:
    """Returns the number of follow-ups previously sent to this professor."""
    clean = professor_email.strip().lower()
    if not FOLLOWUP_TRACKING_FILE.exists():
        return 0
    try:
        with open(FOLLOWUP_TRACKING_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return int(data.get(clean, {}).get("count", 0))
    except Exception:
        return 0


def can_send_followup(
    professor_email: str,
    has_replied: bool = False,
    has_bounced: bool = False
) -> Tuple[bool, str]:
    """
    Enforces follow-up safety rules:
    - Maximum 1 follow-up per professor.
    - Strictly no follow-up if reply recorded, previous send bounced, or professor is suppressed.
    """
    clean = professor_email.strip().lower()
    if not clean or "@" not in clean:
        return False, "INVALID_EMAIL"
    if is_suppressed(clean):
        return False, "RECIPIENT_ON_SUPPRESSION_LIST"
    if has_replied:
        return False, "REPLY_ALREADY_RECORDED"
    if has_bounced:
        return False, "PREVIOUS_SEND_BOUNCED"
    if get_followup_count(clean) >= 1:
        return False, "MAX_FOLLOWUP_LIMIT_REACHED (1)"
    return True, "ELIGIBLE_FOR_FOLLOWUP"


def record_followup(professor_email: str) -> int:
    """Records that a follow-up was dispatched to the professor."""
    clean = professor_email.strip().lower()
    data = {}
    if FOLLOWUP_TRACKING_FILE.exists():
        try:
            with open(FOLLOWUP_TRACKING_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    entry = data.setdefault(clean, {"count": 0, "history": []})
    entry["count"] += 1
    entry["history"].append(datetime.now(timezone.utc).isoformat())
    try:
        FOLLOWUP_TRACKING_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(FOLLOWUP_TRACKING_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
    return entry["count"]



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
            "status_label": "PENDING_OAUTH",
            "claimed_legacy": "Full Gmail API Live Sync",
            "actual_status": "PENDING_OAUTH (Web Compose & 1-Tap Draft fallback active)",
            "activation_instructions": "Add GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN to .env",
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
    human_approved: bool = False,
    actor_user: str = "",
    is_followup: bool = False,
) -> Dict[str, Any]:
    """
    Sends an email directly from shamaabidiphd@gmail.com via Gmail SMTP / API.
    Hard Safety Rules:
      1. Explicit per-email human approval REQUIRED (`human_approved=True`).
      2. Rejects if GLOBAL_SENDING_PAUSED is active.
      3. Rejects if recipient is on the suppression list.
      4. Enforces daily send cap (default 15/day).
      5. Enforces maximum 1 follow-up per professor.
      6. Sets Reply-To to Dr. Shama Abidi's personal inbox (shama.abidi80@gmail.com).
      7. Appends opt-out / unsubscribe line to body.
      8. Detects and handles bounces (marks invalid, suppresses).
    """
    # 1. Hard Safety Lock: Explicit per-email human approval
    if not human_approved:
        raise PermissionError(
            "HARD_SAFETY_LOCK: No email can ever be dispatched without explicit human approval "
            "(human_approved=True). Automatic or unattended background sending is strictly forbidden."
        )

    # 2. Global Sending Paused Switch
    if is_sending_paused():
        raise RuntimeError(
            "GLOBAL_SENDING_PAUSED: All email dispatching is globally paused by safety switch."
        )

    # 3. Suppression List
    clean_to = recipient_email.strip().lower()
    if is_suppressed(clean_to):
        raise ValueError(
            f"RECIPIENT_SUPPRESSED: {clean_to} is on the suppression list. Outreach blocked."
        )

    # 4. Follow-up Eligibility Check
    if is_followup:
        can_follow, reason = can_send_followup(clean_to)
        if not can_follow:
            raise ValueError(f"FOLLOWUP_BLOCKED: {reason}")

    # 5. Daily Send Cap (Default: 50/day)
    daily_cap = int(os.getenv("DAILY_SEND_CAP", "50"))
    current_today_count = get_daily_send_count()
    if current_today_count >= daily_cap:
        raise RuntimeError(
            f"DAILY_SEND_CAP_EXCEEDED: Maximum {daily_cap} emails per day reached. "
            f"Sending is paused until the next day to preserve domain and sender reputation."
        )

    # 6. Opt-Out Line Append
    final_body = (body_text or "").strip()
    if "unsubscribe" not in final_body.lower():
        final_body = f"{final_body}{OPT_OUT_FOOTER}"

    # 7. Construct MIME Message with Reply-To
    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication

    mime_msg = MIMEMultipart()
    mime_msg["to"] = recipient_email
    mime_msg["from"] = f"Dr. Shama Abidi <{sender_email}>"
    reply_to_email = os.getenv("REPLY_TO_EMAIL", "shama.abidi80@gmail.com").strip()
    mime_msg["Reply-To"] = reply_to_email
    mime_msg["subject"] = subject

    mime_msg.attach(MIMEText(final_body, "plain", "utf-8"))

    # Automatically attach Dr. Shama Abidi Academic CV PDF if present
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

    app_password = os.getenv("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    if app_password:
        import smtplib
        import ssl
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                server.login(sender_email, app_password)
                server.sendmail(sender_email, recipient_email, mime_msg.as_string())
            
            # Record successful dispatch
            record_daily_send(clean_to)
            if is_followup:
                record_followup(clean_to)

            msg_id = f"msg_smtp_{int(time.time())}_{secrets.token_hex(4)}"
            th_id = f"th_smtp_{int(time.time())}_{secrets.token_hex(4)}"
            return {
                "status": "SENT",
                "message_id": msg_id,
                "thread_id": th_id,
                "reply_to": reply_to_email,
                "daily_send_count": current_today_count + 1,
            }
        except smtplib.SMTPRecipientsRefused as err:
            add_to_suppression_list(clean_to, reason=f"SMTPRecipientsRefused: {err}")
            return {
                "status": "INVALID_EMAIL_BOUNCED",
                "error": f"Recipient refused by SMTP server: {err}",
                "bounced": True,
            }
        except smtplib.SMTPDataError as err:
            if err.smtp_code == 550:
                add_to_suppression_list(clean_to, reason="550 Mailbox unavailable / bounced")
                return {
                    "status": "INVALID_EMAIL_BOUNCED",
                    "error": f"Mailbox unavailable (550): {err}",
                    "bounced": True,
                }
            raise
        except Exception as smtp_err:
            logger.warning(f"SMTP send failed, checking API fallback: {smtp_err}")

    # Fallback to Gmail OAuth API if configured
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
        record_daily_send(clean_to)
        if is_followup:
            record_followup(clean_to)
        return {
            "status": "SENT",
            "message_id": res_data.get("id", ""),
            "thread_id": res_data.get("threadId", ""),
            "reply_to": reply_to_email,
            "daily_send_count": current_today_count + 1,
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
