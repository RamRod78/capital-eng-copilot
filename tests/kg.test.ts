import { describe, it, expect } from 'vitest';
import {
  KGNodeSchema,
  KGEdgeSchema,
  KGGraphResponseSchema,
  KGStatsResponseSchema,
  GraphRAGQueryInputSchema,
  GraphRAGQueryResponseSchema,
  KGEntityTypeValues,
  KGRelationTypeValues,
} from '../src/shared/schemas.js';
import {
  normalizeStandardCode,
  extractTriplesFromText,
} from '../src/server/services/kg_extractor.js';

describe('Knowledge Graph Schemas & Validation', () => {
  it('validates KGNodeSchema with standard entity', () => {
    const node = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      entity_type: 'Standard',
      name: 'API 610',
      label: 'API 610: Centrifugal Pumps for Petroleum, Petrochemical and Natural Gas Industries',
      description: 'Standard for centrifugal pumps in petroleum service.',
      discipline: 'Mechanical',
      properties: { edition: '12th', published: 2021 },
      degree_count: 15,
    };

    const parsed = KGNodeSchema.parse(node);
    expect(parsed.name).toBe('API 610');
    expect(parsed.entity_type).toBe('Standard');
    expect(parsed.degree_count).toBe(15);
  });

  it('validates KGEdgeSchema with relationship', () => {
    const edge = {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      source_node_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      target_node_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      relation_type: 'REFERENCES_STANDARD',
      weight: 2.5,
      context_text: 'Pumps must strictly adhere to API 610 vibration requirements.',
    };

    const parsed = KGEdgeSchema.parse(edge);
    expect(parsed.relation_type).toBe('REFERENCES_STANDARD');
    expect(parsed.weight).toBe(2.5);
  });

  it('validates KGStatsResponseSchema', () => {
    const stats = {
      total_nodes: 120,
      total_edges: 350,
      node_types: { Standard: 25, Equipment: 30, Requirement: 65 },
      top_standards: [{ name: 'API 610', count: 18 }, { name: 'ASME B31.3', count: 14 }],
      top_equipment: [{ name: 'Centrifugal Pump', count: 22 }],
      top_disciplines: [{ name: 'Mechanical', count: 45 }],
      density: 0.0489,
    };

    const parsed = KGStatsResponseSchema.parse(stats);
    expect(parsed.total_nodes).toBe(120);
    expect(parsed.top_standards[0].name).toBe('API 610');
  });

  it('validates GraphRAGQueryResponseSchema', () => {
    const response = {
      query: 'What standard governs centrifugal pumps?',
      summary: 'Centrifugal pumps are governed primarily by API 610 in mechanical engineering.',
      seed_nodes: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          entity_type: 'Equipment',
          name: 'Centrifugal Pump',
          label: 'Centrifugal Pump',
          degree_count: 8,
          properties: {},
        },
      ],
      subgraph: {
        nodes: [
          {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            entity_type: 'Equipment',
            name: 'Centrifugal Pump',
            label: 'Centrifugal Pump',
            degree_count: 8,
            properties: {},
          },
          {
            id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            entity_type: 'Standard',
            name: 'API 610',
            label: 'API 610',
            degree_count: 12,
            properties: {},
          },
        ],
        edges: [
          {
            id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
            source_node_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            target_node_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            relation_type: 'APPLIES_TO_EQUIPMENT',
            weight: 1.0,
            properties: {},
          },
        ],
      },
      connected_standards: ['API 610'],
      connected_equipment: ['Centrifugal Pump'],
      governing_disciplines: ['Mechanical'],
    };

    const parsed = GraphRAGQueryResponseSchema.parse(response);
    expect(parsed.connected_standards).toContain('API 610');
    expect(parsed.connected_equipment).toContain('Centrifugal Pump');
  });
});

describe('Knowledge Graph Entity Normalization & Extraction', () => {
  it('normalizes various standard code formats to canonical standard codes', () => {
    expect(normalizeStandardCode('API-610')).toBe('API 610');
    expect(normalizeStandardCode('API Standard 610 12th Edition')).toBe('API 610');
    expect(normalizeStandardCode('API RP 520')).toBe('API 520');
    expect(normalizeStandardCode('ASME B31.3-2022')).toBe('ASME B31.3');
    expect(normalizeStandardCode('ASME Sec VIII Div 1')).toBe('ASME Section VIII');
    expect(normalizeStandardCode('ASME Code Sec II')).toBe('ASME Section II');
    expect(normalizeStandardCode('NFPA 70 (NEC)')).toBe('NFPA 70');
    expect(normalizeStandardCode('National Electrical Code')).toBe('NFPA 70');
    expect(normalizeStandardCode('ISO 13709:2014')).toBe('ISO 13709');
    expect(normalizeStandardCode('PIP PN01CS1S01')).toBe('PIP PN01CS1S01');
    expect(normalizeStandardCode('NACE MR0175/ISO 15156')).toBe('NACE MR0175');
  });

  it('extracts standards, equipment, parameters, and disciplines from requirement text', () => {
    const text = 'Centrifugal pumps in sour service shall comply with API 610 and have dual mechanical seals under API 682 with 316L stainless steel metallurgy.';
    const triples = extractTriplesFromText('REQ-MEC-00000001', text, 'Mechanical', 'Company Pump Spec');

    expect(triples.length).toBeGreaterThan(3);

    // Checks requirement -> discipline
    const govEdge = triples.find((t) => t.predicate === 'GOVERNED_BY' && t.objectName === 'Mechanical');
    expect(govEdge).toBeDefined();

    // Checks standard references
    const api610 = triples.find((t) => t.predicate === 'REFERENCES_STANDARD' && t.objectName === 'API 610');
    expect(api610).toBeDefined();

    const api682 = triples.find((t) => t.predicate === 'REFERENCES_STANDARD' && t.objectName === 'API 682');
    expect(api682).toBeDefined();

    // Checks equipment connection
    const eq = triples.find((t) => t.predicate === 'APPLIES_TO_EQUIPMENT' && t.objectName === 'Centrifugal Pump');
    expect(eq).toBeDefined();

    // Checks parameter / condition
    const param = triples.find((t) => t.objectName === 'NACE MR0175 Sour Service' || t.objectName.includes('316L'));
    expect(param).toBeDefined();
  });
});
