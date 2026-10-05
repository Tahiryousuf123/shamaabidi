"""
Phase 5: Draft Quality & Anti-Fabrication Engine Tests
Verifies strict candidate identity, degree integrity, verified publications citation,
anti-hallucination quarantine, quality scoring (0-100), and human approval workflow.
"""

import pytest
from fastapi.testclient import TestClient

from backend.verified_publications import (
    SHAMA_CANDIDATE_PROFILE,
    SHAMA_VERIFIED_PUBLICATIONS,
    get_verified_publication_by_domain,
)
from backend.draft_validator import (
    validate_and_score_draft,
    extract_synergy_paragraph,
)
from backend.main import app
from backend.database import get_connection, init_database, make_id, utc_now_iso


# ==============================================================================
# 1. CANDIDATE PROFILE & VERIFIED PUBLICATIONS INTEGRITY
# ==============================================================================
def test_candidate_profile_authoritative_values():
    assert SHAMA_CANDIDATE_PROFILE["full_name"] == "Dr. Shama Abidi"
    assert "PharmD" in SHAMA_CANDIDATE_PROFILE["degree_title"]
    assert "MPhil in Pharmacy Practice" in SHAMA_CANDIDATE_PROFILE["degree_title"]
    assert "Liaquat National Hospital" in SHAMA_CANDIDATE_PROFILE["current_institution"]


def test_verified_publications_exact_count_and_details():
    assert len(SHAMA_VERIFIED_PUBLICATIONS) == 4

    dois = [p["doi"] for p in SHAMA_VERIFIED_PUBLICATIONS]
    assert "10.36721/PJPS.2024.37.3.REG.639-649.1" in dois
    assert "10.36721/PJPS.2022.35.6.REG.1595-1601.1" in dois
    assert "10.1080/20523211.2025.2485639" in dois

    journals = [p["journal_short"] for p in SHAMA_VERIFIED_PUBLICATIONS]
    assert "PJPS" in journals
    assert "JPPP" in journals


def test_verified_publication_matcher_by_topic():
    asp_pub = get_verified_publication_by_domain("Antimicrobial resistance in ICU patients")
    assert asp_pub["id"] == "pub_pjps_2022_asp"
    assert "carbapenem" in asp_pub["title"].lower()

    cardio_pub = get_verified_publication_by_domain("Cardiovascular pharmacology and beta blocker safety")
    assert cardio_pub["id"] == "pub_pjps_2024_angina"
    assert "angina" in cardio_pub["title"].lower()

    ai_pub = get_verified_publication_by_domain("Artificial Intelligence and clinical decision support systems")
    assert ai_pub["id"] == "pub_jppp_2025_ai_vs_pharmacist"
    assert "ai" in ai_pub["title"].lower()


# ==============================================================================
# 2. ANTI-FABRICATION ASSERTIONS & VALIDATION
# ==============================================================================
def test_validator_rejects_missing_candidate_name():
    prof = {
        "full_name": "Prof. David Smith",
        "recent_paper_title": "Antimicrobial stewardship in clinical care",
        "recent_paper_doi": "10.1016/j.jiph.2024.01.001",
    }
    body = (
        "Dear Prof. David Smith,\n\n"
        "I am a pharmacist holding a PharmD and MPhil in Pharmacy Practice. "
        "I read your paper Antimicrobial stewardship in clinical care. "
        "In our PJPS study, we evaluated carbapenem stewardship."
    )
    is_valid, score, errors, _ = validate_and_score_draft("PhD Inquiry", body, prof)
    assert not is_valid
    assert any("Candidate name assertion failed" in err for err in errors)


def test_validator_rejects_missing_degree_credentials():
    prof = {
        "full_name": "Prof. David Smith",
        "recent_paper_title": "Antimicrobial stewardship in clinical care",
        "recent_paper_doi": "10.1016/j.jiph.2024.01.001",
    }
    body = (
        "Dear Prof. David Smith,\n\n"
        "My name is Dr. Shama Abidi. I am writing regarding your paper "
        "Antimicrobial stewardship in clinical care. "
        "In our PJPS publication, we evaluated carbapenems."
    )
    is_valid, score, errors, _ = validate_and_score_draft("PhD Inquiry", body, prof)
    assert not is_valid
    assert any("degree assertion failed" in err for err in errors)


