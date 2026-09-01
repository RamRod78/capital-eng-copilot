import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  boolean,
  customType,
} from 'drizzle-orm/pg-core';

// Custom pgvector type for 768-dimension dense embeddings
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(val: number[]) {
    return `[${val.join(',')}]`;
  },
  fromDriver(val: unknown): number[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(Number);
    if (typeof val === 'string') {
      return val
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(Number);
    }
    return [];
  },
});

// Table: documents
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  filename: varchar('filename', { length: 255 }).notNull(),
  documentNumber: varchar('document_number', { length: 100 }),
  documentDate: varchar('document_date', { length: 50 }),
  documentType: varchar('document_type', { length: 50 }).notNull().default('Standard'),
  ownerSme: varchar('owner_sme', { length: 100 }).default('Engineering Lead'),
  version: varchar('version', { length: 50 }).default('1.0'),
  rawContent: text('raw_content').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Table: extractions
export const extractions = pgTable('extractions', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
  batchId: varchar('batch_id', { length: 100 }).notNull(),
  sectionTitle: varchar('section_title', { length: 255 }),
  requirementCode: varchar('requirement_code', { length: 100 }),
  requirementText: text('requirement_text').notNull(),
  itemType: varchar('item_type', { length: 50 }).default('Requirement'),
  category: varchar('category', { length: 100 }),
  engineeringDiscipline: varchar('engineering_discipline', { length: 100 }).notNull(),
  complianceLevel: varchar('compliance_level', { length: 50 }).default('Mandatory'),
  estimatedCostImpact: varchar('estimated_cost_impact', { length: 50 }),
  documentOwner: varchar('document_owner', { length: 100 }),
  confidenceScore: doublePrecision('confidence_score').default(1.0),
  confidenceReasoning: text('confidence_reasoning'),
  status: varchar('status', { length: 50 }).default('Pending Review'),
  smeReviewer: varchar('sme_reviewer', { length: 100 }),
  smeComments: text('sme_comments'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
});

// Table: requirement_embeddings
export const requirementEmbeddings = pgTable('requirement_embeddings', {
  id: uuid('id').defaultRandom().primaryKey(),
  extractionId: uuid('extraction_id').references(() => extractions.id, { onDelete: 'cascade' }),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Table: project_scopes
export const projectScopes = pgTable('project_scopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectName: varchar('project_name', { length: 255 }).notNull(),
  projectCode: varchar('project_code', { length: 100 }),
  facilityType: varchar('facility_type', { length: 100 }).notNull(),
  operatingConditions: text('operating_conditions'),
  scopeDescription: text('scope_description').notNull(),
  disciplines: jsonb('disciplines').default([]),
  status: varchar('status', { length: 50 }).default('Draft'),
  createdBy: varchar('created_by', { length: 100 }).default('Engineering Lead'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Table: scoping_items
export const scopingItems = pgTable('scoping_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectScopeId: uuid('project_scope_id').references(() => projectScopes.id, { onDelete: 'cascade' }),
  extractionId: uuid('extraction_id').references(() => extractions.id, { onDelete: 'set null' }),
  requirementCode: varchar('requirement_code', { length: 100 }),
  requirementText: text('requirement_text').notNull(),
  itemType: varchar('item_type', { length: 50 }).default('Requirement'),
  engineeringDiscipline: varchar('engineering_discipline', { length: 100 }).notNull(),
  complianceLevel: varchar('compliance_level', { length: 50 }).default('Mandatory'),
  relevanceScore: doublePrecision('relevance_score').default(1.0),
  isSelected: boolean('is_selected').default(true),
  customNotes: text('custom_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Table: feedback_lessons
export const feedbackLessons = pgTable('feedback_lessons', {
  id: uuid('id').defaultRandom().primaryKey(),
  extractionId: uuid('extraction_id').references(() => extractions.id, { onDelete: 'set null' }),
  projectScopeId: uuid('project_scope_id').references(() => projectScopes.id, { onDelete: 'set null' }),
  originalText: text('original_text').notNull(),
  reviewedText: text('reviewed_text'),
  originalStatus: varchar('original_status', { length: 50 }),
  finalStatus: varchar('final_status', { length: 50 }).notNull(),
  reviewer: varchar('reviewer', { length: 100 }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Table: document_revision_flags
export const documentRevisionFlags = pgTable('document_revision_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  documentTitle: varchar('document_title', { length: 255 }).notNull(),
  documentOwner: varchar('document_owner', { length: 100 }).notNull(),
  flaggedBy: varchar('flagged_by', { length: 100 }).notNull(),
  issueDescription: text('issue_description').notNull(),
  suggestedAction: varchar('suggested_action', { length: 255 }).default('Review and Update Standard'),
  isResolved: boolean('is_resolved').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// Table: kg_nodes (Knowledge Graph Nodes / Entities)
export const kgNodes = pgTable('kg_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  description: text('description'),
  discipline: varchar('discipline', { length: 100 }),
  sourceDocumentId: uuid('source_document_id').references(() => documents.id, { onDelete: 'set null' }),
  extractionId: uuid('extraction_id').references(() => extractions.id, { onDelete: 'set null' }),
  properties: jsonb('properties').default({}),
  embedding: vector('embedding'),
  degreeCount: integer('degree_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Table: kg_edges (Knowledge Graph Relationships)
export const kgEdges = pgTable('kg_edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceNodeId: uuid('source_node_id').references(() => kgNodes.id, { onDelete: 'cascade' }).notNull(),
  targetNodeId: uuid('target_node_id').references(() => kgNodes.id, { onDelete: 'cascade' }).notNull(),
  relationType: varchar('relation_type', { length: 100 }).notNull(),
  weight: doublePrecision('weight').default(1.0),
  contextText: text('context_text'),
  sourceDocumentId: uuid('source_document_id').references(() => documents.id, { onDelete: 'set null' }),
  extractionId: uuid('extraction_id').references(() => extractions.id, { onDelete: 'set null' }),
  properties: jsonb('properties').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

