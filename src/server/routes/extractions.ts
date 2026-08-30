import { Hono } from 'hono';
import { db } from '../db/index.js';
import { extractions, feedbackLessons } from '../db/schema.js';
import { eq, and, lt, desc, sql } from 'drizzle-orm';

export const extractionsRouter = new Hono();

// Fetch extractions with filters
extractionsRouter.get('/', async (c) => {
  try {
    const status = c.req.query('status');
    const discipline = c.req.query('discipline');
    const owner = c.req.query('owner');
    const lowConfidenceOnly = c.req.query('lowConfidenceOnly') === 'true';
    const keyword = c.req.query('keyword')?.toLowerCase();

    let query = db.select().from(extractions).$dynamic();
    const conditions = [];

    if (status && status !== 'All') {
      conditions.push(eq(extractions.status, status));
    }
    if (discipline && discipline !== 'All') {
      conditions.push(eq(extractions.engineeringDiscipline, discipline));
    }
    if (owner && owner !== 'All') {
      conditions.push(eq(extractions.documentOwner, owner));
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
          r.requirementText.toLowerCase().includes(keyword) ||
          r.requirementCode?.toLowerCase().includes(keyword) ||
          r.category?.toLowerCase().includes(keyword)
      );
    }

    return c.json(filtered);
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
