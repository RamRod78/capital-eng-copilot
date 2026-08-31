import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { ExtractionBatch, ExtractionBatchSchema, assignUniqueRequirementCodes, ExtractionProgressEvent } from '../../shared/schemas.js';
import { getNextRequirementSequences } from './sequences.js';

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
1. Clause/Code: Generate a unique requirement identifier following the exact format 'REQ-[DISCIPLINE]-[Sequence Number]' where [DISCIPLINE] is the discipline code (e.g., MEC, PIP, ELE, INC, CIV, PRO, HSE, QUA, GEN) and [Sequence Number] is an 8-digit zero-padded number (e.g., 'REQ-MEC-00000001', 'REQ-ELE-00000002'). If referencing existing clause numbers (e.g., 'Sec 3.4.1', 'API-650-Req4'), record them in 'category' or 'requirement_text'.
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
  "document_number": "string or null",
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

export interface DocumentSection {
  section_title: string;
  content: string;
}

const SECTIONS_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      section_title: { type: 'STRING' },
      content: { type: 'STRING' },
    },
    required: ['section_title', 'content'],
  },
};

const EXTRACTION_ITEM_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      section_title: { type: 'STRING' },
      requirement_code: { type: 'STRING' },
      requirement_text: { type: 'STRING' },
      item_type: {
        type: 'STRING',
        enum: ['Requirement', 'Recommendation', 'Guideline'],
      },
      category: { type: 'STRING' },
      engineering_discipline: {
        type: 'STRING',
        enum: [
          'Mechanical',
          'Piping',
          'Electrical',
          'I&C',
          'Civil/Structural',
          'Process',
          'HSE',
          'Quality',
          'General',
        ],
      },
      compliance_level: {
        type: 'STRING',
        enum: ['Mandatory', 'Recommended', 'Optional', 'Informational'],
      },
      estimated_cost_impact: {
        type: 'STRING',
        enum: ['High', 'Medium', 'Low', 'Negligible', 'TBD'],
      },
      document_owner: { type: 'STRING' },
      confidence_score: { type: 'NUMBER' },
      confidence_reasoning: { type: 'STRING' },
    },
    required: [
      'requirement_text',
      'item_type',
      'engineering_discipline',
      'compliance_level',
    ],
  },
};

const SYNTHESIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    executive_summary: { type: 'STRING' },
    identified_disciplines: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    cross_discipline_conflicts: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['executive_summary', 'identified_disciplines'],
};

/**
 * Fallback deterministic chunker when documents are large and AI partitioning fails or is unneeded
 */
function deterministicChunker(content: string, defaultTitle: string, targetChunkSize = 7000): DocumentSection[] {
  if (content.length <= targetChunkSize) {
    return [{ section_title: defaultTitle || 'General Scope', content }];
  }

  const paragraphs = content.split(/\n\s*\n/);
  const sections: DocumentSection[] = [];
  let currentTitle = defaultTitle || 'Section 1';
  let currentChunk = '';
  let sectionIndex = 1;

  for (const para of paragraphs) {
    const headerMatch = para.match(/^(?:#+|[0-9]+(?:\.[0-9]+)*|Section|Chapter|Part)\s+([^\n]+)/i);
    if (headerMatch && currentChunk.length > 2000) {
      sections.push({ section_title: currentTitle, content: currentChunk.trim() });
      sectionIndex++;
      currentTitle = headerMatch[0].substring(0, 100).trim();
      currentChunk = para + '\n\n';
      continue;
    }

    if (currentChunk.length + para.length > targetChunkSize && currentChunk.length > 2000) {
      sections.push({ section_title: currentTitle, content: currentChunk.trim() });
      sectionIndex++;
      currentTitle = `Section ${sectionIndex} (Continued)`;
      currentChunk = para + '\n\n';
    } else {
      currentChunk += para + '\n\n';
    }
  }

  if (currentChunk.trim()) {
    sections.push({ section_title: currentTitle, content: currentChunk.trim() });
  }

  return sections.length > 0 ? sections : [{ section_title: defaultTitle, content }];
}

/**
 * Stage 1: Table of Contents & Chunking using Gemini 3.6 Flash
 */
async function scanAndPartitionDocument(
  content: string,
  documentTitle: string,
  model = 'gemini-3.6-flash'
): Promise<DocumentSection[]> {
  if (content.length < 5000) {
    return [{ section_title: documentTitle || 'General Scope', content: content.trim() }];
  }

  const ai = getGeminiClient();
  const prompt = `You are an EPC Engineering Lead. Scan the following engineering specification and partition it into logical engineering sections (or coherent chunks preserving clause boundaries).
Ensure all original text is preserved across the sections without losing technical specifications or clause numbers.

Document Title: ${documentTitle}
--- DOCUMENT CONTENT ---
${content.trim()}
--- END OF DOCUMENT CONTENT ---`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: 'Partition the document into logical engineering sections or 10-15 page chunks. Return a JSON array of objects with section_title and full section content.',
        responseMimeType: 'application/json',
        responseSchema: SECTIONS_RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    });

    const parsed: DocumentSection[] = JSON.parse(response.text || '[]');
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(p => p.section_title && p.content)) {
      console.log(`📑 Stage 1 complete: Document partitioned into ${parsed.length} logical sections.`);
      return parsed;
    }
  } catch (err: any) {
    console.warn(`Stage 1 Gemini ToC chunking failed (${err.message}). Using deterministic engineering section chunker.`);
  }

  const chunks = deterministicChunker(content, documentTitle);
  console.log(`📑 Stage 1 complete: Document partitioned into ${chunks.length} sections via fallback chunker.`);
  return chunks;
}

