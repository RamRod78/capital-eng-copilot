import { pool } from '../db/index.js';
import { getGeminiClient, getEmbedding } from './gemini.js';
import {
  KGEntityType,
  KGRelationType,
  normalizeEngineeringDiscipline,
} from '../../shared/schemas.js';

// Standard Normalization Dictionary & Regex
export function normalizeStandardCode(raw: string): string {
  if (!raw || !raw.trim()) return '';
  let cleaned = raw.trim();

  // Strip leading/trailing quotation or brackets
  cleaned = cleaned.replace(/^["'\[\(]+|["'\]\)]+$/g, '').trim();

  // Normalize API Standards (e.g., API-610, API Standard 610, API 610 12th Ed -> API 610)
  const apiMatch = cleaned.match(/^API\s*(?:(?:Std|Standard|RP|Spec|Specification)\s*)?[-:]?\s*(\d+[A-Z0-9]*)/i);
  if (apiMatch) return `API ${apiMatch[1].toUpperCase()}`;

  // Normalize ASME Standards (e.g., ASME B31.3-2022, ASME Sec VIII, ASME Code Sec II -> ASME B31.3, ASME Section VIII, ASME Section II)
  const asmeSecMatch = cleaned.match(/^ASME\s*(?:(?:BPVC|Code|Std|Standard)\s*)*(?:Sec(?:tion)?|Part)\s*([IVX0-9]+)/i);
  if (asmeSecMatch) {
    const roman = asmeSecMatch[1].toUpperCase();
    return `ASME Section ${roman}`;
  }

  const asmeMatch = cleaned.match(/^ASME\s*(?:(?:BPVC|Code|Std|Standard|Sec|Section)\s*)*[-:]?\s*([A-Z0-9.]+)/i);
  if (asmeMatch) {
    const code = asmeMatch[1].toUpperCase();
    if (code.startsWith('VIII') || code === '8') return 'ASME Section VIII';
    if (code.startsWith('II') || code === '2') return 'ASME Section II';
    if (code.startsWith('IX') || code === '9') return 'ASME Section IX';
    return `ASME ${code}`;
  }

  // Normalize NFPA (e.g., NFPA 70 / NEC -> NFPA 70)
  const nfpaMatch = cleaned.match(/^NFPA\s*[-:]?\s*(\d+)/i);
  if (nfpaMatch) return `NFPA ${nfpaMatch[1]}`;
  if (/^(?:NEC|National\s*Electrical\s*Code)/i.test(cleaned)) return 'NFPA 70';

  // Normalize ISO Standards (e.g., ISO 13709:2014 -> ISO 13709)
  const isoMatch = cleaned.match(/^ISO\s*(?:(?:Std|Standard)\s*)?[-:]?\s*(\d+)/i);
  if (isoMatch) return `ISO ${isoMatch[1]}`;

  // Normalize PIP (Process Industry Practices)
  const pipMatch = cleaned.match(/^PIP\s*[-:]?\s*([A-Z0-9]+)/i);
  if (pipMatch) return `PIP ${pipMatch[1].toUpperCase()}`;

  // Normalize IEEE, IEC, NACE, ISA
  const ieeeMatch = cleaned.match(/^IEEE\s*[-:]?\s*(\d+)/i);
  if (ieeeMatch) return `IEEE ${ieeeMatch[1]}`;

  const iecMatch = cleaned.match(/^IEC\s*[-:]?\s*(\d+)/i);
  if (iecMatch) return `IEC ${iecMatch[1]}`;

  const naceMatch = cleaned.match(/^NACE\s*[-:]?\s*((?:MR|SP)?\s*\d+[A-Z0-9]*)/i);
  if (naceMatch) return `NACE ${naceMatch[1].replace(/\s+/g, '').toUpperCase()}`;

  const isaMatch = cleaned.match(/^ISA\s*[-:]?\s*([A-Z0-9.]+)/i);
  if (isaMatch) return `ISA ${isaMatch[1].toUpperCase()}`;

  return cleaned.replace(/\s+/g, ' ').substring(0, 100);
}

// Known Engineering Equipment Catalog Patterns
const EQUIPMENT_PATTERNS: Array<{ regex: RegExp; canonical: string; discipline: string }> = [
  { regex: /\b(?:centrifugal\s+pumps?|api\s*610\s+pumps?|multistage\s+pumps?)\b/i, canonical: 'Centrifugal Pump', discipline: 'Mechanical' },
  { regex: /\b(?:positive\s+displacement\s+pumps?|reciprocating\s+pumps?|diaphragm\s+pumps?|api\s*674|api\s*675|api\s*676)\b/i, canonical: 'Positive Displacement Pump', discipline: 'Mechanical' },
  { regex: /\b(?:centrifugal\s+compressors?|api\s*617|gas\s+compressors?)\b/i, canonical: 'Centrifugal Compressor', discipline: 'Mechanical' },
  { regex: /\b(?:reciprocating\s+compressors?|api\s*618)\b/i, canonical: 'Reciprocating Compressor', discipline: 'Mechanical' },
  { regex: /\b(?:screw\s+compressors?|api\s*619)\b/i, canonical: 'Screw Compressor', discipline: 'Mechanical' },
  { regex: /\b(?:gas\s+turbines?|api\s*616|combustion\s+turbines?)\b/i, canonical: 'Gas Turbine Generator', discipline: 'Mechanical' },
  { regex: /\b(?:steam\s+turbines?|api\s*611|api\s*612)\b/i, canonical: 'Steam Turbine Driver', discipline: 'Mechanical' },
  { regex: /\b(?:pressure\s+vessels?|asme\s+viii|separators?|accumulators?|drums?|reactors?)\b/i, canonical: 'Pressure Vessel', discipline: 'Mechanical' },
  { regex: /\b(?:shell\s+(?:and|&)\s+tube|heat\s+exchangers?|twee|api\s*660|tema)\b/i, canonical: 'Shell and Tube Heat Exchanger', discipline: 'Mechanical' },
  { regex: /\b(?:air\s+cooled\s+heat\s+exchangers?|fin\s*fans?|api\s*661)\b/i, canonical: 'Air-Cooled Heat Exchanger', discipline: 'Mechanical' },
  { regex: /\b(?:storage\s+tanks?|api\s*650|api\s*620|atmospheric\s+tanks?)\b/i, canonical: 'Atmospheric Storage Tank', discipline: 'Mechanical' },
  { regex: /\b(?:piping\s+systems?|asme\s+b31\.3|process\s+piping|pipe\s+spools?)\b/i, canonical: 'Process Piping System', discipline: 'Piping' },
  { regex: /\b(?:control\s+valves?|globe\s+valves?|modulating\s+valves?|isa-75)\b/i, canonical: 'Control Valve', discipline: 'I&C' },
  { regex: /\b(?:pressure\s+safety\s+valves?|psv|prv|relief\s+valves?|api\s*520|api\s*526)\b/i, canonical: 'Pressure Safety Relief Valve (PSV)', discipline: 'Mechanical' },
  { regex: /\b(?:motor\s+operated\s+valves?|mov|esdv|emergency\s+shutdown\s+valves?)\b/i, canonical: 'Emergency Shutdown Valve (ESDV)', discipline: 'Piping' },
  { regex: /\b(?:medium\s+voltage\s+switchgear|low\s+voltage\s+switchgear|switchgear|mcc|motor\s+control\s+center)\b/i, canonical: 'Electrical Switchgear & MCC', discipline: 'Electrical' },
  { regex: /\b(?:power\s+transformers?|distribution\s+transformers?|transformer\s+substation|oil\s+filled\s+transformers?)\b/i, canonical: 'Power Transformer', discipline: 'Electrical' },
  { regex: /\b(?:variable\s+frequency\s+drives?|vfd|vsd|inverter\s+drives?)\b/i, canonical: 'Variable Frequency Drive (VFD)', discipline: 'Electrical' },
  { regex: /\b(?:uninterruptible\s+power\s+supply|ups\s+systems?|battery\s+banks?)\b/i, canonical: 'Uninterruptible Power Supply (UPS)', discipline: 'Electrical' },
  { regex: /\b(?:electric\s+motors?|induction\s+motors?|nema\s+motors?|ie3|ie4|api\s*541|api\s*547)\b/i, canonical: 'Electric Motor Driver', discipline: 'Electrical' },
  { regex: /\b(?:distributed\s+control\s+systems?|dcs|plc|programmable\s+logic\s+controllers?|scada)\b/i, canonical: 'DCS & PLC Control System', discipline: 'I&C' },
  { regex: /\b(?:safety\s+instrumented\s+systems?|sis|safety\s+plc|iec\s*61511|sil\s*(?:[1-4]))\b/i, canonical: 'Safety Instrumented System (SIS)', discipline: 'I&C' },
  { regex: /\b(?:flow\s+transmitters?|coriolis\s+meters?|orifice\s+plates?|ultrasonic\s+flowmeters?)\b/i, canonical: 'Flow Meter Transmitter', discipline: 'I&C' },
  { regex: /\b(?:pressure\s+transmitters?|differential\s+pressure|smart\s+transmitters?)\b/i, canonical: 'Pressure Transmitter', discipline: 'I&C' },
  { regex: /\b(?:gas\s+detectors?|flame\s+detectors?|fire\s+(?:and|&)\s+gas|fgs)\b/i, canonical: 'Fire & Gas Detection System', discipline: 'HSE' },
  { regex: /\b(?:flare\s+stacks?|flare\s+tips?|api\s*537|flare\s+headers?)\b/i, canonical: 'Flare System & Knockout Drum', discipline: 'Process' },
  { regex: /\b(?:cooling\s+towers?|cti|recirculating\s+cooling)\b/i, canonical: 'Cooling Tower Package', discipline: 'Process' },
  { regex: /\b(?:pipe\s+racks?|structural\s+steel|equipment\s+foundations?|aisc\s+360|aci\s+318)\b/i, canonical: 'Pipe Rack & Structural Steel', discipline: 'Civil/Structural' },
];

// Known Engineering Parameters & Metallurgy Patterns
const PARAMETER_PATTERNS: Array<{ regex: RegExp; canonical: string; label: string }> = [
  { regex: /\b(?:sour\s+service|nace\s+mr0175|iso\s+15156|h2s\s+service)\b/i, canonical: 'NACE MR0175 Sour Service', label: 'Sour Service (H2S Compliance)' },
  { regex: /\b(?:cryogenic\s+service|cryogenic\s+temperature|below\s*-\s*46\s*°?[cf])\b/i, canonical: 'Cryogenic Service (< -46°C)', label: 'Cryogenic Service Temperature' },
  { regex: /\b(?:design\s+pressure|maximum\s+allowable\s+working\s+pressure|mawp)\b/i, canonical: 'Design Pressure / MAWP', label: 'Design Pressure Envelope' },
  { regex: /\b(?:design\s+temperature|operating\s+temperature)\b/i, canonical: 'Design Temperature', label: 'Design Temperature Range' },
  { regex: /\b(?:stainless\s+steel\s+316l?|ss\s*316l?|a312\s+tp316l?|uns\s+s31603)\b/i, canonical: 'Austenitic Stainless Steel 316L', label: 'Metallurgy: 316L Stainless Steel' },
  { regex: /\b(?:duplex\s+stainless|2205\s+duplex|super\s+duplex|2507|uns\s+s31803|uns\s+s32750)\b/i, canonical: 'Duplex / Super Duplex SS', label: 'Metallurgy: Duplex Stainless Steel' },
  { regex: /\b(?:carbon\s+steel|a106\s+gr\s+b|a516\s+gr\s+70|a105)\b/i, canonical: 'Carbon Steel (CS)', label: 'Metallurgy: Carbon Steel' },
  { regex: /\b(?:inconel\s+625|alloy\s+625|hastelloy|monel|titanium\s+gr)\b/i, canonical: 'Nickel Alloy / Inconel 625', label: 'Metallurgy: High-Nickel Alloy' },
  { regex: /\b(?:vibration\s+limit|iso\s+10816|api\s*670|overall\s+vibration)\b/i, canonical: 'ISO 10816 / API 670 Vibration Limits', label: 'Vibration & Dynamic Monitoring' },
  { regex: /\b(?:mechanical\s+seal|dual\s+seal|tandem\s+seal|api\s*682|plan\s*53|plan\s*54)\b/i, canonical: 'API 682 Mechanical Seal Plan', label: 'API 682 Mechanical Seal Arrangement' },
  { regex: /\b(?:class\s+150|class\s+300|class\s+600|class\s+900|class\s+1500|class\s+2500)\b/i, canonical: 'ASME Flange Pressure Class', label: 'ASME B16.5 Flange Rating' },
  { regex: /\b(?:class\s+i\s*,?\s*div(?:ision)?\s*1|class\s+i\s*,?\s*div(?:ision)?\s*2|zone\s*1|zone\s*2|atex|iecex)\b/i, canonical: 'Hazardous Area Classification (Class I Div 1/2)', label: 'Hazardous Area Classification' },
  { regex: /\b(?:sil\s*2|sil\s*3|safety\s+integrity\s+level|iec\s*61508)\b/i, canonical: 'Safety Integrity Level (SIL 2/3)', label: 'Functional Safety (SIL Rating)' },
  { regex: /\b(?:corrosion\s+allowance|3\s*mm\s+ca|1\/8\s*(?:inch|")\s+ca)\b/i, canonical: 'Corrosion Allowance (CA)', label: 'Corrosion Allowance Spec' },
  { regex: /\b(?:hydrostatic\s+test|hydrotest|pneumatic\s+test|1\.5\s*x\s*design\s+pressure)\b/i, canonical: 'Hydrostatic Pressure Testing', label: 'Hydrotest Pressure Criteria' },
  { regex: /\b(?:100%\s+radiography|100%\s+rt|nde|ndt|paut|magnetic\s+particle)\b/i, canonical: '100% NDE / Radiographic Testing', label: 'Non-Destructive Examination (NDE)' },
];

export interface ExtractedTriple {
  subjectType: KGEntityType;
  subjectName: string;
  subjectLabel?: string;
  subjectDiscipline?: string;
  predicate: KGRelationType;
  objectType: KGEntityType;
  objectName: string;
  objectLabel?: string;
  objectDiscipline?: string;
  contextText?: string;
  weight?: number;
}

/**
 * Fast Rule-Based + Pattern Extraction from requirement text
 */
export function extractTriplesFromText(
  requirementCode: string,
  requirementText: string,
  discipline: string,
  documentTitle: string
): ExtractedTriple[] {
  const triples: ExtractedTriple[] = [];
  const normDiscipline = normalizeEngineeringDiscipline(discipline);

  // 1. Requirement Node
  const reqSubjectName = requirementCode || requirementText.slice(0, 40);
  const reqSubjectLabel = requirementCode ? `${requirementCode}: ${requirementText.slice(0, 60)}...` : requirementText.slice(0, 60);

  // Requirement -> Discipline
  triples.push({
    subjectType: 'Requirement',
    subjectName: reqSubjectName,
    subjectLabel: reqSubjectLabel,
    subjectDiscipline: normDiscipline,
    predicate: 'GOVERNED_BY',
    objectType: 'Discipline',
    objectName: normDiscipline,
    objectLabel: `${normDiscipline} Engineering`,
    objectDiscipline: normDiscipline,
    contextText: `Requirement assigned to ${normDiscipline} discipline.`,
    weight: 1.0,
  });

  // 2. Extract Standard Citations (e.g. API 610, ASME B31.3, NFPA 70)
  const standardRegex = /\b(?:API\s*(?:Std|Standard|RP|Spec)?\s*[-:]?\s*\d+[A-Z0-9]*|ASME\s*(?:Sec|Section|Code|B\d+[A-Z0-9.]*)?|NFPA\s*\d+|ISO\s*\d+|PIP\s*[A-Z0-9]+|IEC\s*\d+|IEEE\s*\d+|NACE\s*(?:MR|SP)?\s*[A-Z0-9]+|ISA\s*[A-Z0-9.]+)\b/gi;
  const standardMatches = requirementText.match(standardRegex) || [];
  const uniqueStandards = new Set<string>();

  for (const rawStd of standardMatches) {
    const canonicalStd = normalizeStandardCode(rawStd);
    if (canonicalStd && canonicalStd.length >= 4 && !uniqueStandards.has(canonicalStd)) {
      uniqueStandards.add(canonicalStd);
      triples.push({
        subjectType: 'Requirement',
        subjectName: reqSubjectName,
        subjectLabel: reqSubjectLabel,
        subjectDiscipline: normDiscipline,
        predicate: 'REFERENCES_STANDARD',
        objectType: 'Standard',
        objectName: canonicalStd,
        objectLabel: canonicalStd,
        objectDiscipline: normDiscipline,
        contextText: `Cited in clause: "${requirementText.slice(0, 150)}"`,
        weight: 1.0,
      });

      // Standard -> Discipline
      triples.push({
        subjectType: 'Standard',
        subjectName: canonicalStd,
        subjectLabel: canonicalStd,
        subjectDiscipline: normDiscipline,
        predicate: 'GOVERNED_BY',
        objectType: 'Discipline',
        objectName: normDiscipline,
        objectLabel: `${normDiscipline} Engineering`,
        objectDiscipline: normDiscipline,
        contextText: `Industry standard utilized in ${normDiscipline}.`,
        weight: 0.8,
      });
    }
  }

  // 3. Extract Equipment Classes
  const uniqueEquipment = new Set<string>();
  for (const eq of EQUIPMENT_PATTERNS) {
    if (eq.regex.test(requirementText) && !uniqueEquipment.has(eq.canonical)) {
      uniqueEquipment.add(eq.canonical);

      // Requirement -> Equipment
      triples.push({
        subjectType: 'Requirement',
        subjectName: reqSubjectName,
        subjectLabel: reqSubjectLabel,
        subjectDiscipline: normDiscipline,
        predicate: 'APPLIES_TO_EQUIPMENT',
        objectType: 'Equipment',
        objectName: eq.canonical,
        objectLabel: eq.canonical,
        objectDiscipline: eq.discipline || normDiscipline,
        contextText: `Specifies requirements for ${eq.canonical}.`,
        weight: 1.0,
      });

      // Equipment -> Discipline
      triples.push({
        subjectType: 'Equipment',
        subjectName: eq.canonical,
        subjectLabel: eq.canonical,
        subjectDiscipline: eq.discipline || normDiscipline,
        predicate: 'GOVERNED_BY',
        objectType: 'Discipline',
        objectName: eq.discipline || normDiscipline,
        objectLabel: `${eq.discipline || normDiscipline} Engineering`,
        objectDiscipline: eq.discipline || normDiscipline,
        contextText: `${eq.canonical} governed primarily by ${eq.discipline || normDiscipline}.`,
        weight: 0.9,
      });

      // Cross-link Standard -> Equipment if both present
      for (const std of uniqueStandards) {
        triples.push({
          subjectType: 'Standard',
          subjectName: std,
          subjectLabel: std,
          subjectDiscipline: normDiscipline,
          predicate: 'APPLIES_TO_EQUIPMENT',
          objectType: 'Equipment',
          objectName: eq.canonical,
          objectLabel: eq.canonical,
          objectDiscipline: eq.discipline || normDiscipline,
          contextText: `${std} governing standard applied to ${eq.canonical}.`,
          weight: 1.2,
        });
      }
    }
  }

  // 4. Extract Technical Parameters & Operating Conditions
  for (const param of PARAMETER_PATTERNS) {
    if (param.regex.test(requirementText)) {
      triples.push({
        subjectType: 'Requirement',
        subjectName: reqSubjectName,
        subjectLabel: reqSubjectLabel,
        subjectDiscipline: normDiscipline,
        predicate: 'SPECIFIES_PARAMETER',
        objectType: 'Parameter',
        objectName: param.canonical,
        objectLabel: param.label,
        objectDiscipline: normDiscipline,
        contextText: `Specifies ${param.label}.`,
        weight: 0.9,
      });

      // Link Equipment to Parameter if both found
      for (const eqName of uniqueEquipment) {
        triples.push({
          subjectType: 'Equipment',
          subjectName: eqName,
          subjectLabel: eqName,
          subjectDiscipline: normDiscipline,
          predicate: 'OPERATES_UNDER',
          objectType: 'Parameter',
          objectName: param.canonical,
          objectLabel: param.label,
          objectDiscipline: normDiscipline,
          contextText: `${eqName} configured with ${param.label}.`,
          weight: 1.1,
        });
      }
    }
  }

  return triples;
}

/**
 * Upsert a Knowledge Graph Node with vector embedding
 */
export async function upsertKGNode(data: {
  entityType: KGEntityType;
  name: string;
  label?: string;
  description?: string | null;
  discipline?: string | null;
  sourceDocumentId?: string | null;
  extractionId?: string | null;
  properties?: Record<string, any>;
}): Promise<string> {
  const client = await pool.connect();
  try {
    const cleanName = data.name.trim();
    const cleanLabel = (data.label || cleanName).trim();
    const cleanType = data.entityType;
    const cleanDisc = data.discipline || 'General';

    // Check if node already exists
    const checkRes = await client.query(
      `SELECT id, embedding FROM kg_nodes WHERE entity_type = $1 AND LOWER(name) = LOWER($2) LIMIT 1;`,
      [cleanType, cleanName]
    );

    if (checkRes.rows.length > 0) {
      const existingId = checkRes.rows[0].id;
      // Update properties / updated_at
      await client.query(
        `UPDATE kg_nodes 
         SET updated_at = CURRENT_TIMESTAMP,
             discipline = COALESCE(discipline, $1),
             description = COALESCE(description, $2)
         WHERE id = $3;`,
        [cleanDisc, data.description || null, existingId]
      );
      return existingId;
    }

    // Generate vector embedding for semantic search & GraphRAG seed selection
    let embeddingVector: number[] = [];
    try {
      const textToEmbed = `${cleanType}: ${cleanLabel}. ${data.description || ''} Discipline: ${cleanDisc}`;
      embeddingVector = await getEmbedding(textToEmbed);
    } catch (e) {
      console.warn(`Vector embedding for node "${cleanName}" skipped:`, e);
    }

    const vectorParam = embeddingVector && embeddingVector.length === 768 ? `[${embeddingVector.join(',')}]` : null;

    const insertRes = await client.query(
      `INSERT INTO kg_nodes (
         entity_type, name, label, description, discipline,
         source_document_id, extraction_id, properties, embedding, degree_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
       ON CONFLICT (entity_type, lower(name)) DO UPDATE 
       SET updated_at = CURRENT_TIMESTAMP,
           discipline = COALESCE(kg_nodes.discipline, EXCLUDED.discipline)
       RETURNING id;`,
      [
        cleanType,
        cleanName,
        cleanLabel,
        data.description || null,
        cleanDisc,
        data.sourceDocumentId || null,
        data.extractionId || null,
        JSON.stringify(data.properties || {}),
        vectorParam,
      ]
    );

    return insertRes.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Upsert a Knowledge Graph Edge and increment connection weight
 */
export async function upsertKGEdge(data: {
  sourceNodeId: string;
  targetNodeId: string;
  relationType: KGRelationType;
  weight?: number;
  contextText?: string | null;
  sourceDocumentId?: string | null;
  extractionId?: string | null;
  properties?: Record<string, any>;
}): Promise<string> {
  if (data.sourceNodeId === data.targetNodeId) {
    // Avoid self-loops
    return '';
  }

  const client = await pool.connect();
  try {
    const weightInc = data.weight || 1.0;
    const res = await client.query(
      `INSERT INTO kg_edges (
         source_node_id, target_node_id, relation_type, weight,
         context_text, source_document_id, extraction_id, properties
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_node_id, target_node_id, relation_type) DO UPDATE
       SET weight = kg_edges.weight + $4,
           context_text = COALESCE(EXCLUDED.context_text, kg_edges.context_text),
           source_document_id = COALESCE(EXCLUDED.source_document_id, kg_edges.source_document_id)
       RETURNING id;`,
      [
        data.sourceNodeId,
        data.targetNodeId,
        data.relationType,
        weightInc,
        data.contextText || null,
        data.sourceDocumentId || null,
        data.extractionId || null,
        JSON.stringify(data.properties || {}),
      ]
    );
    return res.rows[0]?.id || '';
  } finally {
    client.release();
  }
}

/**
 * Recalculates degree counts across all knowledge nodes
 */
export async function recalculateDegreeCounts(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      WITH edge_counts AS (
        SELECT node_id, count(*) AS total_degree
        FROM (
          SELECT source_node_id AS node_id FROM kg_edges
          UNION ALL
          SELECT target_node_id AS node_id FROM kg_edges
        ) all_edges
        GROUP BY node_id
      )
      UPDATE kg_nodes n
      SET degree_count = COALESCE(ec.total_degree, 0)
      FROM edge_counts ec
      WHERE n.id = ec.node_id;
    `);
  } catch (err: any) {
    console.warn('Degree count recalculation warning:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Ingest an extraction batch into the Knowledge Graph
 */
export async function ingestExtractionToGraph(
  documentId: string,
  items: any[],
  documentTitle: string,
  documentOwner?: string
): Promise<{ nodesCreated: number; edgesCreated: number }> {
  console.log(`🕸️ Building Knowledge Graph from document "${documentTitle}" (${items.length} items)...`);
  let nodesCreated = 0;
  let edgesCreated = 0;

  try {
    // 1. Create/Upsert Document Root Node
    const docNodeId = await upsertKGNode({
      entityType: 'Document',
      name: documentTitle,
      label: documentTitle,
      description: `Engineering document / standard. Owner SME: ${documentOwner || 'Engineering Lead'}`,
      discipline: 'General',
      sourceDocumentId: documentId,
      properties: {
        document_id: documentId,
        owner_sme: documentOwner,
      },
    });
    nodesCreated++;

    // 2. Process each requirement item
    for (const item of items) {
      const code = item.requirement_code || 'REQ';
      const text = item.requirement_text || '';
      const disc = normalizeEngineeringDiscipline(item.engineering_discipline || 'General');

      // Create Requirement Node
      const reqNodeId = await upsertKGNode({
        entityType: 'Requirement',
        name: code,
        label: `${code}: ${text.slice(0, 50)}...`,
        description: text,
        discipline: disc,
        sourceDocumentId: documentId,
        properties: {
          requirement_code: code,
          item_type: item.item_type || 'Requirement',
          compliance_level: item.compliance_level || 'Mandatory',
          confidence_score: item.confidence_score ?? 1.0,
          section_title: item.section_title || null,
        },
      });
      nodesCreated++;

      // Edge: (Document)-[:CONTAINS]->(Requirement)
      await upsertKGEdge({
        sourceNodeId: docNodeId,
        targetNodeId: reqNodeId,
        relationType: 'CONTAINS',
        weight: 1.0,
        contextText: `Contained in specification "${documentTitle}"`,
        sourceDocumentId: documentId,
      });
      edgesCreated++;

      // Extract Triples from clause text
      const triples = extractTriplesFromText(code, text, disc, documentTitle);

      for (const t of triples) {
        // Upsert subject node if not requirement
        let srcId = reqNodeId;
        if (t.subjectType !== 'Requirement') {
          srcId = await upsertKGNode({
            entityType: t.subjectType,
            name: t.subjectName,
            label: t.subjectLabel || t.subjectName,
            discipline: t.subjectDiscipline || disc,
            sourceDocumentId: documentId,
          });
          nodesCreated++;
        }

        // Upsert target node
        const tgtId = await upsertKGNode({
          entityType: t.objectType,
          name: t.objectName,
          label: t.objectLabel || t.objectName,
          discipline: t.objectDiscipline || disc,
          sourceDocumentId: documentId,
        });
        nodesCreated++;

        // Upsert Edge
        if (srcId && tgtId) {
          await upsertKGEdge({
            sourceNodeId: srcId,
            targetNodeId: tgtId,
            relationType: t.predicate,
            weight: t.weight || 1.0,
            contextText: t.contextText || null,
            sourceDocumentId: documentId,
          });
          edgesCreated++;
        }
      }
    }

    // 3. Recalculate degree counts
    await recalculateDegreeCounts();
    console.log(`✅ Knowledge Graph updated: Processed nodes and edges for "${documentTitle}".`);
  } catch (err: any) {
    console.error('Knowledge Graph ingestion error:', err);
  }

  return { nodesCreated, edgesCreated };
}

/**
 * Backfill Knowledge Graph from all existing documents and extractions
 */
export async function backfillKnowledgeGraph(): Promise<{
  documentsProcessed: number;
  totalNodes: number;
  totalEdges: number;
}> {
  console.log('🔄 Starting Knowledge Graph backfill from database...');
  const client = await pool.connect();
  let documentsProcessed = 0;

  try {
    const docsRes = await client.query(`SELECT id, filename, owner_sme FROM documents ORDER BY created_at ASC;`);
    for (const doc of docsRes.rows) {
      const extractionsRes = await client.query(
        `SELECT id, requirement_code, requirement_text, engineering_discipline, item_type, compliance_level, confidence_score, section_title
         FROM extractions
         WHERE document_id = $1;`,
        [doc.id]
      );

      if (extractionsRes.rows.length > 0) {
        await ingestExtractionToGraph(
          doc.id,
          extractionsRes.rows,
          doc.filename,
          doc.owner_sme
        );
        documentsProcessed++;
      }
    }

    // Get final counts
    const countRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM kg_nodes) AS total_nodes,
        (SELECT count(*) FROM kg_edges) AS total_edges;
    `);

    const totalNodes = Number(countRes.rows[0]?.total_nodes || 0);
    const totalEdges = Number(countRes.rows[0]?.total_edges || 0);

    console.log(`🎉 Knowledge Graph backfill complete: Processed ${documentsProcessed} documents (${totalNodes} nodes, ${totalEdges} edges).`);
    return { documentsProcessed, totalNodes, totalEdges };
  } finally {
    client.release();
  }
}
