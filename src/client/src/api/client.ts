import {
  ExtractionBatch,
  ExtractionRecord,
  SMEReviewUpdate,
  SearchResult,
  ProjectScopeInput,
  RFPPackage,
  FeedbackEntry,
  DocumentRevisionFlag,
} from '@shared/schemas';

const API_BASE = '/api';

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function parseUploadedFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/ingest/parse-file`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to parse file');
  }
  return res.json();
}

export async function extractRequirements(data: {
  content: string;
  documentTitle?: string;
  documentOwner?: string;
}): Promise<ExtractionBatch> {
  const res = await fetch(`${API_BASE}/ingest/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Extraction failed');
  }
  return res.json();
}

export async function saveExtractionBatch(data: {
  documentTitle: string;
  documentType?: string;
  ownerSme?: string;
  version?: string;
  rawContent: string;
  batchId?: string;
  items: any[];
}) {
  const res = await fetch(`${API_BASE}/ingest/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to save batch');
  }
  return res.json();
}

export async function fetchExtractions(params?: {
  status?: string;
  discipline?: string;
  owner?: string;
  lowConfidenceOnly?: boolean;
  keyword?: string;
}): Promise<ExtractionRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.append('status', params.status);
  if (params?.discipline) searchParams.append('discipline', params.discipline);
  if (params?.owner) searchParams.append('owner', params.owner);
  if (params?.lowConfidenceOnly) searchParams.append('lowConfidenceOnly', 'true');
  if (params?.keyword) searchParams.append('keyword', params.keyword);

  const res = await fetch(`${API_BASE}/extractions?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch extractions');
  return res.json();
}

export async function updateExtraction(id: string, update: Partial<SMEReviewUpdate>) {
  const res = await fetch(`${API_BASE}/extractions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update extraction');
  }
  return res.json();
}

export async function bulkUpdateExtractions(data: {
  items: any[];
  reviewer: string;
  defaultStatus?: string;
}) {
  const res = await fetch(`${API_BASE}/extractions/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to bulk update');
  }
  return res.json();
}

export async function matchScopeRequirements(input: ProjectScopeInput & { top_k?: number }): Promise<RFPPackage> {
  const res = await fetch(`${API_BASE}/scoping/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to match scope requirements');
  }
  return res.json();
}

export async function saveRFPPackage(pkg: RFPPackage) {
  const res = await fetch(`${API_BASE}/scoping/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pkg),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to save RFP package');
  }
  return res.json();
}

export async function fetchFeedbackLessons(): Promise<FeedbackEntry[]> {
  const res = await fetch(`${API_BASE}/feedback/lessons`);
  if (!res.ok) throw new Error('Failed to fetch lessons');
  return res.json();
}

export async function fetchDocumentFlags(params?: {
  showResolved?: boolean;
  owner?: string;
}): Promise<DocumentRevisionFlag[]> {
  const searchParams = new URLSearchParams();
  if (params?.showResolved) searchParams.append('showResolved', 'true');
  if (params?.owner) searchParams.append('owner', params.owner);

  const res = await fetch(`${API_BASE}/feedback/flags?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch flags');
  return res.json();
}

export async function createDocumentFlag(data: {
  document_title: string;
  document_owner: string;
  flagged_by: string;
  issue_description: string;
  suggested_action?: string;
  document_id?: string;
}) {
  const res = await fetch(`${API_BASE}/feedback/flags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create flag');
  }
  return res.json();
}

export async function resolveDocumentFlag(id: string) {
  const res = await fetch(`${API_BASE}/feedback/flags/${id}/resolve`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Failed to resolve flag');
  return res.json();
}

export async function searchSimilarRequirements(data: {
  query: string;
  top_k?: number;
  discipline?: string;
  item_type?: string;
}): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Search failed');
  }
  return res.json();
}
