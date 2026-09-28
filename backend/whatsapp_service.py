"""
Unified WhatsApp Alert Service for Shama Abidi PhD AI System
Supports 3 Free / Low-Cost Providers Out-of-the-Box:
  1. Meta Official WhatsApp Cloud API (WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_API_TOKEN)
  2. Self-Hosted n8n / Evolution API / Baileys Webhook (WHATSAPP_WEBHOOK_URL)
  3. CallMeBot Free Personal WhatsApp API (CALLMEBOT_API_KEY + WHATSAPP_RECIPIENT_PHONE)
"""

from datetime import datetime, timezone
import json
import os
from typing import Any, Dict
import urllib.parse
import urllib.request


def push_whatsapp_notification(
    event_type: str,
    supervisor_name: str,
    university: str,
    summary: str,
) -> Dict[str, Any]:
    """
    Pushes an instant WhatsApp notification to Shama Abidi when:
      - A new personalized email draft is ready in the CRM Approval Queue
      - A professor replies in her Gmail inbox (shama.abidi80@gmail.com)
    """
    recipient_phone = os.getenv("WHATSAPP_RECIPIENT_PHONE", "+923000000000").strip()
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    api_token = os.getenv("WHATSAPP_API_TOKEN", "").strip()
    webhook_url = os.getenv("WHATSAPP_WEBHOOK_URL", "").strip()
    callmebot_key = os.getenv("CALLMEBOT_API_KEY", "").strip()

    message_text = (
        f"🎓 *Shama Abidi PhD AI Alert ({event_type})*\n"
        f"👩‍🔬 *Supervisor:* {supervisor_name} ({university})\n"
        f"📋 *Update:* {summary}\n"
        f"🔒 *Action:* Open CRM Dashboard to review & click 'Approve & Send via Gmail OAuth2'."
    )

    provider_used = "DASHBOARD_QUEUE_ONLY"
    status = "QUEUED_IN_DASHBOARD"

    # 1. Meta Official WhatsApp Cloud API
    if (
        phone_number_id
        and api_token
        and not phone_number_id.startswith("your_")
        and not api_token.startswith("your_")
    ):
        try:
            meta_url = f"https://graph.facebook.com/v20.0/{phone_number_id}/messages"
            clean_phone = recipient_phone.replace("+", "").replace("-", "").replace(" ", "")
            payload = json.dumps(
                {
                    "messaging_product": "whatsapp",
                    "to": clean_phone,
                    "type": "text",
                    "text": {"preview_url": False, "body": message_text},
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
                    provider_used = "META_WHATSAPP_CLOUD_API"
                    status = "SENT_LIVE_WHATSAPP"
        except Exception as e:
            status = f"META_API_ERROR: {e}"

    # 2. Self-Hosted n8n / Evolution API / Baileys Webhook
    elif webhook_url and not webhook_url.startswith("https://your-"):
        try:
            headers = {"Content-Type": "application/json"}
            if api_token and not api_token.startswith("your_"):
                headers["Authorization"] = f"Bearer {api_token}"
            payload = json.dumps(
                {
                    "to": recipient_phone,
                    "recipient_name": "Shama Abidi",
                    "event_type": event_type,
                    "supervisor_name": supervisor_name,
                    "university": university,
                    "message": message_text,
                }
            ).encode("utf-8")
            req = urllib.request.Request(
                webhook_url,
                data=payload,
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    provider_used = "N8N_OR_EVOLUTION_WEBHOOK"
                    status = "SENT_LIVE_WHATSAPP"
        except Exception as e:
            status = f"WEBHOOK_ERROR: {e}"

    # 3. CallMeBot Free Personal WhatsApp API
    elif callmebot_key and not callmebot_key.startswith("your_"):
        try:
            params = urllib.parse.urlencode(
                {
                    "phone": recipient_phone,
                    "text": message_text,
                    "apikey": callmebot_key,
                }
            )
            req = urllib.request.Request(
                f"https://api.callmebot.com/whatsapp.php?{params}"
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if 200 <= resp.status < 300:
                    provider_used = "CALLMEBOT_FREE_API"
                    status = "SENT_LIVE_WHATSAPP"
        except Exception as e:
            status = f"CALLMEBOT_ERROR: {e}"

    return {
        "recipient_name": "Shama Abidi",
        "recipient_phone": recipient_phone,
        "provider": provider_used,
        "event_type": event_type,
        "message": message_text,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
