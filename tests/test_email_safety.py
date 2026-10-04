"""
Phase 3: Email Sending Safety & Human Approval Lock Test Suite.
Verifies:
1. Hard lock: No email can be sent without explicit per-email human approval,
   even if EMAIL_AUTOMATION_ENABLED is changed to True.
2. Reply-To header is set to candidate's real personal inbox (shama.abidi80@gmail.com).
3. Daily send cap (default 15/day) is strictly enforced.
4. Global sending paused switch immediately blocks all outgoing dispatches.
5. Opt-out / unsubscribe footer is automatically appended to every email.
6. Suppression list permanently blocks emails and follow-ups to opted-out contacts.
7. Maximum 1 follow-up per professor. Strictly no follow-up if reply recorded or bounced.
8. Bounces and invalid addresses are handled safely and automatically suppressed.
"""
import os
from pathlib import Path
import smtplib
from unittest.mock import MagicMock, patch
import pytest

from backend.gmail_service import (
    send_gmail_message,
    is_sending_paused,
    is_suppressed,
    add_to_suppression_list,
    get_daily_send_count,
    record_daily_send,
    can_send_followup,
    record_followup,
    get_followup_count,
    OPT_OUT_FOOTER,
)


def test_hard_safety_lock_blocks_unapproved_sending(monkeypatch):
    """
    Proves automation cannot send emails without explicit per-email human approval,
    EVEN IF EMAIL_AUTOMATION_ENABLED is explicitly set to true.
    """
    monkeypatch.setenv("EMAIL_AUTOMATION_ENABLED", "true")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "test_app_pass_mock")

    # Without human_approved=True: MUST fail with PermissionError
    with pytest.raises(PermissionError) as exc_info:
        send_gmail_message(
            recipient_email="test.prof@ox.ac.uk",
            subject="PhD Inquiry",
            body_text="Dear Professor...",
            human_approved=False,  # Automated / unreviewed
        )

    assert "HARD_SAFETY_LOCK" in str(exc_info.value)
    assert "human_approved=True" in str(exc_info.value)


def test_reply_to_header_configured_to_real_inbox(monkeypatch):
    """
    Verifies that Reply-To is set to shama.abidi80@gmail.com (configurable),
    keeping sender (shamaabidiphd@gmail.com) separate.
    """
    monkeypatch.setenv("REPLY_TO_EMAIL", "shama.abidi80@gmail.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "dummy_pass")

    captured_mime = {}

    def mock_sendmail(sender, recipient, msg_str):
        captured_mime["raw"] = msg_str

    mock_smtp = MagicMock()
    mock_smtp.__enter__.return_value.sendmail = mock_sendmail

    with patch("smtplib.SMTP_SSL", return_value=mock_smtp):
        res = send_gmail_message(
            recipient_email="supervisor@cam.ac.uk",
            subject="PhD Research Inquiry",
            body_text="Research alignment...",
            human_approved=True,
        )

    assert res["status"] == "SENT"
    assert res["reply_to"] == "shama.abidi80@gmail.com"
    assert "Reply-To: shama.abidi80@gmail.com" in captured_mime["raw"]


def test_opt_out_footer_appended_to_outreach(monkeypatch):
    """Verifies that unsubscribe / opt-out text is present in all sent emails."""
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "dummy_pass")

    captured_mime = {}

    def mock_sendmail(sender, recipient, msg_str):
        captured_mime["raw"] = msg_str

    mock_smtp = MagicMock()
    mock_smtp.__enter__.return_value.sendmail = mock_sendmail

    with patch("smtplib.SMTP_SSL", return_value=mock_smtp):
        send_gmail_message(
            recipient_email="faculty@ucl.ac.uk",
            subject="Prospective PhD Inquiry",
            body_text="I am writing to inquire regarding prospective PhD opportunities.",
            human_approved=True,
        )

    import email
    parsed_msg = email.message_from_string(captured_mime["raw"])
    decoded_body = ""
    for part in parsed_msg.walk():
        if part.get_content_type() == "text/plain":
            decoded_body += part.get_payload(decode=True).decode("utf-8")

    assert "Unsubscribe" in decoded_body
    assert "If you do not wish to receive further academic correspondence" in decoded_body