/**
 * Stage 2: Parallel Extraction across sections using Gemini 3.7 Flash with Thinking & Structured Outputs
 */
async function extractSection(
  section: DocumentSection,
  documentTitle: string,
  documentOwner: string,
  model = 'gemini-3.7-flash'
): Promise<any[]> {
  const ai = getGeminiClient();
  const prompt = `Analyze the following engineering section from "${documentTitle}" and extract all concrete technical requirements, recommendations, and guidelines.

Document Title: ${documentTitle}
Section Title: ${section.section_title}
Assigned SME: ${documentOwner}

--- SECTION TEXT ---
${section.content}
--- END OF SECTION TEXT ---`;

  const modelsToTry = [model, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.0-flash'].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  );

  for (const m of modelsToTry) {
    try {
      const config: any = {
        systemInstruction: CAPITAL_ENG_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_ITEM_RESPONSE_SCHEMA,
        temperature: 0.1,
      };

      // Enable thinking on Gemini 3.7 Flash
      if (m.includes('3.7') || m.includes('thinking')) {
        config.thinkingConfig = { thinkingBudget: 1024 };
      }

      const response = await ai.models.generateContent({
        model: m,
        contents: prompt,
        config,
      });

      const parsed = JSON.parse(response.text || '[]');
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          ...item,
          section_title: item.section_title || section.section_title,
          document_owner: item.document_owner || documentOwner,
        }));
      }
    } catch (err: any) {
      console.warn(`Extraction for section "${section.section_title}" with ${m} failed: ${err.message}. Trying next fallback...`);
    }
  }

  return [];
}

/**
 * Stage 3: Synthesis, De-duplication, and Cross-Discipline Review using Gemini 3.1 Pro
 */
