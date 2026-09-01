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
  ScopeAuditInput,
  ScopeQualityAuditReport,
  ScopeQualityAuditReportSchema,
  RequirementQualityFlag,
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
export const DEFAULT_AUDIT_MODEL = process.env.GEMINI_AUDIT_MODEL || 'gemini-3.7-flash';

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

const SCOPE_AUDIT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    quality_score: { type: 'NUMBER' },
    executive_summary: { type: 'STRING' },
    manager_guidance: { type: 'STRING' },
    conflict_count: { type: 'NUMBER' },
    ambiguity_count: { type: 'NUMBER' },
    duplication_count: { type: 'NUMBER' },
    flags: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          scoping_item_id: { type: 'STRING' },
          issue_type: {
            type: 'STRING',
            enum: ['Duplication', 'Ambiguity', 'CrossDisciplineConflict'],
          },
          severity: {
            type: 'STRING',
            enum: ['Critical', 'Warning', 'Notice'],
          },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          conflicting_item_ids: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          conflicting_requirement_codes: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          suggested_action: { type: 'STRING' },
        },
        required: [
          'scoping_item_id',
          'issue_type',
          'severity',
          'title',
          'description',
          'suggested_action',
        ],
      },
    },
    suggested_exclusions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    category_summaries: {
      type: 'OBJECT',
      properties: {
        cross_discipline_conflicts: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        ambiguities: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        duplications: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
      },
      required: ['cross_discipline_conflicts', 'ambiguities', 'duplications'],
    },
  },
  required: [
    'quality_score',
    'executive_summary',
    'manager_guidance',
    'flags',
    'category_summaries',
  ],
};

/**
 * Deterministic Heuristic Quality & Conflict Analyzer
 * Used as reliable fallback when offline or when LLM response is unavailable
 */
