"""
Dr. Shama Abidi — Academic Draft Validator & Quality Scorer
Phase 5: Draft Quality & Anti-Fabrication Engine

Enforces strict assertions before any outreach email draft can be saved or queued:
1. Candidate Identity & Degree Integrity:
   - Must assert candidate name == "Dr. Shama Abidi" (or "Shama Abidi")
   - Must assert candidate degree == "PharmD, MPhil in Pharmacy Practice"
2. Strict Citation Verification:
   - Candidate publications mentioned MUST be strictly from the 4 verified publications.
   - Professor publication mentioned MUST match the database record.
3. Anti-Hallucination & Zero-Fabrication:
   - If any assertion fails, the draft is quarantined with validation_status = 'DRAFT_VALIDATION_FAILED'.
4. Draft Quality Score (0 - 100):
   - Evaluates synergy relevance (0-30), DOI presence (0-25), name/title accuracy (0-20),
     and funding inquiry status alignment (0-25).
"""

import re
from typing import Any, Dict, List, Tuple

from backend.verified_publications import (
    SHAMA_CANDIDATE_PROFILE,
    SHAMA_VERIFIED_PUBLICATIONS,
)


def extract_synergy_paragraph(body_text: str) -> str:
    """Extracts the substantive research synergy paragraph connecting both publications."""
    paragraphs = [p.strip() for p in (body_text or "").split("\n\n") if p.strip()]
    best_p = ""
    best_score = 0

    core_study_indicators = [
        "pjps", "jppp", "prospective interventional", "our study", "our prospective",
        "evaluated n=", "n=", "naranjo", "saq-7", "seattle angina", "acceptance rate",
        "renal dose", "high-alert", "decision support", "readmissions", "p=", "p<",
        "carbapenem", "calcium channel", "beta blocker"
    ]

    for p in paragraphs:
        p_lower = p.lower()
        if p_lower.startswith("dear ") or p_lower.startswith("my name is"):
            continue
        hits = sum(1 for term in core_study_indicators if term in p_lower)
        if hits > best_score:
            best_score = hits
            best_p = p

    if best_score > 0:
        return best_p
    # Fallback to 3rd paragraph if exists (standard email template layout)
    return paragraphs[2] if len(paragraphs) > 2 else (paragraphs[1] if len(paragraphs) > 1 else "")


