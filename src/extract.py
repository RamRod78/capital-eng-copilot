import logging
from typing import List, Optional
from uuid import uuid4

from google import genai
from google.genai import types

from src.config import settings
from src.models import (
    ComplianceLevel,
    CostImpact,
    EngineeringDiscipline,
    ExtractionBatch,
    ExtractionItem,
    ItemType,
)

logger = logging.getLogger(__name__)

CAPITAL_ENG_SYSTEM_PROMPT = """
You are a Principal Capital Projects Technical Lead and Senior EPC (Engineering, Procurement, and Construction) Subject Matter Expert (SME).
Your objective is to analyze engineering RFPs, FEED dossiers, datasheets, standards, and technical specifications.

Extract all concrete, enforceable technical requirements, recommendations, and optional guidelines into structured items.

Guidelines for Extraction:
1. Clause/Code: Identify existing clause references (e.g., 'Sec 3.4.1', 'API-650-Req4') or generate a meaningful identifier (e.g., 'REQ-MEC-001', 'REC-ELE-002', 'GDL-PIP-003').
2. Item Type & Compliance Level:
   - Requirement (Mandatory): Strict requirements using 'shall', 'must', 'mandatory', 'required', absolute codes (e.g., ASME, API, NEC).
   - Recommendation (Recommended): Preferred practices using 'should', 'recommended', preferred vendor options or design margins.
   - Guideline (Optional/Informational): Suggestions using 'may', 'guideline', 'alternative scope', or general design context.
3. Discipline: Assign to the exact engineering discipline (Mechanical, Piping, Electrical, I&C, Civil/Structural, Process, HSE, Quality, General).
4. Document Owner: Identify the primary SME role responsible (e.g., 'Mechanical SME', 'Electrical SME', 'HSE Lead', 'Process Lead').
5. Cost Impact: Estimate the CapEx cost impact tier (High, Medium, Low, Negligible, TBD).
6. Confidence Score (0.0 to 1.0) & Reasoning:
   - Assign 0.90 - 1.0 for unambiguous, explicit technical clauses with clear criteria.
   - Assign 0.70 - 0.89 for items with moderate ambiguity, multiple potential disciplines, or inferred requirements.
   - Assign < 0.70 for highly ambiguous text, fragmented sentences, or unclear design constraints.
   - Provide a concise `confidence_reasoning` string explaining your score.
7. Summary: Provide an executive summary highlighting the primary engineering scope, major equipment packages, and high-risk technical constraints.
"""


def get_gemini_client(api_key: Optional[str] = None) -> genai.Client:
    """Initialize and return a configured Google GenAI client."""
    key = api_key or settings.gemini_api_key
    if not key:
        logger.warning("No Gemini API key provided. LLM operations will fail unless configured.")
    return genai.Client(api_key=key)


def extract_requirements_from_text(
    content: str,
    document_title: str = "Engineering Specification",
    document_owner: Optional[str] = "General Engineering SME",
    model: Optional[str] = None,
    client: Optional[genai.Client] = None,
) -> ExtractionBatch:
    """
    Extract structured engineering requirements, recommendations, and guidelines from raw text
    using Gemini with Pydantic structured output schema.
    """
    if not content or not content.strip():
        raise ValueError("Document content is empty; cannot extract requirements.")

    target_model = model or settings.gemini_model or "gemini-2.5-flash"
    ai_client = client or get_gemini_client()

    user_prompt = (
        f"Analyze the following capital engineering document and extract all requirements, recommendations, and guidelines.\n\n"
        f"Document Title: {document_title}\n"
        f"Assigned Document Owner: {document_owner}\n"
        f"--- DOCUMENT CONTENT ---\n"
        f"{content.strip()}\n"
        f"--- END OF CONTENT ---"
    )

    try:
        response = ai_client.models.generate_content(
            model=target_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=CAPITAL_ENG_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=ExtractionBatch,
                temperature=0.1,
            ),
        )

        if not response.text:
            raise ValueError(f"Gemini model '{target_model}' returned an empty response body.")

        # Parse and validate with Pydantic model
        extraction_batch = ExtractionBatch.model_validate_json(response.text)
        
        # Ensure document title, owner, and batch_id are populated
        if not extraction_batch.document_title:
            extraction_batch.document_title = document_title
        if not extraction_batch.document_owner:
            extraction_batch.document_owner = document_owner
        if not extraction_batch.batch_id:
            extraction_batch.batch_id = str(uuid4())

        # Ensure default document_owner on items if missing
        for item in extraction_batch.items:
            if not item.document_owner:
                item.document_owner = extraction_batch.document_owner

        # Automatically collect unique disciplines if not populated
        if not extraction_batch.identified_disciplines and extraction_batch.items:
            extraction_batch.identified_disciplines = list(
                {item.engineering_discipline for item in extraction_batch.items}
            )

        logger.info(
            f"Successfully extracted {len(extraction_batch.items)} items from '{document_title}' using {target_model}."
        )
        return extraction_batch

    except Exception as e:
        logger.error(f"Failed extraction with Gemini model '{target_model}': {e}", exc_info=True)
        raise


def extract_requirements_from_chunks(
    chunks: List[str],
    document_title: str = "Engineering Specification",
    document_owner: Optional[str] = "General Engineering SME",
    model: Optional[str] = None,
    client: Optional[genai.Client] = None,
) -> ExtractionBatch:
    """
    Sequentially extract requirements across multiple text chunks and aggregate into a single batch.
    """
    if not chunks:
        raise ValueError("Chunks list is empty.")

    batch_id = str(uuid4())
    aggregated_items: List[ExtractionItem] = []
    summaries: List[str] = []
    disciplines_set = set()

    for idx, chunk in enumerate(chunks, start=1):
        chunk_title = f"{document_title} (Part {idx}/{len(chunks)})"
        chunk_batch = extract_requirements_from_text(
            content=chunk,
            document_title=chunk_title,
            document_owner=document_owner,
            model=model,
            client=client,
        )
        aggregated_items.extend(chunk_batch.items)
        if chunk_batch.executive_summary:
            summaries.append(f"[Part {idx}]: {chunk_batch.executive_summary}")
        disciplines_set.update(chunk_batch.identified_disciplines)

    combined_summary = "\n".join(summaries) if summaries else None

    return ExtractionBatch(
        batch_id=batch_id,
        document_title=document_title,
        document_owner=document_owner,
        executive_summary=combined_summary,
        identified_disciplines=list(disciplines_set),
        items=aggregated_items,
    )