def test_validator_rejects_hallucinated_candidate_publications():
    prof = {
        "full_name": "Prof. David Smith",
        "recent_paper_title": "Antimicrobial stewardship in clinical care",
        "recent_paper_doi": "10.1016/j.jiph.2024.01.001",
    }
    body = (
        "Dear Prof. David Smith,\n\n"
        "My name is Dr. Shama Abidi (PharmD, MPhil in Pharmacy Practice). "
        "I read your paper Antimicrobial stewardship in clinical care. "
        "In my recent Nature Medicine 2025 paper on gene therapy, we discovered..."
    )
    is_valid, score, errors, _ = validate_and_score_draft("PhD Inquiry", body, prof)
    assert not is_valid
    assert any("Candidate publication assertion failed" in err for err in errors)


def test_validator_rejects_mismatched_professor_paper():
    prof = {
        "full_name": "Prof. David Smith",
        "recent_paper_title": "Antimicrobial stewardship in clinical care",
        "recent_paper_doi": "10.1016/j.jiph.2024.01.001",
    }
    body = (
        "Dear Prof. David Smith,\n\n"
        "My name is Dr. Shama Abidi (PharmD, MPhil in Pharmacy Practice). "
        "I read your fascinating work on Quantum Computing in Astrophysics. "
        "In our PJPS 2022 prospective study on carbapenems, we evaluated..."
    )
    is_valid, score, errors, _ = validate_and_score_draft("PhD Inquiry", body, prof)
    assert not is_valid
    assert any("Professor publication mismatch" in err for err in errors)


def test_validator_accepts_valid_academic_draft_with_high_quality_score():
    prof = {
        "full_name": "Prof. Alistair Brown",
        "recent_paper_title": "Optimizing Antimicrobial Stewardship Programs in Intensive Care Units",
        "recent_paper_doi": "10.1016/j.jiph.2024.05.012",
        "funding_status": "OPEN_FUNDED_POSITION",
    }
    body = (
        "Dear Prof. Alistair Brown,\n\n"
        "My name is Dr. Shama Abidi (PharmD, MPhil in Pharmacy Practice). I am a Senior Clinical Pharmacist "
        "at Liaquat National Hospital with 18+ years of tertiary care experience.\n\n"
        "I read with great interest your recent paper, 'Optimizing Antimicrobial Stewardship Programs in Intensive Care Units' "
        "(DOI: 10.1016/j.jiph.2024.05.012).\n\n"
        "At Liaquat National Hospital, our prospective interventional study on carbapenem stewardship (PJPS, 2022) "
        "evaluated N=134 ICU patients. Our pharmacist-led interventions achieved an 87.3% physician acceptance rate, "
        "improving renal dose adjustments and significantly reducing 30-day readmissions (p=0.036).\n\n"
        "I am writing to inquire regarding prospective funded PhD studentship opportunities in your laboratory."
    )
    is_valid, score, errors, breakdown = validate_and_score_draft("PhD Inquiry", body, prof)
    assert is_valid, f"Expected valid draft, got errors: {errors}"
    assert score >= 80
    assert breakdown["synergy_relevance"] == 30
    assert breakdown["verified_doi"] == 25
    assert breakdown["name_and_title"] == 20
    assert breakdown["funding_alignment"] == 25


