import { describe, it, expect } from 'vitest';
import {
  RFPPackageSchema,
  ScopingRequirementItemSchema,
  ProjectScopeRecordSchema,
  ProjectCreateInputSchema,
  FeedbackEntryCreateSchema,
  sortRequirementItems,
  groupRequirementsByDiscipline,
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
      saved_items_count: 12,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const parsedRecord = ProjectScopeRecordSchema.parse(record);
    expect(parsedRecord.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(parsedRecord.status).toBe('Configured');
    expect(parsedRecord.saved_items_count).toBe(12);
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

  it('groups requirements by discipline within a category and sorts by requirement number', () => {
    const rawItems = [
      {
        scoping_item_id: '1',
        requirement_code: 'REQ-MEC-010',
        requirement_text: 'Mechanical requirement 10',
        engineering_discipline: 'Mechanical',
        compliance_level: 'Mandatory',
      },
      {
        scoping_item_id: '2',
        requirement_code: 'REQ-ELE-002',
        requirement_text: 'Electrical requirement 2',
        engineering_discipline: 'Electrical',
        compliance_level: 'Mandatory',
      },
      {
        scoping_item_id: '3',
        requirement_code: 'REQ-MEC-002',
        requirement_text: 'Mechanical requirement 2',
        engineering_discipline: 'Mechanical',
        compliance_level: 'Mandatory',
      },
      {
        scoping_item_id: '4',
        requirement_code: 'REQ-PIP-001',
        requirement_text: 'Piping requirement 1',
        engineering_discipline: 'Piping',
        compliance_level: 'Mandatory',
      },
      {
        scoping_item_id: '5',
        requirement_code: 'REQ-MEC-001',
        requirement_text: 'Mechanical requirement 1',
        engineering_discipline: 'Mechanical',
        compliance_level: 'Mandatory',
      },
      {
        scoping_item_id: '6',
        requirement_code: 'REQ-ELE-001',
        requirement_text: 'Electrical requirement 1',
        engineering_discipline: 'Electrical',
        compliance_level: 'Mandatory',
      },
    ];

    const sorted = sortRequirementItems(rawItems);
    expect(sorted.map((i) => i.requirement_code)).toEqual([
      'REQ-MEC-001',
      'REQ-MEC-002',
      'REQ-MEC-010',
      'REQ-PIP-001',
      'REQ-ELE-001',
      'REQ-ELE-002',
    ]);

    const groups = groupRequirementsByDiscipline(rawItems);
    expect(groups).toHaveLength(3);

    // 1. Mechanical group (ordered first per standard discipline order)
    expect(groups[0].discipline).toBe('Mechanical');
    expect(groups[0].items.map((i) => i.requirement_code)).toEqual([
      'REQ-MEC-001',
      'REQ-MEC-002',
      'REQ-MEC-010',
    ]);

    // 2. Piping group
    expect(groups[1].discipline).toBe('Piping');
    expect(groups[1].items.map((i) => i.requirement_code)).toEqual([
      'REQ-PIP-001',
    ]);

    // 3. Electrical group
    expect(groups[2].discipline).toBe('Electrical');
    expect(groups[2].items.map((i) => i.requirement_code)).toEqual([
      'REQ-ELE-001',
      'REQ-ELE-002',
    ]);
  });

  it('validates RFPPackageSchema with token_usage observability metadata', () => {
    const pkgWithTokens = {
      package_id: '123e4567-e89b-12d3-a456-426614174000',
      project_name: 'Gulf Coast NGL Fractionation Unit 3',
      project_code: 'CAP-2026-NGL-03',
      facility_type: 'NGL Fractionation & Gas Plant',
      scope_summary: 'EPC scope for 150,000 BPD fractionation train with amine treaters.',
      mandatory_requirements: [
        {
          scoping_item_id: '223e4567-e89b-12d3-a456-426614174001',
          requirement_code: 'REQ-MEC-00000001',
          requirement_text: 'Pressure vessels shall be designed in accordance with ASME Section VIII Div 1.',
          item_type: 'Requirement',
          engineering_discipline: 'Mechanical',
          compliance_level: 'Mandatory',
          relevance_score: 0.98,
          is_selected: true,
          custom_notes: 'Mandatory code compliance for 1480 psig design pressure.',
        },
      ],
      recommendations: [],
      guidelines: [],
      token_usage: {
        stage1: { promptTokens: 350, candidateTokens: 0, thoughtTokens: 0, totalTokens: 350, model: 'gemini-embedding-001' },
        stage2: { promptTokens: 2400, candidateTokens: 850, thoughtTokens: 512, totalTokens: 3762, model: 'gemini-3.7-flash' },
        stage3: { promptTokens: 1100, candidateTokens: 320, totalTokens: 1420, model: 'gemini-2.5-pro' },
        totalPromptTokens: 3850,
        totalCandidateTokens: 1170,
        totalThoughtTokens: 512,
        totalTokens: 5532,
      },
    };

    const parsed = RFPPackageSchema.parse(pkgWithTokens);
    expect(parsed.token_usage).toBeDefined();
    expect(parsed.token_usage?.stage1?.totalTokens).toBe(350);
    expect(parsed.token_usage?.stage2?.thoughtTokens).toBe(512);
    expect(parsed.token_usage?.stage3?.candidateTokens).toBe(320);
    expect(parsed.token_usage?.totalTokens).toBe(5532);
  });
});
