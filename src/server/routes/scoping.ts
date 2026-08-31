import { Hono } from 'hono';
import { db, pool } from '../db/index.js';
import { projectScopes, scopingItems } from '../db/schema.js';
import { getEmbedding } from '../services/gemini.js';
import { randomUUID } from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { sortRequirementItems } from '../../shared/schemas.js';

export const scopingRouter = new Hono();

function formatProjectRow(row: any) {
  return {
    id: row.id,
    project_name: row.projectName || row.project_name,
    project_code: row.projectCode || row.project_code,
    facility_type: row.facilityType || row.facility_type,
    operating_conditions: row.operatingConditions || row.operating_conditions,
    scope_description: row.scopeDescription || row.scope_description,
    disciplines: Array.isArray(row.disciplines) ? row.disciplines : [],
    status: row.status || 'Draft',
    created_by: row.createdBy || row.created_by || 'Engineering Lead',
    saved_items_count: Number(row.savedItemsCount ?? row.saved_items_count ?? 0),
    created_at: row.createdAt || row.created_at ? new Date(row.createdAt || row.created_at).toISOString() : null,
    updated_at: row.updatedAt || row.updated_at ? new Date(row.updatedAt || row.updated_at).toISOString() : null,
  };
}

function buildRFPPackageFromRecord(projectRow: any, items: any[]) {
  const mandatory: any[] = [];
  const recommendations: any[] = [];
  const guidelines: any[] = [];

  for (const it of items) {
    const item = {
      scoping_item_id: it.id || it.scoping_item_id,
      extraction_id: it.extractionId || it.extraction_id || null,
      requirement_code: it.requirementCode || it.requirement_code || null,
      requirement_text: it.requirementText || it.requirement_text,
      item_type: it.itemType || it.item_type || 'Requirement',
      engineering_discipline: it.engineeringDiscipline || it.engineering_discipline || 'General',
      compliance_level: it.complianceLevel || it.compliance_level || 'Mandatory',
      relevance_score: Number(it.relevanceScore ?? it.relevance_score ?? 1.0),
      is_selected: it.isSelected ?? it.is_selected ?? true,
      custom_notes: it.customNotes || it.custom_notes || '',
    };

    if (item.item_type === 'Requirement' || item.compliance_level === 'Mandatory') {
      mandatory.push(item);
    } else if (item.item_type === 'Recommendation' || item.compliance_level === 'Recommended') {
      recommendations.push(item);
    } else {
      guidelines.push(item);
    }
  }

  return {
    package_id: projectRow.id,
    project_name: projectRow.projectName || projectRow.project_name,
    project_code: projectRow.projectCode || projectRow.project_code || null,
    facility_type: projectRow.facilityType || projectRow.facility_type,
    scope_summary: projectRow.scopeDescription || projectRow.scope_description,
    mandatory_requirements: sortRequirementItems(mandatory),
    recommendations: sortRequirementItems(recommendations),
    guidelines: sortRequirementItems(guidelines),
    created_at: projectRow.updatedAt ? new Date(projectRow.updatedAt).toISOString() : new Date().toISOString(),
    generated_by: 'Capital Engineering Copilot Agent',
  };
}

