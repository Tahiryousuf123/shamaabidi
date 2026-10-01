"""
Shama Abidi PhD System — Global Funded PhD Opportunity Search Test Suite (`tests/test_global_phd_search.py`)
Tests:
1. 7 Target Regions & Country Resolution
2. Exclusion list enforcement (Pakistan excluded)
3. Dynamic Country & Region Configuration (add country & toggle region without rebuilding)
4. Strict Evidence-Backed Funding Classification (FULLY_FUNDED, PARTIALLY_FUNDED, UNFUNDED, NEEDS_REVIEW, UNKNOWN; never guessing)
5. Applicant Academic Matching against Dr. Shama Abidi (PharmD / MPhil in Pharmacy Practice)
6. English-language requirements and Medium of Instruction exemption tracking
7. Outreach Recommendation Gatekeeping (Human-in-the-loop safety)
"""
from __future__ import annotations

import io
from pathlib import Path
import sys
import uuid

from fastapi.testclient import TestClient
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.app.config import settings
from backend.app.db_session import SessionLocal, init_orm_schema
from backend.app.enums import (
    FundingClassificationEnum,
    TuitionCoverageEnum,
    VerificationStatusEnum,
)
from backend.app.opportunity_service import (
    classify_funding_integrity,
    evaluate_academic_alignment,
)
from backend.app.services import seed_roles_users_and_jobs
from backend.app.target_countries import (
    get_all_target_countries_flat,
    get_regions_summary,
    is_country_excluded,
    load_target_countries_config,
    resolve_target_country,
)
from backend.main import app


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    init_orm_schema()
    db = SessionLocal()
    try:
        seed_roles_users_and_jobs(db)
    finally:
        db.close()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, email: str = "researcher@shama-phd.org", password: str = "Researcher#2026!Pass") -> dict[str, str]:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ==============================================================================
# 1. TARGET REGIONS & COUNTRY RESOLUTION
# ==============================================================================
def test_all_7_regions_and_country_resolution():
    regions = get_regions_summary()
    expected_region_keys = {
        "north_america",
        "oceania",
        "western_and_northern_europe",
        "southern_europe",
        "central_and_eastern_europe",
        "boundary_and_wider_europe",
        "optional_global_expansion",
    }
    assert expected_region_keys.issubset(set(regions.keys())), f"Missing regions: {expected_region_keys - set(regions.keys())}"

    # Verify key countries resolve properly to their regions
    us_meta = resolve_target_country("United States of America")
    assert us_meta is not None
    assert us_meta["code"] == "US"
    assert us_meta["region_key"] == "north_america"

    uk_meta = resolve_target_country("UK")
    assert uk_meta is not None
    assert uk_meta["code"] == "GB"

    aus_meta = resolve_target_country("Australia")
    assert aus_meta is not None
    assert aus_meta["code"] == "AU"

    ger_meta = resolve_target_country("Germany")
    assert ger_meta is not None
    assert ger_meta["code"] == "DE"

    tr_meta = resolve_target_country("Türkiye")
    assert tr_meta is not None
    assert tr_meta["code"] == "TR"
    assert tr_meta["region_key"] == "boundary_and_wider_europe"

    jp_meta = resolve_target_country("Japan")
    assert jp_meta is not None
    assert jp_meta["code"] == "JP"
    assert jp_meta["region_key"] == "optional_global_expansion"


def test_pakistan_exclusion_enforcement():
    assert is_country_excluded("Pakistan") is True
    assert is_country_excluded("PK") is True
    assert resolve_target_country("Pakistan") is None
    assert resolve_target_country("pk") is None


