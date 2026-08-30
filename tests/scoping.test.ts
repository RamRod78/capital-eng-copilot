import { describe, it, expect } from 'vitest';
import { RFPPackageSchema, ScopingRequirementItemSchema } from '../src/shared/schemas.js';

describe('Project Scoping & RFP Models', () => {
  it('validates complete RFP package model', () => {
    const pkg = {
      package_id: '123e4567-e89b-12d3-a456-426614174000',
      project_name: 'Offshore Flare Gas Recovery',
      facility_type: 'Offshore Production Platform',
      scope_summary: 'Install low-pressure liquid ring compressors and knock-out drums.',
      mandatory_requirements: [
        {
          scoping_item_id: '223e4567-e89b-12d3-a456-426614174001',
          requirement_code: 'REQ-MEC-010',
          requirement_text: 'Compressors shall be rated for Class 1 Div 2 hazardous locations.',
          item_type: 'Requirement',
          engineering_discipline: 'Mechanical',
          compliance_level: 'Mandatory',
          relevance_score: 0.96,
          is_selected: true,
        },
      ],
      recommendations: [
        {
          scoping_item_id: '223e4567-e89b-12d3-a456-426614174002',
          requirement_code: 'REC-ELE-005',
          requirement_text: 'Variable frequency drives should include harmonic mitigation filters.',
          item_type: 'Recommendation',
          engineering_discipline: 'Electrical',
          compliance_level: 'Recommended',
          relevance_score: 0.88,
          is_selected: true,
        },
      ],
      guidelines: [],
    };

    const parsed = RFPPackageSchema.parse(pkg);
    expect(parsed.project_name).toBe('Offshore Flare Gas Recovery');
    expect(parsed.mandatory_requirements.length).toBe(1);
    expect(parsed.recommendations.length).toBe(1);
    expect(parsed.generated_by).toBe('Capital Engineering Copilot Agent');
  });
});
