from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


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
    ELECTRICAL = "Electrical"
    CIVIL_STRUCTURAL = "Civil/Structural"
    PROCESS = "Process"
    INSTRUMENTATION_CONTROLS = "I&C"
    SAFETY_ENVIRONMENTAL = "HSE"
    GENERAL = "General"


class ExtractionItem(BaseModel):
    """Single extracted requirement or engineering specification."""
    section_title: Optional[str] = Field(default=None, description="Section or heading title from the document")
    requirement_code: Optional[str] = Field(default=None, description="Identifier or clause number if present (e.g., REQ-101, Sec 4.2)")
    requirement_text: str = Field(description="Exact or synthesized requirement statement")
    category: Optional[str] = Field(default=None, description="Domain category, e.g., Equipment, Commissioning, Materials")
    engineering_discipline: EngineeringDiscipline = Field(default=EngineeringDiscipline.GENERAL)
    compliance_level: ComplianceLevel = Field(default=ComplianceLevel.MANDATORY)
    estimated_cost_impact: Optional[str] = Field(default=None, description="High, Medium, Low or estimated cost note")
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0, description="Extraction confidence score")


class ExtractionBatch(BaseModel):
    """Batch of extracted requirements from a document."""
    batch_id: str = Field(default_factory=lambda: str(uuid4()))
    document_title: str
    items: List[ExtractionItem] = Field(default_factory=list)
    summary: Optional[str] = Field(default=None, description="Executive summary of the extraction")


class SMEReviewUpdate(BaseModel):
    """Model representing an SME's review update on an extraction item."""
    extraction_id: UUID
    status: ReviewStatus
    sme_reviewer: str
    sme_comments: Optional[str] = None
    edited_text: Optional[str] = None
    edited_discipline: Optional[EngineeringDiscipline] = None
    edited_compliance: Optional[ComplianceLevel] = None


class SearchResult(BaseModel):
    """Matching requirement result from vector similarity search."""
    extraction_id: UUID
    requirement_code: Optional[str]
    requirement_text: str
    category: Optional[str]
    engineering_discipline: str
    compliance_level: str
    status: str
    similarity_score: float
