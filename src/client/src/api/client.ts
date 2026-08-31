import {
  ExtractionBatch,
  ExtractionRecord,
  ExtractionProgressEvent,
  SMEReviewUpdate,
  SearchResult,
  ProjectScopeInput,
  ProjectScopeRecord,
  ProjectCreateInput,
  ScopingRequirementItem,
  RFPPackage,
  FeedbackEntry,
  FeedbackEntryCreate,
  DocumentRevisionFlag,
  DocumentRecord,
  DocumentSummaryItem,
  DocumentListResponse,
} from '@shared/schemas';

const API_BASE = '/api';

async function parseResponseJson<T = any>(res: Response, fallbackError = 'Request failed'): Promise<T> {
  if (!res.ok) {
    let errMsg = fallbackError;
    try {
      const data = await res.json();
      errMsg = data.error || data.message || fallbackError;
    } catch (_) {
      try {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          errMsg = `${fallbackError} (${res.status}): ${text.slice(0, 150)}`;
        } else {
          errMsg = `${fallbackError} (HTTP ${res.status})`;
        }
      } catch (_) {
        errMsg = `${fallbackError} (HTTP ${res.status})`;
      }
    }
    throw new Error(errMsg);
  }

  try {
    return await res.json();
  } catch (err: any) {
    throw new Error(`Invalid response format from server (${err.message})`);
  }
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  return parseResponseJson(res, 'Failed to fetch stats');
}

export async function parseUploadedFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/ingest/parse-file`, {
    method: 'POST',
    body: formData,
  });
  return parseResponseJson(res, 'Failed to parse file');
}

export async function extractRequirements(data: {
  content: string;
  documentTitle?: string;
  documentNumber?: string;
  documentDate?: string;
  documentOwner?: string;
}): Promise<ExtractionBatch> {
  const res = await fetch(`${API_BASE}/ingest/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseResponseJson(res, 'Extraction failed');
}

export async function extractRequirementsStream(
  data: {
    content: string;
    documentTitle?: string;
    documentNumber?: string;
    documentDate?: string;
    documentOwner?: string;
  },
  onProgress?: (event: ExtractionProgressEvent) => void
): Promise<ExtractionBatch> {
  const res = await fetch(`${API_BASE}/ingest/extract-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let errMsg = 'Extraction failed';
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
    } catch (_) {
      try {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          errMsg = `Extraction failed (${res.status}): ${text.slice(0, 150)}`;
        } else {
          errMsg = `Extraction failed (HTTP ${res.status})`;
        }
      } catch (_) {}
    }
    throw new Error(errMsg);
  }

  if (!res.body) {
    throw new Error('ReadableStream not supported on this response');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalResult: ExtractionBatch | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;

      const chunkLines = chunk.split(/\r?\n/);
      let eventType = 'message';
      let dataStr = '';

      for (const line of chunkLines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataStr = line.slice(5).trim();
        }
      }

      if (!dataStr) continue;

      try {
        const parsed = JSON.parse(dataStr);
        if (eventType === 'progress') {
          onProgress?.(parsed as ExtractionProgressEvent);
        } else if (eventType === 'result') {
          finalResult = parsed as ExtractionBatch;
        } else if (eventType === 'error') {
          streamError = parsed.error || 'Extraction failed';
        }
      } catch (parseErr) {
        console.warn('Failed to parse SSE event chunk:', dataStr, parseErr);
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }

  if (!finalResult) {
    throw new Error('Extraction stream ended without returning final result');
  }

  return finalResult;
}

export async function saveExtractionBatch(data: {
  documentTitle: string;
  documentNumber?: string;
  documentDate?: string;
  documentType?: string;
  ownerSme?: string;
  version?: string;
  rawContent: string;
  batchId?: string;
  items: any[];
  tokenUsage?: any;
}) {
  const res = await fetch(`${API_BASE}/ingest/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseResponseJson(res, 'Failed to save batch');
}

export async function fetchExtractions(params?: {
  status?: string;
  discipline?: string;
  owner?: string;
  reviewer?: string;
  lowConfidenceOnly?: boolean;
  keyword?: string;
}): Promise<ExtractionRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.append('status', params.status);
  if (params?.discipline) searchParams.append('discipline', params.discipline);
  if (params?.reviewer) searchParams.append('reviewer', params.reviewer);
  else if (params?.owner) searchParams.append('owner', params.owner);
  if (params?.lowConfidenceOnly) searchParams.append('lowConfidenceOnly', 'true');
  if (params?.keyword) searchParams.append('keyword', params.keyword);

  const res = await fetch(`${API_BASE}/extractions?${searchParams.toString()}`);
  return parseResponseJson(res, 'Failed to fetch extractions');
}

