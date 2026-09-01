import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { getGeminiClient, getEmbedding, extractUsageMetadata } from '../services/gemini.js';
import { backfillKnowledgeGraph } from '../services/kg_extractor.js';
import {
  KGGraphResponse,
  KGStatsResponse,
  GraphRAGQueryResponse,
} from '../../shared/schemas.js';

export const kgRouter = new Hono();

// GET /api/kg/graph - Retrieve Knowledge Graph subgraphs or full network
kgRouter.get('/graph', async (c) => {
  const client = await pool.connect();
  try {
    const entityType = c.req.query('entityType');
    const discipline = c.req.query('discipline');
    const keyword = c.req.query('keyword');
    const documentId = c.req.query('documentId');
    const minWeight = Number(c.req.query('minWeight') || '1');
    const limit = Math.min(Number(c.req.query('limit') || '200'), 500);

    let nodeQuery = `
      SELECT 
        id, entity_type, name, label, description, discipline,
        source_document_id, extraction_id, properties, degree_count,
        created_at, updated_at
      FROM kg_nodes
      WHERE 1=1
    `;
    const params: any[] = [];

    if (entityType && entityType !== 'All') {
      params.push(entityType);
      nodeQuery += ` AND entity_type = $${params.length}`;
    }

    if (discipline && discipline !== 'All') {
      params.push(discipline);
      nodeQuery += ` AND discipline = $${params.length}`;
    }

    if (documentId) {
      params.push(documentId);
      nodeQuery += ` AND source_document_id = $${params.length}`;
    }

    if (keyword && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      nodeQuery += ` AND (label ILIKE $${params.length} OR name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    params.push(limit);
    nodeQuery += ` ORDER BY degree_count DESC, created_at DESC LIMIT $${params.length};`;

    const nodesRes = await client.query(nodeQuery, params);
    const nodes = nodesRes.rows;
    const nodeIds = nodes.map((n) => n.id);

    let edges: any[] = [];
    if (nodeIds.length > 0) {
      const edgesRes = await client.query(
        `SELECT 
           id, source_node_id, target_node_id, relation_type, weight,
           context_text, source_document_id, extraction_id, properties, created_at
         FROM kg_edges
         WHERE source_node_id = ANY($1::uuid[])
           AND target_node_id = ANY($1::uuid[])
           AND weight >= $2
         ORDER BY weight DESC;`,
        [nodeIds, minWeight]
      );
      edges = edgesRes.rows;
    }

    // Get total counts
    const countRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM kg_nodes) AS total_nodes,
        (SELECT count(*) FROM kg_edges) AS total_edges;
    `);

    const responseData: KGGraphResponse = {
      nodes,
      edges,
      total_nodes: Number(countRes.rows[0]?.total_nodes || 0),
      total_edges: Number(countRes.rows[0]?.total_edges || 0),
    };

    return c.json(responseData);
  } catch (err: any) {
    console.error('KG Graph fetch error:', err);
    return c.json({ error: err.message || 'Failed to fetch knowledge graph' }, 500);
  } finally {
    client.release();
  }
});

// GET /api/kg/nodes/:id - Retrieve node with 1-hop & 2-hop neighborhood
kgRouter.get('/nodes/:id', async (c) => {
  const id = c.req.param('id');
  const client = await pool.connect();
  try {
    const nodeRes = await client.query(
      `SELECT 
         n.*,
         d.filename AS source_document_title,
         d.document_number AS source_document_number,
         e.requirement_code,
         e.requirement_text,
         e.status AS extraction_status
       FROM kg_nodes n
       LEFT JOIN documents d ON d.id = n.source_document_id
       LEFT JOIN extractions e ON e.id = n.extraction_id
       WHERE n.id = $1;`,
      [id]
    );

    if (nodeRes.rows.length === 0) {
      return c.json({ error: 'Node not found' }, 404);
    }

    const node = nodeRes.rows[0];

    // Get connected edges and neighbor nodes
    const edgesRes = await client.query(
      `SELECT 
         e.id, e.source_node_id, e.target_node_id, e.relation_type, e.weight,
         e.context_text, e.properties,
         src.label AS source_label, src.entity_type AS source_type, src.discipline AS source_discipline,
         tgt.label AS target_label, tgt.entity_type AS target_type, tgt.discipline AS target_discipline
       FROM kg_edges e
       JOIN kg_nodes src ON src.id = e.source_node_id
       JOIN kg_nodes tgt ON tgt.id = e.target_node_id
       WHERE e.source_node_id = $1 OR e.target_node_id = $1
       ORDER BY e.weight DESC;`,
      [id]
    );

    return c.json({
      node,
      connectedEdges: edgesRes.rows,
    });
  } catch (err: any) {
    console.error('KG Node detail fetch error:', err);
    return c.json({ error: err.message || 'Failed to fetch node details' }, 500);
  } finally {
    client.release();
  }
});

