"""
Shama Abidi PhD System — SQLAlchemy 2.0 Production ORM Models (`backend/app/models.py`)
Implements all 26 core relational entities required in Section 4, Section 11 (Duplicate Detection),
Section 12 (Data Provenance), Section 13 (Safe Email State Machine), Section 14 (Jobs & Job Runs),
and Section 17 (Immutable Audit Logs).
"""

from datetime import datetime, timezone
import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# 1. roles
class Role(Base):
    __tablename__ = "roles"

    id = Column(String(64), primary_key=True, default=new_uuid)
    name = Column(String(50), unique=True, nullable=False, index=True)  # ADMIN, RESEARCHER, VIEWER
    description = Column(String(255), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 2. permissions
class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String(64), primary_key=True, default=new_uuid)
    code = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=False, default="")
    role_name = Column(String(50), ForeignKey("roles.name", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 3. users
class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=new_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    password_hash = Column(String(512), nullable=False)
    role = Column(String(50), ForeignKey("roles.name"), nullable=False, default="RESEARCHER", index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    totp_secret = Column(String(128), nullable=True)
    totp_enabled = Column(Boolean, nullable=False, default=False)
    degree_title = Column(String(200), nullable=False, default="PharmD, MPhil in Pharmacy Practice")
    institution = Column(String(255), nullable=False, default="Liaquat National Hospital & University of Karachi")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 4. universities (Deterministic key: normalized_name + country)
class University(Base):
    __tablename__ = "universities"
    __table_args__ = (
        UniqueConstraint("normalized_name", "country", name="uq_university_norm_name_country"),
        Index("ix_universities_country_verif", "country", "verification_status"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False, index=True)
    normalized_name = Column(String(255), nullable=False, index=True)
    country = Column(String(100), nullable=False, index=True)
    country_code = Column(String(10), nullable=False, default="INT")
    city = Column(String(120), nullable=False, default="")
    website_url = Column(String(500), nullable=False, default="")
    ror_id = Column(String(100), nullable=False, default="")
    # Section 12 Provenance
    source_url = Column(String(500), nullable=False, default="")
    source_domain = Column(String(200), nullable=False, default="")
    source_title = Column(String(300), nullable=False, default="")
    source_type = Column(String(100), nullable=False, default="SCHOLARLY_REGISTRY")
    evidence_text = Column(Text, nullable=False, default="")
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    departments = relationship("Department", back_populates="university", cascade="all, delete-orphan")
    professors = relationship("Professor", back_populates="university")


# 5. departments
class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("university_id", "normalized_name", name="uq_dept_uni_norm_name"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    university_id = Column(String(64), ForeignKey("universities.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    normalized_name = Column(String(255), nullable=False, index=True)
    website_url = Column(String(500), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    university = relationship("University", back_populates="departments")


# 6. research_areas
class ResearchArea(Base):
    __tablename__ = "research_areas"

    id = Column(String(64), primary_key=True, default=new_uuid)
    name = Column(String(200), unique=True, nullable=False, index=True)
    normalized_name = Column(String(200), unique=True, nullable=False, index=True)
    category = Column(String(120), nullable=False, default="Clinical Pharmacy")
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 7. professors (Deterministic key: normalized_name + university_id)
class Professor(Base):
    __tablename__ = "professors"
    __table_args__ = (
        UniqueConstraint("normalized_name", "university_id", name="uq_professor_norm_name_uni"),
        Index("ix_professors_verif_score", "verification_status", "relevance_score"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    full_name = Column(String(200), nullable=False, index=True)
    normalized_name = Column(String(200), nullable=False, index=True)
    title = Column(String(100), nullable=False, default="Professor")
    university_id = Column(String(64), ForeignKey("universities.id", ondelete="RESTRICT"), nullable=False, index=True)
    department_id = Column(String(64), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    email = Column(String(255), nullable=False, default="", index=True)
    orcid_id = Column(String(100), nullable=False, default="", index=True)
    profile_url = Column(String(500), nullable=False, default="")
    why_matches = Column(Text, nullable=False, default="")
    relevance_score = Column(Float, nullable=False, default=0.0, index=True)
    # Section 10 & 29: Controlled enum UNVERIFIED, PENDING, VERIFIED, REJECTED (Default: UNVERIFIED)
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    # Phase 4 Funding Status: OPEN_FUNDED_POSITION, FUNDING_SCHEME_AVAILABLE, UNKNOWN (Default: UNKNOWN)
    funding_status = Column(String(50), nullable=False, default="UNKNOWN", index=True)
    funding_source_url = Column(String(500), nullable=False, default="")
    funding_last_verified = Column(DateTime(timezone=True), nullable=True)
    grant_id = Column(String(100), nullable=False, default="")
    # Phase 4 Programme Eligibility & Deadlines
    min_qualification = Column(String(50), nullable=False, default="UNKNOWN")
    english_requirement = Column(String(100), nullable=False, default="UNKNOWN")
    international_eligibility = Column(String(50), nullable=False, default="UNKNOWN")
    application_deadline = Column(String(100), nullable=False, default="UNKNOWN")
    deadline_source_url = Column(String(500), nullable=False, default="")
    # Phase 4 Email Verification
    email_verification_status = Column(String(50), nullable=False, default="UNVERIFIED_EMAIL", index=True)
    email_source_url = Column(String(500), nullable=False, default="")
    # Phase 4 Topic Match & Recency
    has_recent_publication = Column(Boolean, nullable=False, default=False, index=True)
    topic_match_details = Column(Text, nullable=False, default="{}")
    confidence_score = Column(Float, nullable=False, default=0.0)
    # Section 12 Provenance
    source_url = Column(String(500), nullable=False, default="")
    source_domain = Column(String(200), nullable=False, default="")
    source_title = Column(String(300), nullable=False, default="")
    source_type = Column(String(100), nullable=False, default="EUROPE_PMC_API")
    evidence_text = Column(Text, nullable=False, default="")
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    def __init__(self, **kwargs):
        kwargs.setdefault("funding_status", "UNKNOWN")
        kwargs.setdefault("funding_source_url", "")
        kwargs.setdefault("grant_id", "")
        kwargs.setdefault("min_qualification", "UNKNOWN")
        kwargs.setdefault("english_requirement", "UNKNOWN")
        kwargs.setdefault("international_eligibility", "UNKNOWN")
        kwargs.setdefault("application_deadline", "UNKNOWN")
        kwargs.setdefault("deadline_source_url", "")
        kwargs.setdefault("email_verification_status", "UNVERIFIED_EMAIL")
        kwargs.setdefault("email_source_url", "")
        kwargs.setdefault("has_recent_publication", False)
        kwargs.setdefault("topic_match_details", "{}")
        super().__init__(**kwargs)

    university = relationship("University", back_populates="professors")
    publications = relationship("Publication", back_populates="professor", cascade="all, delete-orphan")


# 8. professor_research_areas
class ProfessorResearchArea(Base):
    __tablename__ = "professor_research_areas"
    __table_args__ = (
        UniqueConstraint("professor_id", "research_area_id", name="uq_prof_research_area"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=False, index=True)
    research_area_id = Column(String(64), ForeignKey("research_areas.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 9. publications (Deterministic key: doi or normalized_title_hash)
class Publication(Base):
    __tablename__ = "publications"

    id = Column(String(64), primary_key=True, default=new_uuid)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(Text, nullable=False)
    normalized_title_hash = Column(String(64), unique=True, nullable=False, index=True)
    doi = Column(String(200), nullable=False, default="", index=True)
    pmid = Column(String(64), nullable=False, default="")
    journal = Column(String(300), nullable=False, default="")
    publication_year = Column(Integer, nullable=False, default=2024, index=True)
    abstract_text = Column(Text, nullable=False, default="")
    # Section 12 Provenance
    source_url = Column(String(500), nullable=False, default="")
    source_domain = Column(String(200), nullable=False, default="")
    source_type = Column(String(100), nullable=False, default="PEER_REVIEWED_INDEX")
    evidence_text = Column(Text, nullable=False, default="")
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    professor = relationship("Professor", back_populates="publications")


# 10. funding_opportunities (Deterministic key: provider + normalized_title + deadline)
class FundingOpportunity(Base):
    __tablename__ = "funding_opportunities"
    __table_args__ = (
        UniqueConstraint("provider", "normalized_title", "deadline", name="uq_funding_provider_title_deadline"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    university_id = Column(String(64), ForeignKey("universities.id", ondelete="SET NULL"), nullable=True, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(255), nullable=False, index=True)
    title = Column(String(350), nullable=False)
    normalized_title = Column(String(350), nullable=False, index=True)
    grant_code = Column(String(150), nullable=False, default="")
    deadline = Column(String(50), nullable=False, default="OPEN_ROLLING")
    stipend_summary = Column(String(255), nullable=False, default="UNVERIFIED")
    # Section 12 Provenance
    source_url = Column(String(500), nullable=False, default="")
    source_domain = Column(String(200), nullable=False, default="")
    source_title = Column(String(300), nullable=False, default="")
    source_type = Column(String(100), nullable=False, default="GRANT_REGISTRY")
    evidence_text = Column(Text, nullable=False, default="")
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 11. funding_evidence
class FundingEvidence(Base):
    __tablename__ = "funding_evidence"

    id = Column(String(64), primary_key=True, default=new_uuid)
    funding_opportunity_id = Column(String(64), ForeignKey("funding_opportunities.id", ondelete="CASCADE"), nullable=True, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=False, index=True)
    grant_agency = Column(String(255), nullable=False, default="")
    grant_id_or_program = Column(String(200), nullable=False, default="")
    source_url = Column(String(500), nullable=False, default="")
    source_domain = Column(String(200), nullable=False, default="")
    source_title = Column(String(300), nullable=False, default="")
    source_type = Column(String(100), nullable=False, default="PUBLICATION_GRANT_METADATA")
    evidence_text = Column(Text, nullable=False, default="")
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 12. verification_records
class VerificationRecord(Base):
    __tablename__ = "verification_records"

    id = Column(String(64), primary_key=True, default=new_uuid)
    entity_type = Column(String(50), nullable=False, index=True)  # PROFESSOR, UNIVERSITY, FUNDING
    entity_id = Column(String(64), nullable=False, index=True)
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    source_url = Column(String(500), nullable=False, default="")
    source_domain = Column(String(200), nullable=False, default="")
    evidence_reference = Column(Text, nullable=False, default="")
    verified_by_user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 13. applications (Deterministic key: applicant_user_id + professor_id)
class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("applicant_user_id", "professor_id", name="uq_application_user_professor"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    applicant_user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    university_id = Column(String(64), ForeignKey("universities.id", ondelete="RESTRICT"), nullable=False, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="RESTRICT"), nullable=False, index=True)
    funding_opportunity_id = Column(String(64), ForeignKey("funding_opportunities.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(300), nullable=False)
    status = Column(String(50), nullable=False, default="DRAFT", index=True)  # ApplicationStatusEnum
    notes = Column(Text, nullable=False, default="")
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 14. application_status_history
class ApplicationStatusHistory(Base):
    __tablename__ = "application_status_history"

    id = Column(String(64), primary_key=True, default=new_uuid)
    application_id = Column(String(64), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_status = Column(String(50), nullable=False, default="")
    new_status = Column(String(50), nullable=False)
    changed_by_user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 15. application_documents
class ApplicationDocument(Base):
    __tablename__ = "application_documents"

    id = Column(String(64), primary_key=True, default=new_uuid)
    application_id = Column(String(64), ForeignKey("applications.id", ondelete="CASCADE"), nullable=True, index=True)
    uploaded_by_user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    safe_storage_path = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    document_type = Column(String(60), nullable=False, default="PUBLICATION_PDF")
    extracted_text_summary = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 16. email_templates
class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(String(64), primary_key=True, default=new_uuid)
    name = Column(String(150), unique=True, nullable=False)
    template_type = Column(String(50), nullable=False, default="INITIAL_OUTREACH")
    subject_template = Column(String(350), nullable=False)
    body_template = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 17. emails (Safe Email State Machine: DRAFT, APPROVED, QUEUED, SENT, FAILED, BOUNCED, REPLIED)
class Email(Base):
    __tablename__ = "emails"

    id = Column(String(64), primary_key=True, default=new_uuid)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    application_id = Column(String(64), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id = Column(String(64), ForeignKey("email_templates.id", ondelete="SET NULL"), nullable=True)
    recipient_email = Column(String(255), nullable=False, index=True)
    subject = Column(String(350), nullable=False)
    body_text = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="DRAFT", index=True)  # EmailStatusEnum
    approved_by_user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    provider = Column(String(100), nullable=False, default="GMAIL_DRAFT_MANUAL_SEND")
    message_id = Column(String(200), nullable=False, default="")
    thread_id = Column(String(200), nullable=False, default="", index=True)
    error_information = Column(Text, nullable=False, default="")
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 18. email_threads
class EmailThread(Base):
    __tablename__ = "email_threads"

    id = Column(String(64), primary_key=True, default=new_uuid)
    email_id = Column(String(64), ForeignKey("emails.id", ondelete="CASCADE"), nullable=False, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_thread_id = Column(String(200), unique=True, nullable=False, index=True)
    subject = Column(String(350), nullable=False)
    recipient_email = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="AWAITING_REPLY", index=True)
    last_message_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 19. email_replies
class EmailReply(Base):
    __tablename__ = "email_replies"

    id = Column(String(64), primary_key=True, default=new_uuid)
    thread_id = Column(String(64), ForeignKey("email_threads.id", ondelete="CASCADE"), nullable=True, index=True)
    email_id = Column(String(64), ForeignKey("emails.id", ondelete="SET NULL"), nullable=True, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_email = Column(String(255), nullable=False)
    subject = Column(String(350), nullable=False)
    reply_body = Column(Text, nullable=False)
    classification = Column(String(50), nullable=False, default="OTHER", index=True)
    ai_summary = Column(Text, nullable=False, default="")
    suggested_next_action = Column(Text, nullable=False, default="")
    received_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 20. followups
class Followup(Base):
    __tablename__ = "followups"

    id = Column(String(64), primary_key=True, default=new_uuid)
    email_id = Column(String(64), ForeignKey("emails.id", ondelete="CASCADE"), nullable=False, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="CASCADE"), nullable=False, index=True)
    application_id = Column(String(64), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="DRAFT", index=True)
    draft_subject = Column(String(350), nullable=False, default="")
    draft_body = Column(Text, nullable=False, default="")
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 21. tasks
class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(64), primary_key=True, default=new_uuid)
    assigned_user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    application_id = Column(String(64), ForeignKey("applications.id", ondelete="CASCADE"), nullable=True, index=True)
    professor_id = Column(String(64), ForeignKey("professors.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    status = Column(String(50), nullable=False, default="TODO", index=True)  # TaskStatusEnum
    priority = Column(String(30), nullable=False, default="MEDIUM")
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 22. jobs (Scheduled Job Definitions)
class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(64), primary_key=True)
    job_type = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    schedule_cron = Column(String(100), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True)
    last_status = Column(String(50), nullable=False, default="PENDING")
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_scheduled_run = Column(String(100), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 23. job_runs (Execution History & Idempotency Tracking — Section 14 & 15)
class JobRun(Base):
    __tablename__ = "job_runs"

    id = Column(String(64), primary_key=True, default=new_uuid)
    job_id = Column(String(64), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(100), nullable=False, index=True)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="PENDING", index=True)  # PENDING, RUNNING, SUCCESS, FAILED, CANCELLED
    started_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    execution_duration_ms = Column(Integer, nullable=False, default=0)
    retry_count = Column(Integer, nullable=False, default=0)
    records_processed = Column(Integer, nullable=False, default=0)
    records_created = Column(Integer, nullable=False, default=0)
    records_updated = Column(Integer, nullable=False, default=0)
    records_skipped = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


# 24. activity_logs
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(String(64), primary_key=True, default=new_uuid)
    event_type = Column(String(100), nullable=False, index=True)
    module_name = Column(String(100), nullable=False)
    actor = Column(String(150), nullable=False)
    summary = Column(Text, nullable=False)
    details_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)


# 25. audit_logs (Immutable Security & Data Mutation Audit Trail — Section 17)
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, default=new_uuid)
    actor_user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=False, default="SYSTEM")
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False, index=True)
    entity_id = Column(String(100), nullable=False, default="")
    previous_value_json = Column(Text, nullable=False, default="{}")
    new_value_json = Column(Text, nullable=False, default="{}")
    ip_address = Column(String(64), nullable=False, default="127.0.0.1")
    request_id = Column(String(64), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)


# 26. system_settings
class SystemSetting(Base):
    __tablename__ = "system_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(Text, nullable=False)
    description = Column(String(300), nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


# 27. phd_opportunities (Global Funded PhD Positions & Doctoral Studentships)
class PhDOpportunity(Base):
    __tablename__ = "phd_opportunities"
    __table_args__ = (
        UniqueConstraint("university_name", "phd_programme", "supervisor_name", name="uq_phd_opportunity"),
        Index("ix_phd_opp_funding_verif", "funding_type", "verification_status"),
        Index("ix_phd_opp_country", "country"),
        Index("ix_phd_opp_region", "region"),
    )

    id = Column(String(64), primary_key=True, default=new_uuid)
    country = Column(String(100), nullable=False, index=True)
    country_code = Column(String(10), nullable=False, default="INT")
    region = Column(String(100), nullable=False, default="Global", index=True)
    university_id = Column(String(64), ForeignKey("universities.id", ondelete="SET NULL"), nullable=True)
    university_name = Column(String(255), nullable=False, index=True)
    phd_programme = Column(String(300), nullable=False)
    research_field = Column(String(255), nullable=False)
    supervisor_name = Column(String(200), nullable=False)
    supervisor_profile_url = Column(String(500), nullable=False, default="")
    supervisor_email = Column(String(255), nullable=False, default="")
    funding_source = Column(String(255), nullable=False, default="Unknown")
    confirmed_funding_amount = Column(String(150), nullable=False, default="Unknown")
    # Controlled: FULLY_FUNDED, PARTIALLY_FUNDED, UNFUNDED, NEEDS_REVIEW, UNKNOWN
    funding_type = Column(String(50), nullable=False, default="NEEDS_REVIEW", index=True)
    # YES, NO, UNKNOWN
    tuition_coverage = Column(String(50), nullable=False, default="UNKNOWN")
    stipend_amount = Column(String(150), nullable=False, default="Unknown")
    stipend_duration_months = Column(String(50), nullable=False, default="Unknown")
    # ELIGIBLE, RESTRICTED, UNKNOWN
    international_eligibility = Column(String(50), nullable=False, default="UNKNOWN")
    # IELTS_TOEFL_REQUIRED, MEDIUM_OF_INSTRUCTION_EXEMPTION_ACCEPTED, UNKNOWN
    english_requirements = Column(String(100), nullable=False, default="UNKNOWN")
    english_exemption_details = Column(Text, nullable=False, default="")
    deadline_date = Column(String(50), nullable=False, default="OPEN_ROLLING")
    intended_intake = Column(String(64), nullable=False, default="Fall 2026 / Spring 2027")
    official_application_url = Column(String(500), nullable=False, default="")
    official_funding_url = Column(String(500), nullable=False, default="")
    source_verification_date = Column(DateTime(timezone=True), nullable=True)
    # VERIFIED, UNVERIFIED, NEEDS_REVIEW, REJECTED
    verification_status = Column(String(50), nullable=False, default="UNVERIFIED", index=True)
    required_qualifications = Column(Text, nullable=False, default="")
    required_documents = Column(Text, nullable=False, default="")
    evidence_text = Column(Text, nullable=False, default="")
    applicant_match_score = Column(Float, nullable=False, default=0.0)
    match_rationale = Column(Text, nullable=False, default="")
    is_recommended_for_outreach = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