export function heuristicAuditScopeQualityAndConflicts(input: ScopeAuditInput): ScopeQualityAuditReport {
  const items = input.selected_items || [];
  const flags: RequirementQualityFlag[] = [];
  const suggestedExclusions = new Set<string>();
  const conflictSummaries: string[] = [];
  const ambiguitySummaries: string[] = [];
  const duplicationSummaries: string[] = [];

  // Helper token extractor
  const tokenize = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

  // 1. Duplication & Overlap Detection
  for (let i = 0; i < items.length; i++) {
    const itemA = items[i];
    const tokensA = new Set(tokenize(itemA.requirement_text));
    if (tokensA.size === 0) continue;

    for (let j = i + 1; j < items.length; j++) {
      const itemB = items[j];
      const tokensB = tokenize(itemB.requirement_text);
      if (tokensB.length === 0) continue;

      let matchCount = 0;
      for (const t of tokensB) {
        if (tokensA.has(t)) matchCount++;
      }
      const unionSize = new Set([...tokensA, ...tokensB]).size;
      const jaccard = unionSize > 0 ? matchCount / unionSize : 0;

      const normA = itemA.requirement_text.trim().toLowerCase();
      const normB = itemB.requirement_text.trim().toLowerCase();
      const isDirectOverlap = normA === normB || normA.includes(normB) || normB.includes(normA);

      if (jaccard > 0.60 || isDirectOverlap) {
        const flagA: RequirementQualityFlag = {
          flag_id: randomUUID(),
          scoping_item_id: itemA.scoping_item_id,
          issue_type: 'Duplication',
          severity: 'Notice',
          title: `Redundant Specification with [${itemB.requirement_code || 'REQ'}]`,
          description: `Near-identical scope requirements detected between ${itemA.engineering_discipline} [${itemA.requirement_code || 'REQ'}] and ${itemB.engineering_discipline} [${itemB.requirement_code || 'REQ'}].`,
          conflicting_item_ids: [itemB.scoping_item_id],
          conflicting_requirement_codes: [itemB.requirement_code || 'REQ'],
          suggested_action: `Consolidate clauses into a single authoritative specification to prevent redundant vendor deliverables.`,
        };
        const flagB: RequirementQualityFlag = {
          flag_id: randomUUID(),
          scoping_item_id: itemB.scoping_item_id,
          issue_type: 'Duplication',
          severity: 'Notice',
          title: `Redundant Specification with [${itemA.requirement_code || 'REQ'}]`,
          description: `Duplicate clause overlapping with ${itemA.engineering_discipline} [${itemA.requirement_code || 'REQ'}].`,
          conflicting_item_ids: [itemA.scoping_item_id],
          conflicting_requirement_codes: [itemA.requirement_code || 'REQ'],
          suggested_action: `Consider excluding this duplicate from the final RFP package.`,
        };

        flags.push(flagA, flagB);
        suggestedExclusions.add(itemB.scoping_item_id);
        duplicationSummaries.push(
          `Overlap between [${itemA.requirement_code || 'REQ'}] (${itemA.engineering_discipline}) and [${itemB.requirement_code || 'REQ'}] (${itemB.engineering_discipline})`
        );
      }
    }
  }

  // 2. Ambiguity & Vagueness Scan
  const ambiguousPatterns = [
    { pattern: /\b(adequate(?:ly)?)\b/i, term: 'adequate', fix: 'Specify numerical thresholds or quantitative engineering metrics.' },
    { pattern: /\b(proper(?:ly)?)\b/i, term: 'properly', fix: 'Replace with exact governing code, standard number, or design parameter.' },
    { pattern: /\b(as necessary|as needed|as appropriate)\b/i, term: 'as necessary/needed', fix: 'Define the boundary condition or triggering criteria.' },
    { pattern: /\b(suitable for)\b/i, term: 'suitable', fix: 'Provide exact service envelope (temperature, pressure, fluid chemistry).' },
    { pattern: /\b(sufficient(?:ly)?)\b/i, term: 'sufficient', fix: 'State minimum capacity, margin percentage, or flow rate.' },
    { pattern: /\b(good engineering practice|standard industry practice)\b/i, term: 'good/standard practice', fix: 'Cite specific applicable industry standards (e.g. ASME, API, IEEE).' },
    { pattern: /\b(to the satisfaction of|best efforts)\b/i, term: 'subjective criteria', fix: 'Establish objective, verifiable factory acceptance test (FAT) criteria.' },
  ];

  for (const item of items) {
    for (const amb of ambiguousPatterns) {
      if (amb.pattern.test(item.requirement_text)) {
        flags.push({
          flag_id: randomUUID(),
          scoping_item_id: item.scoping_item_id,
          issue_type: 'Ambiguity',
          severity: 'Warning',
          title: `Ambiguous Phrasing: "${amb.term}"`,
          description: `The clause contains subjective or unquantified term "${amb.term}" without verifiable acceptance criteria.`,
          conflicting_item_ids: [],
          conflicting_requirement_codes: [],
          suggested_action: amb.fix,
        });
        ambiguitySummaries.push(
          `[${item.requirement_code || 'REQ'}] contains non-enforceable term "${amb.term}". ${amb.fix}`
        );
        break; // 1 ambiguity flag per item to keep clean
      }
    }
  }

  // 3. Cross-Discipline Conflict Analysis
  // Parameter extraction helpers
  const extractPressures = (t: string) => {
    const m = t.match(/(\d{3,5})\s*(?:psig|psi|barg|bar)/gi);
    return m ? m.map((s) => parseInt(s.replace(/\D/g, ''), 10)).filter((n) => n > 100) : [];
  };
  const extractMetallurgy = (t: string) => {
    const list: string[] = [];
    if (/carbon\s*steel/i.test(t)) list.push('Carbon Steel');
    if (/super\s*duplex|duplex\s*2507|2205/i.test(t)) list.push('Duplex/Super Duplex');
    if (/316l?|stainless\s*steel/i.test(t)) list.push('Stainless Steel');
    if (/inconel|hastelloy|nickel\s*alloy/i.test(t)) list.push('Nickel Alloy / Inconel');
    return list;
  };
  const extractHazardous = (t: string) => {
    if (/class\s*1\s*div\s*1|zone\s*0|zone\s*1/i.test(t)) return 'Class 1 Div 1 (High Hazard)';
    if (/class\s*1\s*div\s*2|zone\s*2/i.test(t)) return 'Class 1 Div 2 (Moderate Hazard)';
    if (/unclassified|non-hazardous|general\s*purpose/i.test(t)) return 'Unclassified / General Purpose';
    return null;
  };

  for (let i = 0; i < items.length; i++) {
    const itemA = items[i];
    const pressA = extractPressures(itemA.requirement_text);
    const metalA = extractMetallurgy(itemA.requirement_text);
    const hazA = extractHazardous(itemA.requirement_text);

    for (let j = i + 1; j < items.length; j++) {
      const itemB = items[j];
      if (itemA.engineering_discipline === itemB.engineering_discipline) continue; // cross-discipline only

      const pressB = extractPressures(itemB.requirement_text);
      const metalB = extractMetallurgy(itemB.requirement_text);
      const hazB = extractHazardous(itemB.requirement_text);

      // Pressure Conflict (e.g. Piping 1480 psig vs Mechanical 3200 psig)
      if (pressA.length > 0 && pressB.length > 0) {
        const maxA = Math.max(...pressA);
        const maxB = Math.max(...pressB);
        if (Math.abs(maxA - maxB) > 400 && Math.min(maxA, maxB) > 0) {
          const flagA: RequirementQualityFlag = {
            flag_id: randomUUID(),
            scoping_item_id: itemA.scoping_item_id,
            issue_type: 'CrossDisciplineConflict',
            severity: 'Critical',
            title: `Design Pressure Conflict with ${itemB.engineering_discipline} [${itemB.requirement_code || 'REQ'}]`,
            description: `${itemA.engineering_discipline} specifies ${maxA} psig whereas ${itemB.engineering_discipline} specifies ${maxB} psig for connected equipment envelope.`,
            conflicting_item_ids: [itemB.scoping_item_id],
            conflicting_requirement_codes: [itemB.requirement_code || 'REQ'],
            suggested_action: `Align design pressure rating between ${itemA.engineering_discipline} and ${itemB.engineering_discipline} to prevent piping/vessel flange rating mismatch.`,
          };
          const flagB: RequirementQualityFlag = {
            flag_id: randomUUID(),
            scoping_item_id: itemB.scoping_item_id,
            issue_type: 'CrossDisciplineConflict',
            severity: 'Critical',
            title: `Design Pressure Conflict with ${itemA.engineering_discipline} [${itemA.requirement_code || 'REQ'}]`,
            description: `${itemB.engineering_discipline} specifies ${maxB} psig whereas ${itemA.engineering_discipline} specifies ${maxA} psig.`,
            conflicting_item_ids: [itemA.scoping_item_id],
            conflicting_requirement_codes: [itemA.requirement_code || 'REQ'],
            suggested_action: `Verify system design pressure across P&ID and mechanical datasheets before RFP release.`,
          };
          flags.push(flagA, flagB);
          conflictSummaries.push(
            `Pressure mismatch: ${itemA.engineering_discipline} (${maxA} psig) vs ${itemB.engineering_discipline} (${maxB} psig)`
          );
        }
      }

      // Metallurgy Conflict (e.g. Carbon Steel vs Super Duplex on wet sour service)
      if (metalA.length > 0 && metalB.length > 0 && metalA[0] !== metalB[0]) {
        if ((metalA.includes('Carbon Steel') && metalB.includes('Duplex/Super Duplex')) ||
            (metalB.includes('Carbon Steel') && metalA.includes('Duplex/Super Duplex'))) {
          flags.push({
            flag_id: randomUUID(),
            scoping_item_id: itemA.scoping_item_id,
            issue_type: 'CrossDisciplineConflict',
            severity: 'Critical',
            title: `Metallurgy Compatibility Conflict with ${itemB.engineering_discipline} [${itemB.requirement_code || 'REQ'}]`,
            description: `${itemA.engineering_discipline} specifies ${metalA.join(', ')} while ${itemB.engineering_discipline} requires ${metalB.join(', ')}. Galvanic or sour corrosion risk.`,
            conflicting_item_ids: [itemB.scoping_item_id],
            conflicting_requirement_codes: [itemB.requirement_code || 'REQ'],
            suggested_action: `Harmonize piping and equipment metallurgy with Materials & Corrosion SME per NACE MR0175.`,
          });
          conflictSummaries.push(
            `Material incompatibility between ${itemA.engineering_discipline} (${metalA.join('/')}) and ${itemB.engineering_discipline} (${metalB.join('/')})`
          );
        }
      }

      // Hazardous Area Conflict (e.g. Electrical unclassified vs I&C Class 1 Div 1)
      if (hazA && hazB && hazA !== hazB) {
        if ((hazA.includes('Unclassified') && hazB.includes('Hazard')) || (hazB.includes('Unclassified') && hazA.includes('Hazard'))) {
          flags.push({
            flag_id: randomUUID(),
            scoping_item_id: itemA.scoping_item_id,
            issue_type: 'CrossDisciplineConflict',
            severity: 'Critical',
            title: `Hazardous Area Rating Inconsistency with ${itemB.engineering_discipline}`,
            description: `${itemA.engineering_discipline} references ${hazA} whereas ${itemB.engineering_discipline} specifies ${hazB}.`,
            conflicting_item_ids: [itemB.scoping_item_id],
            conflicting_requirement_codes: [itemB.requirement_code || 'REQ'],
            suggested_action: `Cross-check Electrical Area Classification drawings (API RP 500/505) and standardize instrument ingress and explosion-proof enclosures.`,
          });
          conflictSummaries.push(
            `Area classification clash: ${itemA.engineering_discipline} (${hazA}) vs ${itemB.engineering_discipline} (${hazB})`
          );
        }
      }
    }
  }

  // Deduplicate and group flags
  const conflictCount = flags.filter((f) => f.issue_type === 'CrossDisciplineConflict').length;
  const ambiguityCount = flags.filter((f) => f.issue_type === 'Ambiguity').length;
  const duplicationCount = flags.filter((f) => f.issue_type === 'Duplication').length;

  // Compute Quality Health Score (0-100)
  let score = 100;
  score -= conflictCount * 8;
  score -= ambiguityCount * 4;
  score -= duplicationCount * 3;
  if (items.length === 0) score = 100;
  score = Math.max(25, Math.min(100, score));

  // Executive Summary & Package Manager Guidance
  const executiveSummary = items.length === 0
    ? `No active requirements selected for quality scan.`
    : `Scanned ${items.length} active requirements for ${input.project_name} (${input.facility_type}). Identified ${conflictCount} cross-discipline conflicts, ${ambiguityCount} ambiguous clauses, and ${duplicationCount} duplicate requirements. Overall Scope Health Score is ${score}/100.`;

  const managerGuidance = conflictCount > 0
    ? `Action Required: Prioritize resolving the ${conflictCount} critical cross-discipline conflicts before issuing RFP to avoid contractor change orders and engineering rework. Review highlighted clauses and exclude redundant duplicate specifications.`
    : ambiguityCount > 0
    ? `Recommendation: Review the ${ambiguityCount} ambiguous clauses to replace subjective wording with explicit numerical tolerances and referenced codes before finalizing the tender package.`
    : `Scope package is in excellent condition. No critical cross-discipline conflicts or major ambiguities detected. Ready for vendor RFP release.`;

  return {
    audit_id: randomUUID(),
    package_id: input.package_id,
    project_name: input.project_name,
    project_code: input.project_code,
    quality_score: score,
    executive_summary: executiveSummary,
    manager_guidance: managerGuidance,
    conflict_count: conflictCount,
    ambiguity_count: ambiguityCount,
    duplication_count: duplicationCount,
    flags,
    suggested_exclusions: Array.from(suggestedExclusions),
    category_summaries: {
      cross_discipline_conflicts: Array.from(new Set(conflictSummaries)),
      ambiguities: Array.from(new Set(ambiguitySummaries)),
      duplications: Array.from(new Set(duplicationSummaries)),
    },
    scanned_at: new Date().toISOString(),
    model_used: input.model || DEFAULT_AUDIT_MODEL || 'gemini-3.7-flash',
    token_usage: {
      promptTokens: 0,
      candidateTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
      model: 'Heuristic Rule Engine (Fallback)',
    },
  };
}

