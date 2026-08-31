import { describe, it, expect } from 'vitest';
import {
  ExtractionItemSchema,
  ExtractionBatchSchema,
  DocumentRecordSchema,
  ProjectScopeInputSchema,
  RFPPackageSchema,
  DocumentRevisionFlagSchema,
} from '../src/shared/schemas.js';

describe('Zod Schema Validation', () => {
  it('validates ExtractionItemSchema with valid data', () => {
    const item = {
      requirement_code: 'REQ-MEC-001',
      requirement_text: 'All pressure vessels shall comply with ASME Boiler and Pressure Vessel Code Section VIII.',
      item_type: 'Requirement',
      engineering_discipline: 'Mechanical',
      compliance_level: 'Mandatory',
      estimated_cost_impact: 'High',
      confidence_score: 0.95,
      confidence_reasoning: 'Explicit ASME statutory obligation.',
    };

    const parsed = ExtractionItemSchema.parse(item);
    expect(parsed.requirement_code).toBe('REQ-MEC-001');
    expect(parsed.item_type).toBe('Requirement');
    expect(parsed.confidence_score).toBe(0.95);
  });

  it('validates ExtractionBatchSchema with document_number and document_date', () => {
    const batch = {
      document_title: 'API 650 Welded Tanks for Oil Storage',
      document_number: 'API-STD-650-ED13',
      document_date: '2026-08-31',
      document_owner: 'Mechanical SME',
      executive_summary: 'Comprehensive design and fabrication standard for welded steel oil storage tanks.',
      identified_disciplines: ['Mechanical', 'Civil/Structural'],
      items: [
        {
          requirement_code: 'REQ-MEC-001',
          requirement_text: 'Tanks shall be designed for wind velocity specified in ASCE 7.',
          item_type: 'Requirement',
          engineering_discipline: 'Mechanical',
          compliance_level: 'Mandatory',
        },
      ],
    };

    const parsed = ExtractionBatchSchema.parse(batch);
    expect(parsed.document_title).toBe('API 650 Welded Tanks for Oil Storage');
    expect(parsed.document_number).toBe('API-STD-650-ED13');
    expect(parsed.document_date).toBe('2026-08-31');
    expect(parsed.items.length).toBe(1);
  });

  it('validates DocumentRecordSchema with document_number and document_date', () => {
    const doc = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      filename: 'API 650 Storage Tanks Spec',
      document_number: 'SPEC-2026-MEC-001',
      document_date: '2026-08-31',
      document_type: 'Standard',
      owner_sme: 'Mechanical SME',
      version: '1.0',
      raw_content: 'Sample raw content...',
      metadata: { documentNumber: 'SPEC-2026-MEC-001', documentDate: '2026-08-31' },
    };

    const parsed = DocumentRecordSchema.parse(doc);
    expect(parsed.document_number).toBe('SPEC-2026-MEC-001');
    expect(parsed.document_date).toBe('2026-08-31');
    expect(parsed.metadata.documentNumber).toBe('SPEC-2026-MEC-001');
  });

  it('rejects confidence_score outside [0, 1] range', () => {
    const invalidItem = {
      requirement_text: 'All instruments shall be HART-enabled.',
      confidence_score: 1.5,
    };
    expect(() => ExtractionItemSchema.parse(invalidItem)).toThrow();
  });

  it('validates ProjectScopeInputSchema', () => {
    const input = {
      project_name: 'LNG Cryogenic Storage Train 2',
      facility_type: 'LNG Export Terminal',
      scope_description: 'Cryogenic storage tanks, boil-off gas compressors, and loading arms.',
      disciplines: ['Mechanical', 'Process', 'I&C'],
    };
    const parsed = ProjectScopeInputSchema.parse(input);
    expect(parsed.project_name).toBe('LNG Cryogenic Storage Train 2');
    expect(parsed.disciplines).toContain('Mechanical');
  });

  it('validates DocumentRevisionFlagSchema', () => {
    const flag = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      document_title: 'API 650 Storage Tanks Spec',
      document_owner: 'Mechanical SME',
      flagged_by: 'Lead Piping Engineer',
      issue_description: 'Clause 4.2 does not reflect 13th edition seismic load additions.',
    };
    const parsed = DocumentRevisionFlagSchema.parse(flag);
    expect(parsed.is_resolved).toBe(false);
    expect(parsed.suggested_action).toBe('Review and Update Standard');
  });
});
