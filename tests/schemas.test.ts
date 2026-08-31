import { describe, it, expect } from 'vitest';
import {
  ExtractionItemSchema,
  ExtractionBatchSchema,
  ExtractionRecordSchema,
  DocumentRecordSchema,
  ProjectScopeInputSchema,
  RFPPackageSchema,
  DocumentRevisionFlagSchema,
  SearchResultSchema,
  ExtractionProgressEventSchema,
  getDisciplineCode,
  formatRequirementCode,
  parseRequirementCode,
  assignUniqueRequirementCodes,
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

  it('validates ExtractionRecordSchema with document metadata for grouping', () => {
    const record = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      batch_id: 'batch-001',
      requirement_code: 'REQ-MEC-001',
      requirement_text: 'All pressure vessels shall comply with ASME Section VIII.',
      engineering_discipline: 'Mechanical',
      compliance_level: 'Mandatory',
      status: 'Pending Review',
      document_number: 'SPEC-ENG-2026-001',
      document_version: '2.1',
      document_title: 'Pressure Vessels & Piping Standard',
      document_date: '2026-08-31',
      document_type: 'Standard',
    };
    const parsed = ExtractionRecordSchema.parse(record);
    expect(parsed.document_number).toBe('SPEC-ENG-2026-001');
    expect(parsed.document_version).toBe('2.1');
    expect(parsed.document_title).toBe('Pressure Vessels & Piping Standard');
  });

  it('validates SearchResultSchema with source document details', () => {
    const searchResult = {
      extraction_id: '123e4567-e89b-12d3-a456-426614174000',
      requirement_code: 'REQ-MEC-00000001',
      requirement_text: 'Centrifugal pumps shall comply with API 610 12th edition.',
      item_type: 'Requirement',
      category: 'Rotating Equipment',
      engineering_discipline: 'Mechanical',
      compliance_level: 'Mandatory',
      document_owner: 'Rotating Equipment Lead',
      section_title: '6.1 Pump Design and Nozzle Loads',
      document_title: 'API 610 Centrifugal Pumps Spec',
      document_number: 'API-610-ED12',
      document_version: '12.0',
      document_type: 'Standard',
      document_date: '2026-08-31',
      status: 'Approved',
      similarity_score: 0.942,
    };
    const parsed = SearchResultSchema.parse(searchResult);
    expect(parsed.document_number).toBe('API-610-ED12');
    expect(parsed.document_title).toBe('API 610 Centrifugal Pumps Spec');
    expect(parsed.document_version).toBe('12.0');
    expect(parsed.section_title).toBe('6.1 Pump Design and Nozzle Loads');
    expect(parsed.document_owner).toBe('Rotating Equipment Lead');
    expect(parsed.similarity_score).toBe(0.942);
  });

  describe('Unique Requirement Code Generation & Formatting', () => {
    it('maps standard engineering disciplines to standard 3-letter codes', () => {
      expect(getDisciplineCode('Mechanical')).toBe('MEC');
      expect(getDisciplineCode('Piping')).toBe('PIP');
      expect(getDisciplineCode('Electrical')).toBe('ELE');
      expect(getDisciplineCode('I&C')).toBe('INC');
      expect(getDisciplineCode('Civil/Structural')).toBe('CIV');
      expect(getDisciplineCode('Process')).toBe('PRO');
      expect(getDisciplineCode('HSE')).toBe('HSE');
      expect(getDisciplineCode('Quality')).toBe('QUA');
      expect(getDisciplineCode('General')).toBe('GEN');
      expect(getDisciplineCode(null)).toBe('GEN');
      expect(getDisciplineCode(undefined)).toBe('GEN');
    });

    it('formats requirement code with REQ-[DISCIPLINE]-[Sequence Number] and 8-digit zero padding', () => {
      expect(formatRequirementCode('Mechanical', 1)).toBe('REQ-MEC-00000001');
      expect(formatRequirementCode('Piping', 42)).toBe('REQ-PIP-00000042');
      expect(formatRequirementCode('Electrical', 99999999)).toBe('REQ-ELE-99999999');
      expect(formatRequirementCode('I&C', 5)).toBe('REQ-INC-00000005');
      expect(formatRequirementCode('Civil/Structural', 123)).toBe('REQ-CIV-00000123');

      // Verify strict regex structure: REQ-[DISCIPLINE]-[8 digits]
      const regex = /^REQ-[A-Z0-9]+-\d{8}$/;
      expect(regex.test(formatRequirementCode('Mechanical', 1))).toBe(true);
      expect(formatRequirementCode('Mechanical', 1).split('-')[2].length).toBe(8);
    });

    it('assigns unique requirement codes across extracted items batch', () => {
      const rawExtractedItems = [
        { requirement_text: 'Pressure relief valve setting.', engineering_discipline: 'Mechanical' },
        { requirement_text: 'Piping wall thickness margin.', engineering_discipline: 'Piping' },
        { requirement_text: 'Compressor nozzle design.', engineering_discipline: 'Mechanical' },
        { requirement_text: 'Cable tray segregation.', engineering_discipline: 'Electrical' },
        { requirement_text: 'Motor winding temperature sensors.', engineering_discipline: 'Electrical' },
      ];

      const processed = assignUniqueRequirementCodes(rawExtractedItems);

      expect(processed[0].requirement_code).toBe('REQ-MEC-00000001');
      expect(processed[1].requirement_code).toBe('REQ-PIP-00000001');
      expect(processed[2].requirement_code).toBe('REQ-MEC-00000002');
      expect(processed[3].requirement_code).toBe('REQ-ELE-00000001');
      expect(processed[4].requirement_code).toBe('REQ-ELE-00000002');

      // All requirement codes must be distinct
      const codes = processed.map(p => p.requirement_code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(rawExtractedItems.length);

      // Verify each code adheres strictly to REQ-[DISCIPLINE]-[8-digits]
      for (const code of codes) {
        expect(code).toMatch(/^REQ-[A-Z0-9]+-\d{8}$/);
        const parts = code.split('-');
        expect(parts[0]).toBe('REQ');
        expect(parts[2].length).toBe(8);
      }
    });

    it('parses formatted requirement codes correctly', () => {
      expect(parseRequirementCode('REQ-MEC-00000042')).toEqual({
        disciplineCode: 'MEC',
        sequenceNumber: 42,
      });
      expect(parseRequirementCode('REQ-ELE-00000105')).toEqual({
        disciplineCode: 'ELE',
        sequenceNumber: 105,
      });
      expect(parseRequirementCode('INVALID-CODE')).toBeNull();
      expect(parseRequirementCode(null)).toBeNull();
    });

    it('assigns globally continuous requirement codes with custom discipline sequence offsets', () => {
      const batch1 = [
        { requirement_text: 'Item 1', engineering_discipline: 'Mechanical' },
        { requirement_text: 'Item 2', engineering_discipline: 'Mechanical' },
        { requirement_text: 'Item 3', engineering_discipline: 'Electrical' },
      ];

      const processed1 = assignUniqueRequirementCodes(batch1);
      expect(processed1[0].requirement_code).toBe('REQ-MEC-00000001');
      expect(processed1[1].requirement_code).toBe('REQ-MEC-00000002');
      expect(processed1[2].requirement_code).toBe('REQ-ELE-00000001');

      // Second batch using startingSequence map representing live database max + 1
      const startingSequences = {
        MEC: 3, // Next available after MEC 2
        ELE: 2, // Next available after ELE 1
        PIP: 1,
      };

      const batch2 = [
        { requirement_text: 'Item 4', engineering_discipline: 'Mechanical' },
        { requirement_text: 'Item 5', engineering_discipline: 'Electrical' },
        { requirement_text: 'Item 6', engineering_discipline: 'Piping' },
        { requirement_text: 'Item 7', engineering_discipline: 'Mechanical' },
      ];

      const processed2 = assignUniqueRequirementCodes(batch2, { startingSequence: startingSequences });

      expect(processed2[0].requirement_code).toBe('REQ-MEC-00000003');
      expect(processed2[1].requirement_code).toBe('REQ-ELE-00000002');
      expect(processed2[2].requirement_code).toBe('REQ-PIP-00000001');
      expect(processed2[3].requirement_code).toBe('REQ-MEC-00000004');

      // Verify all codes between both batches are globally unique
      const allCodes = [...processed1.map(p => p.requirement_code), ...processed2.map(p => p.requirement_code)];
      const codeSet = new Set(allCodes);
      expect(codeSet.size).toBe(allCodes.length);
    });

    it('validates ExtractionProgressEventSchema across all stages', () => {
      const event1 = {
        stage: 1 as const,
        stageName: 'Structure Chunking & ToC Analysis',
        status: 'running' as const,
        message: 'Scanning document layout and chunking into sections...',
        timestamp: new Date().toISOString(),
        details: { model: 'Gemini 3.6 Flash' },
      };
      const parsed1 = ExtractionProgressEventSchema.parse(event1);
      expect(parsed1.stage).toBe(1);
      expect(parsed1.status).toBe('running');

      const event2 = {
        stage: 2 as const,
        stageName: 'Parallel Deep Extraction',
        status: 'completed' as const,
        message: 'Stage 2 Complete: Extracted 24 raw candidate requirements.',
        timestamp: new Date().toISOString(),
        details: { totalSections: 3, rawItemsCount: 24, model: 'Gemini 3.7 Flash (Thinking)' },
      };
      const parsed2 = ExtractionProgressEventSchema.parse(event2);
      expect(parsed2.stage).toBe(2);
      expect(parsed2.details?.rawItemsCount).toBe(24);

      const eventComplete = {
        stage: 'complete' as const,
        stageName: 'Extraction Complete',
        status: 'completed' as const,
        message: 'Pipeline finished: 18 requirements ready.',
        timestamp: new Date().toISOString(),
        details: { finalItemsCount: 18 },
      };
      const parsedComplete = ExtractionProgressEventSchema.parse(eventComplete);
      expect(parsedComplete.stage).toBe('complete');
      expect(parsedComplete.details?.finalItemsCount).toBe(18);
    });
  });
});