/**
 * Stage 4: AI Requirement Quality, Ambiguity & Cross-Discipline Conflict Scanner
 * Uses Gemini 3.7 Flash with Thinking Mode (or Gemini 2.5 Pro) to analyze active RFP requirements
 */
export async function auditScopeQualityAndConflicts(input: ScopeAuditInput): Promise<ScopeQualityAuditReport> {
  const items = input.selected_items || [];
  if (items.length === 0) {
    return heuristicAuditScopeQualityAndConflicts(input);
  }

  console.log(`🛡️ Running Scope Quality & Conflict Audit on ${items.length} requirements for "${input.project_name}"...`);

  const modelToUse = input.model || DEFAULT_AUDIT_MODEL || 'gemini-3.7-flash';
  const modelsToTry = [
    modelToUse,
    'gemini-3.7-flash',
    'gemini-2.5-pro',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  const auditPrompt = `You are a Principal Capital Projects Quality Assurance Lead, Systems Engineering Manager, and EPC Contract Auditor.
Perform a rigorous multi-discipline quality and conflict audit on the following ${items.length} selected RFP requirements for capital project "${input.project_name}".

PROJECT DETAILS:
- Facility Type: ${input.facility_type}
- Operating Envelope: ${input.operating_conditions || 'Standard'}
- Project Scope: ${input.scope_description}

SELECTED REQUIREMENTS TO SCAN:
${items.map((it, idx) => `${idx + 1}. [Scoping Item ID: ${it.scoping_item_id}] [Code: ${it.requirement_code || 'REQ'}] [Discipline: ${it.engineering_discipline}] [Compliance: ${it.compliance_level}]
Text: ${it.requirement_text}
Category/Notes: ${it.custom_notes || 'N/A'}`).join('\n\n')}

AUDIT OBJECTIVES:
1. DUPLICATION: Identify duplicate, near-identical, or redundant requirements across disciplines or from duplicate source documents.
2. AMBIGUITY: Detect vague phrases ("adequate", "properly sized", "as required", "good practice"), non-enforceable criteria, or undefined boundaries that leave the EPC contractor with open-ended interpretation.
3. CROSS-DISCIPLINE CONFLICT: Detect engineering contradictions between disciplines (e.g. Mechanical vs Piping design pressures/temperatures, Electrical hazardous area vs I&C ratings, Process metallurgy vs Piping specs, HSE setbacks vs Civil foundations).
4. SCOPE HEALTH SCORE: Calculate an overall quality score from 0 (critical flaws) to 100 (clean, robust RFP package).
5. EXECUTIVE SUMMARY & RFP PACKAGE MANAGER GUIDANCE: Provide a clear text overview and actionable decision guidance on what to include, modify, or exclude in the final package.
6. HIGHLIGHT FLAGS: Attach a flag to each affected requirement with scoping_item_id, issue_type ('Duplication', 'Ambiguity', 'CrossDisciplineConflict'), severity ('Critical', 'Warning', 'Notice'), title, description, and suggested_action.
`;

  const ai = getGeminiClient();

  for (const m of modelsToTry) {
    try {
      const config: any = {
        systemInstruction: 'Perform rigorous EPC engineering scope quality audit, detect cross-discipline conflicts, ambiguous phrasing, and duplicate clauses, and output structured JSON.',
        responseMimeType: 'application/json',
        responseSchema: SCOPE_AUDIT_RESPONSE_SCHEMA,
        temperature: 0.1,
      };

      if (m.includes('3.7') || m.includes('2.5') || m.includes('thinking')) {
        config.thinkingConfig = { thinkingBudget: 2048 };
      }

      const response = await ai.models.generateContent({
        model: m,
        contents: auditPrompt,
        config,
      });

      const tokenUsage = extractUsageMetadata(response, m);
      const parsed = JSON.parse(response.text || '{}');

      if (parsed.quality_score !== undefined && Array.isArray(parsed.flags)) {
        console.log(`✅ Quality Audit complete with ${m}: Score=${parsed.quality_score}%, Flags=${parsed.flags.length} (${tokenUsage.totalTokens} tokens).`);

        // Format and validate flags
        const formattedFlags: RequirementQualityFlag[] = parsed.flags.map((f: any) => ({
          flag_id: randomUUID(),
          scoping_item_id: f.scoping_item_id || items[0].scoping_item_id,
          issue_type: (f.issue_type === 'CrossDisciplineConflict' || f.issue_type === 'Ambiguity' || f.issue_type === 'Duplication')
            ? f.issue_type
            : 'Ambiguity',
          severity: (f.severity === 'Critical' || f.severity === 'Warning' || f.severity === 'Notice')
            ? f.severity
            : 'Warning',
          title: f.title || 'Quality Notice',
          description: f.description || 'Quality issue detected.',
          conflicting_item_ids: Array.isArray(f.conflicting_item_ids) ? f.conflicting_item_ids : [],
          conflicting_requirement_codes: Array.isArray(f.conflicting_requirement_codes) ? f.conflicting_requirement_codes : [],
          suggested_action: f.suggested_action || 'Review requirement with engineering SME.',
        }));

        const conflictCount = formattedFlags.filter((f) => f.issue_type === 'CrossDisciplineConflict').length;
        const ambiguityCount = formattedFlags.filter((f) => f.issue_type === 'Ambiguity').length;
        const duplicationCount = formattedFlags.filter((f) => f.issue_type === 'Duplication').length;

        const report: ScopeQualityAuditReport = {
          audit_id: randomUUID(),
          package_id: input.package_id,
          project_name: input.project_name,
          project_code: input.project_code,
          quality_score: Math.max(0, Math.min(100, Number(parsed.quality_score) || 85)),
          executive_summary: parsed.executive_summary || `Quality audit scanned ${items.length} requirements.`,
          manager_guidance: parsed.manager_guidance || `Review flagged items before tender issuance.`,
          conflict_count: conflictCount,
          ambiguity_count: ambiguityCount,
          duplication_count: duplicationCount,
          flags: formattedFlags,
          suggested_exclusions: Array.isArray(parsed.suggested_exclusions) ? parsed.suggested_exclusions : [],
          category_summaries: {
            cross_discipline_conflicts: Array.isArray(parsed.category_summaries?.cross_discipline_conflicts)
              ? parsed.category_summaries.cross_discipline_conflicts
              : [],
            ambiguities: Array.isArray(parsed.category_summaries?.ambiguities)
              ? parsed.category_summaries.ambiguities
              : [],
            duplications: Array.isArray(parsed.category_summaries?.duplications)
              ? parsed.category_summaries.duplications
              : [],
          },
          scanned_at: new Date().toISOString(),
          model_used: m,
          token_usage: tokenUsage,
        };

        return ScopeQualityAuditReportSchema.parse(report);
      }
    } catch (err: any) {
      console.warn(`Quality Audit attempt with ${m} failed: ${err.message}. Trying next fallback...`);
    }
  }

  console.warn('Falling back to deterministic heuristic quality analyzer...');
  return heuristicAuditScopeQualityAndConflicts(input);
}

