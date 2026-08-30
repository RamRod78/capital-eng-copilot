import logging
from typing import List, Optional
from uuid import UUID, uuid4
import json

from google import genai
from google.genai import types

from src.config import settings
from src.extract import get_gemini_client
from src.models import (
    EngineeringDiscipline,
    ComplianceLevel,
    ItemType,
    ProjectScopeInput,
    RFPPackage,
    ScopingRequirementItem,
)
from src.rag import get_db_connection, search_similar_requirements

logger = logging.getLogger(__name__)

SCOPING_AGENT_SYSTEM_PROMPT = """
You are a Principal EPC Engineering Project Director and Proposal Manager.
Your role is to analyze a new Capital Engineering Project's scope and match/curate the most relevant mandatory specifications, recommended best practices, and optional guidelines from the engineering knowledge database.

Given the project parameters (facility type, operating conditions, target disciplines, and scope narrative):
1. Review the candidate engineering requirements retrieved from the database.
2. Select and rank the most applicable requirements for this project scope.
3. Categorize each item into:
   - Mandatory Requirement: Essential design and safety compliance items that the vendor MUST adhere to.
   - Recommendation: High-value best practices, equipment margins, and preferred methods.
   - Guideline: Optional design alternatives, site considerations, and negotiable scope options.
4. Summarize the engineering scope into an executive RFP brief.
"""


def match_requirements_for_scope(
    scope_input: ProjectScopeInput,
    top_k_per_discipline: int = 10,
    client: Optional[genai.Client] = None,
) -> RFPPackage:
    """
    Query the knowledge database for relevant requirements across target disciplines
    and assemble a structured RFP package.
    """
    candidate_items: List[ScopingRequirementItem] = []
    
    # 1. Search semantic vector space using project description + operating conditions
    search_prompt = f"{scope_input.facility_type} {scope_input.scope_description} {scope_input.operating_conditions or ''}"
    
    disciplines_to_query = (
        [d.value if hasattr(d, "value") else str(d) for d in scope_input.disciplines]
        if scope_input.disciplines
        else [None]
    )

    for disc in disciplines_to_query:
        matches = search_similar_requirements(
            query_text=search_prompt,
            top_k=top_k_per_discipline,
            discipline_filter=disc,
            client=client,
        )
        
        for m in matches:
            # Map item_type safely
            try:
                itype = ItemType(m.item_type) if m.item_type in [t.value for t in ItemType] else ItemType.REQUIREMENT
            except Exception:
                itype = ItemType.REQUIREMENT

            try:
                disc_enum = EngineeringDiscipline(m.engineering_discipline) if m.engineering_discipline in [d.value for d in EngineeringDiscipline] else EngineeringDiscipline.GENERAL
            except Exception:
                disc_enum = EngineeringDiscipline.GENERAL

            try:
                comp_enum = ComplianceLevel(m.compliance_level) if m.compliance_level in [c.value for c in ComplianceLevel] else ComplianceLevel.MANDATORY
            except Exception:
                comp_enum = ComplianceLevel.MANDATORY

            candidate_items.append(
                ScopingRequirementItem(
                    scoping_item_id=uuid4(),
                    extraction_id=m.extraction_id,
                    requirement_code=m.requirement_code,
                    requirement_text=m.requirement_text,
                    item_type=itype,
                    engineering_discipline=disc_enum,
                    compliance_level=comp_enum,
                    relevance_score=m.similarity_score,
                    is_selected=True,
                )
            )

    # 2. De-duplicate candidates by extraction_id or requirement text
    seen_texts = set()
    unique_candidates: List[ScopingRequirementItem] = []
    for item in candidate_items:
        normalized = item.requirement_text.strip().lower()
        if normalized not in seen_texts:
            seen_texts.add(normalized)
            unique_candidates.append(item)

    # 3. Partition into Mandatory, Recommendations, and Guidelines
    mandatory = [i for i in unique_candidates if i.item_type == ItemType.REQUIREMENT or i.compliance_level == ComplianceLevel.MANDATORY]
    recommendations = [i for i in unique_candidates if i.item_type == ItemType.RECOMMENDATION or i.compliance_level == ComplianceLevel.RECOMMENDED]
    guidelines = [i for i in unique_candidates if i.item_type == ItemType.GUIDELINE or i.compliance_level in (ComplianceLevel.OPTIONAL, ComplianceLevel.INFORMATIONAL)]

    return RFPPackage(
        package_id=uuid4(),
        project_name=scope_input.project_name,
        project_code=scope_input.project_code,
        facility_type=scope_input.facility_type,
        scope_summary=scope_input.scope_description,
        mandatory_requirements=mandatory,
        recommendations=recommendations,
        guidelines=guidelines,
    )


def save_project_scope_to_db(scope_package: RFPPackage, user_id: str = "Engineering Lead") -> UUID:
    """Persist the generated project scope and its selected requirements in PostgreSQL."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Insert project_scopes record
            cur.execute(
                """
                INSERT INTO project_scopes (
                    id, project_name, project_code, facility_type,
                    scope_description, status, created_by
                ) VALUES (%s, %s, %s, %s, %s, 'Draft', %s)
                RETURNING id;
                """,
                (
                    scope_package.package_id,
                    scope_package.project_name,
                    scope_package.project_code,
                    scope_package.facility_type,
                    scope_package.scope_summary,
                    user_id,
                ),
            )
            scope_id = cur.fetchone()[0]

            # Insert all requirement items
            all_items = (
                scope_package.mandatory_requirements
                + scope_package.recommendations
                + scope_package.guidelines
            )

            for it in all_items:
                cur.execute(
                    """
                    INSERT INTO scoping_items (
                        id, project_scope_id, extraction_id, requirement_code,
                        requirement_text, item_type, engineering_discipline,
                        compliance_level, relevance_score, is_selected, custom_notes
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        it.scoping_item_id,
                        scope_id,
                        it.extraction_id,
                        it.requirement_code,
                        it.requirement_text,
                        it.item_type.value if hasattr(it.item_type, "value") else str(it.item_type),
                        it.engineering_discipline.value if hasattr(it.engineering_discipline, "value") else str(it.engineering_discipline),
                        it.compliance_level.value if hasattr(it.compliance_level, "value") else str(it.compliance_level),
                        it.relevance_score,
                        it.is_selected,
                        it.custom_notes,
                    ),
                )
        conn.commit()
    return scope_package.package_id
