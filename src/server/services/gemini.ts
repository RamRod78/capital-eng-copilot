import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { ExtractionBatch, ExtractionBatchSchema } from '../../shared/schemas.js';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

export function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export const CAPITAL_ENG_SYSTEM_PROMPT = `
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
   - Provide a concise 'confidence_reasoning' string explaining your score.
7. Summary: Provide an executive summary highlighting the primary engineering scope, major equipment packages, and high-risk technical constraints.

You MUST respond strictly with valid JSON conforming to the following structure:
{
  "document_title": "string",
  "document_owner": "string",
  "executive_summary": "string",
  "identified_disciplines": ["Mechanical", "Electrical", ...],
  "items": [
    {
      "section_title": "string or null",
      "requirement_code": "string or null",
      "requirement_text": "string",
      "item_type": "Requirement" | "Recommendation" | "Guideline",
      "category": "string or null",
      "engineering_discipline": "Mechanical" | "Piping" | "Electrical" | "I&C" | "Civil/Structural" | "Process" | "HSE" | "Quality" | "General",
      "compliance_level": "Mandatory" | "Recommended" | "Optional" | "Informational",
      "estimated_cost_impact": "High" | "Medium" | "Low" | "Negligible" | "TBD",
      "document_owner": "string or null",
      "confidence_score": number,
      "confidence_reasoning": "string or null"
    }
  ]
}
`;

export async function extractRequirementsFromText(
  content: string,
  documentTitle = 'Engineering Specification',
  documentOwner = 'General Engineering SME',
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
): Promise<ExtractionBatch> {
  if (!content || !content.trim()) {
    throw new Error('Document content is empty; cannot extract requirements.');
  }

  const ai = getGeminiClient();
  const prompt = `Analyze the following capital engineering document and extract all requirements, recommendations, and guidelines.\n\nDocument Title: ${documentTitle}\nAssigned Document Owner: ${documentOwner}\n\n--- DOCUMENT CONTENT ---\n${content.trim()}\n--- END OF CONTENT ---`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: CAPITAL_ENG_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const responseText = response.text || '';
  if (!responseText) {
    throw new Error(`Gemini model returned empty response.`);
  }

  const parsedJson = JSON.parse(responseText);
  if (!parsedJson.document_title) parsedJson.document_title = documentTitle;
  if (!parsedJson.document_owner) parsedJson.document_owner = documentOwner;

  // Validate with Zod
  const validated = ExtractionBatchSchema.parse(parsedJson);

  // Ensure default document owner
  for (const item of validated.items) {
    if (!item.document_owner) {
      item.document_owner = validated.document_owner;
    }
  }

  return validated;
}

export async function getEmbedding(
  text: string,
  model = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
): Promise<number[]> {
  if (!text || !text.trim()) return [];

  try {
    const ai = getGeminiClient();
    const response = await ai.models.embedContent({
      model,
      contents: text,
    });

    const resAny = response as any;
    if (resAny?.embedding?.values) {
      return resAny.embedding.values;
    }
    if (resAny?.embeddings?.[0]?.values) {
      return resAny.embeddings[0].values;
    }
    return [];
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}