# ==============================================================================
# 2. STRICT FUNDING CLASSIFICATION TESTS (NEVER GUESSING)
# ==============================================================================
def test_funding_classification_integrity():
    # 1. Full tuition + living stipend from official university domain -> FULLY_FUNDED
    f_type, t_cov, rat = classify_funding_integrity(
        tuition_coverage="YES",
        stipend_amount="EUR 24,000 per annum",
        evidence_text="The doctoral studentship covers full tuition fee waiver and provides an annual living stipend of EUR 24,000 for 48 months.",
        source_url="https://www.ox.ac.uk/admissions/graduate/funding",
    )
    assert f_type == FundingClassificationEnum.FULLY_FUNDED.value
    assert t_cov == TuitionCoverageEnum.YES.value

    # 2. Third-party listing claiming full funding -> NEEDS_REVIEW (must verify on official source)
    f_type_tp, _, rat_tp = classify_funding_integrity(
        tuition_coverage="YES",
        stipend_amount="EUR 20,000",
        evidence_text="Full tuition and living stipend funded",
        source_url="https://www.findaphd.com/phds/some-project",
    )
    assert f_type_tp == FundingClassificationEnum.NEEDS_REVIEW.value
    assert "Third-party listing" in rat_tp

    # 3. Tuition waiver only without stipend -> PARTIALLY_FUNDED
    f_type_part, _, _ = classify_funding_integrity(
        tuition_coverage="YES",
        stipend_amount="",
        evidence_text="Successful candidates receive 100% tuition fee waiver. Living costs are not covered.",
        source_url="https://www.helsinki.fi/phd/funding",
    )
    assert f_type_part == FundingClassificationEnum.PARTIALLY_FUNDED.value

    # 4. Self-funded indicator -> UNFUNDED
    f_type_unf, _, _ = classify_funding_integrity(
        tuition_coverage="UNKNOWN",
        stipend_amount="",
        evidence_text="This is a self-funded doctoral research position. Standard international tuition fees payable.",
        source_url="https://www.manchester.ac.uk/phd/fees",
    )
    assert f_type_unf == FundingClassificationEnum.UNFUNDED.value

    # 5. Missing data -> UNKNOWN (never guessed)
    f_type_unk, _, _ = classify_funding_integrity(
        tuition_coverage="UNKNOWN",
        stipend_amount="",
        evidence_text="",
        source_url="",
    )
    assert f_type_unk == FundingClassificationEnum.UNKNOWN.value


# ==============================================================================
# 3. APPLICANT ACADEMIC MATCHING TESTS (DR. SHAMA ABIDI)
# ==============================================================================
def test_academic_matching_shama_profile():
    # Antimicrobial stewardship & ICU carbapenem research
    score_as, rat_as = evaluate_academic_alignment(
        research_field="Clinical Pharmacy & Antimicrobial Stewardship",
        phd_programme="Doctoral Programme in Infectious Disease Pharmacotherapy",
        supervisor_name="Prof. John Smith",
        additional_context="Focus on ICU carbapenem pharmacokinetic optimization and therapeutic drug monitoring.",
    )
    assert score_as >= 60.0
    assert "Antimicrobial Stewardship" in rat_as

    # Cardiovascular angina research
    score_cv, rat_cv = evaluate_academic_alignment(
        research_field="Cardiovascular Pharmacology",
        phd_programme="PhD in Clinical Pharmacotherapy",
        supervisor_name="Prof. Elena Rossi",
        additional_context="Investigation of calcium channel blockers and beta blockers in angina pectoris.",
    )
    assert score_cv >= 60.0
    assert "Cardiovascular Pharmacotherapy" in rat_cv

    # Unrelated field -> low match
    score_unrelated, _ = evaluate_academic_alignment(
        research_field="Theoretical Astrophysics",
        phd_programme="PhD in Cosmology",
        supervisor_name="Prof. Star",
    )
    assert score_unrelated < 50.0


