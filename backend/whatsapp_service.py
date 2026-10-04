"""
Shama Abidi — Autonomous AI Research Agent & CRM System
Legitimate WhatsApp Business Cloud API Notification Service (Sections 18, 19, 29, 32)

Strict Production Rules:
  1. Uses legitimate Meta WhatsApp Business Cloud API (`WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_API_TOKEN`).
  2. Never uses unsafe WhatsApp Web QR browser automation.
  3. Never fakes "Connected" or "Sent" status when WhatsApp Business API credentials are not configured.
  4. Groups daily discovery & draft notifications into concise batch summaries (Section 32).
"""

from datetime import datetime, timezone
import json
import os
from typing import Any, Dict
import urllib.parse
import urllib.request


def normalize_pakistan_phone(raw_phone: str) -> str:
    digits = "".join(ch for ch in (raw_phone or "+923002460274") if ch.isdigit())
    if digits.startswith("03") and len(digits) == 11:
        return "92" + digits[1:]
    if digits.startswith("92"):
        return digits
    return digits or "923002460274"


def check_whatsapp_api_status() -> Dict[str, Any]:
    """
    Section 19: Honestly classifies WhatsApp Business Cloud API status without faking connection.
    """
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    api_token = os.getenv("WHATSAPP_API_TOKEN", "").strip()
    recipient = f"+{normalize_pakistan_phone(os.getenv('WHATSAPP_RECIPIENT_PHONE', '+923002460274'))}"

    is_configured = bool(
        phone_number_id
        and api_token
        and not phone_number_id.startswith("your_")
        and not api_token.startswith("your_")
    )

    if is_configured:
        return {
            "service": "Meta WhatsApp Business Cloud API",
            "classification": "REQUIRES ACCOUNT/AUTHORIZATION",
            "connected": True,
            "status_label": "CONNECTED",
            "claimed_legacy": "Automated WhatsApp Cloud Gateway",
            "actual_status": "CONNECTED (Meta Cloud API Configured)",
            "activation_instructions": "Credentials configured and active in environment",
            "recipient_phone": recipient,
            "detail": f"Configured with Phone Number ID {phone_number_id[:6]}*** for recipient {recipient}.",
        }
    return {
        "service": "Meta WhatsApp Business Cloud API",
        "classification": "REQUIRES ACCOUNT/AUTHORIZATION",
        "connected": False,
        "status_label": "UNCONFIGURED",
        "claimed_legacy": "Automated WhatsApp Cloud Gateway",
        "actual_status": "UNCONFIGURED (Official wa.me 1-click fallback active)",
        "activation_instructions": "Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_API_TOKEN to .env",
        "recipient_phone": recipient,
        "detail": (
            "Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_API_TOKEN in .env / Cloud Secrets to enable "
            "automatic server-to-WhatsApp Cloud API delivery. All alerts are logged in the CRM Notifications "
            "table with 1-click official wa.me links."
        ),
    }


def send_grouped_whatsapp_notification(
    event_category: str,
    message_body: str,
) -> Dict[str, Any]:
    """
    Dispatches a grouped notification via Meta WhatsApp Business Cloud API when
    credentials are configured; otherwise records honest status `PENDING_WHATSAPP_API_CREDENTIALS`.
    """
    clean_phone = normalize_pakistan_phone(os.getenv("WHATSAPP_RECIPIENT_PHONE", "+923002460274"))
    recipient_phone = f"+{clean_phone}"
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    api_token = os.getenv("WHATSAPP_API_TOKEN", "").strip()

    wa_direct_url = f"https://wa.me/{clean_phone}?text={urllib.parse.quote(message_body)}"
    delivery_channel = "PENDING_WHATSAPP_API_CREDENTIALS"
    delivery_status = "LOGGED_IN_CRM_AWAITING_META_CLOUD_API_TOKEN"

    if (
        phone_number_id
        and api_token
        and not phone_number_id.startswith("your_")
        and not api_token.startswith("your_")
    ):
        try:
            meta_url = f"https://graph.facebook.com/v20.0/{phone_number_id}/messages"
            payload = json.dumps(
                {
                    "messaging_product": "whatsapp",
                    "to": clean_phone,
                    "type": "text",
                    "text": {"preview_url": False, "body": message_body},
                }
            ).encode("utf-8")
            req = urllib.request.Request(
                meta_url,
                data=payload,
                headers={
                    "Authorization": f"Bearer {api_token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                if 200 <= resp.status < 300:
                    delivery_channel = "META_WHATSAPP_CLOUD_API"
                    delivery_status = "SENT_VIA_META_CLOUD_API"
        except Exception as e:
            delivery_channel = "META_WHATSAPP_CLOUD_API"
            delivery_status = f"META_API_ERROR: {str(e)[:120]}"

    return {
        "event_category": event_category,
        "recipient_phone": recipient_phone,
        "message_body": message_body,
        "delivery_channel": delivery_channel,
        "delivery_status": delivery_status,
        "whatsapp_direct_link": wa_direct_url,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def push_whatsapp_notification(
    event_type: str,
    supervisor_name: str,
    university: str,
    summary: str,
) -> Dict[str, Any]:
    """Backward-compatible wrapper for single-event notifications."""
    body = (
        f"Shama Abidi Research Agent ({event_type})\n"
        f"Professor: {supervisor_name} ({university})\n"
        f"Summary: {summary}"
    )
    return send_grouped_whatsapp_notification(
        event_category="DAILY_DISCOVERY_SUMMARY",
        message_body=body,
    )