// 1. List all projects with saved item counts
scopingRouter.get('/projects', async (c) => {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          p.id,
          p.project_name AS "projectName",
          p.project_code AS "projectCode",
          p.facility_type AS "facilityType",
          p.operating_conditions AS "operatingConditions",
          p.scope_description AS "scopeDescription",
          p.disciplines,
          p.status,
          p.created_by AS "createdBy",
          p.created_at AS "createdAt",
          p.updated_at AS "updatedAt",
          COUNT(s.id)::int AS "savedItemsCount"
        FROM project_scopes p
        LEFT JOIN scoping_items s ON s.project_scope_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC;
      `);
      return c.json(res.rows.map(formatProjectRow));
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error fetching projects:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 2. Get single project by ID with items
scopingRouter.get('/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const [row] = await db.select().from(projectScopes).where(eq(projectScopes.id, id));
    if (!row) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const items = await db
      .select()
      .from(scopingItems)
      .where(eq(scopingItems.projectScopeId, id))
      .orderBy(desc(scopingItems.relevanceScore));

    const formattedItems = items.map((it) => ({
      scoping_item_id: it.id,
      extraction_id: it.extractionId,
      requirement_code: it.requirementCode,
      requirement_text: it.requirementText,
      item_type: it.itemType,
      engineering_discipline: it.engineeringDiscipline,
      compliance_level: it.complianceLevel,
      relevance_score: it.relevanceScore,
      is_selected: it.isSelected,
      custom_notes: it.customNotes,
    }));

    return c.json({
      project: formatProjectRow(row),
      items: sortRequirementItems(formattedItems),
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2b. Get project's saved scope package directly formatted as RFPPackage
scopingRouter.get('/projects/:id/package', async (c) => {
  try {
    const id = c.req.param('id');
    const [row] = await db.select().from(projectScopes).where(eq(projectScopes.id, id));
    if (!row) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const items = await db
      .select()
      .from(scopingItems)
      .where(eq(scopingItems.projectScopeId, id))
      .orderBy(desc(scopingItems.relevanceScore));

    const pkg = buildRFPPackageFromRecord(row, items);
    return c.json(pkg);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Create a new project
scopingRouter.post('/projects', async (c) => {
  try {
    const body = await c.req.json();
    const {
      project_name,
      project_code,
      facility_type,
      operating_conditions,
      disciplines,
      scope_description,
      status,
      created_by,
    } = body;

    if (!project_name || !facility_type || !scope_description) {
      return c.json({ error: 'Project name, facility type, and scope description are required' }, 400);
    }

    const [newProject] = await db
      .insert(projectScopes)
      .values({
        id: randomUUID(),
        projectName: project_name,
        projectCode: project_code || null,
        facilityType: facility_type,
        operatingConditions: operating_conditions || null,
        scopeDescription: scope_description,
        disciplines: Array.isArray(disciplines) ? disciplines : [],
        status: status || 'Configured',
        createdBy: created_by || 'Engineering Lead',
      })
      .returning();

    return c.json(formatProjectRow(newProject), 201);
  } catch (err: any) {
    console.error('Error creating project:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 4. Update an existing project
scopingRouter.patch('/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const [existing] = await db.select().from(projectScopes).where(eq(projectScopes.id, id));
    if (!existing) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const [updated] = await db
      .update(projectScopes)
      .set({
        projectName: body.project_name ?? existing.projectName,
        projectCode: body.project_code !== undefined ? body.project_code : existing.projectCode,
        facilityType: body.facility_type ?? existing.facilityType,
        operatingConditions: body.operating_conditions !== undefined ? body.operating_conditions : existing.operatingConditions,
        scopeDescription: body.scope_description ?? existing.scopeDescription,
        disciplines: body.disciplines ?? existing.disciplines,
        status: body.status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(eq(projectScopes.id, id))
      .returning();

    return c.json(formatProjectRow(updated));
  } catch (err: any) {
    console.error('Error updating project:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 5. Delete a project
scopingRouter.delete('/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const [deleted] = await db
      .delete(projectScopes)
      .where(eq(projectScopes.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({ success: true, id });
  } catch (err: any) {
    console.error('Error deleting project:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 6. Match requirements for scope
scopingRouter.post('/match', async (c) => {
  try {
    const scopeInput = await c.req.json();
    const { project_id, project_name, project_code, facility_type, operating_conditions, disciplines, scope_description, top_k } = scopeInput;

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

    const packageId = project_id || randomUUID();
    return c.json({
      package_id: packageId,
      project_name,
      project_code,
      facility_type,
      scope_summary: scope_description,
      mandatory_requirements: sortRequirementItems(mandatory),
      recommendations: sortRequirementItems(recommendations),
      guidelines: sortRequirementItems(guidelines),
      created_at: new Date().toISOString(),
      generated_by: 'Capital Engineering Copilot Agent',
    });
  } catch (err: any) {
    console.error('Error matching scope:', err);
    return c.json({ error: err.message }, 500);
  }
});

// 7. Save curated RFP Package to database
scopingRouter.post('/save', async (c) => {
  try {
    const pkg = await c.req.json();
    const { package_id, project_name, project_code, facility_type, scope_summary, mandatory_requirements, recommendations, guidelines } = pkg;

    const targetId = package_id || randomUUID();
    const [existing] = await db.select().from(projectScopes).where(eq(projectScopes.id, targetId));

    let scopeId = targetId;
    if (existing) {
      await db
        .update(projectScopes)
        .set({
          projectName: project_name,
          projectCode: project_code || null,
          facilityType: facility_type,
          scopeDescription: scope_summary,
          status: 'Approved',
          updatedAt: new Date(),
        })
        .where(eq(projectScopes.id, targetId));
      // Delete existing scoping items for this scope to replace with updated curated set
      await db.delete(scopingItems).where(eq(scopingItems.projectScopeId, targetId));
    } else {
      const [scopeRecord] = await db
        .insert(projectScopes)
        .values({
          id: targetId,
          projectName: project_name,
          projectCode: project_code || null,
          facilityType: facility_type,
          scopeDescription: scope_summary,
          status: 'Approved',
        })
        .returning();
      scopeId = scopeRecord.id;
    }

    const allItems = [
      ...(mandatory_requirements || []),
      ...(recommendations || []),
      ...(guidelines || []),
    ];

    for (const it of allItems) {
      await db.insert(scopingItems).values({
        id: it.scoping_item_id || randomUUID(),
        projectScopeId: scopeId,
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

    return c.json({ success: true, scopeId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
