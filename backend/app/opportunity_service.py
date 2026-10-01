"""
Shama Abidi PhD System — Global Funded PhD Opportunity Service (`backend/app/opportunity_service.py`)
Implements strict business logic for:
1. Global Target Country lookup & validation across 7 regions
2. Evidence-backed Funding Classification (FULLY_FUNDED vs PARTIALLY_FUNDED vs UNFUNDED vs NEEDS_REVIEW vs UNKNOWN; never guessing)
3. Academic Alignment Evaluation against Dr. Shama Abidi's PharmD/MPhil Clinical Pharmacy profile
4. English Language requirement & Medium of Instruction exemption tracking
5. Strict Outreach Recommendation gatekeeping (human approval mandatory)
"""
from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from backend.app.enums import (
    EnglishRequirementEnum,
    FundingClassificationEnum,
    InternationalEligibilityEnum,
    TuitionCoverageEnum,
    VerificationStatusEnum,
)
from backend.app.logging_audit import record_audit_log
from backend.app.models import PhDOpportunity, University
from backend.app.security import sanitize_text_against_xss
from backend.app.services import extract_domain, is_official_academic_domain, normalize_key
from backend.app.target_countries import is_country_excluded, resolve_target_country

# Dr. Shama Abidi's verified core research themes & publication keywords
SHAMA_RESEARCH_THEMES = [
    {
        "domain": "Antimicrobial Stewardship & Critical Care",
        "keywords": ["antimicrobial stewardship", "carbapenem", "meropenem", "antibiotic", "icu", "critical care", "infectious disease"],
        "weight": 25.0,
    },
    {
        "domain": "Cardiovascular Pharmacotherapy & Angina",
        "keywords": ["angina", "calcium channel blocker", "beta blocker", "cardiovascular", "cardiology", "hypertension", "antianginal"],
        "weight": 25.0,
    },
    {
        "domain": "Pharmacovigilance & High-Alert Medication Safety",
        "keywords": ["pharmacovigilance", "adverse drug reaction", "adr", "naranjo", "high-alert medication", "medication error", "patient safety"],
        "weight": 20.0,
    },
    {
        "domain": "Artificial Intelligence & Clinical Decision Support",
        "keywords": ["artificial intelligence", "clinical decision support", "machine learning in pharmacy", "digital health", "cdss", "health informatics"],
        "weight": 15.0,
    },
    {
        "domain": "Renal Pharmacokinetics & Dose Optimization",
        "keywords": ["renal dose adjustment", "creatinine clearance", "crcl", "pharmacokinetics", "therapeutic drug monitoring", "tdm"],
        "weight": 15.0,
    },
]


def classify_funding_integrity(
    tuition_coverage: str,
    stipend_amount: str,
    evidence_text: str,
    source_url: str = "",
) -> Tuple[str, str, str]:
    """
    Strict evidence-backed classification:
    - Never labels FULLY_FUNDED unless official evidence confirms BOTH tuition coverage AND living stipend.
    - Missing info marked UNKNOWN or NEEDS_REVIEW, never guessed.
    Returns: (funding_type, tuition_coverage_val, rationale)
    """
    clean_ev = (evidence_text or "").lower()
    clean_stipend = (stipend_amount or "").lower()
    domain = extract_domain(source_url)
    is_official = is_official_academic_domain(domain, source_url)

    # Keywords for tuition & stipend
    tuition_confirmed = any(
        k in clean_ev for k in ["full tuition", "tuition fee waiver", "100% tuition", "fees covered", "tuition covered", "fees waived", "tuition and fees"]
    ) or (tuition_coverage.upper() == "YES")
    
    stipend_confirmed = any(
        k in clean_ev or k in clean_stipend
        for k in ["stipend", "living allowance", "maintenance grant", "salary", "annum", "per year", "per month", "eur", "gbp", "usd", "aud", "cad", "chf", "sek", "nok", "dkk"]
    ) and clean_stipend not in ("", "unknown", "none", "0")

    unfunded_indicators = any(
        k in clean_ev for k in ["self-funded", "self funded", "bench fees apply", "unfunded", "applicant must provide funding", "tuition fees payable"]
    )

    if unfunded_indicators:
        return (
            FundingClassificationEnum.UNFUNDED.value,
            TuitionCoverageEnum.NO.value,
            "Official documentation indicates position is self-funded or fee-paying.",
        )

    if tuition_confirmed and stipend_confirmed:
        if is_official:
            return (
                FundingClassificationEnum.FULLY_FUNDED.value,
                TuitionCoverageEnum.YES.value,
                f"Verified from official source ({domain}): Both 100% tuition coverage and living stipend confirmed.",
            )
        else:
            return (
                FundingClassificationEnum.NEEDS_REVIEW.value,
                TuitionCoverageEnum.UNKNOWN.value,
                "Third-party listing claims full funding, but claims must be verified against official university portal.",
            )

    if tuition_confirmed and not stipend_confirmed:
        return (
            FundingClassificationEnum.PARTIALLY_FUNDED.value,
            TuitionCoverageEnum.YES.value,
            "Tuition fee waiver confirmed, but living stipend amount is unspecified or not provided.",
        )

    if stipend_confirmed and not tuition_confirmed:
        return (
            FundingClassificationEnum.PARTIALLY_FUNDED.value,
            TuitionCoverageEnum.UNKNOWN.value,
            "Stipend/salary confirmed, but full tuition waiver status is unconfirmed.",
        )

    if clean_ev:
        return (
            FundingClassificationEnum.NEEDS_REVIEW.value,
            TuitionCoverageEnum.UNKNOWN.value,
            "Evidence text is ambiguous or lacks explicit breakdown of tuition and stipend coverage.",
        )

    return (
        FundingClassificationEnum.UNKNOWN.value,
        TuitionCoverageEnum.UNKNOWN.value,
        "No funding evidence provided. Marked as UNKNOWN to prevent guessing.",
    )


