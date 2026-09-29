-- ============================================================================
-- SHAMA ABIDI — AUTONOMOUS AI RESEARCH AGENT & CRM SYSTEM
-- Authoritative Production Relational Database Schema (PostgreSQL / SQLite)
-- Implements all 19 required logical entities from Section 26 with:
--   1. Strict Evidence-Based No-Fabrication Guardrails
--   2. Mandatory Human-in-the-Loop Gmail Draft Workflow (Never Auto-Send Initial Emails)
--   3. Cross-Run Professor Deduplication (ORCID, Name+University, Email, Profile URL)
--   4. Event-Driven Scheduled Job Execution & Retry Tracking
-- ============================================================================

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    degree_title TEXT NOT NULL,
    designation TEXT NOT NULL,
    institution TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Karachi',
    country TEXT NOT NULL DEFAULT 'Pakistan',
    official_email TEXT UNIQUE NOT NULL,
    whatsapp_number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. research_profiles
CREATE TABLE IF NOT EXISTS research_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    primary_discipline TEXT NOT NULL,
    summary_bio TEXT NOT NULL,
    research_topics_json TEXT NOT NULL DEFAULT '[]',
    methods_used_json TEXT NOT NULL DEFAULT '[]',
    keywords_json TEXT NOT NULL DEFAULT '[]',
    specializations_json TEXT NOT NULL DEFAULT '[]',
    target_phd_themes_json TEXT NOT NULL DEFAULT '[]',
    source_document_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- 3. research_documents
CREATE TABLE IF NOT EXISTS research_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    document_type TEXT NOT NULL, -- 'PUBLICATION_PDF', 'THESIS_PDF', 'ABSTRACT_BOOK', 'CV_DOCUMENT'
    title TEXT NOT NULL,
    authors_json TEXT NOT NULL DEFAULT '[]',
    publication_year INTEGER,
    journal_or_venue TEXT,
    doi TEXT,
    file_hash TEXT UNIQUE NOT NULL,
    pipeline_stage TEXT NOT NULL CHECK (
        pipeline_stage IN (
            'UPLOAD',
            'PROCESSING',
            'TEXT EXTRACTION',
            'RESEARCH INFORMATION EXTRACTION',
            'EMBEDDINGS',
            'INDEXING',
            'READY',
            'FAILED'
        )
    ),
    extracted_text TEXT NOT NULL DEFAULT '',
    extracted_summary TEXT NOT NULL DEFAULT '',
    page_count INTEGER NOT NULL DEFAULT 1,
    uploaded_at TEXT NOT NULL,
    processed_at TEXT
);

-- 4. research_facts
CREATE TABLE IF NOT EXISTS research_facts (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
    fact_category TEXT NOT NULL, -- 'TOPIC', 'METHODOLOGY', 'STATISTICAL_RESULT', 'CLINICAL_SETTING', 'COHORT_METRIC', 'KEYWORD'
    fact_key TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    source_citation TEXT NOT NULL,
    confidence_level TEXT NOT NULL DEFAULT 'VERIFIED_FROM_DOCUMENT',
    created_at TEXT NOT NULL
);

-- 5. research_embeddings
CREATE TABLE IF NOT EXISTS research_embeddings (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL, -- 'SHAMA_DOCUMENT', 'SHAMA_PROFILE', 'PROFESSOR_PUBLICATION'
    source_id TEXT NOT NULL,
    collection_name TEXT NOT NULL DEFAULT 'shama_research_vectors',
    text_chunk TEXT NOT NULL,
    vector_dimension INTEGER NOT NULL DEFAULT 64,
    embedding_json TEXT NOT NULL,
    content_hash TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);

-- 6. universities
CREATE TABLE IF NOT EXISTS universities (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    city TEXT DEFAULT '',
    website_url TEXT DEFAULT '',
    ror_id TEXT DEFAULT '',
    openalex_id TEXT DEFAULT '',
    is_outside_pakistan INTEGER NOT NULL DEFAULT 1 CHECK (is_outside_pakistan = 1),
    created_at TEXT NOT NULL
);

