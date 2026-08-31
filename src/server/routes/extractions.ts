import { Hono } from 'hono';
import { db } from '../db/index.js';
import { extractions, documents, feedbackLessons } from '../db/schema.js';
import { eq, and, lt, desc, sql, or } from 'drizzle-orm';

export const extractionsRouter = new Hono();

function formatExtractionRow(r: { extraction: any; document?: any } | any) {
  const ex = r.extraction || r;
  const doc = r.document;
  return {
    id: ex.id,
    document_id: ex.documentId,
    batch_id: ex.batchId,
    section_title: ex.sectionTitle,
    requirement_code: ex.requirementCode,
    requirement_text: ex.requirementText,
    item_type: ex.itemType,
    category: ex.category,
    engineering_discipline: ex.engineeringDiscipline,
    compliance_level: ex.complianceLevel,
    estimated_cost_impact: ex.estimatedCostImpact,
    document_owner: ex.documentOwner || doc?.ownerSme || null,
    confidence_score: ex.confidenceScore,
    confidence_reasoning: ex.confidenceReasoning,
    status: ex.status,
    sme_reviewer: ex.smeReviewer,
    sme_comments: ex.smeComments,
    created_at: ex.createdAt ? new Date(ex.createdAt).toISOString() : null,
    reviewed_at: ex.reviewedAt ? new Date(ex.reviewedAt).toISOString() : null,
    document_number: doc?.documentNumber || null,
    document_version: doc?.version || '1.0',
    document_title: doc?.filename || null,
    document_date: doc?.documentDate || null,
    document_type: doc?.documentType || 'Standard',
  };
}

// Fetch extractions with filters
extractionsRouter.get('/', async (c) => {
  try {
    const status = c.req.query('status');
    const discipline = c.req.query('discipline');
    const reviewer = c.req.query('reviewer') || c.req.query('owner');
    const lowConfidenceOnly = c.req.query('lowConfidenceOnly') === 'true';
    const keyword = c.req.query('keyword')?.toLowerCase();

    let query = db
      .select({
        extraction: extractions,
        document: documents,
      })
      .from(extractions)
      .leftJoin(documents, eq(extractions.documentId, documents.id))
      .$dynamic();

    const conditions = [];

    if (status && status !== 'All') {
      conditions.push(eq(extractions.status, status));
    }
    if (discipline && discipline !== 'All') {
      conditions.push(eq(extractions.engineeringDiscipline, discipline));
    }
    if (reviewer && reviewer !== 'All') {
      conditions.push(
        or(
          eq(extractions.smeReviewer, reviewer),
          eq(extractions.documentOwner, reviewer),
          eq(documents.ownerSme, reviewer)
        )
      );
    }
    if (lowConfidenceOnly) {
      conditions.push(lt(extractions.confidenceScore, 0.85));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(extractions.confidenceScore, desc(extractions.createdAt));

    let filtered = rows;
    if (keyword && keyword.trim()) {
      filtered = rows.filter(
        (r) =>
          r.extraction.requirementText.toLowerCase().includes(keyword) ||
          r.extraction.requirementCode?.toLowerCase().includes(keyword) ||
          r.extraction.category?.toLowerCase().includes(keyword) ||
          r.document?.documentNumber?.toLowerCase().includes(keyword) ||
          r.document?.filename?.toLowerCase().includes(keyword)
      );
    }

    return c.json(filtered.map(formatExtractionRow));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Update single extraction
extractionsRouter.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const [existing] = await db.select().from(extractions).where(eq(extractions.id, id));
    if (!existing) {
      return c.json({ error: 'Extraction not found' }, 404);
    }

    const [updated] = await db
      .update(extractions)
      .set({
        status: body.status || existing.status,
        smeReviewer: body.sme_reviewer || existing.smeReviewer,
        itemType: body.item_type || existing.itemType,
        engineeringDiscipline: body.engineering_discipline || existing.engineeringDiscipline,
        complianceLevel: body.compliance_level || existing.complianceLevel,
        estimatedCostImpact: body.estimated_cost_impact || existing.estimatedCostImpact,
        category: body.category !== undefined ? body.category : existing.category,
        requirementText: body.requirement_text || existing.requirementText,
        smeComments: body.sme_comments !== undefined ? body.sme_comments : existing.smeComments,
        reviewedAt: new Date(),
      })
      .where(eq(extractions.id, id))
      .returning();

    // Closed-loop feedback logging if edited or rejected
    const isTextChanged = body.requirement_text && body.requirement_text.trim() !== existing.requirementText.trim();
    const isRejected = body.status === 'Rejected';
    const isEdited = body.status === 'Edited' || isTextChanged;

    if (isRejected || isEdited) {
      await db.insert(feedbackLessons).values({
        extractionId: existing.id,
        originalText: existing.requirementText,
        reviewedText: isTextChanged ? body.requirement_text : null,
        originalStatus: existing.status || 'Pending Review',
        finalStatus: body.status || 'Edited',
        reviewer: body.sme_reviewer || 'SME Reviewer',
        reason: body.sme_comments || (isRejected ? 'Rejected by SME during review' : 'Edited specification clause'),
      });
    }

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Bulk update extractions
extractionsRouter.post('/bulk', async (c) => {
  try {
    const { items, reviewer, defaultStatus } = await c.req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ error: 'No items provided' }, 400);
    }

    let updatedCount = 0;
    for (const item of items) {
      const [existing] = await db.select().from(extractions).where(eq(extractions.id, item.id));
      if (existing) {
        const targetStatus = item.status || defaultStatus || 'Approved';
        await db
          .update(extractions)
          .set({
            status: targetStatus,
            smeReviewer: reviewer || 'SME Lead',
            itemType: item.item_type || existing.itemType,
            engineeringDiscipline: item.engineering_discipline || existing.engineeringDiscipline,
            complianceLevel: item.compliance_level || existing.complianceLevel,
            estimatedCostImpact: item.estimated_cost_impact || existing.estimatedCostImpact,
            requirementText: item.requirement_text || existing.requirementText,
            smeComments: item.sme_comments !== undefined ? item.sme_comments : existing.smeComments,
            reviewedAt: new Date(),
          })
          .where(eq(extractions.id, item.id));

        if (targetStatus === 'Rejected') {
          await db.insert(feedbackLessons).values({
            extractionId: existing.id,
            originalText: existing.requirementText,
            reviewedText: null,
            originalStatus: existing.status || 'Pending Review',
            finalStatus: 'Rejected',
            reviewer: reviewer || 'SME Lead',
            reason: item.sme_comments || 'Bulk rejected by SME',
          });
        }
        updatedCount++;
      }
    }

    return c.json({ success: true, updatedCount });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