// GET /api/kg/stats - Graph summary metrics and hubs leaderboard
kgRouter.get('/stats', async (c) => {
  const client = await pool.connect();
  try {
    // Total nodes and edges
    const totalsRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM kg_nodes) AS total_nodes,
        (SELECT count(*) FROM kg_edges) AS total_edges;
    `);
    const totalNodes = Number(totalsRes.rows[0]?.total_nodes || 0);
    const totalEdges = Number(totalsRes.rows[0]?.total_edges || 0);

    // Entity types distribution
    const typesRes = await client.query(`
      SELECT entity_type, count(*) AS count
      FROM kg_nodes
      GROUP BY entity_type
      ORDER BY count DESC;
    `);
    const nodeTypes: Record<string, number> = {};
    for (const r of typesRes.rows) {
      nodeTypes[r.entity_type] = Number(r.count);
    }

    // Top Standards Leaderboard
    const standardsRes = await client.query(`
      SELECT name, degree_count AS count
      FROM kg_nodes
      WHERE entity_type = 'Standard'
      ORDER BY degree_count DESC, name ASC
      LIMIT 8;
    `);

    // Top Equipment Classes Leaderboard
    const equipmentRes = await client.query(`
      SELECT name, degree_count AS count
      FROM kg_nodes
      WHERE entity_type = 'Equipment'
      ORDER BY degree_count DESC, name ASC
      LIMIT 8;
    `);

    // Top Disciplines
    const disciplinesRes = await client.query(`
      SELECT discipline AS name, count(*) AS count
      FROM kg_nodes
      WHERE discipline IS NOT NULL AND discipline != ''
      GROUP BY discipline
      ORDER BY count DESC
      LIMIT 10;
    `);

    // Density = (2 * E) / (N * (N - 1))
    const density = totalNodes > 1 ? Number(((2 * totalEdges) / (totalNodes * (totalNodes - 1))).toFixed(4)) : 0;

    const stats: KGStatsResponse = {
      total_nodes: totalNodes,
      total_edges: totalEdges,
      node_types: nodeTypes,
      top_standards: standardsRes.rows.map((r) => ({ name: r.name, count: Number(r.count) })),
      top_equipment: equipmentRes.rows.map((r) => ({ name: r.name, count: Number(r.count) })),
      top_disciplines: disciplinesRes.rows.map((r) => ({ name: r.name, count: Number(r.count) })),
      density,
    };

    return c.json(stats);
  } catch (err: any) {
    console.error('KG Stats fetch error:', err);
    return c.json({ error: err.message || 'Failed to fetch graph stats' }, 500);
  } finally {
    client.release();
  }
});

// POST /api/kg/query - GraphRAG: Hybrid vector seed lookup + multi-hop graph context retrieval & synthesis
kgRouter.post('/query', async (c) => {
  const client = await pool.connect();
  try {
    const { query, max_hops = 2, top_k_seeds = 5, disciplines } = await c.req.json();
    if (!query || !query.trim()) {
      return c.json({ error: 'Query is required for GraphRAG' }, 400);
    }

    // 1. Compute embedding of search query
    const vector = await getEmbedding(query);
    let seedNodes: any[] = [];

    if (vector && vector.length === 768) {
      let seedSql = `
        SELECT 
          id, entity_type, name, label, description, discipline,
          source_document_id, properties, degree_count,
          1 - (embedding <=> $1) AS similarity_score
        FROM kg_nodes
        WHERE embedding IS NOT NULL
      `;
      const params: any[] = [`[${vector.join(',')}]`];

      if (disciplines && Array.isArray(disciplines) && disciplines.length > 0 && !disciplines.includes('All')) {
        params.push(disciplines);
        seedSql += ` AND discipline = ANY($${params.length}::varchar[])`;
      }

      params.push(top_k_seeds);
      seedSql += ` ORDER BY embedding <=> $1 LIMIT $${params.length};`;

      const seedRes = await client.query(seedSql, params);
      seedNodes = seedRes.rows;
    } else {
      // Fallback text match
      const seedRes = await client.query(
        `SELECT id, entity_type, name, label, description, discipline, source_document_id, properties, degree_count, 1.0 AS similarity_score
         FROM kg_nodes
         WHERE label ILIKE $1 OR name ILIKE $1 OR description ILIKE $1
         ORDER BY degree_count DESC
         LIMIT $2;`,
        [`%${query}%`, top_k_seeds]
      );
      seedNodes = seedRes.rows;
    }

    if (seedNodes.length === 0) {
      return c.json({
        query,
        summary: 'No related engineering entities or standards found in the Knowledge Graph for this query.',
        seed_nodes: [],
        subgraph: { nodes: [], edges: [] },
        connected_standards: [],
        connected_equipment: [],
        governing_disciplines: [],
      });
    }

    // 2. Perform 1-2 hop neighborhood expansion
    const seedIds = seedNodes.map((s) => s.id);
    const hopEdgesRes = await client.query(
      `WITH RECURSIVE graph_hops AS (
         -- Seed edges (Hop 1)
         SELECT 
           e.id, e.source_node_id, e.target_node_id, e.relation_type, e.weight,
           e.context_text, 1 AS depth
         FROM kg_edges e
         WHERE e.source_node_id = ANY($1::uuid[]) OR e.target_node_id = ANY($1::uuid[])

         UNION

         -- Hop 2
         SELECT 
           e.id, e.source_node_id, e.target_node_id, e.relation_type, e.weight,
           e.context_text, gh.depth + 1
         FROM kg_edges e
         JOIN graph_hops gh ON (e.source_node_id = gh.target_node_id OR e.target_node_id = gh.source_node_id)
         WHERE gh.depth < $2
       )
       SELECT DISTINCT id, source_node_id, target_node_id, relation_type, weight, context_text
       FROM graph_hops
       ORDER BY weight DESC
       LIMIT 60;`,
      [seedIds, max_hops]
    );

    const subgraphEdges = hopEdgesRes.rows;
    const allNodeIdsSet = new Set<string>(seedIds);
    for (const edge of subgraphEdges) {
      allNodeIdsSet.add(edge.source_node_id);
      allNodeIdsSet.add(edge.target_node_id);
    }

    const allNodeIds = Array.from(allNodeIdsSet);
    const subgraphNodesRes = await client.query(
      `SELECT id, entity_type, name, label, description, discipline, source_document_id, properties, degree_count
       FROM kg_nodes
       WHERE id = ANY($1::uuid[]);`,
      [allNodeIds]
    );
    const subgraphNodes = subgraphNodesRes.rows;

    // 3. Extract connected standards, equipment, and disciplines
    const connectedStandards = Array.from(
      new Set(subgraphNodes.filter((n) => n.entity_type === 'Standard').map((n) => n.name))
    );
    const connectedEquipment = Array.from(
      new Set(subgraphNodes.filter((n) => n.entity_type === 'Equipment').map((n) => n.name))
    );
    const governingDisciplines = Array.from(
      new Set(subgraphNodes.filter((n) => n.discipline && n.discipline !== 'General').map((n) => n.discipline))
    );

    // 4. Synthesize GraphRAG Context via Gemini
    const triplesSummary = subgraphEdges
      .map((e) => {
        const src = subgraphNodes.find((n) => n.id === e.source_node_id);
        const tgt = subgraphNodes.find((n) => n.id === e.target_node_id);
        return `- [${src?.entity_type || 'Node'}] "${src?.name || 'Entity'}" --(${e.relation_type})--> [${tgt?.entity_type || 'Node'}] "${tgt?.name || 'Entity'}"${e.context_text ? ` (Context: ${e.context_text})` : ''}`;
      })
      .slice(0, 30)
      .join('\n');

    const prompt = `You are a Principal EPC Engineering Technical Lead.
A user asked the following engineering question:
"${query}"

KNOWLEDGE GRAPH CONTEXT (Extracted Multi-Hop Relationships from Corporate Standards and Documents):
- Connected Governing Standards: ${connectedStandards.join(', ') || 'General Engineering'}
- Equipment Classes Involved: ${connectedEquipment.join(', ') || 'General Equipment'}
- Governing Disciplines: ${governingDisciplines.join(', ') || 'Multidisciplinary'}

Graph Triples:
${triplesSummary || 'No direct triples extracted.'}

Provide a concise, high-impact technical analysis answering the question based on these interconnected standards and equipment constraints.
Highlight standard citations (e.g. API 610, ASME B31.3), specific parameter limits, and multi-discipline implications.`;

    let summary = `Based on the Knowledge Graph, this query connects to ${connectedStandards.length} standard(s) (${connectedStandards.join(', ')}) and ${connectedEquipment.length} equipment class(es) (${connectedEquipment.join(', ')}).`;
    let usage: any;

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction: 'Synthesize engineering knowledge graph relationships into an actionable technical brief.',
          temperature: 0.2,
        },
      });
      if (response.text) {
        summary = response.text;
      }
      usage = extractUsageMetadata(response, 'gemini-3.7-flash');
    } catch (llmErr) {
      console.warn('GraphRAG Gemini synthesis fallback:', llmErr);
    }

    const responsePayload: GraphRAGQueryResponse = {
      query,
      summary,
      seed_nodes: seedNodes,
      subgraph: {
        nodes: subgraphNodes,
        edges: subgraphEdges,
      },
      connected_standards: connectedStandards,
      connected_equipment: connectedEquipment,
      governing_disciplines: governingDisciplines,
      token_usage: usage,
    };

    return c.json(responsePayload);
  } catch (err: any) {
    console.error('GraphRAG Query Error:', err);
    return c.json({ error: err.message || 'GraphRAG execution failed' }, 500);
  } finally {
    client.release();
  }
});

// POST /api/kg/backfill - Rebuild/Backfill Knowledge Graph from all documents in database
kgRouter.post('/backfill', async (c) => {
  try {
    const result = await backfillKnowledgeGraph();
    return c.json({
      success: true,
      message: `Knowledge Graph backfilled successfully from ${result.documentsProcessed} documents.`,
      result,
    });
  } catch (err: any) {
    console.error('Backfill error:', err);
    return c.json({ error: err.message || 'Backfill failed' }, 500);
  }
});

// GET /api/kg/export - Export full graph data in JSON Graph format
kgRouter.get('/export', async (c) => {
  const client = await pool.connect();
  try {
    const nodesRes = await client.query(`SELECT id, entity_type, name, label, description, discipline, properties, degree_count FROM kg_nodes ORDER BY degree_count DESC;`);
    const edgesRes = await client.query(`SELECT id, source_node_id, target_node_id, relation_type, weight, context_text FROM kg_edges ORDER BY weight DESC;`);

    return c.json({
      graph: {
        nodes: nodesRes.rows,
        edges: edgesRes.rows,
        metadata: {
          exported_at: new Date().toISOString(),
          node_count: nodesRes.rows.length,
          edge_count: edgesRes.rows.length,
          schema_version: '1.0',
        },
      },
    });
  } catch (err: any) {
    console.error('KG Export error:', err);
    return c.json({ error: err.message || 'Export failed' }, 500);
  } finally {
    client.release();
  }
});
