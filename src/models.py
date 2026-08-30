from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator


class ReviewStatus(str, Enum):
    PENDING_REVIEW = "Pending Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    EDITED = "Edited"


class ComplianceLevel(str, Enum):
    MANDATORY = "Mandatory"
    RECOMMENDED = "Recommended"
    OPTIONAL = "Optional"
    INFORMATIONAL = "Informational"


class EngineeringDiscipline(str, Enum):
    MECHANICAL = "Mechanical"
    PIPING = "Piping"
    ELECTRICAL = "Electrical"
    INSTRUMENTATION_CONTROLS = "I&C"
    CIVIL_STRUCTURAL = "Civil/Structural"
    PROCESS = "Process"
    PROCESS_SAFETY_HSE = "HSE"
    QUALITY_MANAGEMENT = "Quality"
    GENERAL = "General"


class CostImpact(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    NEGLIGIBLE = "Negligible"
    TBD = "TBD"


class ExtractionItem(BaseModel):
    """Single extracted requirement or engineering specification."""

    section_title: Optional[str] = Field(
        default=None,
        description="Document section or clause heading (e.g., 'Section 4.3 - High Pressure Vessels')",
    )
    requirement_code: Optional[str] = Field(
        default=None,
        description="Requirement code or identifier (e.g., 'REQ-MEC-042', 'CL-3.1.2')",
    )
    requirement_text: str = Field(
        description="The extracted technical specification, standard, constraint, or vendor obligation.",
        min_length=5,
    )
    category: Optional[str] = Field(
        default=None,
        description="Engineering subsystem or asset category (e.g., Pressure Vessels, Switchgear, Foundation, SCADA)",
    )
    engineering_discipline: EngineeringDiscipline = Field(
        default=EngineeringDiscipline.GENERAL,
        description="Primary engineering discipline responsible for the requirement",
    )
    compliance_level: ComplianceLevel = Field(
        default=ComplianceLevel.MANDATORY,
        description="Mandatory vs Recommended vs Optional requirement level",
    )
    estimated_cost_impact: CostImpact = Field(
        default=CostImpact.TBD,
        description="Estimated financial or capital expenditure impact tier",
    )
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence score of the extraction (0.0 to 1.0)",
    )

    @field_validator("requirement_text")
    @classmethod
    def strip_and_clean_text(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("requirement_text cannot be empty")
        return cleaned


class ExtractionBatch(BaseModel):
    """Batch of extracted engineering requirements parsed by Gemini."""

    batch_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique identifier for this extraction batch execution",
    )
    document_title: str = Field(
        description="Title or filename of the RFP/FEED document analyzed",
    )
    executive_summary: Optional[str] = Field(
        default=None,
        description="High-level engineering summary of the scope and key constraints identified",
    )
    identified_disciplines: List[EngineeringDiscipline] = Field(
        default_factory=list,
        description="List of engineering disciplines present in the extracted requirements",
    )
    items: List[ExtractionItem] = Field(
        default_factory=list,
        description="List of extracted engineering requirement items",
    )

    @property
    def total_items(self) -> int:
        return len(self.items)


class DocumentRecord(BaseModel):
    """Model representing a document stored in the database."""

    id: UUID = Field(default_factory=uuid4)
    filename: str
    document_type: str = "RFP"
    raw_content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ExtractionRecord(BaseModel):
    """Model representing an extraction item persisted in PostgreSQL."""

    id: UUID = Field(default_factory=uuid4)
    document_id: Optional[UUID] = None
    batch_id: str
    section_title: Optional[str] = None
    requirement_code: Optional[str] = None
    requirement_text: str
    category: Optional[str] = None
    engineering_discipline: EngineeringDiscipline
    compliance_level: ComplianceLevel
    estimated_cost_impact: Optional[str] = None
    confidence_score: float = 1.0
    status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    sme_reviewer: Optional[str] = None
    sme_comments: Optional[str] = None
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None


class SMEReviewUpdate(BaseModel):
    """Model representing an SME's review action on an extraction item."""

    extraction_id: UUID
    status: ReviewStatus
    sme_reviewer: str = Field(min_length=1)
    sme_comments: Optional[str] = None
    edited_text: Optional[str] = None
    edited_discipline: Optional[EngineeringDiscipline] = None
    edited_compliance: Optional[ComplianceLevel] = None


class SearchResult(BaseModel):
    """Vector similarity match result from pgvector query."""

    extraction_id: UUID
    requirement_code: Optional[str] = None
    requirement_text: str
    category: Optional[str] = None
    engineering_discipline: str
    compliance_level: str
    status: str
    similarity_score: float = Field(ge=-1.0, le=1.0)