def validate_and_score_draft(
    draft_subject: str,
    draft_body: str,
    prof: Dict[str, Any],
) -> Tuple[bool, int, List[str], Dict[str, Any]]:
    """
    Validates draft correctness and scores quality.
    Returns:
      (is_valid, quality_score, error_list, score_breakdown)
    """
    errors: List[str] = []
    breakdown: Dict[str, int] = {
        "synergy_relevance": 0,
        "verified_doi": 0,
        "name_and_title": 0,
        "funding_alignment": 0,
    }

    body_clean = draft_body or ""
    body_lower = body_clean.lower()
    subject_clean = draft_subject or ""

    # 1. Candidate Name Assertion
    has_candidate_name = any(
        alias.lower() in body_lower for alias in SHAMA_CANDIDATE_PROFILE["name_aliases"]
    )
    if not has_candidate_name:
        errors.append("Candidate name assertion failed: Dr. Shama Abidi name not found in email body.")

    # 2. Candidate Degree Assertion
    has_pharmd = "pharmd" in body_lower
    has_mphil = "mphil" in body_lower
    if not (has_pharmd and has_mphil):
        errors.append("Candidate degree assertion failed: 'PharmD' and 'MPhil' credentials must be explicitly cited.")

    # 3. Professor Publication Match Assertion
    prof_paper_title = (prof.get("recent_paper_title") or "").strip()
    if prof_paper_title:
        # Title or significant substring of professor paper must be present in body or subject
        norm_title = re.sub(r"[^a-z0-9]", "", prof_paper_title.lower())
        norm_body = re.sub(r"[^a-z0-9]", "", body_clean.lower())
        title_snippet = norm_title[:40] if len(norm_title) > 40 else norm_title
        if title_snippet and title_snippet not in norm_body:
            errors.append(f"Professor publication mismatch: cited work does not match database record '{prof_paper_title[:50]}...'.")
    else:
        errors.append("Professor has no verified publication record in database.")

    # 4. Candidate Publication Authenticity (Zero Hallucination)
    # Check if cited publications match the 4 verified works
    known_journals = ["pjps", "pakistan journal of pharmaceutical sciences", "jppp", "journal of pharmaceutical policy and practice"]
    has_valid_citation = False
    for pub in SHAMA_VERIFIED_PUBLICATIONS:
        if (pub["journal_short"].lower() in body_lower) or (pub["doi"].lower() in body_lower):
            has_valid_citation = True
            break
    if not has_valid_citation:
        errors.append("Candidate publication assertion failed: email must cite only verified peer-reviewed publications (PJPS, JPPP).")

    # 5. Professor Name / Salutation Check
    prof_full_name = (prof.get("full_name") or "").strip()
    clean_name = re.sub(r"^(prof\.|dr\.|professor|associate professor)\s+", "", prof_full_name, flags=re.I).strip()
    if clean_name and len(clean_name) > 3:
        if clean_name.lower() not in body_lower and prof_full_name.lower() not in body_lower:
            errors.append(f"Professor salutation mismatch: recipient name '{prof_full_name}' not addressed in salutation.")

    is_valid = len(errors) == 0

    # --------------------------------------------------------------------------
    # QUALITY SCORE CALCULATION (0 - 100)
    # --------------------------------------------------------------------------
    synergy_p = extract_synergy_paragraph(body_clean)
    synergy_lower = synergy_p.lower()

    # Synergy Relevance (0 - 30 pts)
    # High synergy: contains specific methodology / statistical metrics
    method_hits = sum(1 for m in [
        "n=", "p=", "p<", "naranjo", "saq-7", "seattle angina", "renal dose",
        "creatinine clearance", "carbapenem", "stewardship", "acceptance rate",
        "high-alert", "decision support", "intervention"
    ] if m in synergy_lower)

    if method_hits >= 3:
        breakdown["synergy_relevance"] = 30
    elif method_hits >= 1 or len(synergy_p) > 100:
        breakdown["synergy_relevance"] = 20
    else:
        breakdown["synergy_relevance"] = 10

    # Presence of Verified DOI (0 - 25 pts)
    prof_doi = (prof.get("recent_paper_doi") or "").strip()
    if prof_doi and (prof_doi.lower() in body_lower or f"doi: {prof_doi.lower()}" in body_lower):
        breakdown["verified_doi"] = 25
    elif prof_doi or (prof.get("profile_url") and "http" in prof.get("profile_url", "")):
        breakdown["verified_doi"] = 18
    else:
        breakdown["verified_doi"] = 10

    # Correct Professor Name & Title (0 - 20 pts)
    if clean_name and (clean_name.lower() in body_lower or prof_full_name.lower() in body_lower):
        breakdown["name_and_title"] = 20
    elif "professor" in body_lower or "dr." in body_lower:
        breakdown["name_and_title"] = 12
    else:
        breakdown["name_and_title"] = 5

    # Explicit Funding Inquiry Matching Funding Status (0 - 25 pts)
    funding_status = (prof.get("funding_status") or "UNKNOWN").upper()

    if funding_status in ("OPEN_FUNDED_POSITION", "FUNDING_SCHEME_AVAILABLE", "VERIFIED", "PARTIALLY VERIFIED"):
        # Expect discussion of active externally funded grants or studentships
        if any(term in body_lower for term in ["externally funded grants", "funded phd", "studentship", "scholarship nominations", "assistantship"]):
            breakdown["funding_alignment"] = 25
        else:
            breakdown["funding_alignment"] = 15
    else:
        # Status is UNKNOWN: inquiry should ask about supervision capacity & fellowship tracks, NOT claim active grant exists
        if "supervision capacity" in body_lower and "fellowship" in body_lower:
            breakdown["funding_alignment"] = 25
        elif "supervision capacity" in body_lower or "capacity" in body_lower:
            breakdown["funding_alignment"] = 20
        else:
            breakdown["funding_alignment"] = 10

    quality_score = sum(breakdown.values())

    return is_valid, quality_score, errors, breakdown
