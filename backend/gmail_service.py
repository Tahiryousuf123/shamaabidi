"""
Gmail OAuth 2.0 Service for Shama Abidi (shama.abidi80@gmail.com)
Uses GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN
to send approved PhD outreach emails and monitor incoming professor replies without
storing any password.
"""

import base64
from email.mime.text import MIMEText
import json
import os
from typing import Any, Dict, List
import urllib.parse
import urllib.request


GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"


def get_gmail_access_token() -> str:
    """
    Exchanges GMAIL_OAUTH_REFRESH_TOKEN for a short-lived OAuth 2.0 Access Token.
    """
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


def send_email_via_gmail_oauth(
    recipient_email: str,
    subject: str,
    body_text: str,
    sender_email: str = "shama.abidi80@gmail.com",
) -> Dict[str, Any]:
    """
    Dispatches an email from shama.abidi80@gmail.com using the official Gmail REST API.
    """
    try:
        access_token = get_gmail_access_token()
    except ValueError:
        return {
            "dispatch_mode": "SIMULATED_DEMO_MODE (Set GMAIL_OAUTH_* in .env for live dispatch)",
            "sender": sender_email,
            "recipient": recipient_email,
            "subject": subject,
        }

    mime_msg = MIMEText(body_text, "plain", "utf-8")
    mime_msg["to"] = recipient_email
    mime_msg["from"] = f"Shama Abidi <{sender_email}>"
    mime_msg["subject"] = subject

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
    with urllib.request.urlopen(req, timeout=20) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        return {
            "dispatch_mode": "LIVE_GMAIL_OAUTH2_SENT",
            "gmail_message_id": res_data.get("id"),
            "gmail_thread_id": res_data.get("threadId"),
            "sender": sender_email,
            "recipient": recipient_email,
        }


def check_unread_professor_replies(max_results: int = 5) -> List[Dict[str, Any]]:
    """
    Polls shama.abidi80@gmail.com for unread incoming replies from academic domains.
    """
    try:
        access_token = get_gmail_access_token()
    except ValueError:
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
            replies.append(
                {
                    "message_id": msg_id,
                    "thread_id": detail.get("threadId"),
                    "from": headers.get("From", "Unknown Professor"),
                    "subject": headers.get("Subject", "PhD Inquiry Reply"),
                    "snippet": detail.get("snippet", ""),
                }
            )
    return replies