-- 7. professors
CREATE TABLE IF NOT EXISTS professors (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    normalized_name_uni_key TEXT UNIQUE NOT NULL,
    orcid_id TEXT DEFAULT '',
    openalex_author_id TEXT DEFAULT '',
    university_id TEXT REFERENCES universities(id) ON DELETE SET NULL,
    university_name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'School of Pharmacy & Pharmaceutical Sciences',
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    official_email TEXT DEFAULT '',
    email_source_type TEXT DEFAULT 'INSTITUTIONAL_DIRECTORY',
    profile_url TEXT DEFAULT '',
    research_areas_json TEXT NOT NULL DEFAULT '[]',
    recent_paper_title TEXT NOT NULL DEFAULT '',
    recent_paper_year INTEGER,
    recent_paper_doi TEXT DEFAULT '',
    why_matches_shama TEXT NOT NULL DEFAULT '',
    matched_shama_doc_id TEXT REFERENCES research_documents(id) ON DELETE SET NULL,
    matched_shama_Work_title TEXT DEFAULT '',
    relevance_score REAL NOT NULL DEFAULT 0.0,
    funding_status TEXT NOT NULL DEFAULT 'NO EVIDENCE FOUND' CHECK (
        funding_status IN ('VERIFIED', 'PARTIALLY VERIFIED', 'NOT CONFIRMED', 'NO EVIDENCE FOUND')
    ),
    verification_status TEXT NOT NULL DEFAULT 'NEEDS REVIEW' CHECK (
        verification_status IN ('VERIFIED', 'PARTIALLY VERIFIED', 'NEEDS REVIEW', 'NOT VERIFIED')
    ),
    crm_state TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (
        crm_state IN ('DISCOVERED', 'VERIFIED', 'DRAFT_READY', 'EMAILED', 'REPLIED', 'INTERESTED', 'CV_REQUESTED', 'MEETING_REQUEST', 'FOLLOWUP_DUE', 'DECLINED', 'ARCHIVED')
    ),
    discovery_source TEXT NOT NULL DEFAULT 'OpenAlex / Europe PMC',
    discovered_batch_date TEXT NOT NULL,
    discovered_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_professors_orcid ON professors(orcid_id);
CREATE INDEX IF NOT EXISTS idx_professors_crm_state ON professors(crm_state);
CREATE INDEX IF NOT EXISTS idx_professors_country ON professors(country);

-- 8. professor_publications
CREATE TABLE IF NOT EXISTS professor_publications (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    publication_year INTEGER,
    journal TEXT DEFAULT '',
    doi TEXT DEFAULT '',
    pmid TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    abstract_snippet TEXT DEFAULT '',
    shared_keywords_json TEXT NOT NULL DEFAULT '[]',
    semantic_similarity REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL
);

-- 9. funding_evidence
CREATE TABLE IF NOT EXISTS funding_evidence (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    funding_status TEXT NOT NULL CHECK (
        funding_status IN ('VERIFIED', 'PARTIALLY VERIFIED', 'NOT CONFIRMED', 'NO EVIDENCE FOUND')
    ),
    grant_agency TEXT NOT NULL DEFAULT '',
    grant_id_or_program TEXT NOT NULL DEFAULT '',
    evidence_type TEXT NOT NULL DEFAULT '', -- 'ACTIVE_GRANT_RECORD', 'FUNDED_PAPER_ACKNOWLEDGEMENT', 'UNIVERSITY_SCHOLARSHIP_PORTAL', 'NONE'
    evidence_summary TEXT NOT NULL,
    source_url TEXT NOT NULL DEFAULT '',
    verified_at TEXT NOT NULL
);

-- 10. verification_records
CREATE TABLE IF NOT EXISTS verification_records (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN ('VERIFIED', 'PARTIALLY VERIFIED', 'NEEDS REVIEW', 'NOT VERIFIED')
    ),
    person_identity_checked INTEGER NOT NULL DEFAULT 0,
    university_affiliation_checked INTEGER NOT NULL DEFAULT 0,
    active_publication_checked INTEGER NOT NULL DEFAULT 0,
    research_alignment_checked INTEGER NOT NULL DEFAULT 0,
    outside_pakistan_checked INTEGER NOT NULL DEFAULT 1,
    email_authenticity_note TEXT NOT NULL DEFAULT '',
    verification_notes TEXT NOT NULL DEFAULT '',
    verified_at TEXT NOT NULL
);