async function synthesizeAndDeduplicate(
  rawItems: any[],
  documentTitle: string,
  documentOwner: string,
  documentNumber?: string | null,
  model = 'gemini-3.1-pro',
  startingSequences?: Record<string, number>
): Promise<ExtractionBatch> {
  // 1. In-memory de-duplication
  const seenTexts = new Set<string>();
  const uniqueItems: any[] = [];

  for (const item of rawItems) {
    const normalized = (item.requirement_text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 5) continue;

    if (!seenTexts.has(normalized)) {
      seenTexts.add(normalized);
      uniqueItems.push(item);
    }
  }

  // 2. Cross-discipline analysis and executive summary synthesis
  const disciplines = Array.from(
    new Set(uniqueItems.map((i) => i.engineering_discipline || 'General'))
  ) as any[];

  const seqs = startingSequences || (await getNextRequirementSequences());
  const seqContext = Object.entries(seqs)
    .map(([disc, num]) => `${disc}: ${num}`)
    .join(', ');

  const ai = getGeminiClient();
  const summaryPrompt = `You are a Principal Engineering Reviewer. Synthesize the following ${uniqueItems.length} extracted engineering requirements for document "${documentTitle}"${documentNumber ? ` (Doc No: ${documentNumber})` : ''}.
Generate a unified executive summary highlighting the primary engineering scope, major equipment packages, and high-risk technical constraints, and check for any cross-discipline conflicts or omissions.

Document Title: ${documentTitle}
${documentNumber ? `Document Number: ${documentNumber}\n` : ''}Lead SME: ${documentOwner}
Disciplines Identified: ${disciplines.join(', ')}
Next Assignable Discipline Sequence Numbers: ${seqContext}

Sample Extracted Items:
${uniqueItems.slice(0, 30).map((it, idx) => `${idx + 1}. [${it.engineering_discipline}][${it.compliance_level}] ${it.requirement_code || 'REQ'}: ${it.requirement_text}`).join('\n')}
`;

  let executiveSummary = `Extracted ${uniqueItems.length} technical requirements across ${disciplines.length} engineering disciplines for ${documentTitle}.`;
  let identifiedDisciplines = disciplines;

  const modelsToTry = [model, 'gemini-3.6-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  );

  for (const m of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: summaryPrompt,
        config: {
          systemInstruction: 'Synthesize the extracted engineering items into an executive summary and detect cross-discipline conflicts.',
          responseMimeType: 'application/json',
          responseSchema: SYNTHESIS_RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.executive_summary) {
        executiveSummary = parsed.executive_summary;
        if (Array.isArray(parsed.cross_discipline_conflicts) && parsed.cross_discipline_conflicts.length > 0) {
          executiveSummary += `\n\nCross-Discipline Notes:\n- ` + parsed.cross_discipline_conflicts.join('\n- ');
        }
      }
      if (Array.isArray(parsed.identified_disciplines) && parsed.identified_disciplines.length > 0) {
        identifiedDisciplines = parsed.identified_disciplines as any;
      }
      break;
    } catch (err: any) {
      console.warn(`Stage 3 executive summary synthesis with ${m} failed: ${err.message}. Trying next fallback...`);
    }
  }

  // 3. Ensure strictly unique formatted requirement codes (REQ-[DISCIPLINE]-[Sequence Number], 8-digit padded)
  // using global starting sequence numbers from database
  const formattedItems = assignUniqueRequirementCodes(uniqueItems, {
    perDiscipline: true,
    startingSequence: seqs,
  });

  const batch: ExtractionBatch = {
    document_title: documentTitle,
    document_number: documentNumber || undefined,
    document_owner: documentOwner,
    executive_summary: executiveSummary,
    identified_disciplines: identifiedDisciplines.length > 0 ? (identifiedDisciplines as any) : ['General'],
    items: formattedItems,
  };

  return ExtractionBatchSchema.parse(batch);
}

/**
 * 3-Stage Requirements Extraction Pipeline:
 * Stage 1 (Table of Contents & Chunking): Gemini 3.6 Flash
 * Stage 2 (Parallel Extraction): Gemini 3.7 Flash (with Thinking & Structured Outputs)
 * Stage 3 (Synthesis & De-duplication): Gemini 3.1 Pro
 */