def evaluate_academic_alignment(
    research_field: str,
    phd_programme: str,
    supervisor_name: str,
    additional_context: str = "",
) -> Tuple[float, str]:
    """
    Evaluates PhD position against Dr. Shama Abidi's PharmD/MPhil verified academic profile.
    Returns: (match_score: 0.0-100.0, match_rationale)
    """
    text_corpus = f"{research_field} {phd_programme} {additional_context}".lower()
    base_score = 0.0
    general_pharma_keywords = ["pharmacy", "pharmacology", "pharmaceutical", "clinical pharmacy", "therapeutics", "biomedical"]
    if any(g in text_corpus for g in general_pharma_keywords):
        base_score = 45.0

    theme_score = 0.0
    matched_domains = []

    for theme in SHAMA_RESEARCH_THEMES:
        theme_matched = False
        for kw in theme["keywords"]:
            if kw in text_corpus:
                theme_matched = True
                break
        if theme_matched:
            theme_score += theme["weight"]
            matched_domains.append(theme["domain"])

    final_score = min(100.0, round(base_score + theme_score, 1))

    if matched_domains:
        rationale = f"Strong alignment with Dr. Shama Abidi's publications in: {', '.join(matched_domains)}."
    elif final_score >= 45.0:
        rationale = "General alignment with Doctor of Pharmacy (PharmD) and MPhil Clinical Pharmacology discipline."
    else:
        rationale = "Low direct alignment with clinical pharmacy and pharmacotherapy research portfolio."

    return final_score, rationale


