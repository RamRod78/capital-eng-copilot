from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator


class ReviewStatus(str, Enum):
    PENDING_REVIEW = "Pending Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    EDITED = "Edited"


class ItemType(str, Enum):
    REQUIREMENT = "Requirement"          # Mandatory obligation (shall/must)
    RECOMMENDATION = "Recommendation"    # Preferred practice / standard (should)
    GUIDELINE = "Guideline"              # Optional guidance / alternative (may)


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
    """Single extracted requirement, recommendation, or guideline item."""

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
    item_type: ItemType = Field(
        default=ItemType.REQUIREMENT,
        description="Classification: Requirement (Mandatory), Recommendation (Should), or Guideline (Optional)",
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
    document_owner: Optional[str] = Field(
        default=None,
        description="Identified Subject Matter Expert (SME) or discipline owner responsible for this document area",
    )
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence score of the extraction (0.0 to 1.0)",
    )
    confidence_reasoning: Optional[str] = Field(
        default=None,
        description="Rationale for the confidence score (e.g., ambiguous wording, clear standard clause)",
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
    document_owner: Optional[str] = Field(
        default="General Engineering SME",
        description="Default document owner / lead SME assigned to this document",
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

    @property
    def low_confidence_items(self) -> List[ExtractionItem]:
        return [item for item in self.items if item.confidence_score < 0.85]


class DocumentRecord(BaseModel):
    """Model representing a document stored in the database."""

    id: UUID = Field(default_factory=uuid4)
    filename: str
    document_type: str = "Standard"
    owner_sme: Optional[str] = "Engineering Lead"
    version: str = "1.0"
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
    item_type: ItemType = ItemType.REQUIREMENT
    category: Optional[str] = None
    engineering_discipline: EngineeringDiscipline
    compliance_level: ComplianceLevel
    estimated_cost_impact: Optional[str] = None
    document_owner: Optional[str] = None
    confidence_score: float = 1.0
    confidence_reasoning: Optional[str] = None
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
    edited_item_type: Optional[ItemType] = None
    edited_discipline: Optional[EngineeringDiscipline] = None
    edited_compliance: Optional[ComplianceLevel] = None
    edited_cost_impact: Optional[CostImpact] = None


class SearchResult(BaseModel):
    """Vector similarity match result from pgvector query."""

    extraction_id: UUID
    requirement_code: Optional[str] = None
    requirement_text: str
    item_type: str = "Requirement"
    category: Optional[str] = None
    engineering_discipline: str
    compliance_level: str
    document_owner: Optional[str] = None
    status: str
    similarity_score: float = Field(ge=-1.0, le=1.0)


# --- Milestone 3: Project Scoping & RFP Models ---

class ProjectScopeInput(BaseModel):
    """Input specification for a new Capital Project to be scoped."""

    project_name: str = Field(min_length=3, description="Name of the capital project")
    project_code: Optional[str] = Field(default=None, description="Project identifier / AFE code")
    facility_type: str = Field(description="e.g. Petrochemical, Water Treatment, Compression Station, Battery Storage")
    operating_conditions: Optional[str] = Field(default=None, description="Key design parameters: pressures, temps, flow rates")
    disciplines: List[EngineeringDiscipline] = Field(default_factory=list, description="Target disciplines in scope")
    scope_description: str = Field(min_length=10, description="Detailed narrative of project requirements and boundaries")
    target_delivery_format: str = Field(default="Vendor RFP Document", description="Output format: RFP, SOW, Scoping Matrix")


class ScopingRequirementItem(BaseModel):
    """A requirement matched and included in a project's scoping matrix."""

    scoping_item_id: UUID = Field(default_factory=uuid4)
    extraction_id: Optional[UUID] = None
    requirement_code: Optional[str] = None
    requirement_text: str
    item_type: ItemType = ItemType.REQUIREMENT
    engineering_discipline: EngineeringDiscipline
    compliance_level: ComplianceLevel
    relevance_score: float = 1.0
    is_selected: bool = True
    custom_notes: Optional[str] = None


class RFPPackage(BaseModel):
    """Generated vendor RFP / Scope of Work package ready for engineering providers."""

    package_id: UUID = Field(default_factory=uuid4)
    project_name: str
    project_code: Optional[str] = None
    facility_type: str
    scope_summary: str
    mandatory_requirements: List[ScopingRequirementItem] = Field(default_factory=list)
    recommendations: List[ScopingRequirementItem] = Field(default_factory=list)
    guidelines: List[ScopingRequirementItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    generated_by: str = "Capital Engineering Copilot Agent"


# --- Milestone 4: Lessons Learned & Document Revision Models ---

class FeedbackEntry(BaseModel):
    """Closed-loop feedback logged when an SME modifies or rejects an item."""

    id: UUID = Field(default_factory=uuid4)
    extraction_id: Optional[UUID] = None
    project_scope_id: Optional[UUID] = None
    original_text: str
    reviewed_text: Optional[str] = None
    original_status: str
    final_status: ReviewStatus
    reviewer: str
    reason: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentRevisionFlag(BaseModel):
    """Flag raised on a source document requiring SME revision or deprecation."""

    id: UUID = Field(default_factory=uuid4)
    document_id: Optional[UUID] = None
    document_title: str
    document_owner: str
    flagged_by: str
    issue_description: str
    suggested_action: str = "Review and Update Standard"
    is_resolved: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
