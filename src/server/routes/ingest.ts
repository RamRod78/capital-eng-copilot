import { Hono } from 'hono';
import { db, pool } from '../db/index.js';
import { documents, extractions } from '../db/schema.js';
import { extractRequirementsFromText, getEmbedding } from '../services/gemini.js';
import { parseUploadedFileBuffer } from '../services/parsers.js';
import { randomUUID } from 'crypto';

export const ingestRouter = new Hono();

// Parse uploaded file endpoint
ingestRouter.post('/parse-file', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'] as File | undefined;
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, error } = await parseUploadedFileBuffer(buffer, file.name);

    if (error) {
      return c.json({ error }, 400);
    }

    return c.json({
      filename: file.name,
      suggestedTitle: file.name.replace(/\.[^/.]+$/, ''),
      text,
      charCount: text.length,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'File parsing failed' }, 500);
  }
});

// Run Gemini extraction on text
ingestRouter.post('/extract', async (c) => {
  try {
    const { content, documentTitle, documentOwner } = await c.req.json();
    if (!content || !content.trim()) {
      return c.json({ error: 'Content is required for extraction' }, 400);
    }

    const batch = await extractRequirementsFromText(
      content,
      documentTitle || 'Engineering Specification',
      documentOwner || 'General Engineering SME'
    );

    return c.json(batch);
  } catch (err: any) {
    console.error('Extraction failed with error:', err);
    return c.json({ error: err.message || 'Extraction failed' }, 500);
  }
});

// Save extraction batch and pgvector embeddings to database
ingestRouter.post('/save', async (c) => {
  try {
    const { documentTitle, documentType, ownerSme, version, rawContent, batchId, items } = await c.req.json();

    // 1. Insert document record
    const [doc] = await db
      .insert(documents)
      .values({
        filename: documentTitle || 'Engineering Specification',
        documentType: documentType || 'Standard',
        ownerSme: ownerSme || 'Engineering Lead',
        version: version || '1.0',
        rawContent: rawContent || '',
      })
      .returning();

    const finalBatchId = batchId || randomUUID();
    let storedCount = 0;

    // 2. Insert extractions and generate embeddings
    for (const item of items) {
      const [ex] = await db
        .insert(extractions)
        .values({
          documentId: doc.id,
          batchId: finalBatchId,
          sectionTitle: item.section_title || null,
          requirementCode: item.requirement_code || null,
          requirementText: item.requirement_text,
          itemType: item.item_type || 'Requirement',
          category: item.category || null,
          engineeringDiscipline: item.engineering_discipline || 'General',
          complianceLevel: item.compliance_level || 'Mandatory',
          estimatedCostImpact: item.estimated_cost_impact || 'TBD',
          documentOwner: item.document_owner || ownerSme || 'General SME',
          confidenceScore: item.confidence_score ?? 1.0,
          confidenceReasoning: item.confidence_reasoning || null,
          status: 'Pending Review',
        })
        .returning();

      // Generate embedding and insert into requirement_embeddings
      try {
        const vector = await getEmbedding(item.requirement_text);
        if (vector && vector.length === 768) {
          const client = await pool.connect();
          try {
            await client.query(
              `INSERT INTO requirement_embeddings (extraction_id, chunk_text, embedding) VALUES ($1, $2, $3);`,
              [ex.id, item.requirement_text, `[${vector.join(',')}]`]
            );
          } finally {
            client.release();
          }
        }
      } catch (embErr) {
        console.error('Failed to store embedding:', embErr);
      }

      storedCount++;
    }

    return c.json({
      success: true,
      documentId: doc.id,
      storedCount,
    });
  } catch (err: any) {
    console.error('Error saving batch:', err);
    return c.json({ error: err.message || 'Failed to save batch' }, 500);
  }
});