-- 11. email_addresses
CREATE TABLE IF NOT EXISTS email_addresses (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    source_type TEXT NOT NULL, -- 'PUBLISHED_CORRESPONDING_AUTHOR', 'UNIVERSITY_PROFILE', 'INSTITUTIONAL_PATTERN_TO_VERIFY'
    is_verified_public INTEGER NOT NULL DEFAULT 0,
    domain TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

-- 12. email_drafts
CREATE TABLE IF NOT EXISTS email_drafts (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    draft_type TEXT NOT NULL DEFAULT 'INITIAL_OUTREACH' CHECK (
        draft_type IN ('INITIAL_OUTREACH', 'FOLLOW_UP')
    ),
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    referenced_professor_paper TEXT NOT NULL,
    referenced_shama_paper TEXT NOT NULL,
    gmail_draft_id TEXT DEFAULT '',
    gmail_sync_status TEXT NOT NULL DEFAULT 'LOCAL_CRM_DRAFT_PENDING_OAUTH' CHECK (
        gmail_sync_status IN ('GMAIL_DRAFT_CREATED', 'LOCAL_CRM_DRAFT_PENDING_OAUTH', 'MANUALLY_SENT_IN_GMAIL', 'ARCHIVED')
    ),
    auto_send_disabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_send_disabled = 1),
    batch_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 13. email_threads
CREATE TABLE IF NOT EXISTS email_threads (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    draft_id TEXT REFERENCES email_drafts(id) ON DELETE SET NULL,
    gmail_thread_id TEXT UNIQUE,
    subject TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    last_checked_at TEXT NOT NULL,
    thread_status TEXT NOT NULL DEFAULT 'AWAITING_REPLY' CHECK (
        thread_status IN ('AWAITING_REPLY', 'REPLIED', 'FOLLOWUP_DRAFT_CREATED', 'CLOSED')
    ),
    days_elapsed INTEGER NOT NULL DEFAULT 0
);

-- 14. email_replies
CREATE TABLE IF NOT EXISTS email_replies (
    id TEXT PRIMARY KEY,
    thread_id TEXT REFERENCES email_threads(id) ON DELETE CASCADE,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    gmail_message_id TEXT UNIQUE,
    sender_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    reply_snippet TEXT NOT NULL,
    reply_body TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (
        classification IN (
            'INTERESTED',
            'CV REQUESTED',
            'MEETING REQUEST',
            'MORE INFORMATION',
            'POSITIVE',
            'DECLINED',
            'NOT RELEVANT',
            'OTHER'
        )
    ),
    ai_summary TEXT NOT NULL,
    suggested_next_action TEXT NOT NULL,
    received_at TEXT NOT NULL
);

-- 15. followups
CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY,
    thread_id TEXT REFERENCES email_threads(id) ON DELETE CASCADE,
    professor_id TEXT NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    followup_draft_id TEXT REFERENCES email_drafts(id) ON DELETE SET NULL,
    days_after_initial INTEGER NOT NULL DEFAULT 7,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT_GENERATED_AWAITING_MANUAL_SEND' CHECK (
        status IN ('PENDING_DUE_DATE', 'DRAFT_GENERATED_AWAITING_MANUAL_SEND', 'SENT_MANUALLY', 'SKIPPED_REPLIED')
    ),
    created_at TEXT NOT NULL
);

-- 16. whatsapp_notifications
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
    id TEXT PRIMARY KEY,
    event_category TEXT NOT NULL CHECK (
        event_category IN (
            'DAILY_DISCOVERY_SUMMARY',
            'DRAFTS_CREATED_IN_GMAIL',
            'PROFESSOR_REPLY_ALERT',
            'CV_OR_MEETING_REQUEST_ALERT',
            'FOLLOWUP_REMINDER',
            'CRITICAL_SYSTEM_ALERT'
        )
    ),
    recipient_phone TEXT NOT NULL,
    message_body TEXT NOT NULL,
    delivery_channel TEXT NOT NULL, -- 'META_WHATSAPP_CLOUD_API', 'NTFY_INSTANT_PUSH', 'PENDING_WHATSAPP_API_CREDENTIALS'
    delivery_status TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 17. automation_jobs
CREATE TABLE IF NOT EXISTS automation_jobs (
    job_id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    schedule_cron TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'IDLE')
    ),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_info TEXT DEFAULT '',
    items_processed INTEGER NOT NULL DEFAULT 0,
    last_successful_run TEXT,
    next_scheduled_run TEXT,
    execution_summary TEXT NOT NULL DEFAULT ''
);

-- 18. activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    module_name TEXT NOT NULL,
    actor TEXT NOT NULL,
    summary TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

-- 19. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
