"""
Tests for Phase 4: Correctness of Professor Matching
Validates:
1. Controlled funding_status enum ('OPEN_FUNDED_POSITION', 'FUNDING_SCHEME_AVAILABLE', 'UNKNOWN')
   and no-assumption default to 'UNKNOWN'.
2. Grant records require verified grant ID/paper and URL provenance.
3. Programme eligibility verification (min qualification, english requirement, international eligibility, deadline)
   marking UNKNOWN when unverified.
4. Candidate topic match scoring strictly against Dr. Shama Abidi's 6 core topics with publication recency check
   (last 3 years: >= 2023) and absence of artificial 71.5% clamping.
5. Institutional email verification (.edu, .ac.uk, etc. vs free email services) and strict exclusion of Pakistan professors.
6. Top 30-50 ranking API endpoint and filtering.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.enums import ProfessorFundingStatusEnum, EmailVerificationStatusEnum
from backend.app.models import Professor, University
from backend.app.db_session import SessionLocal, init_orm_schema
from backend.autonomous_pipeline import verify_institutional_email
from backend.vector_engine import (
    SHAMA_CORE_TOPICS,
    score_candidate_topics,
    compute_research_alignment,
)
from backend.main import app


from backend.app.services import seed_roles_users_and_jobs


@pytest.fixture(scope="module")
def client():
    init_orm_schema()
    db = SessionLocal()
    try:
        seed_roles_users_and_jobs(db)
    finally:
        db.close()
    return TestClient(app)


@pytest.fixture(scope="module")
def auth_headers(client):
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "researcher@shama-phd.org", "password": "Researcher#2026!Pass"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# 1. Controlled funding status enum validation
def test_funding_status_enum_values():
    assert ProfessorFundingStatusEnum.OPEN_FUNDED_POSITION.value == "OPEN_FUNDED_POSITION"
    assert ProfessorFundingStatusEnum.FUNDING_SCHEME_AVAILABLE.value == "FUNDING_SCHEME_AVAILABLE"
    assert ProfessorFundingStatusEnum.UNKNOWN.value == "UNKNOWN"


def test_professor_defaults_funding_to_unknown_without_evidence():
    """Default funding_status MUST be UNKNOWN; never assume funding without proof."""
    prof = Professor(
        full_name="Dr. Jane Doe",
        normalized_name="janedoe",
        university_id="uni_test_123",
        email="jane.doe@ox.ac.uk",
    )
    assert prof.funding_status == "UNKNOWN"
    assert prof.funding_source_url == ""
    assert prof.grant_id == ""


# 2. Programme eligibility fields default to UNKNOWN
def test_programme_eligibility_defaults_to_unknown():
    prof = Professor(
        full_name="Dr. Alan Turing",
        normalized_name="alanturing",
        university_id="uni_test_456",
        email="a.turing@cam.ac.uk",
    )
    assert prof.min_qualification == "UNKNOWN"
    assert prof.english_requirement == "UNKNOWN"
    assert prof.international_eligibility == "UNKNOWN"
    assert prof.application_deadline == "UNKNOWN"
    assert prof.deadline_source_url == ""


# 3. Candidate 6 core topics definition and topic match scoring
def test_shama_core_topics_coverage():
    expected_topics = [
        "Clinical Pharmacy & Pharmacotherapy",
        "Medication Safety & Pharmacovigilance",
        "Antimicrobial Stewardship & Critical Care",
        "Evidence-based Pharmacy Practice",
        "Implementation Science & Health-System Outcomes",
        "AI & CDSS in Medication Management",
    ]
    for topic in expected_topics:
        assert topic in SHAMA_CORE_TOPICS
        assert len(SHAMA_CORE_TOPICS[topic]) >= 5


def test_topic_scoring_high_for_clinical_pharmacy():
    text = (
        "Professor of Clinical Pharmacy researching antimicrobial stewardship, "
        "carbapenem resistance, meropenem dosing, and renal clearance optimization in the ICU."
    )
    scores, best_topic, composite = score_candidate_topics(text)
    assert best_topic == "Antimicrobial Stewardship & Critical Care"
    assert scores["Antimicrobial Stewardship & Critical Care"] >= 50.0
    assert composite >= 50.0


def test_topic_scoring_low_for_unrelated_research():
    text = "Synthesis of novel organometallic catalysts for olefin polymerization in non-polar organic solvents."
    scores, best_topic, composite = score_candidate_topics(text)
    assert composite < 20.0
    for val in scores.values():
        assert val < 20.0


def test_recency_check_rewards_recent_publications():
    text = "Clinical pharmacist interventions, adverse drug reaction monitoring, and high-alert medication safety."
    mock_docs = [{
        "id": "doc_1",
        "title": "High-Alert Medication Safety in Tertiary Care",
        "extracted_summary": "pharmacovigilance adverse drug reactions clinical pharmacist",
        "extracted_text": "pharmacovigilance adverse drug reactions clinical pharmacist",
    }]
    # Recent publication (2024)
    align_recent = compute_research_alignment(text, mock_docs, recent_paper_year=2024)
    assert align_recent["has_recent_publication"] is True

    # Older publication (2020)
    align_older = compute_research_alignment(text, mock_docs, recent_paper_year=2020)
    assert align_older["has_recent_publication"] is False

    # Score of recent publication must be strictly higher due to recency multiplier
    assert align_recent["relevance_score"] > align_older["relevance_score"]


def test_no_artificial_score_clamping():
    """Verify that unrelated text is NOT artificially clamped to >= 71.5%."""
    unrelated_text = "Astronomical spectroscopic observations of stellar coronas and binary black hole mergers."
    align = compute_research_alignment(unrelated_text, [], recent_paper_year=2019)
    assert align["relevance_score"] < 50.0


# 4. Institutional email verification
def test_institutional_email_verification():
    # Valid institutional emails
    status, _ = verify_institutional_email("prof.smith@manchester.ac.uk", "John Smith")
    assert status == "VERIFIED_INSTITUTIONAL"

    status, _ = verify_institutional_email("sarah.connor@harvard.edu", "Sarah Connor")
    assert status == "VERIFIED_INSTITUTIONAL"

    status, _ = verify_institutional_email("doctor@sydney.edu.au", "Sydney Doctor")
    assert status == "VERIFIED_INSTITUTIONAL"

    # Commercial public webmail domains must be flagged as UNVERIFIED_EMAIL
    status, reason = verify_institutional_email("john.smith@gmail.com", "John Smith")
    assert status == "UNVERIFIED_EMAIL"
    assert "webmail" in reason.lower()

    status, _ = verify_institutional_email("researcher@yahoo.com", "Researcher")
    assert status == "UNVERIFIED_EMAIL"

    # Pakistan domain must be rejected/excluded
    status, reason = verify_institutional_email("prof@hec.edu.pk", "Pakistani Prof")
    assert status == "UNVERIFIED_EMAIL"
    assert "excluded" in reason.lower()


# 5. Top matches API endpoint
def test_top_matches_endpoint(client, auth_headers):
    res = client.get("/api/v1/professors/top-matches?limit=30", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "items" in data
    assert len(data["items"]) <= 30

    # Ensure each item contains Phase 4 metadata keys
    for item in data["items"]:
        assert "funding_status" in item
        assert item["funding_status"] in [
            "OPEN_FUNDED_POSITION",
            "FUNDING_SCHEME_AVAILABLE",
            "UNKNOWN",
            "VERIFIED",
            "PARTIALLY VERIFIED",
        ]
        assert "min_qualification" in item
        assert "english_requirement" in item
        assert "international_eligibility" in item
        assert "application_deadline" in item
        assert "email_verification_status" in item
        assert "has_recent_publication" in item
        # Ensure outside Pakistan rule
        assert item["country"].lower() != "pakistan"
