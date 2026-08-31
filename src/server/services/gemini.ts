import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
  ExtractionBatch,
  ExtractionBatchSchema,
  assignUniqueRequirementCodes,
  ExtractionProgressEvent,
  StageTokenUsage,
  PipelineTokenUsage,
  RFPPackage,
  RFPPackageSchema,
  ScopingRequirementItem,
  sortRequirementItems,
  normalizeEngineeringDiscipline,
  normalizeItemType,
  normalizeComplianceLevel,
  normalizeCostImpact,
} from '../../shared/schemas.js';
import { getNextRequirementSequences } from './sequences.js';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

export const DEFAULT_STAGE1_MODEL = process.env.GEMINI_STAGE1_MODEL || 'gemini-3.6-flash';
export const DEFAULT_STAGE2_MODEL = process.env.GEMINI_STAGE2_MODEL || 'gemini-3.7-flash';
export const DEFAULT_STAGE3_MODEL = process.env.GEMINI_STAGE3_MODEL || 'gemini-2.5-pro';

export function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export function extractUsageMetadata(response: any, fallbackModel?: string): StageTokenUsage {
  const meta = response?.usageMetadata;
  const promptTokens = Number(meta?.promptTokenCount) || 0;
  const candidateTokens = Number(meta?.candidatesTokenCount) || 0;
  const thoughtTokens = Number(meta?.thoughtsTokenCount) || 0;
  const totalTokens = Number(meta?.totalTokenCount) || (promptTokens + candidateTokens + thoughtTokens);

  return {
    promptTokens,
    candidateTokens,
    thoughtTokens,
    totalTokens,
    model: fallbackModel,
  };
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
      items: {
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
 * Stage 1: Table of Contents & Chunking using Fast Gemini Flash
 */
async function scanAndPartitionDocument(
  content: string,
  documentTitle: string,
  model = DEFAULT_STAGE1_MODEL
): Promise<{ sections: DocumentSection[]; tokenUsage: StageTokenUsage }> {
  if (content.length < 5000) {
    return {
      sections: [{ section_title: documentTitle || 'General Scope', content: content.trim() }],
      tokenUsage: { promptTokens: 0, candidateTokens: 0, thoughtTokens: 0, totalTokens: 0, model: 'Local Pass-through' },
    };
  }

  const ai = getGeminiClient();
  const prompt = `You are an EPC Engineering Lead. Scan the following engineering specification and partition it into logical engineering sections (or coherent chunks preserving clause boundaries).
Ensure all original text is preserved across the sections without losing technical specifications or clause numbers.

Document Title: ${documentTitle}
--- DOCUMENT CONTENT ---
${content.trim()}
--- END OF DOCUMENT CONTENT ---`;

  const modelsToTry = [
    model,
    DEFAULT_STAGE1_MODEL,
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  for (const m of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: m,
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
        const usage = extractUsageMetadata(response, m);
        console.log(`📑 Stage 1 complete: Document partitioned into ${parsed.length} logical sections with ${m} (${usage.totalTokens} tokens).`);
        return { sections: parsed, tokenUsage: usage };
      }
    } catch (err: any) {
      console.warn(`Stage 1 Gemini ToC chunking with ${m} failed (${err.message}). Trying next fallback...`);
    }
  }

  const chunks = deterministicChunker(content, documentTitle);
  console.log(`📑 Stage 1 complete: Document partitioned into ${chunks.length} sections via fallback chunker.`);
  return {
    sections: chunks,
    tokenUsage: { promptTokens: 0, candidateTokens: 0, thoughtTokens: 0, totalTokens: 0, model: 'Deterministic Chunker' },
  };
}

/**
 * Stage 2: Parallel Extraction across sections using Gemini 3.7 Flash with Thinking & Structured Outputs
 */
async function extractSection(
  section: DocumentSection,
  documentTitle: string,
  documentOwner: string,
  model = DEFAULT_STAGE2_MODEL
): Promise<{ items: any[]; tokenUsage: StageTokenUsage }> {
  const ai = getGeminiClient();
  const prompt = `Analyze the following engineering section from "${documentTitle}" and extract all concrete technical requirements, recommendations, and guidelines.

Document Title: ${documentTitle}
Section Title: ${section.section_title}
Assigned SME: ${documentOwner}

--- SECTION TEXT ---
${section.content}
--- END OF SECTION TEXT ---`;

  const modelsToTry = [
    model,
    DEFAULT_STAGE2_MODEL,
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  for (const m of modelsToTry) {
    try {
      const config: any = {
        systemInstruction: CAPITAL_ENG_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_ITEM_RESPONSE_SCHEMA,
        temperature: 0.1,
      };

      // Enable thinking on Gemini 3.7 Flash / 2.5 Flash
      if (m.includes('3.7') || m.includes('2.5') || m.includes('thinking')) {
        config.thinkingConfig = { thinkingBudget: 1024 };
      }

      const response = await ai.models.generateContent({
        model: m,
        contents: prompt,
        config,
      });

      const usage = extractUsageMetadata(response, m);
      const parsed = JSON.parse(response.text || '[]');
      if (Array.isArray(parsed)) {
        const items = parsed.map((item) => ({
          ...item,
          engineering_discipline: normalizeEngineeringDiscipline(item.engineering_discipline),
          item_type: normalizeItemType(item.item_type),
          compliance_level: normalizeComplianceLevel(item.compliance_level),
          estimated_cost_impact: normalizeCostImpact(item.estimated_cost_impact),
          section_title: item.section_title || section.section_title,
          document_owner: item.document_owner || documentOwner,
          confidence_score: Math.max(0, Math.min(1, typeof item.confidence_score === 'number' && !isNaN(item.confidence_score) ? item.confidence_score : 0.95)),
        }));
        return { items, tokenUsage: usage };
      }
    } catch (err: any) {
      console.warn(`Extraction for section "${section.section_title}" with ${m} failed: ${err.message}. Trying next fallback...`);
    }
  }

  return { items: [], tokenUsage: { promptTokens: 0, candidateTokens: 0, thoughtTokens: 0, totalTokens: 0, model } };
}

/**
 * Stage 3: Synthesis, De-duplication, and Cross-Discipline Review using Gemini Pro
 */
async function synthesizeAndDeduplicate(
  rawItems: any[],
  documentTitle: string,
  documentOwner: string,
  documentNumber?: string | null,
  model = DEFAULT_STAGE3_MODEL,
  startingSequences?: Record<string, number>
): Promise<{ batch: ExtractionBatch; tokenUsage: StageTokenUsage }> {
  // 1. In-memory de-duplication
  const seenTexts = new Set<string>();
  const uniqueItems: any[] = [];

  for (const item of rawItems) {
    const normalized = (item.requirement_text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 5) continue;

    if (!seenTexts.has(normalized)) {
      seenTexts.add(normalized);
      uniqueItems.push({
        ...item,
        engineering_discipline: normalizeEngineeringDiscipline(item.engineering_discipline),
        item_type: normalizeItemType(item.item_type),
        compliance_level: normalizeComplianceLevel(item.compliance_level),
        estimated_cost_impact: normalizeCostImpact(item.estimated_cost_impact),
        confidence_score: Math.max(0, Math.min(1, typeof item.confidence_score === 'number' && !isNaN(item.confidence_score) ? item.confidence_score : 0.95)),
        confidence_reasoning: item.confidence_reasoning || 'Extracted technical specification clause.',
      });
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
  let stage3Usage: StageTokenUsage = {
    promptTokens: 0,
    candidateTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    model,
  };

  const modelsToTry = [
    model,
    DEFAULT_STAGE3_MODEL,
    'gemini-2.5-pro',
    'gemini-3.1-pro',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

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

      stage3Usage = extractUsageMetadata(response, m);
      const parsed = JSON.parse(response.text || '{}');
      if (parsed.executive_summary) {
        executiveSummary = parsed.executive_summary;
        if (Array.isArray(parsed.cross_discipline_conflicts) && parsed.cross_discipline_conflicts.length > 0) {
          executiveSummary += `\n\nCross-Discipline Notes:\n- ` + parsed.cross_discipline_conflicts.join('\n- ');
        }
      }
      if (Array.isArray(parsed.identified_disciplines) && parsed.identified_disciplines.length > 0) {
        identifiedDisciplines = parsed.identified_disciplines.map((d: any) => normalizeEngineeringDiscipline(d));
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

  const cleanedDisciplines = Array.from(
    new Set([
      ...(identifiedDisciplines || []).map((d: any) => normalizeEngineeringDiscipline(d)),
      ...formattedItems.map((i) => i.engineering_discipline),
    ])
  );

  const batch: ExtractionBatch = {
    document_title: documentTitle,
    document_number: documentNumber || undefined,
    document_owner: documentOwner,
    executive_summary: executiveSummary,
    identified_disciplines: cleanedDisciplines.length > 0 ? (cleanedDisciplines as any) : ['General'],
    items: formattedItems,
  };

  return { batch: ExtractionBatchSchema.parse(batch), tokenUsage: stage3Usage };
}

/**
 * 3-Stage Requirements Extraction Pipeline:
 * Stage 1 (Table of Contents & Chunking): Fast Gemini 3.6 Flash
 * Stage 2 (Parallel Extraction): Gemini 3.7 Flash (with Thinking & Structured Outputs)
 * Stage 3 (Synthesis & De-duplication): Gemini 2.5 Pro
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

  // Stage 1: Table of Contents & Chunking (Fast Gemini 3.6 Flash)
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

  const { sections, tokenUsage: stage1Usage } = await scanAndPartitionDocument(content, documentTitle, DEFAULT_STAGE1_MODEL);

  const cumulativeAfterStage1: PipelineTokenUsage = {
    stage1: stage1Usage,
    totalPromptTokens: stage1Usage.promptTokens,
    totalCandidateTokens: stage1Usage.candidateTokens,
    totalThoughtTokens: stage1Usage.thoughtTokens || 0,
    totalTokens: stage1Usage.totalTokens,
  };

  await onProgress?.({
    stage: 1,
    stageName: 'Structure Chunking & ToC Analysis',
    status: 'completed',
    message: `Partitioned into ${sections.length} logical engineering section(s). (Stage 1 Tokens: ${stage1Usage.totalTokens.toLocaleString()})`,
    timestamp: new Date().toISOString(),
    details: {
      sectionsFound: sections.length,
      sectionTitles: sections.map((s) => s.section_title),
      model: stage1Usage.model || 'Gemini 3.6 Flash',
      stageTokens: stage1Usage,
      cumulativeTokens: cumulativeAfterStage1,
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
      currentSectionIndex: 0,
      rawItemsCount: 0,
      model: 'Gemini 3.7 Flash (Thinking)',
      cumulativeTokens: cumulativeAfterStage1,
    },
  });

  let completedSections = 0;
  let cumulativeRawItems = 0;
  let stage2PromptTokens = 0;
  let stage2CandidateTokens = 0;
  let stage2ThoughtTokens = 0;
  let stage2TotalTokens = 0;

  const sectionPromises = sections.map(async (section, idx) => {
    const { items, tokenUsage: secUsage } = await extractSection(section, documentTitle, documentOwner, DEFAULT_STAGE2_MODEL);
    completedSections++;
    cumulativeRawItems += items.length;
    stage2PromptTokens += secUsage.promptTokens;
    stage2CandidateTokens += secUsage.candidateTokens;
    stage2ThoughtTokens += secUsage.thoughtTokens || 0;
    stage2TotalTokens += secUsage.totalTokens;

    const currentStage2Usage: StageTokenUsage = {
      promptTokens: stage2PromptTokens,
      candidateTokens: stage2CandidateTokens,
      thoughtTokens: stage2ThoughtTokens,
      totalTokens: stage2TotalTokens,
      model: secUsage.model || 'Gemini 3.7 Flash (Thinking)',
    };

    const runningCumulative: PipelineTokenUsage = {
      stage1: stage1Usage,
      stage2: currentStage2Usage,
      totalPromptTokens: stage1Usage.promptTokens + stage2PromptTokens,
      totalCandidateTokens: stage1Usage.candidateTokens + stage2CandidateTokens,
      totalThoughtTokens: (stage1Usage.thoughtTokens || 0) + stage2ThoughtTokens,
      totalTokens: stage1Usage.totalTokens + stage2TotalTokens,
    };

    await onProgress?.({
      stage: 2,
      stageName: 'Parallel Deep Extraction',
      status: 'running',
      message: `Extracted section ${completedSections}/${sections.length}: "${section.section_title}" (${items.length} items · +${secUsage.totalTokens.toLocaleString()} tokens)`,
      timestamp: new Date().toISOString(),
      details: {
        currentSectionIndex: completedSections,
        currentSectionTitle: section.section_title,
        totalSections: sections.length,
        rawItemsCount: cumulativeRawItems,
        model: 'Gemini 3.7 Flash (Thinking)',
        stageTokens: currentStage2Usage,
        cumulativeTokens: runningCumulative,
      },
    });

    return items;
  });

  const sectionResults = await Promise.all(sectionPromises);
  const rawItems = sectionResults.flat();
  console.log(`📊 Stage 2 complete: Extracted ${rawItems.length} raw items across all sections (${stage2TotalTokens} tokens).`);

  const stage2FinalUsage: StageTokenUsage = {
    promptTokens: stage2PromptTokens,
    candidateTokens: stage2CandidateTokens,
    thoughtTokens: stage2ThoughtTokens,
    totalTokens: stage2TotalTokens,
    model: 'Gemini 3.7 Flash (Thinking)',
  };

  const cumulativeAfterStage2: PipelineTokenUsage = {
    stage1: stage1Usage,
    stage2: stage2FinalUsage,
    totalPromptTokens: stage1Usage.promptTokens + stage2PromptTokens,
    totalCandidateTokens: stage1Usage.candidateTokens + stage2CandidateTokens,
    totalThoughtTokens: (stage1Usage.thoughtTokens || 0) + stage2ThoughtTokens,
    totalTokens: stage1Usage.totalTokens + stage2TotalTokens,
  };

  await onProgress?.({
    stage: 2,
    stageName: 'Parallel Deep Extraction',
    status: 'completed',
    message: `Stage 2 Complete: Extracted ${rawItems.length} raw candidate requirements across all ${sections.length} section(s). (Stage 2 Tokens: ${stage2TotalTokens.toLocaleString()})`,
    timestamp: new Date().toISOString(),
    details: {
      totalSections: sections.length,
      currentSectionIndex: sections.length,
      rawItemsCount: rawItems.length,
      model: 'Gemini 3.7 Flash (Thinking)',
      stageTokens: stage2FinalUsage,
      cumulativeTokens: cumulativeAfterStage2,
    },
  });

  // Stage 3: Synthesis, De-duplication, & Cross-Discipline Review (Gemini 2.5 Pro)
  console.log(`🧠 Stage 3: Running synthesis, de-duplication, and cross-discipline review with Gemini 2.5 Pro...`);
  await onProgress?.({
    stage: 3,
    stageName: 'Synthesis & De-duplication',
    status: 'running',
    message: `Synthesizing ${rawItems.length} items, eliminating duplicates, and assigning discipline requirement codes with Gemini 2.5 Pro...`,
    timestamp: new Date().toISOString(),
    details: {
      rawItemsCount: rawItems.length,
      model: 'Gemini 2.5 Pro',
      cumulativeTokens: cumulativeAfterStage2,
    },
  });

  const { batch: finalBatch, tokenUsage: stage3Usage } = await synthesizeAndDeduplicate(
    rawItems,
    documentTitle,
    documentOwner,
    documentNumber,
    DEFAULT_STAGE3_MODEL,
    startingSequences
  );

  const totalPipelineUsage: PipelineTokenUsage = {
    stage1: stage1Usage,
    stage2: stage2FinalUsage,
    stage3: stage3Usage,
    totalPromptTokens: stage1Usage.promptTokens + stage2FinalUsage.promptTokens + stage3Usage.promptTokens,
    totalCandidateTokens: stage1Usage.candidateTokens + stage2FinalUsage.candidateTokens + stage3Usage.candidateTokens,
    totalThoughtTokens: (stage1Usage.thoughtTokens || 0) + (stage2FinalUsage.thoughtTokens || 0) + (stage3Usage.thoughtTokens || 0),
    totalTokens: stage1Usage.totalTokens + stage2FinalUsage.totalTokens + stage3Usage.totalTokens,
  };

  finalBatch.token_usage = totalPipelineUsage;
  console.log(`✅ 3-Stage Pipeline complete: ${finalBatch.items.length} verified requirements generated. Total tokens: ${totalPipelineUsage.totalTokens.toLocaleString()}`);

  await onProgress?.({
    stage: 3,
    stageName: 'Synthesis & De-duplication',
    status: 'completed',
    message: `Stage 3 Complete: Synthesized ${finalBatch.items.length} verified requirements. (Stage 3 Tokens: ${stage3Usage.totalTokens.toLocaleString()})`,
    timestamp: new Date().toISOString(),
    details: {
      finalItemsCount: finalBatch.items.length,
      model: stage3Usage.model || 'Gemini 2.5 Pro',
      stageTokens: stage3Usage,
      cumulativeTokens: totalPipelineUsage,
    },
  });

  await onProgress?.({
    stage: 'complete',
    stageName: 'Extraction Complete',
    status: 'completed',
    message: `Extraction pipeline finished: ${finalBatch.items.length} requirements ready for review. Total tokens: ${totalPipelineUsage.totalTokens.toLocaleString()} (Prompt: ${totalPipelineUsage.totalPromptTokens.toLocaleString()} · Output: ${totalPipelineUsage.totalCandidateTokens.toLocaleString()}${totalPipelineUsage.totalThoughtTokens ? ` · Thinking: ${totalPipelineUsage.totalThoughtTokens.toLocaleString()}` : ''}).`,
    timestamp: new Date().toISOString(),
    details: {
      finalItemsCount: finalBatch.items.length,
      cumulativeTokens: totalPipelineUsage,
    },
  });

  return finalBatch;
}

export async function getEmbedding(
  text: string,
  model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
): Promise<number[]> {
  if (!text || !text.trim()) return [];

  const candidateModels = [
    model,
    'gemini-embedding-001',
    'gemini-embedding-2',
    'text-embedding-004',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const m of candidateModels) {
    try {
      const ai = getGeminiClient();
      const response = await ai.models.embedContent({
        model: m,
        contents: text,
        config: {
          outputDimensionality: 768,
        },
      });

      const resAny = response as any;
      let values: number[] | undefined;
      if (resAny?.embedding?.values) {
        values = resAny.embedding.values;
      } else if (resAny?.embeddings?.[0]?.values) {
        values = resAny.embeddings[0].values;
      }

      if (values && values.length > 0) {
        if (values.length > 768) {
          return values.slice(0, 768);
        }
        return values;
      }
    } catch (err: any) {
      console.warn(`Embedding attempt with model "${m}" failed: ${err.message || err}. Trying next fallback...`);
    }
  }

  console.warn('Vector embedding unavailable across all candidate models. Falling back to text search.');
  return [];
}

export async function getEmbeddingWithUsage(
  text: string,
  model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
): Promise<{ embedding: number[]; tokenUsage: StageTokenUsage }> {
  if (!text || !text.trim()) {
    return {
      embedding: [],
      tokenUsage: { promptTokens: 0, candidateTokens: 0, thoughtTokens: 0, totalTokens: 0, model },
    };
  }

  const estimatedPromptTokens = Math.max(1, Math.ceil(text.length / 4));
  const vector = await getEmbedding(text, model);

  return {
    embedding: vector,
    tokenUsage: {
      promptTokens: estimatedPromptTokens,
      candidateTokens: 0,
      thoughtTokens: 0,
      totalTokens: estimatedPromptTokens,
      model: model || 'gemini-embedding-001',
    },
  };
}

const SCOPE_EVALUATION_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'STRING' },
      compliance_level: {
        type: 'STRING',
        enum: ['Mandatory', 'Recommended', 'Optional', 'Informational'],
      },
      item_type: {
        type: 'STRING',
        enum: ['Requirement', 'Recommendation', 'Guideline'],
      },
      relevance_score: { type: 'NUMBER' },
      custom_notes: { type: 'STRING' },
    },
    required: ['id', 'compliance_level', 'item_type', 'relevance_score'],
  },
};

const SCOPE_SYNTHESIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    scope_summary: { type: 'STRING' },
    high_risk_constraints: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['scope_summary'],
};

/**
 * 3-Stage Project Requirement Matching Pipeline:
 * Stage 1 (Vector Embedding & Candidate Retrieval): Vector embeddings
 * Stage 2 (AI Scope Alignment & Clause Reasoning): Gemini 3.7 Flash (Thinking enabled)
 * Stage 3 (RFP Scope Synthesis & Executive Summary): Gemini 2.5 Pro / Flash
 */
export async function matchAndEvaluateScopeRequirements(
  project: {
    project_id?: string;
    project_name: string;
    project_code?: string | null;
    facility_type: string;
    operating_conditions?: string | null;
    disciplines?: string[];
    scope_description: string;
    top_k?: number;
  },
  candidateRows: any[],
  stage1Usage: StageTokenUsage
): Promise<RFPPackage> {
  console.log(`🎯 Running AI Scope Requirement Matching for "${project.project_name}" across ${candidateRows.length} candidates...`);

  // Default partition if LLM evaluation fails
  let evaluatedMap = new Map<string, { compliance_level: string; item_type: string; relevance_score: number; custom_notes?: string }>();
  let stage2Usage: StageTokenUsage = {
    promptTokens: 0,
    candidateTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    model: DEFAULT_STAGE2_MODEL,
  };

  // Stage 2: AI Scope Alignment & Clause Reasoning (Gemini 3.7 Flash with Thinking)
  if (candidateRows.length > 0) {
    const ai = getGeminiClient();
    const evalPrompt = `You are a Principal Capital Projects Technical Lead and EPC SME.
Evaluate the following ${candidateRows.length} retrieved engineering candidate clauses for applicability against the specified project operating envelope.

PROJECT SPECIFICATIONS:
- Project Name: ${project.project_name} (${project.project_code || 'N/A'})
- Facility Type: ${project.facility_type}
- Operating Envelope & Conditions: ${project.operating_conditions || 'Standard'}
- Active Disciplines: ${project.disciplines?.join(', ') || 'All'}
- Detailed Scope of Work: ${project.scope_description}

RETRIEVED CANDIDATE CLAUSES:
${candidateRows.map((r, i) => `${i + 1}. [ID: ${r.id}] [Code: ${r.requirement_code || 'REQ'}] [Discipline: ${r.engineering_discipline}] [Default Compliance: ${r.compliance_level}]
Text: ${r.requirement_text}
Category: ${r.category || 'General'}
`).join('\n')}

For each clause:
1. Determine whether it is 'Mandatory' (statutory or strictly applicable to this envelope), 'Recommended' (best practice / preferred option), or 'Guideline' (optional design margin).
2. Assign 'item_type' ('Requirement', 'Recommendation', 'Guideline').
3. Assign an applicability 'relevance_score' between 0.00 and 1.00.
4. Provide concise engineering reasoning in 'custom_notes' explaining how it relates to project operating parameters (e.g. pressure, temperature, metallurgy, safety).
`;

    const modelsToTry = [
      DEFAULT_STAGE2_MODEL,
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    for (const m of modelsToTry) {
      try {
        const config: any = {
          systemInstruction: 'Evaluate candidate engineering specifications against project conditions and classify compliance tier and relevance score.',
          responseMimeType: 'application/json',
          responseSchema: SCOPE_EVALUATION_RESPONSE_SCHEMA,
          temperature: 0.1,
        };

        if (m.includes('3.7') || m.includes('2.5') || m.includes('thinking')) {
          config.thinkingConfig = { thinkingBudget: 1024 };
        }

        const response = await ai.models.generateContent({
          model: m,
          contents: evalPrompt,
          config,
        });

        stage2Usage = extractUsageMetadata(response, m);
        const parsed: any[] = JSON.parse(response.text || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            if (item.id) {
              evaluatedMap.set(item.id, {
                compliance_level: normalizeComplianceLevel(item.compliance_level),
                item_type: normalizeItemType(item.item_type),
                relevance_score: typeof item.relevance_score === 'number' ? Math.max(0, Math.min(1, item.relevance_score)) : 0.95,
                custom_notes: item.custom_notes || '',
              });
            }
          }
          console.log(`✅ Stage 2 complete: Evaluated ${evaluatedMap.size} clauses with ${m} (${stage2Usage.totalTokens} tokens).`);
          break;
        }
      } catch (err: any) {
        console.warn(`Stage 2 Scope Clause Evaluation with ${m} failed: ${err.message}. Trying fallback...`);
      }
    }
  }

  // Partition items into Mandatory, Recommendations, Guidelines
  const seenTexts = new Set<string>();
  const mandatory: ScopingRequirementItem[] = [];
  const recommendations: ScopingRequirementItem[] = [];
  const guidelines: ScopingRequirementItem[] = [];

  for (const r of candidateRows) {
    const normalized = (r.requirement_text || '').trim().toLowerCase();
    if (seenTexts.has(normalized)) continue;
    seenTexts.add(normalized);

    const evalData = evaluatedMap.get(r.id);
    const itemType = evalData?.item_type || normalizeItemType(r.item_type || 'Requirement');
    const complianceLevel = evalData?.compliance_level || normalizeComplianceLevel(r.compliance_level || 'Mandatory');
    const relevanceScore = evalData?.relevance_score ?? Number(r.similarity || 1.0);
    const customNotes = evalData?.custom_notes || '';

    const item: ScopingRequirementItem = {
      scoping_item_id: randomUUID(),
      extraction_id: r.id,
      requirement_code: r.requirement_code || null,
      requirement_text: r.requirement_text,
      item_type: itemType as any,
      engineering_discipline: normalizeEngineeringDiscipline(r.engineering_discipline) as any,
      compliance_level: complianceLevel as any,
      relevance_score: relevanceScore,
      is_selected: true,
      custom_notes: customNotes || null,
    };

    if (item.item_type === 'Requirement' || item.compliance_level === 'Mandatory') {
      mandatory.push(item);
    } else if (item.item_type === 'Recommendation' || item.compliance_level === 'Recommended') {
      recommendations.push(item);
    } else {
      guidelines.push(item);
    }
  }

  // Stage 3: Scope Synthesis & Executive Summary (Gemini Pro / Flash)
  let stage3Usage: StageTokenUsage = {
    promptTokens: 0,
    candidateTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    model: DEFAULT_STAGE3_MODEL,
  };
  let scopeSummary = project.scope_description;

  const totalMatchedCount = mandatory.length + recommendations.length + guidelines.length;
  if (totalMatchedCount > 0) {
    const ai = getGeminiClient();
    const summaryPrompt = `You are a Senior Principal Project Engineer. Synthesize an executive RFP scope summary for project "${project.project_name}" (${project.facility_type}).
Operating Conditions: ${project.operating_conditions || 'Standard'}
Original Scope: ${project.scope_description}
Matched Requirements: ${mandatory.length} Mandatory, ${recommendations.length} Recommendations, ${guidelines.length} Guidelines across ${(project.disciplines || []).join(', ')}.

Provide a structured, executive scope summary highlighting key technical focus areas and major equipment constraints.`;

    const modelsToTry = [
      DEFAULT_STAGE3_MODEL,
      'gemini-2.5-pro',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    for (const m of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: summaryPrompt,
          config: {
            systemInstruction: 'Synthesize the project RFP scope summary and key technical constraints.',
            responseMimeType: 'application/json',
            responseSchema: SCOPE_SYNTHESIS_RESPONSE_SCHEMA,
            temperature: 0.1,
          },
        });

        stage3Usage = extractUsageMetadata(response, m);
        const parsed = JSON.parse(response.text || '{}');
        if (parsed.scope_summary) {
          scopeSummary = parsed.scope_summary;
          if (Array.isArray(parsed.high_risk_constraints) && parsed.high_risk_constraints.length > 0) {
            scopeSummary += `\n\nKey Constraints:\n- ` + parsed.high_risk_constraints.join('\n- ');
          }
        }
        console.log(`✅ Stage 3 complete: Synthesized scope summary with ${m} (${stage3Usage.totalTokens} tokens).`);
        break;
      } catch (err: any) {
        console.warn(`Stage 3 Scope Synthesis with ${m} failed: ${err.message}.`);
      }
    }
  }

  // Grand Total Pipeline Usage Calculation
  const totalPipelineUsage: PipelineTokenUsage = {
    stage1: stage1Usage,
    stage2: stage2Usage,
    stage3: stage3Usage,
    totalPromptTokens: stage1Usage.promptTokens + stage2Usage.promptTokens + stage3Usage.promptTokens,
    totalCandidateTokens: stage1Usage.candidateTokens + stage2Usage.candidateTokens + stage3Usage.candidateTokens,
    totalThoughtTokens: (stage1Usage.thoughtTokens || 0) + (stage2Usage.thoughtTokens || 0) + (stage3Usage.thoughtTokens || 0),
    totalTokens: stage1Usage.totalTokens + stage2Usage.totalTokens + stage3Usage.totalTokens,
  };

  const packageId = project.project_id || randomUUID();
  const pkg: RFPPackage = {
    package_id: packageId,
    project_name: project.project_name,
    project_code: project.project_code || undefined,
    facility_type: project.facility_type,
    scope_summary: scopeSummary,
    mandatory_requirements: sortRequirementItems(mandatory),
    recommendations: sortRequirementItems(recommendations),
    guidelines: sortRequirementItems(guidelines),
    created_at: new Date().toISOString(),
    generated_by: 'Capital Engineering Copilot Agent',
    token_usage: totalPipelineUsage,
  };

  console.log(`✨ RFP Matching complete: Total tokens consumed: ${totalPipelineUsage.totalTokens.toLocaleString()}`);
  return RFPPackageSchema.parse(pkg);
}
