import { Hono } from 'hono';
import { db } from '../db/index.js';
import { feedbackLessons, documentRevisionFlags } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

export const feedbackRouter = new Hono();

// Get feedback lessons log
feedbackRouter.get('/lessons', async (c) => {
  try {
    const lessons = await db
      .select()
      .from(feedbackLessons)
      .orderBy(desc(feedbackLessons.createdAt));
    return c.json(lessons);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create feedback lesson (e.g. deletion reason or added requirement rationale during scoping)
feedbackRouter.post('/lessons', async (c) => {
  try {
    const body = await c.req.json();
    const {
      extraction_id,
      project_scope_id,
      original_text,
      reviewed_text,
      original_status,
      final_status,
      reviewer,
      reason,
    } = body;

    if (!original_text || !reason) {
      return c.json({ error: 'Original text and reasoning are required' }, 400);
    }

    const [lesson] = await db
      .insert(feedbackLessons)
      .values({
        extractionId: extraction_id || null,
        projectScopeId: project_scope_id || null,
        originalText: original_text,
        reviewedText: reviewed_text || null,
        originalStatus: original_status || 'Included in Scope',
        finalStatus: final_status || 'Approved',
        reviewer: reviewer || 'SME Reviewer',
        reason: reason,
      })
      .returning();

    return c.json(lesson, 201);
  } catch (err: any) {
    console.error('Error creating feedback lesson:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Get document revision flags
feedbackRouter.get('/flags', async (c) => {
  try {
    const showResolved = c.req.query('showResolved') === 'true';
    const owner = c.req.query('owner');

    let query = db.select().from(documentRevisionFlags).$dynamic();
    const conditions = [];

    if (!showResolved) {
      conditions.push(eq(documentRevisionFlags.isResolved, false));
    }
    if (owner && owner !== 'All') {
      conditions.push(eq(documentRevisionFlags.documentOwner, owner));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const flags = await query.orderBy(desc(documentRevisionFlags.createdAt));
    return c.json(flags);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create document revision flag
feedbackRouter.post('/flags', async (c) => {
  try {
    const body = await c.req.json();
    const [flag] = await db
      .insert(documentRevisionFlags)
      .values({
        documentId: body.document_id || null,
        documentTitle: body.document_title,
        documentOwner: body.document_owner || 'General Engineering Lead',
        flaggedBy: body.flagged_by || 'SME Reviewer',
        issueDescription: body.issue_description,
        suggestedAction: body.suggested_action || 'Review and Update Standard',
      })
      .returning();

    return c.json(flag);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Resolve document revision flag
feedbackRouter.patch('/flags/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    const [updated] = await db
      .update(documentRevisionFlags)
      .set({
        isResolved: true,
        resolvedAt: new Date(),
      })
      .where(eq(documentRevisionFlags.id, id))
      .returning();

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