# ==============================================================================
# 3. WORKFLOW & APPROVAL API INTEGRATION
# ==============================================================================
def test_draft_approval_and_quarantine_enforcement():
    client = TestClient(app)

    # 1. Login as admin to get token
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "shama.abidi80@gmail.com", "password": "ShamaPhD#2026!Secure"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Insert test professors and drafts into SQLite database
    init_database()
    conn = get_connection()
    now = utc_now_iso()

    # Ensure professors exist to satisfy foreign key
    conn.execute(
        """
        INSERT OR REPLACE INTO professors (
            id, full_name, normalized_name_uni_key, university_name, department, country, country_code,
            research_areas_json, recent_paper_title, why_matches_shama, relevance_score, funding_status,
            discovery_source, verification_status, crm_state, discovered_batch_date, discovered_at, updated_at
        ) VALUES ('prof_test_1', 'Prof. Oxford One', 'oxford_one_oxford', 'Oxford', 'Pharmacy', 'United Kingdom', 'UK',
                  '["Antimicrobial"]', 'Paper A', 'Why A', 90.0, 'VERIFIED',
                  'CROSSREF', 'VERIFIED', 'DRAFT_READY', '2026-10-04', ?, ?)
        """,
        (now, now),
    )
    conn.execute(
        """
        INSERT OR REPLACE INTO professors (
            id, full_name, normalized_name_uni_key, university_name, department, country, country_code,
            research_areas_json, recent_paper_title, why_matches_shama, relevance_score, funding_status,
            discovery_source, verification_status, crm_state, discovered_batch_date, discovered_at, updated_at
        ) VALUES ('prof_test_2', 'Prof. Cambridge Two', 'cambridge_two_cambridge', 'Cambridge', 'Pharmacy', 'United Kingdom', 'UK',
                  '["Pharmacology"]', 'Paper B', 'Why B', 85.0, 'NOT CONFIRMED',
                  'CROSSREF', 'VERIFIED', 'DISCOVERED', '2026-10-04', ?, ?)
        """,
        (now, now),
    )

    # Draft A: Validated
    draft_valid_id = f"test_val_{make_id('dr', 'valid')}"
    conn.execute(
        """
        INSERT OR REPLACE INTO email_drafts (
            id, professor_id, draft_type, recipient_email, subject, body_text,
            referenced_professor_paper, referenced_shama_paper, gmail_draft_id,
            gmail_sync_status, quality_score, validation_status, validation_notes,
            synergy_paragraph, human_approved, auto_send_disabled, batch_date,
            created_at, updated_at
        ) VALUES (?, 'prof_test_1', 'INITIAL_OUTREACH', 'prof@oxford.ac.uk', 'Subject', 'Body',
                  'Paper A', 'Paper B', '', 'LOCAL_CRM_DRAFT_PENDING_OAUTH', 90, 'VALIDATED',
                  'All anti-fabrication assertions passed.', 'Synergy', 0, 1, '2026-10-04', ?, ?)
        """,
        (draft_valid_id, now, now),
    )

    # Draft B: Quarantined (Failed Validation)
    draft_failed_id = f"test_fail_{make_id('dr', 'fail')}"
    conn.execute(
        """
        INSERT OR REPLACE INTO email_drafts (
            id, professor_id, draft_type, recipient_email, subject, body_text,
            referenced_professor_paper, referenced_shama_paper, gmail_draft_id,
            gmail_sync_status, quality_score, validation_status, validation_notes,
            synergy_paragraph, human_approved, auto_send_disabled, batch_date,
            created_at, updated_at
        ) VALUES (?, 'prof_test_2', 'INITIAL_OUTREACH', 'prof@cambridge.ac.uk', 'Subject', 'Body',
                  'Paper A', 'Paper B', '', 'LOCAL_CRM_DRAFT_PENDING_OAUTH', 40, 'DRAFT_VALIDATION_FAILED',
                  'Candidate degree assertion failed', 'Synergy', 0, 1, '2026-10-04', ?, ?)
        """,
        (draft_failed_id, now, now),
    )
    conn.commit()
    conn.close()

    # 3. Quarantined draft MUST be rejected by approve endpoint
    res_fail = client.post(f"/api/drafts/{draft_failed_id}/approve", headers=headers)
    assert res_fail.status_code == 400
    assert "Anti-fabrication assertion failed" in str(res_fail.json())

    # 4. Quarantined draft MUST be rejected by send-now endpoint
    res_send_fail = client.post(f"/api/drafts/{draft_failed_id}/send-now", headers=headers)
    assert res_send_fail.status_code == 400
    assert "Draft failed anti-fabrication assertions" in str(res_send_fail.json())

    # 5. Valid draft MUST succeed when approved
    res_ok = client.post(f"/api/drafts/{draft_valid_id}/approve", headers=headers)
    assert res_ok.status_code == 200
    assert res_ok.json()["status"] == "APPROVED"

    # Verify database state after approval
    conn2 = get_connection()
    row = conn2.execute("SELECT * FROM email_drafts WHERE id = ?", (draft_valid_id,)).fetchone()
    assert row["human_approved"] == 1
    conn2.close()
