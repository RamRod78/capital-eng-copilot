import { Hono } from 'hono';
import { db, pool } from '../db/index.js';
import { projectScopes, scopingItems } from '../db/schema.js';
import { getEmbedding } from '../services/gemini.js';
import { randomUUID } from 'crypto';

export const scopingRouter = new Hono();

// Match requirements for scope
scopingRouter.post('/match', async (c) => {
  try {
    const scopeInput = await c.req.json();
    const { project_name, project_code, facility_type, operating_conditions, disciplines, scope_description, top_k } = scopeInput;

    const queryText = `${facility_type} ${scope_description} ${operating_conditions || ''}`;
    const queryVector = await getEmbedding(queryText);
    const limit = top_k || 15;

    const client = await pool.connect();
    let rows: any[] = [];
    try {
      if (queryVector && queryVector.length === 768) {
        let sqlQuery = `
          SELECT 
            e.id,
            e.requirement_code,
            e.requirement_text,
            COALESCE(e.item_type, 'Requirement') AS item_type,
            e.category,
            e.engineering_discipline,
            e.compliance_level,
            e.document_owner,
            e.status,
            1 - (re.embedding <=> $1) AS similarity
          FROM requirement_embeddings re
          JOIN extractions e ON e.id = re.extraction_id
          WHERE 1=1
        `;
        const params: any[] = [`[${queryVector.join(',')}]`];

        if (Array.isArray(disciplines) && disciplines.length > 0) {
          sqlQuery += ` AND e.engineering_discipline = ANY($2)`;
          params.push(disciplines);
        }

        sqlQuery += ` ORDER BY re.embedding <=> $1 LIMIT $${params.length + 1};`;
        params.push(limit * 2);

        const res = await client.query(sqlQuery, params);
        rows = res.rows;
      } else {
        // Fallback text query
        const res = await client.query(
          `SELECT id, requirement_code, requirement_text, COALESCE(item_type, 'Requirement') AS item_type,
                  category, engineering_discipline, compliance_level, document_owner, status, 1.0 AS similarity
           FROM extractions LIMIT $1;`,
          [limit]
        );
        rows = res.rows;
      }
    } finally {
      client.release();
    }

    // Partition results into Mandatory, Recommendations, Guidelines
    const seenTexts = new Set<string>();
    const mandatory: any[] = [];
    const recommendations: any[] = [];
    const guidelines: any[] = [];

    for (const r of rows) {
      const normalized = r.requirement_text.trim().toLowerCase();
      if (seenTexts.has(normalized)) continue;
      seenTexts.add(normalized);

      const item = {
        scoping_item_id: randomUUID(),
        extraction_id: r.id,
        requirement_code: r.requirement_code,
        requirement_text: r.requirement_text,
        item_type: r.item_type || 'Requirement',
        engineering_discipline: r.engineering_discipline,
        compliance_level: r.compliance_level || 'Mandatory',
        relevance_score: Number(r.similarity || 1.0),
        is_selected: true,
        custom_notes: '',
      };

      if (item.item_type === 'Requirement' || item.compliance_level === 'Mandatory') {
        mandatory.push(item);
      } else if (item.item_type === 'Recommendation' || item.compliance_level === 'Recommended') {
        recommendations.push(item);
      } else {
        guidelines.push(item);
      }
    }

    const packageId = randomUUID();
    return c.json({
      package_id: packageId,
      project_name,
      project_code,
      facility_type,
      scope_summary: scope_description,
      mandatory_requirements: mandatory,
      recommendations,
      guidelines,
      created_at: new Date().toISOString(),
      generated_by: 'Capital Engineering Copilot Agent',
    });
  } catch (err: any) {
    console.error('Error matching scope:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Save curated RFP Package to database
scopingRouter.post('/save', async (c) => {
  try {
    const pkg = await c.req.json();
    const { package_id, project_name, project_code, facility_type, scope_summary, mandatory_requirements, recommendations, guidelines } = pkg;

    const [scopeRecord] = await db
      .insert(projectScopes)
      .values({
        id: package_id || randomUUID(),
        projectName: project_name,
        projectCode: project_code || null,
        facilityType: facility_type,
        scopeDescription: scope_summary,
        status: 'Approved',
      })
      .returning();

    const allItems = [
      ...(mandatory_requirements || []),
      ...(recommendations || []),
      ...(guidelines || []),
    ];

    for (const it of allItems) {
      await db.insert(scopingItems).values({
        id: it.scoping_item_id || randomUUID(),
        projectScopeId: scopeRecord.id,
        extractionId: it.extraction_id || null,
        requirementCode: it.requirement_code || null,
        requirementText: it.requirement_text,
        itemType: it.item_type || 'Requirement',
        engineeringDiscipline: it.engineering_discipline || 'General',
        complianceLevel: it.compliance_level || 'Mandatory',
        relevanceScore: it.relevance_score || 1.0,
        isSelected: it.is_selected ?? true,
        customNotes: it.custom_notes || null,
      });
    }

    return c.json({ success: true, scopeId: scopeRecord.id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
