"""
Shama Abidi PhD System — Controlled Domain Enums (`backend/app/enums.py`)
Enforces Section 7, Section 13, Section 14, and Section 29 controlled state machines.
"""

from enum import Enum


class RoleEnum(str, Enum):
    ADMIN = "ADMIN"
    RESEARCHER = "RESEARCHER"
    VIEWER = "VIEWER"


class VerificationStatusEnum(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class FundingVerificationEnum(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    PARTIALLY_VERIFIED = "PARTIALLY_VERIFIED"
    NO_EVIDENCE = "NO_EVIDENCE"


class ProfessorFundingStatusEnum(str, Enum):
    OPEN_FUNDED_POSITION = "OPEN_FUNDED_POSITION"
    FUNDING_SCHEME_AVAILABLE = "FUNDING_SCHEME_AVAILABLE"
    UNKNOWN = "UNKNOWN"


class EmailVerificationStatusEnum(str, Enum):
    VERIFIED_INSTITUTIONAL = "VERIFIED_INSTITUTIONAL"
    UNVERIFIED_EMAIL = "UNVERIFIED_EMAIL"



class ApplicationStatusEnum(str, Enum):
    DRAFT = "DRAFT"
    PREPARED = "PREPARED"
    SUBMITTED = "SUBMITTED"
    FOLLOW_UP = "FOLLOW_UP"
    REPLIED = "REPLIED"
    INTERVIEW = "INTERVIEW"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CLOSED = "CLOSED"


class EmailStatusEnum(str, Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    QUEUED = "QUEUED"
    SENT = "SENT"
    FAILED = "FAILED"
    BOUNCED = "BOUNCED"
    REPLIED = "REPLIED"


class ReplyCategoryEnum(str, Enum):
    INTERESTED = "INTERESTED"
    CV_REQUESTED = "CV_REQUESTED"
    MEETING_REQUEST = "MEETING_REQUEST"
    MORE_INFORMATION = "MORE_INFORMATION"
    POSITIVE = "POSITIVE"
    DECLINED = "DECLINED"
    NOT_RELEVANT = "NOT_RELEVANT"
    OTHER = "OTHER"


class JobStatusEnum(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TaskStatusEnum(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class FundingClassificationEnum(str, Enum):
    FULLY_FUNDED = "FULLY_FUNDED"
    PARTIALLY_FUNDED = "PARTIALLY_FUNDED"
    UNFUNDED = "UNFUNDED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    UNKNOWN = "UNKNOWN"


class TuitionCoverageEnum(str, Enum):
    YES = "YES"
    NO = "NO"
    UNKNOWN = "UNKNOWN"


class InternationalEligibilityEnum(str, Enum):
    ELIGIBLE = "ELIGIBLE"
    RESTRICTED = "RESTRICTED"
    UNKNOWN = "UNKNOWN"


class EnglishRequirementEnum(str, Enum):
    IELTS_TOEFL_REQUIRED = "IELTS_TOEFL_REQUIRED"
    MEDIUM_OF_INSTRUCTION_EXEMPTION_ACCEPTED = "MEDIUM_OF_INSTRUCTION_EXEMPTION_ACCEPTED"
    UNKNOWN = "UNKNOWN"

