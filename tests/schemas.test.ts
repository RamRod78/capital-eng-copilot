import { describe, it, expect } from 'vitest';
import {
  ExtractionItemSchema,
  ExtractionBatchSchema,
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
