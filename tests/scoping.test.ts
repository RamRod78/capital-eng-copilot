import { describe, it, expect } from 'vitest';
import {
  RFPPackageSchema,
  ScopingRequirementItemSchema,
  ProjectScopeRecordSchema,
  ProjectCreateInputSchema,
  FeedbackEntryCreateSchema,
} from '../src/shared/schemas.js';

describe('Project Scoping & RFP Models', () => {
  it('validates project creation and record schemas for Step 1 (Configure Projects)', () => {
    const input = {
      project_name: 'Permian Cryogenic Gas Plant',
      project_code: 'PRM-2026-001',
      facility_type: 'Gas Processing Plant',
      operating_conditions: 'Sour gas, 1200 psig, ambient -20F to 115F',
      disciplines: ['Mechanical', 'Piping', 'I&C', 'Process'],
      scope_description: 'Installation of high pressure turbo-expanders and mole sieve dehydration beds.',
      status: 'Configured',
      created_by: 'Lead Process Engineer',
    };

    const parsedInput = ProjectCreateInputSchema.parse(input);
    expect(parsedInput.project_name).toBe('Permian Cryogenic Gas Plant');
    expect(parsedInput.disciplines).toHaveLength(4);

    const record = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const parsedRecord = ProjectScopeRecordSchema.parse(record);
    expect(parsedRecord.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(parsedRecord.status).toBe('Configured');
  });

  it('validates complete RFP package model for Step 2 (Generate RFPs)', () => {
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

  it('validates feedback lesson creation schema for Step 3 (Validate RFPs deletions & additions)', () => {
    const removalFeedback = {
      extraction_id: '223e4567-e89b-12d3-a456-426614174001',
      project_scope_id: '123e4567-e89b-12d3-a456-426614174000',
      original_text: 'Compressors shall be rated for Class 1 Div 2 hazardous locations.',
      original_status: 'Included in RFP',
      final_status: 'Rejected' as const,
      reviewer: 'Senior Safety SME',
      reason: 'Facility classified as non-hazardous unclassified area based on ventilation study.',
    };

    const parsedRemoval = FeedbackEntryCreateSchema.parse(removalFeedback);
    expect(parsedRemoval.final_status).toBe('Rejected');
    expect(parsedRemoval.reason).toContain('ventilation study');

    const additionFeedback = {
      extraction_id: '323e4567-e89b-12d3-a456-426614174099',
      project_scope_id: '123e4567-e89b-12d3-a456-426614174000',
      original_text: 'High-alloy duplex stainless steel required for wet H2S piping systems.',
      reviewed_text: 'High-alloy duplex stainless steel required for wet H2S piping systems.',
      original_status: 'Searched Knowledge Base',
      final_status: 'Approved' as const,
      reviewer: 'Materials & Metallurgy SME',
      reason: 'Sour service condition requires duplex stainless steel per NACE MR0175.',
    };

    const parsedAddition = FeedbackEntryCreateSchema.parse(additionFeedback);
    expect(parsedAddition.final_status).toBe('Approved');
    expect(parsedAddition.reviewer).toBe('Materials & Metallurgy SME');
  });
});