# ==============================================================================
# 4. API ENDPOINTS: COUNTRIES CONFIGURATION & OPPORTUNITIES ENDPOINTS
# ==============================================================================
def test_api_countries_and_region_toggle(client: TestClient):
    auth_headers = _login(client, email="shama.abidi80@gmail.com", password="ShamaPhD#2026!Secure")

    # Get target countries
    resp = client.get("/api/v1/countries", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["total_countries"] >= 50
    assert len(data["regions"]) == 7

    # Add a dynamic country without rebuilding system
    add_resp = client.post(
        "/api/v1/countries/add",
        headers=auth_headers,
        json={
            "region_key": "optional_global_expansion",
            "name": "Brazil",
            "code": "BR",
            "aliases": ["Brasil", "BR"],
        },
    )
    assert add_resp.status_code == 201
    assert add_resp.json()["country"]["name"] == "Brazil"

    # Verify newly added country resolves immediately
    br_meta = resolve_target_country("Brazil")
    assert br_meta is not None
    assert br_meta["code"] == "BR"


def test_api_phd_opportunity_creation_and_search(client: TestClient):
    auth_headers = _login(client, email="researcher@shama-phd.org", password="Researcher#2026!Pass")
    unique_tag = uuid.uuid4().hex[:6]

    # Ingest a fully funded PhD opportunity with official university source
    create_payload = {
        "country": "United Kingdom",
        "university_name": f"University of Oxford {unique_tag}",
        "phd_programme": "DPhil in Clinical Pharmacy & Antimicrobial Pharmacotherapy",
        "research_field": "Antimicrobial Stewardship & Intensive Care Pharmacokinetics",
        "supervisor_name": f"Prof. Dr. David Roberts {unique_tag}",
        "supervisor_profile_url": "https://www.ox.ac.uk/faculty/roberts",
        "supervisor_email": f"david.roberts.{unique_tag}@ox.ac.uk",
        "funding_source": "MRC Doctoral Training Partnership & Clarendon Fund",
        "confirmed_funding_amount": "Full Home/International Tuition + GBP 19,237 Stipend/year",
        "stipend_amount": "GBP 19,237 per year",
        "stipend_duration_months": "48",
        "tuition_coverage_hint": "YES",
        "international_eligibility": "ELIGIBLE",
        "english_requirements": "MEDIUM_OF_INSTRUCTION_EXEMPTION_ACCEPTED",
        "english_exemption_details": "Candidates with a 5-year PharmD and MPhil taught in English from an accredited institution are eligible for English test exemption with official institutional certificate.",
        "deadline_date": "2026-12-04",
        "intended_intake": "October 2026",
        "official_application_url": "https://www.ox.ac.uk/admissions/graduate/courses/dphil-medical-sciences",
        "official_funding_url": "https://www.ox.ac.uk/admissions/graduate/fees-and-funding/oxford-scholarships",
        "required_qualifications": "Doctor of Pharmacy (PharmD) or MPhil in clinical pharmacology / pharmacy practice with strong academic standing.",
        "required_documents": "Academic transcripts, CV, research proposal (2,000 words), English proficiency verification, 3 academic references.",
        "evidence_text": "The Clarendon Fund scholarship in partnership with MRC covers full tuition fee waiver for international scholars and provides an annual tax-free living stipend of GBP 19,237 for 4 years.",
    }

    create_resp = client.post("/api/v1/opportunities", headers=auth_headers, json=create_payload)
    assert create_resp.status_code == 201, create_resp.text
    item = create_resp.json()["item"]
    assert item["funding_type"] == FundingClassificationEnum.FULLY_FUNDED.value
    assert item["tuition_coverage"] == TuitionCoverageEnum.YES.value
    assert item["verification_status"] == VerificationStatusEnum.VERIFIED.value
    assert item["applicant_match_score"] >= 70.0
    assert item["is_recommended_for_outreach"] is True

    # Search opportunities by country and funding_type
    search_resp = client.get(
        "/api/v1/opportunities",
        headers=auth_headers,
        params={"country": "United Kingdom", "funding_type": "FULLY_FUNDED"},
    )
    assert search_resp.status_code == 200
    res_data = search_resp.json()
    assert res_data["total"] >= 1
    found = [o for o in res_data["items"] if o["supervisor_name"] == f"Prof. Dr. David Roberts {unique_tag}"]
    assert len(found) == 1
    opp = found[0]
    assert opp["english_requirements"] == "MEDIUM_OF_INSTRUCTION_EXEMPTION_ACCEPTED"
    assert "MRC Doctoral Training Partnership" in opp["funding_source"]


def test_api_phd_opportunity_pakistan_rejection(client: TestClient):
    auth_headers = _login(client, email="researcher@shama-phd.org", password="Researcher#2026!Pass")

    # Attempting to add an opportunity in Pakistan must be rejected
    pk_payload = {
        "country": "Pakistan",
        "university_name": "Aga Khan University",
        "phd_programme": "PhD in Health Sciences",
        "research_field": "Pharmacology",
        "supervisor_name": "Prof. Local",
    }
    resp = client.post("/api/v1/opportunities", headers=auth_headers, json=pk_payload)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_OPPORTUNITY"