def test_global_sending_paused_switch(monkeypatch):
    """Verifies that the global pause switch immediately halts all outgoing sends."""
    monkeypatch.setenv("GLOBAL_SENDING_PAUSED", "true")

    with pytest.raises(RuntimeError) as exc_info:
        send_gmail_message(
            recipient_email="prof@manchester.ac.uk",
            subject="PhD Inquiry",
            body_text="Body text",
            human_approved=True,
        )

    assert "GLOBAL_SENDING_PAUSED" in str(exc_info.value)


def test_daily_send_cap_enforcement(monkeypatch):
    """Verifies that daily send cap (default 50) blocks the 51st send."""
    monkeypatch.setenv("DAILY_SEND_CAP", "50")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "dummy_pass")

    # Simulate 50 sends already recorded today
    with patch("backend.gmail_service.get_daily_send_count", return_value=50):
        with pytest.raises(RuntimeError) as exc_info:
            send_gmail_message(
                recipient_email="prof.cap@ed.ac.uk",
                subject="PhD Inquiry",
                body_text="Body",
                human_approved=True,
            )

        assert "DAILY_SEND_CAP_EXCEEDED" in str(exc_info.value)
        assert "50" in str(exc_info.value)


def test_suppression_list_blocks_outreach(monkeypatch):
    """Verifies that contacts on the suppression list cannot be emailed."""
    test_email = "optout.professor@imperial.ac.uk"
    add_to_suppression_list(test_email, reason="Requested unsubscribe")
    assert is_suppressed(test_email) is True

    monkeypatch.setenv("GMAIL_APP_PASSWORD", "dummy_pass")

    with pytest.raises(ValueError) as exc_info:
        send_gmail_message(
            recipient_email=test_email,
            subject="PhD Inquiry",
            body_text="Body text",
            human_approved=True,
        )

    assert "RECIPIENT_SUPPRESSED" in str(exc_info.value)


def test_maximum_one_followup_limit():
    """Verifies maximum one follow-up per professor is enforced."""
    import uuid
    prof_email = f"followup.{uuid.uuid4().hex[:8]}@kcl.ac.uk"

    # First follow-up eligible
    can_follow, reason = can_send_followup(prof_email, has_replied=False, has_bounced=False)
    assert can_follow is True
    assert reason == "ELIGIBLE_FOR_FOLLOWUP"

    # Record 1 follow-up
    record_followup(prof_email)
    assert get_followup_count(prof_email) == 1

    # Second follow-up MUST be blocked
    can_follow_2, reason_2 = can_send_followup(prof_email, has_replied=False, has_bounced=False)
    assert can_follow_2 is False
    assert "MAX_FOLLOWUP_LIMIT_REACHED" in reason_2


def test_no_followup_if_replied_or_bounced():
    """Verifies follow-up is blocked if professor replied or previous send bounced."""
    import uuid
    prof = f"dr.{uuid.uuid4().hex[:8]}@toronto.ca"

    can_follow_reply, reason_reply = can_send_followup(prof, has_replied=True, has_bounced=False)
    assert can_follow_reply is False
    assert reason_reply == "REPLY_ALREADY_RECORDED"

    can_follow_bounce, reason_bounce = can_send_followup(prof, has_replied=False, has_bounced=True)
    assert can_follow_bounce is False
    assert reason_bounce == "PREVIOUS_SEND_BOUNCED"


def test_smtp_bounce_handling_and_auto_suppression(monkeypatch):
    """Verifies that SMTP bounce errors (550 / recipient refused) mark as bounced and suppress."""
    import uuid
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "dummy_pass")
    bounced_email = f"bounce.{uuid.uuid4().hex[:8]}@nowhere.edu"

    mock_smtp = MagicMock()
    mock_smtp.__enter__.return_value.sendmail.side_effect = smtplib.SMTPRecipientsRefused(
        {bounced_email: (550, b"User unknown")}
    )

    with patch("smtplib.SMTP_SSL", return_value=mock_smtp):
        result = send_gmail_message(
            recipient_email=bounced_email,
            subject="Inquiry",
            body_text="Body",
            human_approved=True,
        )

    assert result["status"] == "INVALID_EMAIL_BOUNCED"
    assert result["bounced"] is True
    assert is_suppressed(bounced_email) is True
