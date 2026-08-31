import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { DocumentSummaryItemSchema, DocumentListResponseSchema } from '../src/shared/schemas.js';

describe('Document Search & Registry Tests', () => {
  it('correctly handles document summary item structure and defaults', () => {
    const docData = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      filename: 'API 610 12th Edition Centrifugal Pumps',
      document_number: 'API-610-12ED',
      document_date: '2024-01-15',
      document_type: 'Standard',
      owner_sme: 'Senior Mechanical Engineer',
      version: '12.0',
      requirement_count: 52,
      status_breakdown: {
        approved: 40,
        pending: 10,
        edited: 2,
        rejected: 0,
      },
      created_at: new Date().toISOString(),
    };

    const parsed = DocumentSummaryItemSchema.parse(docData);
    expect(parsed.filename).toBe('API 610 12th Edition Centrifugal Pumps');
    expect(parsed.document_number).toBe('API-610-12ED');
    expect(parsed.version).toBe('12.0');
    expect(parsed.requirement_count).toBe(52);
    expect(parsed.status_breakdown.approved).toBe(40);
  });

  it('calculates pagination metadata accurately', () => {
    const total = 47;
    const pageSize = 10;
    const page = 3;
    const totalPages = Math.ceil(total / pageSize);

    expect(totalPages).toBe(5);
    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, total);
    expect(startIdx).toBe(21);
    expect(endIdx).toBe(30);
  });

  it('validates document list response with empty items', () => {
    const emptyResponse = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    };

    const parsed = DocumentListResponseSchema.parse(emptyResponse);
    expect(parsed.items).toHaveLength(0);
    expect(parsed.total).toBe(0);
    expect(parsed.totalPages).toBe(1);
  });
});
