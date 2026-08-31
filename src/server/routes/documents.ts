import { Hono } from 'hono';
import { pool, db } from '../db/index.js';
import { documents, extractions } from '../db/schema.js';
import { eq, desc, asc, and, or, sql } from 'drizzle-orm';

export const documentsRouter = new Hono();

// List documents with pagination, search, filter, and requirement counts
documentsRouter.get('/', async (c) => {
  const client = await pool.connect();
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || c.req.query('limit') || '10', 10)));
    const offset = (page - 1) * pageSize;
    const keyword = c.req.query('keyword') || c.req.query('search') || '';
    const documentType = c.req.query('documentType') || '';
    const owner = c.req.query('owner') || '';
    const sortBy = c.req.query('sortBy') || 'createdAt';
    const sortOrder = (c.req.query('sortOrder') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (keyword.trim()) {
      params.push(`%${keyword.trim().toLowerCase()}%`);
      conditions.push(`(
        LOWER(d.filename) LIKE $${params.length} OR
        LOWER(COALESCE(d.document_number, '')) LIKE $${params.length} OR
        LOWER(COALESCE(d.owner_sme, '')) LIKE $${params.length} OR
        LOWER(COALESCE(d.document_type, '')) LIKE $${params.length}
      )`);
    }

    if (documentType && documentType !== 'All') {
      params.push(documentType);
      conditions.push(`d.document_type = $${params.length}`);
    }

    if (owner && owner !== 'All') {
      params.push(owner);
      conditions.push(`d.owner_sme = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // Count total matching documents
    const countSql = `SELECT COUNT(DISTINCT d.id)::int AS total FROM documents d WHERE ${whereClause};`;
    const countResult = await client.query(countSql, params);
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    // Determine safe order by column
    let orderColumn = 'd.created_at';
    if (sortBy === 'documentNumber') orderColumn = 'd.document_number';
    else if (sortBy === 'filename' || sortBy === 'documentTitle') orderColumn = 'd.filename';
    else if (sortBy === 'version') orderColumn = 'd.version';
    else if (sortBy === 'documentDate') orderColumn = 'd.document_date';
    else if (sortBy === 'requirementCount' || sortBy === 'itemCount') orderColumn = 'requirement_count';

    // Fetch paginated documents with aggregated requirement counts & status breakdowns
    const listParams = [...params, pageSize, offset];
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;

    const listSql = `
      SELECT 
        d.id,
        d.filename,
        d.document_number,
        d.document_date,
        d.document_type,
        d.owner_sme,
        d.version,
        d.created_at,
        d.updated_at,
        COUNT(e.id)::int AS requirement_count,
        COUNT(CASE WHEN e.status = 'Approved' THEN 1 END)::int AS approved_count,
        COUNT(CASE WHEN e.status = 'Pending Review' OR e.status IS NULL THEN 1 END)::int AS pending_count,
        COUNT(CASE WHEN e.status = 'Edited' THEN 1 END)::int AS edited_count,
        COUNT(CASE WHEN e.status = 'Rejected' THEN 1 END)::int AS rejected_count
      FROM documents d
      LEFT JOIN extractions e ON e.document_id = d.id
      WHERE ${whereClause}
      GROUP BY d.id
      ORDER BY ${orderColumn} ${sortOrder} NULLS LAST, d.created_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex};
    `;

    const result = await client.query(listSql, listParams);

    const items = result.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      document_number: row.document_number,
      document_date: row.document_date,
      document_type: row.document_type || 'Standard',
      owner_sme: row.owner_sme || 'Engineering Lead',
      version: row.version || '1.0',
      requirement_count: parseInt(row.requirement_count, 10) || 0,
      status_breakdown: {
        approved: parseInt(row.approved_count, 10) || 0,
        pending: parseInt(row.pending_count, 10) || 0,
        edited: parseInt(row.edited_count, 10) || 0,
        rejected: parseInt(row.rejected_count, 10) || 0,
      },
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    }));

    return c.json({
      items,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: any) {
    console.error('Error fetching documents list:', err);
    return c.json({ error: err.message || 'Failed to fetch documents' }, 500);
  } finally {
    client.release();
  }
});

// Get single document details
documentsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) {
      return c.json({ error: 'Document not found' }, 404);
    }
    return c.json(doc);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get extracted requirements for a specific document with status/discipline/keyword filters
documentsRouter.get('/:id/requirements', async (c) => {
  try {
    const id = c.req.param('id');
    const status = c.req.query('status');
    const discipline = c.req.query('discipline');
    const keyword = c.req.query('keyword')?.toLowerCase();

    // Verify document exists
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) {
      return c.json({ error: 'Document not found' }, 404);
    }

    let query = db
      .select()
      .from(extractions)
      .where(eq(extractions.documentId, id))
      .$dynamic();

    const conditions = [eq(extractions.documentId, id)];

    if (status && status !== 'All') {
      conditions.push(eq(extractions.status, status));
    }
    if (discipline && discipline !== 'All') {
      conditions.push(eq(extractions.engineeringDiscipline, discipline));
    }

    query = query.where(and(...conditions));
    const rows = await query.orderBy(asc(extractions.requirementCode), desc(extractions.createdAt));

    let filtered = rows;
    if (keyword && keyword.trim()) {
      filtered = rows.filter(
        (r) =>
          r.requirementText.toLowerCase().includes(keyword) ||
          r.requirementCode?.toLowerCase().includes(keyword) ||
          r.sectionTitle?.toLowerCase().includes(keyword) ||
          r.category?.toLowerCase().includes(keyword)
      );
    }

    const formatted = filtered.map((ex) => ({
      id: ex.id,
      document_id: ex.documentId,
      batch_id: ex.batchId,
      section_title: ex.sectionTitle,
      requirement_code: ex.requirementCode,
      requirement_text: ex.requirementText,
      item_type: ex.itemType || 'Requirement',
      category: ex.category,
      engineering_discipline: ex.engineeringDiscipline,
      compliance_level: ex.complianceLevel,
      estimated_cost_impact: ex.estimatedCostImpact,
      document_owner: ex.documentOwner || doc.ownerSme,
      confidence_score: ex.confidenceScore,
      confidence_reasoning: ex.confidenceReasoning,
      status: ex.status || 'Pending Review',
      sme_reviewer: ex.smeReviewer,
      sme_comments: ex.smeComments,
      created_at: ex.createdAt ? new Date(ex.createdAt).toISOString() : null,
      reviewed_at: ex.reviewedAt ? new Date(ex.reviewedAt).toISOString() : null,
      document_number: doc.documentNumber || null,
      document_version: doc.version || '1.0',
      document_title: doc.filename,
      document_date: doc.documentDate || null,
    }));

    return c.json({
      document: {
        id: doc.id,
        filename: doc.filename,
        document_number: doc.documentNumber,
        document_date: doc.documentDate,
        document_type: doc.documentType,
        owner_sme: doc.ownerSme,
        version: doc.version,
      },
      requirements: formatted,
      total: formatted.length,
    });
  } catch (err: any) {
    console.error('Error fetching document requirements:', err);
    return c.json({ error: err.message || 'Failed to fetch document requirements' }, 500);
  }
});
