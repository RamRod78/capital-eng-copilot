import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { getEmbedding } from '../services/gemini.js';

export const adminRouter = new Hono();

// Get record counts across all database tables
adminRouter.get('/counts', async (c) => {
  const client = await pool.connect();
  try {
    const docs = await client.query('SELECT count(*)::int as count FROM documents;');
    const extractions = await client.query('SELECT count(*)::int as count FROM extractions;');
    const embeddings = await client.query('SELECT count(*)::int as count FROM requirement_embeddings;');
    const scopes = await client.query('SELECT count(*)::int as count FROM project_scopes;');
    const scopingItems = await client.query('SELECT count(*)::int as count FROM scoping_items;');
    const lessons = await client.query('SELECT count(*)::int as count FROM feedback_lessons;');
    const flags = await client.query('SELECT count(*)::int as count FROM document_revision_flags;');
    const kgNodes = await client.query('SELECT count(*)::int as count FROM kg_nodes;');
    const kgEdges = await client.query('SELECT count(*)::int as count FROM kg_edges;');

    return c.json({
      documents: docs.rows[0]?.count || 0,
      extractions: extractions.rows[0]?.count || 0,
      requirement_embeddings: embeddings.rows[0]?.count || 0,
      project_scopes: scopes.rows[0]?.count || 0,
      projects: scopes.rows[0]?.count || 0,
      scoping_items: scopingItems.rows[0]?.count || 0,
      feedback_lessons: lessons.rows[0]?.count || 0,
      document_revision_flags: flags.rows[0]?.count || 0,
      kg_nodes: kgNodes.rows[0]?.count || 0,
      kg_edges: kgEdges.rows[0]?.count || 0,
      total:
        (docs.rows[0]?.count || 0) +
        (extractions.rows[0]?.count || 0) +
        (embeddings.rows[0]?.count || 0) +
        (scopes.rows[0]?.count || 0) +
        (scopingItems.rows[0]?.count || 0) +
        (lessons.rows[0]?.count || 0) +
        (flags.rows[0]?.count || 0) +
        (kgNodes.rows[0]?.count || 0) +
        (kgEdges.rows[0]?.count || 0),
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to fetch table counts' }, 500);
  } finally {
    client.release();
  }
});

// Purge database records endpoint
adminRouter.post('/purge', async (c) => {
  const { target } = await c.req.json();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (target === 'all') {
      await client.query(`
        TRUNCATE TABLE 
          kg_edges,
          kg_nodes,
          requirement_embeddings, 
          scoping_items, 
          feedback_lessons, 
          document_revision_flags, 
          extractions, 
          project_scopes, 
          documents 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'All database records (including Knowledge Graph) successfully purged.' });
    }

    if (target === 'extractions') {
      await client.query(`
        TRUNCATE TABLE 
          kg_edges,
          kg_nodes,
          requirement_embeddings, 
          extractions, 
          documents 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Engineering specifications, extractions, and Knowledge Graph purged.' });
    }

    if (target === 'scopes' || target === 'projects') {
      await client.query(`
        TRUNCATE TABLE 
          scoping_items, 
          project_scopes 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Projects, project scopes, and RFP packages purged.' });
    }

    if (target === 'scoping_items') {
      await client.query(`
        TRUNCATE TABLE 
          scoping_items 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Project scoping items and RFP line items purged (project definitions preserved).' });
    }

    if (target === 'feedback') {
      await client.query(`
        TRUNCATE TABLE 
          feedback_lessons, 
          document_revision_flags 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Feedback lessons learned and revision flags purged.' });
    }

    if (target === 'kg' || target === 'knowledge_graph') {
      await client.query(`
        TRUNCATE TABLE 
          kg_edges, 
          kg_nodes 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Knowledge Graph canonical nodes and relationship edges purged.' });
    }

    if (target === 'kg_edges') {
      await client.query(`
        TRUNCATE TABLE 
          kg_edges 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Knowledge Graph relationship edges purged (canonical nodes preserved).' });
    }

    await client.query('ROLLBACK');
    return c.json({ error: `Invalid purge target: "${target}"` }, 400);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error during database purge:', err);
    return c.json({ error: err.message || 'Purge operation failed' }, 500);
  } finally {
    client.release();
  }
});

// Re-index missing pgvector embeddings for extracted requirements
adminRouter.post('/reindex-embeddings', async (c) => {
  const client = await pool.connect();
  try {
    const unindexed = await client.query(`
      SELECT e.id, e.requirement_text 
      FROM extractions e
      LEFT JOIN requirement_embeddings re ON e.id = re.extraction_id
      WHERE re.id IS NULL AND e.requirement_text IS NOT NULL AND TRIM(e.requirement_text) != '';
    `);

    let indexedCount = 0;
    for (const row of unindexed.rows) {
      try {
        const vector = await getEmbedding(row.requirement_text);
        if (vector && vector.length === 768) {
          await client.query(
            `INSERT INTO requirement_embeddings (extraction_id, chunk_text, embedding) VALUES ($1, $2, $3);`,
            [row.id, row.requirement_text, `[${vector.join(',')}]`]
          );
          indexedCount++;
        }
      } catch (embErr) {
        console.error(`Failed to generate embedding for extraction ${row.id}:`, embErr);
      }
    }

    return c.json({
      success: true,
      unindexedCount: unindexed.rows.length,
      indexedCount,
      message: `Successfully generated ${indexedCount} of ${unindexed.rows.length} vector embeddings.`,
    });
  } catch (err: any) {
    console.error('Re-indexing embeddings failed:', err);
    return c.json({ error: err.message || 'Failed to re-index embeddings' }, 500);
  } finally {
    client.release();
  }
});

