import { Hono } from 'hono';
import { db, pool } from '../db/index.js';
import { documents, extractions, projectScopes, documentRevisionFlags } from '../db/schema.js';
import { count, eq, and, lt } from 'drizzle-orm';

export const statsRouter = new Hono();

statsRouter.get('/', async (c) => {
  try {
    const [totalDocsResult] = await db.select({ value: count() }).from(documents);
    const [totalItemsResult] = await db.select({ value: count() }).from(extractions);
    const [pendingReviewsResult] = await db
      .select({ value: count() })
      .from(extractions)
      .where(eq(extractions.status, 'Pending Review'));
    const [lowConfidenceResult] = await db
      .select({ value: count() })
      .from(extractions)
      .where(
        and(
          eq(extractions.status, 'Pending Review'),
          lt(extractions.confidenceScore, 0.85)
        )
      );
    const [approvedItemsResult] = await db
      .select({ value: count() })
      .from(extractions)
      .where(eq(extractions.status, 'Approved'));
    const [projectScopesResult] = await db.select({ value: count() }).from(projectScopes);
    const [activeFlagsResult] = await db
      .select({ value: count() })
      .from(documentRevisionFlags)
      .where(eq(documentRevisionFlags.isResolved, false));

    return c.json({
      totalDocs: Number(totalDocsResult?.value || 0),
      totalItems: Number(totalItemsResult?.value || 0),
      pendingReviews: Number(pendingReviewsResult?.value || 0),
      lowConfidenceItems: Number(lowConfidenceResult?.value || 0),
      approvedItems: Number(approvedItemsResult?.value || 0),
      projectScopes: Number(projectScopesResult?.value || 0),
      activeFlags: Number(activeFlagsResult?.value || 0),
      dbConnected: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (error: any) {
    return c.json({
      totalDocs: 0,
      totalItems: 0,
      pendingReviews: 0,
      lowConfidenceItems: 0,
      approvedItems: 0,
      projectScopes: 0,
      activeFlags: 0,
      dbConnected: false,
      error: error.message,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  }
});
