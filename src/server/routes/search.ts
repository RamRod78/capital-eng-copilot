import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { getEmbedding } from '../services/gemini.js';

export const searchRouter = new Hono();

searchRouter.post('/', async (c) => {
  try {
    const { query, top_k, discipline, item_type } = await c.req.json();
    if (!query || !query.trim()) {
      return c.json({ error: 'Search query is required' }, 400);
    }

    const vector = await getEmbedding(query);
    const limit = top_k || 8;

    const client = await pool.connect();
    try {
      if (vector && vector.length === 768) {
        let sqlQuery = `
          SELECT 
            e.id AS extraction_id,
            e.requirement_code,
            e.requirement_text,
            COALESCE(e.item_type, 'Requirement') AS item_type,
            e.category,
            e.engineering_discipline,
            e.compliance_level,
            COALESCE(e.document_owner, d.owner_sme, 'Engineering Lead') AS document_owner,
            e.section_title,
            d.filename AS document_title,
            d.document_number,
            d.version AS document_version,
            d.document_type,
            d.document_date,
            e.status,
            1 - (re.embedding <=> $1) AS similarity_score
          FROM requirement_embeddings re
          JOIN extractions e ON e.id = re.extraction_id
          LEFT JOIN documents d ON d.id = e.document_id
          WHERE 1=1
        `;
        const params: any[] = [`[${vector.join(',')}]`];

        if (discipline && discipline !== 'All') {
          params.push(discipline);
          sqlQuery += ` AND e.engineering_discipline = $${params.length}`;
        }

        if (item_type && item_type !== 'All') {
          params.push(item_type);
          sqlQuery += ` AND e.item_type = $${params.length}`;
        }

        params.push(limit);
        sqlQuery += ` ORDER BY re.embedding <=> $1 LIMIT $${params.length};`;

        const res = await client.query(sqlQuery, params);
        return c.json(res.rows);
      } else {
        // Fallback text match
        let sqlQuery = `
          SELECT 
            e.id AS extraction_id,
            e.requirement_code,
            e.requirement_text,
            COALESCE(e.item_type, 'Requirement') AS item_type,
            e.category,
            e.engineering_discipline,
            e.compliance_level,
            COALESCE(e.document_owner, d.owner_sme, 'Engineering Lead') AS document_owner,
            e.section_title,
            d.filename AS document_title,
            d.document_number,
            d.version AS document_version,
            d.document_type,
            d.document_date,
            e.status,
            1.0 AS similarity_score
          FROM extractions e
          LEFT JOIN documents d ON d.id = e.document_id
          WHERE e.requirement_text ILIKE $1
          LIMIT $2;
        `;
        const res = await client.query(sqlQuery, [`%${query}%`, limit]);
        return c.json(res.rows);
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Search error:', err);
    return c.json({ error: err.message }, 500);
  }
});
