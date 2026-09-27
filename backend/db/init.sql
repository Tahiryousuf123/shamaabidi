-- ============================================================================
-- Shama Abidi — International Funded PhD AI Research & Application System
-- PostgreSQL 16 Production Schema (Phase 1 + Future Academic Intelligence)
-- Core Principles:
--   1. STRICT NO-FABRICATION: Unverified fields must explicitly use 'TO_VERIFY' or 'UNKNOWN'
--   2. HUMAN-IN-THE-LOOP: No email can transition to 'SENT' without approved_by_human = TRUE
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Candidate Profile & Verified Evidence Base (No-Fabrication Source of Truth)
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL DEFAULT 'Shama Abidi',
    primary_discipline VARCHAR(200) NOT NULL,
    research_interests TEXT[] NOT NULL,
    verified_degrees JSONB NOT NULL DEFAULT '[]'::jsonb,
    verified_publications JSONB NOT NULL DEFAULT '[]'::jsonb,
    verified_skills TEXT[] NOT NULL DEFAULT '{}',
    english_proficiency VARCHAR(100) DEFAULT 'TO_VERIFY',
    strict_no_fabrication BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Funded PhD Opportunities (Global Discovery + Official Verification)
CREATE TABLE phd_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(300) NOT NULL,
    university VARCHAR(250) NOT NULL,
    country VARCHAR(100) NOT NULL,
    department VARCHAR(250) DEFAULT 'UNKNOWN',
    official_url TEXT NOT NULL,
    source_portal VARCHAR(100) NOT NULL, -- e.g., EURAXESS, DAAD, FindAPhD, University Portal
    url_hash VARCHAR(64) UNIQUE NOT NULL, -- Deduplication hash
    verification_status VARCHAR(50) NOT NULL CHECK (
        verification_status IN ('VERIFIED_OFFICIAL', 'TO_VERIFY', 'EXPIRED_FILTERED', 'DUPLICATE_FILTERED')
    ),
    funding_type VARCHAR(50) NOT NULL CHECK (
        funding_type IN ('FULLY_FUNDED', 'PARTIAL_FUNDING', 'STIPEND_PLUS_TUITION', 'TO_VERIFY', 'UNKNOWN')
    ),
    stipend_amount VARCHAR(150) NOT NULL DEFAULT 'TO_VERIFY',
    tuition_coverage VARCHAR(100) NOT NULL DEFAULT 'TO_VERIFY',
    deadline DATE,
    is_expired BOOLEAN NOT NULL DEFAULT FALSE,
    overall_fit_score NUMERIC(5,2) CHECK (overall_fit_score >= 0 AND overall_fit_score <= 100),
    pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'DISCOVERED' CHECK (
        pipeline_stage IN (
            'DISCOVERED',
            'OFFICIALLY_VERIFIED',
            'SUPERVISOR_ANALYZED',
            'DRAFT_PENDING_APPROVAL',
            'EMAIL_SENT',
            'POSITIVE_REPLY',
            'INTERVIEW_SCHEDULED',
            'APPLICATION_SUBMITTED',
            'ARCHIVED'
        )
    ),
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ
);

-- 3. Supervisors & Evidence-Based Research Fit Analysis
CREATE TABLE supervisors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID REFERENCES phd_opportunities(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    title VARCHAR(100) DEFAULT 'Professor',
    university VARCHAR(250) NOT NULL,
    department_lab VARCHAR(250) DEFAULT 'UNKNOWN',
    official_email VARCHAR(250) NOT NULL,
    google_scholar_url TEXT DEFAULT 'UNKNOWN',
    orcid_id VARCHAR(50) DEFAULT 'UNKNOWN',
    recent_publications JSONB NOT NULL DEFAULT '[]'::jsonb, -- Indexed in Qdrant Vector DB
    evidence_based_fit_score NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    fit_rationale_evidence JSONB NOT NULL DEFAULT '{}'::jsonb, -- Direct quotes & verified overlaps only
    missing_or_unverified_facts TEXT[] NOT NULL DEFAULT '{}', -- Explicitly tagged TO_VERIFY / UNKNOWN
    accepting_phd_status VARCHAR(50) NOT NULL DEFAULT 'TO_VERIFY' CHECK (
        accepting_phd_status IN ('CONFIRMED_OPEN', 'TO_VERIFY', 'UNKNOWN', 'CLOSED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Email Drafts & Strict Human-in-the-Loop Approval Gate
CREATE TABLE email_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supervisor_id UUID NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES phd_opportunities(id) ON DELETE SET NULL,
    email_type VARCHAR(50) NOT NULL CHECK (
        email_type IN ('INITIAL_OUTREACH', 'FOLLOW_UP_DAY_7', 'FOLLOW_UP_DAY_10', 'INTERVIEW_RESPONSE')
    ),
    subject TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    cited_supervisor_papers TEXT[] NOT NULL DEFAULT '{}',
    unverified_placeholders TEXT[] NOT NULL DEFAULT '{}', -- Any [TO_VERIFY] tags found
    no_fabrication_check_passed BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_HUMAN_APPROVAL' CHECK (
        approval_status IN ('PENDING_HUMAN_APPROVAL', 'APPROVED_BY_HUMAN', 'REJECTED_NEEDS_EDIT', 'SENT_VIA_GMAIL_OAUTH')
    ),
    approved_by_human BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by_user VARCHAR(150),
    approved_at TIMESTAMPTZ,
    gmail_message_id VARCHAR(150),
    gmail_thread_id VARCHAR(150),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Database-level constraint: An email CANNOT be marked SENT without human approval!
    CONSTRAINT enforce_human_approval_before_send CHECK (
        (approval_status != 'SENT_VIA_GMAIL_OAUTH') OR (approved_by_human = TRUE AND approved_at IS NOT NULL)
    )
);

-- 5. Gmail OAuth Inbox Monitor & Automatic Follow-Up Scheduler
CREATE TABLE gmail_inbox_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gmail_thread_id VARCHAR(150) UNIQUE NOT NULL,
    supervisor_id UUID REFERENCES supervisors(id) ON DELETE SET NULL,
    last_message_from VARCHAR(250) NOT NULL,
    last_message_snippet TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ai_reply_classification VARCHAR(60) NOT NULL CHECK (
        ai_reply_classification IN (
            'AWAITING_REPLY',
            'POSITIVE_INTEREST',
            'FUNDING_CONFIRMED',
            'INTERVIEW_INVITATION',
            'SUPERVISOR_REDIRECT',
            'NO_FUNDING_OR_CAPACITY',
            'TO_VERIFY'
        )
    ),
    days_since_last_contact INTEGER NOT NULL DEFAULT 0,
    auto_followup_due_date DATE,
    followup_draft_generated BOOLEAN NOT NULL DEFAULT FALSE
);

-- 6. Future-Ready Module: Academic Literature Review & Reference Management (RAG)
CREATE TABLE academic_literature_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doi VARCHAR(150) UNIQUE,
    title TEXT NOT NULL,
    authors TEXT[] NOT NULL,
    publication_year INTEGER,
    journal_or_venue VARCHAR(250) DEFAULT 'UNKNOWN',
    qdrant_point_id UUID,
    summary_notes TEXT DEFAULT 'TO_VERIFY',
    linked_supervisor_id UUID REFERENCES supervisors(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Security & Immutable Audit Logs
CREATE TABLE security_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL, -- 'HUMAN_ADMIN', 'LANGGRAPH_AGENT', 'N8N_SCHEDULER', 'GMAIL_OAUTH_MONITOR'
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(150),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