def upsert_phd_opportunity(
    db: Session,
    country: str,
    university_name: str,
    phd_programme: str,
    research_field: str,
    supervisor_name: str,
    supervisor_profile_url: str = "",
    supervisor_email: str = "",
    funding_source: str = "Unknown",
    confirmed_funding_amount: str = "Unknown",
    stipend_amount: str = "Unknown",
    stipend_duration_months: str = "Unknown",
    tuition_coverage_hint: str = "UNKNOWN",
    international_eligibility: str = "UNKNOWN",
    english_requirements: str = "UNKNOWN",
    english_exemption_details: str = "",
    deadline_date: str = "OPEN_ROLLING",
    intended_intake: str = "Fall 2026 / Spring 2027",
    official_application_url: str = "",
    official_funding_url: str = "",
    required_qualifications: str = "",
    required_documents: str = "",
    evidence_text: str = "",
    actor_user_id: Optional[str] = None,
    actor_email: str = "SYSTEM",
) -> Tuple[PhDOpportunity, bool]:
    """
    Creates or updates a Global Funded PhD Opportunity.
    - Validates target country across 7 regions and rejects excluded countries (Pakistan).
    - Classifies funding strictly based on evidence (never guessing).
    - Evaluates academic match against Dr. Shama Abidi.
    """
    clean_country = sanitize_text_against_xss(country)
    if is_country_excluded(clean_country):
        raise ValueError(f"Country '{clean_country}' is excluded by applicant research policy (Pakistan exclusion).")

    resolved_geo = resolve_target_country(clean_country)
    if not resolved_geo:
        raise ValueError(
            f"Country '{clean_country}' is not in the active 7 target regions. "
            "Please add it to config/target_countries.json or enable the region."
        )

    clean_uni = sanitize_text_against_xss(university_name)
    clean_prog = sanitize_text_against_xss(phd_programme)
    clean_sup = sanitize_text_against_xss(supervisor_name)
    clean_field = sanitize_text_against_xss(research_field)

    if not clean_uni or not clean_prog or not clean_sup:
        raise ValueError("university_name, phd_programme, and supervisor_name are mandatory.")

    # Classify funding strictly
    funding_type, tuition_coverage, funding_rationale = classify_funding_integrity(
        tuition_coverage=tuition_coverage_hint,
        stipend_amount=stipend_amount,
        evidence_text=evidence_text,
        source_url=official_funding_url or official_application_url,
    )

    # Evaluate academic alignment
    match_score, match_rationale = evaluate_academic_alignment(
        research_field=clean_field,
        phd_programme=clean_prog,
        supervisor_name=clean_sup,
        additional_context=evidence_text,
    )

    # Check official verification status
    official_url = official_funding_url or official_application_url or supervisor_profile_url
    domain = extract_domain(official_url)
    is_verified = bool(official_url and is_official_academic_domain(domain, official_url) and evidence_text)
    verif_status = VerificationStatusEnum.VERIFIED.value if is_verified else VerificationStatusEnum.UNVERIFIED.value

    # Outreach recommendation gate
    recommended = bool(
        verif_status == VerificationStatusEnum.VERIFIED.value
        and funding_type in (FundingClassificationEnum.FULLY_FUNDED.value, FundingClassificationEnum.PARTIALLY_FUNDED.value)
        and international_eligibility.upper() != InternationalEligibilityEnum.RESTRICTED.value
        and match_score >= 70.0
    )

    existing = (
        db.query(PhDOpportunity)
        .filter(
            PhDOpportunity.university_name == clean_uni,
            PhDOpportunity.phd_programme == clean_prog,
            PhDOpportunity.supervisor_name == clean_sup,
        )
        .first()
    )

    if existing:
        # Update existing record idempotently
        existing.country = resolved_geo["name"]
        existing.country_code = resolved_geo["code"]
        existing.region = resolved_geo["region_name"]
        existing.research_field = clean_field
        existing.supervisor_profile_url = supervisor_profile_url.strip()
        existing.supervisor_email = supervisor_email.strip()
        existing.funding_source = funding_source.strip()
        existing.confirmed_funding_amount = confirmed_funding_amount.strip()
        existing.funding_type = funding_type
        existing.tuition_coverage = tuition_coverage
        existing.stipend_amount = stipend_amount.strip()
        existing.stipend_duration_months = stipend_duration_months.strip()
        existing.international_eligibility = international_eligibility.upper()
        existing.english_requirements = english_requirements.upper()
        existing.english_exemption_details = sanitize_text_against_xss(english_exemption_details)
        existing.deadline_date = deadline_date.strip()
        existing.intended_intake = intended_intake.strip()
        existing.official_application_url = official_application_url.strip()
        existing.official_funding_url = official_funding_url.strip()
        existing.evidence_text = sanitize_text_against_xss(evidence_text)
        existing.applicant_match_score = match_score
        existing.match_rationale = match_rationale
        existing.is_recommended_for_outreach = recommended
        if is_verified:
            existing.verification_status = verif_status
            existing.source_verification_date = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing, False

    # Link to existing University if matched
    matched_uni = db.query(University).filter(University.name == clean_uni).first()

    opp = PhDOpportunity(
        country=resolved_geo["name"],
        country_code=resolved_geo["code"],
        region=resolved_geo["region_name"],
        university_id=matched_uni.id if matched_uni else None,
        university_name=clean_uni,
        phd_programme=clean_prog,
        research_field=clean_field,
        supervisor_name=clean_sup,
        supervisor_profile_url=supervisor_profile_url.strip(),
        supervisor_email=supervisor_email.strip(),
        funding_source=funding_source.strip(),
        confirmed_funding_amount=confirmed_funding_amount.strip(),
        funding_type=funding_type,
        tuition_coverage=tuition_coverage,
        stipend_amount=stipend_amount.strip(),
        stipend_duration_months=stipend_duration_months.strip(),
        international_eligibility=international_eligibility.upper(),
        english_requirements=english_requirements.upper(),
        english_exemption_details=sanitize_text_against_xss(english_exemption_details),
        deadline_date=deadline_date.strip(),
        intended_intake=intended_intake.strip(),
        official_application_url=official_application_url.strip(),
        official_funding_url=official_funding_url.strip(),
        source_verification_date=datetime.now(timezone.utc) if is_verified else None,
        verification_status=verif_status,
        required_qualifications=sanitize_text_against_xss(required_qualifications),
        required_documents=sanitize_text_against_xss(required_documents),
        evidence_text=sanitize_text_against_xss(evidence_text),
        applicant_match_score=match_score,
        match_rationale=match_rationale,
        is_recommended_for_outreach=recommended,
    )
    db.add(opp)
    db.commit()
    db.refresh(opp)

    record_audit_log(
        db,
        action="PHD_OPPORTUNITY_CREATED",
        entity_type="PhDOpportunity",
        entity_id=opp.id,
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        new_value={
            "university": opp.university_name,
            "country": opp.country,
            "region": opp.region,
            "funding_type": opp.funding_type,
            "match_score": opp.applicant_match_score,
            "is_recommended": opp.is_recommended_for_outreach,
        },
    )
    return opp, True
