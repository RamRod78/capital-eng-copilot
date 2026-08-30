import { z } from 'zod';

export const ReviewStatus = z.enum([
  'Pending Review',
  'Approved',
  'Rejected',
  'Edited',
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const ItemType = z.enum([
  'Requirement',     // Mandatory (shall/must)
  'Recommendation',  // Preferred (should)
  'Guideline',       // Optional (may)
]);
export type ItemType = z.infer<typeof ItemType>;

export const ComplianceLevel = z.enum([
  'Mandatory',
  'Recommended',
  'Optional',
  'Informational',
]);
export type ComplianceLevel = z.infer<typeof ComplianceLevel>;

export const EngineeringDiscipline = z.enum([
  'Mechanical',
  'Piping',
  'Electrical',
  'I&C',
  'Civil/Structural',
  'Process',
  'HSE',
  'Quality',
  'General',
]);
export type EngineeringDiscipline = z.infer<typeof EngineeringDiscipline>;

export const CostImpact = z.enum([
  'High',
  'Medium',
  'Low',
  'Negligible',
  'TBD',
]);
export type CostImpact = z.infer<typeof CostImpact>;

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
  document_owner: z.string().default('General Engineering SME'),
  executive_summary: z.string().nullable().optional(),
  identified_disciplines: z.array(EngineeringDiscipline).default([]),
  items: z.array(ExtractionItemSchema).default([]),
});
export type ExtractionBatch = z.infer<typeof ExtractionBatchSchema>;

// Document Record Schema
export const DocumentRecordSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
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
  status: z.string(),
  similarity_score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// Milestone 3: Project Scoping & RFP Schemas
export const ProjectScopeInputSchema = z.object({
  project_name: z.string().min(3, 'Project name must be at least 3 characters'),
  project_code: z.string().nullable().optional(),
  facility_type: z.string().min(1, 'Facility type is required'),
  operating_conditions: z.string().nullable().optional(),
  disciplines: z.array(EngineeringDiscipline).default([]),
  scope_description: z.string().min(10, 'Scope description must be at least 10 characters'),
  target_delivery_format: z.string().default('Vendor RFP Document'),
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