export async function updateExtraction(id: string, update: Partial<SMEReviewUpdate>) {
  const res = await fetch(`${API_BASE}/extractions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  return parseResponseJson(res, 'Failed to update extraction');
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
  return parseResponseJson(res, 'Failed to bulk update');
}

export async function fetchProjects(): Promise<ProjectScopeRecord[]> {
  const res = await fetch(`${API_BASE}/scoping/projects`);
  return parseResponseJson(res, 'Failed to fetch projects');
}

export async function fetchProject(id: string): Promise<{ project: ProjectScopeRecord; items: ScopingRequirementItem[] }> {
  const res = await fetch(`${API_BASE}/scoping/projects/${id}`);
  return parseResponseJson(res, 'Failed to fetch project details');
}

export async function createProject(data: ProjectCreateInput): Promise<ProjectScopeRecord> {
  const res = await fetch(`${API_BASE}/scoping/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseResponseJson(res, 'Failed to create project');
}

export async function updateProject(id: string, data: Partial<ProjectCreateInput>): Promise<ProjectScopeRecord> {
  const res = await fetch(`${API_BASE}/scoping/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseResponseJson(res, 'Failed to update project');
}

export async function deleteProject(id: string): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/scoping/projects/${id}`, {
    method: 'DELETE',
  });
  return parseResponseJson(res, 'Failed to delete project');
}

export async function matchScopeRequirements(input: ProjectScopeInput & { top_k?: number }): Promise<RFPPackage> {
  const res = await fetch(`${API_BASE}/scoping/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponseJson(res, 'Failed to match scope requirements');
}

export async function fetchProjectPackage(id: string): Promise<RFPPackage> {
  const res = await fetch(`${API_BASE}/scoping/projects/${id}/package`);
  return parseResponseJson(res, 'Failed to fetch scope package');
}

export async function saveRFPPackage(pkg: RFPPackage) {
  const res = await fetch(`${API_BASE}/scoping/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pkg),
  });
  return parseResponseJson(res, 'Failed to save RFP package');
}

export async function fetchFeedbackLessons(): Promise<FeedbackEntry[]> {
  const res = await fetch(`${API_BASE}/feedback/lessons`);
  return parseResponseJson(res, 'Failed to fetch lessons');
}

export async function createFeedbackLesson(data: FeedbackEntryCreate): Promise<FeedbackEntry> {
  const res = await fetch(`${API_BASE}/feedback/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseResponseJson(res, 'Failed to create feedback lesson');
}

export async function fetchDocumentFlags(params?: {
  showResolved?: boolean;
  owner?: string;
}): Promise<DocumentRevisionFlag[]> {
  const searchParams = new URLSearchParams();
  if (params?.showResolved) searchParams.append('showResolved', 'true');
  if (params?.owner) searchParams.append('owner', params.owner);

  const res = await fetch(`${API_BASE}/feedback/flags?${searchParams.toString()}`);
  return parseResponseJson(res, 'Failed to fetch flags');
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
  return parseResponseJson(res, 'Failed to create flag');
}

export async function resolveDocumentFlag(id: string) {
  const res = await fetch(`${API_BASE}/feedback/flags/${id}/resolve`, {
    method: 'PATCH',
  });
  return parseResponseJson(res, 'Failed to resolve flag');
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
  return parseResponseJson(res, 'Search failed');
}

export async function fetchAdminCounts() {
  const res = await fetch(`${API_BASE}/admin/counts`);
  return parseResponseJson(res, 'Failed to fetch table counts');
}

export async function purgeDatabaseRecords(
  target: 'all' | 'extractions' | 'scopes' | 'projects' | 'scoping_items' | 'feedback'
) {
  const res = await fetch(`${API_BASE}/admin/purge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  return parseResponseJson(res, 'Purge failed');
}

export async function reindexAdminEmbeddings() {
  const res = await fetch(`${API_BASE}/admin/reindex-embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return parseResponseJson(res, 'Failed to re-index embeddings');
}

export async function fetchDocuments(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  documentType?: string;
  owner?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<DocumentListResponse> {
  const query = new URLSearchParams();
  if (params?.keyword) query.set('keyword', params.keyword);
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());
  if (params?.documentType) query.set('documentType', params.documentType);
  if (params?.owner) query.set('owner', params.owner);
  if (params?.sortBy) query.set('sortBy', params.sortBy);
  if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

  const res = await fetch(`${API_BASE}/documents?${query.toString()}`);
  return parseResponseJson(res, 'Failed to fetch documents');
}

export async function fetchDocumentDetails(id: string): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE}/documents/${id}`);
  return parseResponseJson(res, 'Failed to fetch document details');
}

export async function fetchDocumentRequirements(
  documentId: string,
  params?: {
    status?: string;
    discipline?: string;
    keyword?: string;
  }
): Promise<{
  document: {
    id: string;
    filename: string;
    document_number?: string | null;
    document_date?: string | null;
    document_type?: string;
    owner_sme?: string;
    version?: string;
  };
  requirements: ExtractionRecord[];
  total: number;
}> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.discipline) query.set('discipline', params.discipline);
  if (params?.keyword) query.set('keyword', params.keyword);

  const res = await fetch(`${API_BASE}/documents/${documentId}/requirements?${query.toString()}`);
  return parseResponseJson(res, 'Failed to fetch document requirements');
}