export async function extractRequirementsFromText(
  content: string,
  documentTitle = 'Engineering Specification',
  documentOwner = 'General Engineering SME',
  documentNumber?: string | null,
  startingSequences?: Record<string, number>,
  onProgress?: (event: ExtractionProgressEvent) => void | Promise<void>
): Promise<ExtractionBatch> {
  if (!content || !content.trim()) {
    throw new Error('Document content is empty; cannot extract requirements.');
  }

  console.log(`🚀 Starting 3-Stage Extraction Pipeline for "${documentTitle}" (${content.length} chars)...`);

  // Stage 1: Table of Contents & Chunking (Gemini 3.6 Flash)
  await onProgress?.({
    stage: 1,
    stageName: 'Structure Chunking & ToC Analysis',
    status: 'running',
    message: `Scanning document structure and chunking into logical sections with Gemini 3.6 Flash...`,
    timestamp: new Date().toISOString(),
    details: {
      model: 'Gemini 3.6 Flash',
    },
  });

  const sections = await scanAndPartitionDocument(content, documentTitle, 'gemini-3.6-flash');

  await onProgress?.({
    stage: 1,
    stageName: 'Structure Chunking & ToC Analysis',
    status: 'completed',
    message: `Partitioned into ${sections.length} logical engineering section(s).`,
    timestamp: new Date().toISOString(),
    details: {
      sectionsFound: sections.length,
      sectionTitles: sections.map((s) => s.section_title),
      model: 'Gemini 3.6 Flash',
    },
  });

  // Stage 2: Parallel Section Extraction (Gemini 3.7 Flash with Thinking & Structured Outputs)
  console.log(`⚡ Stage 2: Running parallel extraction across ${sections.length} section(s) with Gemini 3.7 Flash (Thinking enabled)...`);
  await onProgress?.({
    stage: 2,
    stageName: 'Parallel Deep Extraction',
    status: 'running',
    message: `Running parallel extraction across ${sections.length} section(s) with Gemini 3.7 Flash (Thinking enabled)...`,
    timestamp: new Date().toISOString(),
    details: {
      totalSections: sections.length,
      rawItemsCount: 0,
      model: 'Gemini 3.7 Flash (Thinking)',
    },
  });

  let completedSections = 0;
  let cumulativeRawItems = 0;

  const sectionPromises = sections.map(async (section, idx) => {
    const items = await extractSection(section, documentTitle, documentOwner, 'gemini-3.7-flash');
    completedSections++;
    cumulativeRawItems += items.length;

    await onProgress?.({
      stage: 2,
      stageName: 'Parallel Deep Extraction',
      status: 'running',
      message: `Extracted section ${completedSections}/${sections.length}: "${section.section_title}" (${items.length} items)`,
      timestamp: new Date().toISOString(),
      details: {
        currentSectionIndex: completedSections,
        currentSectionTitle: section.section_title,
        totalSections: sections.length,
        rawItemsCount: cumulativeRawItems,
        model: 'Gemini 3.7 Flash (Thinking)',
      },
    });

    return items;
  });

  const sectionResults = await Promise.all(sectionPromises);
  const rawItems = sectionResults.flat();
  console.log(`📊 Stage 2 complete: Extracted ${rawItems.length} raw items across all sections.`);

  await onProgress?.({
    stage: 2,
    stageName: 'Parallel Deep Extraction',
    status: 'completed',
    message: `Stage 2 Complete: Extracted ${rawItems.length} raw candidate requirements across all ${sections.length} section(s).`,
    timestamp: new Date().toISOString(),
    details: {
      totalSections: sections.length,
      rawItemsCount: rawItems.length,
      model: 'Gemini 3.7 Flash (Thinking)',
    },
  });

  // Stage 3: Synthesis, De-duplication, & Cross-Discipline Review (Gemini 3.1 Pro)
  console.log(`🧠 Stage 3: Running synthesis, de-duplication, and cross-discipline review with Gemini 3.1 Pro...`);
  await onProgress?.({
    stage: 3,
    stageName: 'Synthesis & De-duplication',
    status: 'running',
    message: `Synthesizing ${rawItems.length} items, eliminating duplicates, and assigning discipline requirement codes with Gemini 3.1 Pro...`,
    timestamp: new Date().toISOString(),
    details: {
      rawItemsCount: rawItems.length,
      model: 'Gemini 3.1 Pro',
    },
  });

  const finalBatch = await synthesizeAndDeduplicate(
    rawItems,
    documentTitle,
    documentOwner,
    documentNumber,
    'gemini-3.1-pro',
    startingSequences
  );
  console.log(`✅ 3-Stage Pipeline complete: ${finalBatch.items.length} verified requirements generated.`);

  await onProgress?.({
    stage: 3,
    stageName: 'Synthesis & De-duplication',
    status: 'completed',
    message: `Stage 3 Complete: Synthesized ${finalBatch.items.length} verified requirements.`,
    timestamp: new Date().toISOString(),
    details: {
      finalItemsCount: finalBatch.items.length,
      model: 'Gemini 3.1 Pro',
    },
  });

  await onProgress?.({
    stage: 'complete',
    stageName: 'Extraction Complete',
    status: 'completed',
    message: `Extraction pipeline finished: ${finalBatch.items.length} requirements ready for review.`,
    timestamp: new Date().toISOString(),
    details: {
      finalItemsCount: finalBatch.items.length,
    },
  });

  return finalBatch;
}

export async function getEmbedding(
  text: string,
  model = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
): Promise<number[]> {
  if (!text || !text.trim()) return [];

  try {
    const ai = getGeminiClient();
    let response;
    try {
      response = await ai.models.embedContent({
        model,
        contents: text,
      });
    } catch (primaryErr: any) {
      if (model !== 'embedding-001') {
        response = await ai.models.embedContent({
          model: 'embedding-001',
          contents: text,
        });
      } else {
        throw primaryErr;
      }
    }

    const resAny = response as any;
    if (resAny?.embedding?.values) {
      return resAny.embedding.values;
    }
    if (resAny?.embeddings?.[0]?.values) {
      return resAny.embeddings[0].values;
    }
    return [];
  } catch (error: any) {
    console.warn(`Vector embedding unavailable (${error.message || error}). Falling back to text search.`);
    return [];
  }
}
