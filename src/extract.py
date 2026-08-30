import json
import logging
from typing import Optional
from google import genai
from google.genai import types

from src.config import settings
from src.models import ExtractionBatch

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """
You are an expert Capital Engineering Subject Matter Expert (SME) and RFP Technical Analyst.
Your role is to analyze RFP (Request for Proposal), FEED (Front End Engineering Design), and technical specification documents.
Extract all actionable technical specifications, engineering constraints, vendor obligations, compliance standards, and deliverables into structured requirements.

For each requirement:
- Extract or assign a clear requirement code or clause number.
- Categorize by engineering discipline (Mechanical, Electrical, Civil/Structural, Process, I&C, HSE, General).
- Identify compliance level (Mandatory, Recommended, Optional, Informational).
- Note cost impact and provide confidence scores.
"""


def get_gemini_client() -> genai.Client:
    """Initialize and return the Google GenAI client."""
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. API calls will fail unless configured.")
    return genai.Client(api_key=settings.gemini_api_key)


def extract_requirements_from_text(
    content: str,
    document_title: str = "Engineering RFP Document",
    client: Optional[genai.Client] = None,
) -> ExtractionBatch:
    """
    Extract structured engineering requirements from raw document text using Gemini.
    """
    if client is None:
        client = get_gemini_client()

    prompt = f"Analyze the following engineering/RFP text and extract all requirements for document '{document_title}':\n\n{content}"

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=EXTRACTION_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=ExtractionBatch,
                temperature=0.2,
            ),
        )

        # Parse output into ExtractionBatch
        if response.text:
            return ExtractionBatch.model_validate_json(response.text)
        else:
            raise ValueError("Gemini returned an empty response")

    except Exception as e:
        logger.error(f"Error during Gemini extraction: {e}")
        # Return an empty batch structure with error note
        return ExtractionBatch(
            document_title=document_title,
            items=[],
            summary=f"Extraction failed: {str(e)}",
        )
