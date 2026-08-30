import { describe, it, expect } from 'vitest';
import { parseUploadedFileBuffer } from '../src/server/services/parsers.js';

describe('Document Parsers', () => {
  it('parses plain text and markdown buffers', async () => {
    const textBuffer = Buffer.from(
      '# API 610 Centrifugal Pumps\nAll pumps shall be equipped with tandem mechanical seals with pressurized barrier fluid.'
    );
    const result = await parseUploadedFileBuffer(textBuffer, 'pumps.md');
    expect(result.error).toBeUndefined();
    expect(result.text).toContain('API 610');
    expect(result.text).toContain('mechanical seals');
  });

  it('parses CSV buffers', async () => {
    const csvBuffer = Buffer.from(
      'Code,Discipline,Requirement\nREQ-01,Mechanical,API 650 Storage Tanks\nREQ-02,Electrical,4160V Switchgear'
    );
    const result = await parseUploadedFileBuffer(csvBuffer, 'specs.csv');
    expect(result.error).toBeUndefined();
    expect(result.text).toContain('API 650 Storage Tanks');
    expect(result.text).toContain('4160V Switchgear');
  });

  it('handles empty buffer gracefully', async () => {
    const emptyBuffer = Buffer.from('');
    const result = await parseUploadedFileBuffer(emptyBuffer, 'empty.txt');
    expect(result.error).toBeDefined();
    expect(result.text).toBe('');
  });
});
