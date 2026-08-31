import { Hono } from 'hono';
import { pool } from '../db/index.js';

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

    return c.json({
      documents: docs.rows[0]?.count || 0,
      extractions: extractions.rows[0]?.count || 0,
      requirement_embeddings: embeddings.rows[0]?.count || 0,
      project_scopes: scopes.rows[0]?.count || 0,
      projects: scopes.rows[0]?.count || 0,
      scoping_items: scopingItems.rows[0]?.count || 0,
      feedback_lessons: lessons.rows[0]?.count || 0,
      document_revision_flags: flags.rows[0]?.count || 0,
      total:
        (docs.rows[0]?.count || 0) +
        (extractions.rows[0]?.count || 0) +
        (embeddings.rows[0]?.count || 0) +
        (scopes.rows[0]?.count || 0) +
        (scopingItems.rows[0]?.count || 0) +
        (lessons.rows[0]?.count || 0) +
        (flags.rows[0]?.count || 0),
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
      return c.json({ success: true, message: 'All database records successfully purged.' });
    }

    if (target === 'extractions') {
      await client.query(`
        TRUNCATE TABLE 
          requirement_embeddings, 
          extractions, 
          documents 
        CASCADE;
      `);
      await client.query('COMMIT');
      return c.json({ success: true, message: 'Engineering specifications, extractions, and embeddings purged.' });
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
