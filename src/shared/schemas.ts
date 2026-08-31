import { z } from 'zod';

export const ReviewStatus = z.enum([
  'Pending Review',
  'Approved',
  'Rejected',
  'Edited',
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const ItemTypeValues = [
  'Requirement',     // Mandatory (shall/must)
  'Recommendation',  // Preferred (should)
  'Guideline',       // Optional (may)
] as const;

export function normalizeItemType(val?: unknown): (typeof ItemTypeValues)[number] {
  if (!val || typeof val !== 'string') return 'Requirement';
  const lower = val.trim().toLowerCase();
  if (lower.includes('recommend')) return 'Recommendation';
  if (lower.includes('guide') || lower.includes('opt') || lower.includes('info')) return 'Guideline';
  return 'Requirement';
}

export const ItemType = z.preprocess(
  (val) => normalizeItemType(val),
  z.enum(ItemTypeValues)
);
export type ItemType = (typeof ItemTypeValues)[number];

export const ComplianceLevelValues = [
  'Mandatory',
  'Recommended',
  'Optional',
  'Informational',
] as const;

export function normalizeComplianceLevel(val?: unknown): (typeof ComplianceLevelValues)[number] {
  if (!val || typeof val !== 'string') return 'Mandatory';
  const lower = val.trim().toLowerCase();
  if (lower.includes('recom')) return 'Recommended';
  if (lower.includes('opt')) return 'Optional';
  if (lower.includes('info')) return 'Informational';
  if (lower.includes('mand') || lower.includes('req') || lower.includes('shall') || lower.includes('must')) return 'Mandatory';
  return 'Mandatory';
}

export const ComplianceLevel = z.preprocess(
  (val) => normalizeComplianceLevel(val),
  z.enum(ComplianceLevelValues)
);
export type ComplianceLevel = (typeof ComplianceLevelValues)[number];

export const EngineeringDisciplineValues = [
  'Mechanical',
  'Piping',
  'Electrical',
  'I&C',
  'Civil/Structural',
  'Process',
  'HSE',
  'Quality',
  'General',
] as const;

export function normalizeEngineeringDiscipline(val?: unknown): (typeof EngineeringDisciplineValues)[number] {
  if (!val || typeof val !== 'string') return 'General';
  const trimmed = val.trim();
  for (const d of EngineeringDisciplineValues) {
    if (d.toLowerCase() === trimmed.toLowerCase()) return d;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('mech')) return 'Mechanical';
  if (lower.includes('pip')) return 'Piping';
  if (lower.includes('elec') || lower.includes('power') || lower.includes('substation')) return 'Electrical';
  if (
    lower.includes('inst') ||
    lower.includes('i&c') ||
    lower.includes('i & c') ||
    lower.includes('control') ||
    lower.includes('automation') ||
    lower.includes('scada') ||
    lower.includes('telecom')
  )
    return 'I&C';
  if (
    lower.includes('civil') ||
    lower.includes('struct') ||
    lower.includes('foundat') ||
    lower.includes('geotech') ||
    lower.includes('architect')
  )
    return 'Civil/Structural';
  if (lower.includes('proc') || lower.includes('chem') || lower.includes('flow')) return 'Process';
  if (lower.includes('hse') || lower.includes('safe') || lower.includes('env') || lower.includes('fire')) return 'HSE';
  if (lower.includes('qual') || lower.includes('qa') || lower.includes('qc') || lower.includes('inspect')) return 'Quality';
  return 'General';
}

export const EngineeringDiscipline = z.preprocess(
  (val) => normalizeEngineeringDiscipline(val),
  z.enum(EngineeringDisciplineValues)
);
export type EngineeringDiscipline = (typeof EngineeringDisciplineValues)[number];

export const DISCIPLINE_CODE_MAP: Record<string, string> = {
  Mechanical: 'MEC',
  Piping: 'PIP',
  Electrical: 'ELE',
  'I&C': 'INC',
  'Civil/Structural': 'CIV',
  Process: 'PRO',
  HSE: 'HSE',
  Quality: 'QUA',
  General: 'GEN',
};

export function getDisciplineCode(discipline?: string | null): string {
  if (!discipline) return 'GEN';
  const trimmed = discipline.trim();
  if (DISCIPLINE_CODE_MAP[trimmed]) {
    return DISCIPLINE_CODE_MAP[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const [key, code] of Object.entries(DISCIPLINE_CODE_MAP)) {
    if (key.toLowerCase() === lower) return code;
  }
  if (lower.includes('mech')) return 'MEC';
  if (lower.includes('pip')) return 'PIP';
  if (lower.includes('elec')) return 'ELE';
  if (lower.includes('inst') || lower.includes('i&c') || lower.includes('control')) return 'INC';
  if (lower.includes('civil') || lower.includes('struct')) return 'CIV';
  if (lower.includes('proc')) return 'PRO';
  if (lower.includes('hse') || lower.includes('safe') || lower.includes('env')) return 'HSE';
  if (lower.includes('qual') || lower.includes('qa')) return 'QUA';

  const clean = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.slice(0, 3) || 'GEN';
}

export function formatRequirementCode(discipline: string | undefined | null, sequenceNumber: number): string {
  const discCode = getDisciplineCode(discipline);
  const paddedSeq = String(sequenceNumber).padStart(8, '0');
  return `REQ-${discCode}-${paddedSeq}`;
}

export function parseRequirementCode(code?: string | null): { disciplineCode: string; sequenceNumber: number } | null {
  if (!code) return null;
  const match = code.trim().match(/^REQ-([A-Za-z0-9]+)-(\d+)$/);
  if (!match) return null;
  return {
    disciplineCode: match[1].toUpperCase(),
    sequenceNumber: parseInt(match[2], 10),
  };
}

export function assignUniqueRequirementCodes<T extends { requirement_code?: string | null; engineering_discipline?: string | null }>(
  items: T[],
  options?: {
    perDiscipline?: boolean;
    startingSequence?: number | Record<string, number>;
  }
): (T & { requirement_code: string })[] {
  const perDiscipline = options?.perDiscipline ?? true;

  if (perDiscipline) {
    const disciplineCounters: Record<string, number> = {};
    const startingMap: Record<string, number> =
      typeof options?.startingSequence === 'object' && options?.startingSequence !== null
        ? { ...options.startingSequence }
        : {};
    const defaultStart = typeof options?.startingSequence === 'number' ? options.startingSequence : 1;

    return items.map((item) => {
      const discCode = getDisciplineCode(item.engineering_discipline);
      if (disciplineCounters[discCode] === undefined) {
        disciplineCounters[discCode] = startingMap[discCode] !== undefined ? startingMap[discCode] : defaultStart;
      } else {
        disciplineCounters[discCode]++;
      }
      const seq = disciplineCounters[discCode];
      return {
        ...item,
        requirement_code: formatRequirementCode(item.engineering_discipline, seq),
      };
    });
  } else {
    let currentSeq = typeof options?.startingSequence === 'number' ? options.startingSequence : 1;
    return items.map((item) => {
      const code = formatRequirementCode(item.engineering_discipline, currentSeq);
      currentSeq++;
      return {
        ...item,
        requirement_code: code,
      };
    });
  }
}

export const CostImpactValues = [
  'High',
  'Medium',
  'Low',
  'Negligible',
  'TBD',
] as const;

export function normalizeCostImpact(val?: unknown): (typeof CostImpactValues)[number] {
  if (!val || typeof val !== 'string') return 'TBD';
  const lower = val.trim().toLowerCase();
  if (lower.includes('high')) return 'High';
  if (lower.includes('med')) return 'Medium';
  if (lower.includes('low')) return 'Low';
  if (lower.includes('neg')) return 'Negligible';
  return 'TBD';
}

export const CostImpact = z.preprocess(
  (val) => normalizeCostImpact(val),
  z.enum(CostImpactValues)
);
export type CostImpact = (typeof CostImpactValues)[number];

// Extraction Item Schema
export const ExtractionItemSchema = z.object({
  section_title: z.string().nullable().optional(),
  requirement_code: z.string().nullable().optional(),
  requirement_text: z.string().min(5, 'Requirement text must be at least 5 characters'),
  item_type: ItemType.default('Requirement'),
  category: z.string().nullable().optional(),
  engineering_discipline: EngineeringDiscipline.default('General'),
  compliance_level: ComplianceLevel.default('Mandatory'),
  estimated_cost_impact: CostImpact.default('TBD'),
  document_owner: z.string().nullable().optional(),
  confidence_score: z.number().min(0).max(1).default(1.0),
  confidence_reasoning: z.string().nullable().optional(),
});
export type ExtractionItem = z.infer<typeof ExtractionItemSchema>;

// Extraction Batch Schema
export const ExtractionBatchSchema = z.object({
  batch_id: z.string().uuid().optional(),
  document_title: z.string().min(1, 'Document title is required'),
  document_number: z.string().nullable().optional(),
  document_owner: z.string().default('General Engineering SME'),
  document_date: z.string().nullable().optional(),
  executive_summary: z.string().nullable().optional(),
  identified_disciplines: z.array(EngineeringDiscipline).default([]),
  items: z.array(ExtractionItemSchema).default([]),
});
export type ExtractionBatch = z.infer<typeof ExtractionBatchSchema>;

// Document Record Schema
export const DocumentRecordSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  document_number: z.string().nullable().optional(),
  document_date: z.string().nullable().optional(),
  document_type: z.string().default('Standard'),
  owner_sme: z.string().default('Engineering Lead'),
  version: z.string().default('1.0'),
  raw_content: z.string(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;

// Extraction Record (stored in DB)
export const ExtractionRecordSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid().nullable().optional(),
  batch_id: z.string(),
  section_title: z.string().nullable().optional(),
  requirement_code: z.string().nullable().optional(),
  requirement_text: z.string(),
  item_type: ItemType.default('Requirement'),
  category: z.string().nullable().optional(),
  engineering_discipline: EngineeringDiscipline,
  compliance_level: ComplianceLevel,
  estimated_cost_impact: z.string().nullable().optional(),
  document_owner: z.string().nullable().optional(),
  confidence_score: z.number().default(1.0),
  confidence_reasoning: z.string().nullable().optional(),
  status: ReviewStatus.default('Pending Review'),
  sme_reviewer: z.string().nullable().optional(),
  sme_comments: z.string().nullable().optional(),
  created_at: z.string().optional(),
  reviewed_at: z.string().nullable().optional(),
  document_number: z.string().nullable().optional(),
  document_version: z.string().nullable().optional(),
  document_title: z.string().nullable().optional(),
  document_date: z.string().nullable().optional(),
  document_type: z.string().nullable().optional(),
});
export type ExtractionRecord = z.infer<typeof ExtractionRecordSchema>;

// SME Review Update Schema
export const SMEReviewUpdateSchema = z.object({
  id: z.string().uuid(),
  status: ReviewStatus,
  sme_reviewer: z.string().min(1, 'Reviewer name is required'),
  sme_comments: z.string().nullable().optional(),
  requirement_text: z.string().optional(),
  item_type: ItemType.optional(),
  engineering_discipline: EngineeringDiscipline.optional(),
  compliance_level: ComplianceLevel.optional(),
  estimated_cost_impact: CostImpact.optional(),
  category: z.string().nullable().optional(),
});
export type SMEReviewUpdate = z.infer<typeof SMEReviewUpdateSchema>;

// Search Result Schema
export const SearchResultSchema = z.object({
  extraction_id: z.string().uuid(),
  requirement_code: z.string().nullable().optional(),
  requirement_text: z.string(),
  item_type: z.string().default('Requirement'),
  category: z.string().nullable().optional(),
  engineering_discipline: z.string(),
  compliance_level: z.string(),
  document_owner: z.string().nullable().optional(),
  section_title: z.string().nullable().optional(),
  document_title: z.string().nullable().optional(),
  document_number: z.string().nullable().optional(),
  document_version: z.string().nullable().optional(),
  document_type: z.string().nullable().optional(),
  document_date: z.string().nullable().optional(),
  status: z.string(),
  similarity_score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// Milestone 3: Project Scoping & RFP Schemas
export const ProjectScopeRecordSchema = z.object({
  id: z.string().uuid(),
  project_name: z.string(),
  project_code: z.string().nullable().optional(),
  facility_type: z.string(),
  operating_conditions: z.string().nullable().optional(),
  scope_description: z.string(),
  disciplines: z.array(z.string()).default([]),
  status: z.string().default('Draft'),
  created_by: z.string().default('Engineering Lead'),
  saved_items_count: z.number().default(0).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ProjectScopeRecord = z.infer<typeof ProjectScopeRecordSchema>;

export const ProjectCreateInputSchema = z.object({
  project_name: z.string().min(3, 'Project name must be at least 3 characters'),
  project_code: z.string().nullable().optional(),
  facility_type: z.string().min(1, 'Facility type is required'),
  operating_conditions: z.string().nullable().optional(),
  disciplines: z.array(z.string()).default([]),
  scope_description: z.string().min(10, 'Scope description must be at least 10 characters'),
  status: z.string().default('Draft'),
  created_by: z.string().default('Engineering Lead'),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;

export const ProjectScopeInputSchema = z.object({
  project_id: z.string().uuid().optional(),
  project_name: z.string().min(3, 'Project name must be at least 3 characters'),
  project_code: z.string().nullable().optional(),
  facility_type: z.string().min(1, 'Facility type is required'),
  operating_conditions: z.string().nullable().optional(),
  disciplines: z.array(z.string()).default([]),
  scope_description: z.string().min(10, 'Scope description must be at least 10 characters'),
  target_delivery_format: z.string().optional(),
});
export type ProjectScopeInput = z.infer<typeof ProjectScopeInputSchema>;

export const ScopingRequirementItemSchema = z.object({
  scoping_item_id: z.string().uuid(),
  extraction_id: z.string().uuid().nullable().optional(),
  requirement_code: z.string().nullable().optional(),
  requirement_text: z.string(),
  item_type: ItemType.default('Requirement'),
  engineering_discipline: EngineeringDiscipline,
  compliance_level: ComplianceLevel,
  relevance_score: z.number().default(1.0),
  is_selected: z.boolean().default(true),
  custom_notes: z.string().nullable().optional(),
});
export type ScopingRequirementItem = z.infer<typeof ScopingRequirementItemSchema>;

export const RFPPackageSchema = z.object({
  package_id: z.string().uuid(),
  project_name: z.string(),
  project_code: z.string().nullable().optional(),
  facility_type: z.string(),
  scope_summary: z.string(),
  mandatory_requirements: z.array(ScopingRequirementItemSchema).default([]),
  recommendations: z.array(ScopingRequirementItemSchema).default([]),
  guidelines: z.array(ScopingRequirementItemSchema).default([]),
  created_at: z.string().optional(),
  generated_by: z.string().default('Capital Engineering Copilot Agent'),
});
export type RFPPackage = z.infer<typeof RFPPackageSchema>;

// Milestone 4: Lessons Learned & Document Revision Flags
export const FeedbackEntrySchema = z.object({
  id: z.string().uuid(),
  extraction_id: z.string().uuid().nullable().optional(),
  project_scope_id: z.string().uuid().nullable().optional(),
  original_text: z.string(),
  reviewed_text: z.string().nullable().optional(),
  original_status: z.string(),
  final_status: ReviewStatus,
  reviewer: z.string(),
  reason: z.string(),
  created_at: z.string().optional(),
});
export type FeedbackEntry = z.infer<typeof FeedbackEntrySchema>;

export const FeedbackEntryCreateSchema = z.object({
  extraction_id: z.string().uuid().nullable().optional(),
  project_scope_id: z.string().uuid().nullable().optional(),
  original_text: z.string(),
  reviewed_text: z.string().nullable().optional(),
  original_status: z.string().default('Included in RFP'),
  final_status: ReviewStatus.default('Approved'),
  reviewer: z.string().min(1, 'Reviewer name is required'),
  reason: z.string().min(1, 'Reason is required'),
});
export type FeedbackEntryCreate = z.infer<typeof FeedbackEntryCreateSchema>;

export const DocumentRevisionFlagSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid().nullable().optional(),
  document_title: z.string(),
  document_owner: z.string(),
  flagged_by: z.string(),
  issue_description: z.string(),
  suggested_action: z.string().default('Review and Update Standard'),
  is_resolved: z.boolean().default(false),
  created_at: z.string().optional(),
  resolved_at: z.string().nullable().optional(),
});
export type DocumentRevisionFlag = z.infer<typeof DocumentRevisionFlagSchema>;

// Extraction Progress Tracking Types
export type ExtractionStageId = 1 | 2 | 3 | 'complete' | 'error';

export const ExtractionProgressEventSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal('complete'), z.literal('error')]),
  stageName: z.string(),
  status: z.enum(['running', 'completed', 'error']),
  message: z.string(),
  timestamp: z.string(),
  details: z.object({
    sectionsFound: z.number().optional(),
    sectionTitles: z.array(z.string()).optional(),
    currentSectionIndex: z.number().optional(),
    currentSectionTitle: z.string().optional(),
    totalSections: z.number().optional(),
    rawItemsCount: z.number().optional(),
    finalItemsCount: z.number().optional(),
    model: z.string().optional(),
  }).optional(),
});
export type ExtractionProgressEvent = z.infer<typeof ExtractionProgressEventSchema>;

// Scoping Requirement Grouping & Sorting Utilities
export interface DisciplineGroup<T> {
  discipline: string;
  items: T[];
}

export const ORDERED_DISCIPLINES = [
  'Mechanical',
  'Piping',
  'Electrical',
  'I&C',
  'Process',
  'Civil/Structural',
  'HSE',
  'Telecom',
  'Quality',
  'General',
] as const;

export function sortRequirementItems<T extends { requirement_code?: string | null; engineering_discipline?: string | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const discA = a.engineering_discipline || 'General';
    const discB = b.engineering_discipline || 'General';
    const idxA = ORDERED_DISCIPLINES.indexOf(discA as any);
    const idxB = ORDERED_DISCIPLINES.indexOf(discB as any);
    const orderA = idxA !== -1 ? idxA : 999;
    const orderB = idxB !== -1 ? idxB : 999;

    const discCmp = orderA - orderB || discA.localeCompare(discB);
    if (discCmp !== 0) return discCmp;

    const codeA = a.requirement_code || '';
    const codeB = b.requirement_code || '';
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function groupRequirementsByDiscipline<T extends { requirement_code?: string | null; engineering_discipline?: string | null }>(
  items: T[]
): DisciplineGroup<T>[] {
  const sorted = sortRequirementItems(items);
  const map = new Map<string, T[]>();

  for (const item of sorted) {
    const disc = item.engineering_discipline || 'General';
    if (!map.has(disc)) {
      map.set(disc, []);
    }
    map.get(disc)!.push(item);
  }

  const groups: DisciplineGroup<T>[] = [];
  for (const [discipline, groupItems] of map.entries()) {
    groups.push({ discipline, items: groupItems });
  }

  return groups;
}

