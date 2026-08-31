import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  Flag,
  Filter,
  Search,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Layers,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  fetchExtractions,
  updateExtraction,
  bulkUpdateExtractions,
  createDocumentFlag,
} from '../api/client.js';
import { ExtractionRecord, EngineeringDisciplineValues } from '@shared/schemas';

const DEFAULT_REVIEWERS = [
  'All',
  'Senior Mechanical SME',
  'Mechanical SME',
  'Piping SME',
  'Electrical SME',
  'I&C Lead',
  'Process Lead',
  'Civil/Structural SME',
  'HSE Lead',
  'Quality Manager',
  'General Engineering Lead',
];

interface DocumentGroup {
  groupKey: string;
  documentNumber: string;
  documentVersion: string;
  documentTitle: string;
  documentType: string;
  documentDate?: string;
  documentOwner?: string;
  items: ExtractionRecord[];
}

export default function ReviewQueue() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('Pending Review');
  const [disciplineFilter, setDisciplineFilter] = useState('All');
  const [reviewerFilter, setReviewerFilter] = useState('All');
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Editing state
  const [editingItem, setEditingItem] = useState<ExtractionRecord | null>(null);
  const [editText, setEditText] = useState('');
  const [editDiscipline, setEditDiscipline] = useState('');
  const [editCompliance, setEditCompliance] = useState('');
  const [editType, setEditType] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editComments, setEditComments] = useState('');

  // Flag Modal state
  const [flaggingItem, setFlaggingItem] = useState<ExtractionRecord | null>(null);
  const [flagIssue, setFlagIssue] = useState('');
  const [flagAction, setFlagAction] = useState('Review and Update Standard');

  // Effective SME Reviewer for action logging
  const activeSigner = reviewerFilter !== 'All' ? reviewerFilter : 'Senior Mechanical SME';

  // Dismiss modals on Escape key (Modern Web Guidance: platform-controls-dismiss-dialog)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingItem) setEditingItem(null);
        if (flaggingItem) setFlaggingItem(null);
      }
    };
    if (editingItem || flaggingItem) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [editingItem, flaggingItem]);

  // Fetch extractions query
  const { data: extractions = [], isLoading } = useQuery({
    queryKey: ['extractions', { statusFilter, disciplineFilter, reviewerFilter, lowConfidenceOnly, keyword }],
    queryFn: () =>
      fetchExtractions({
        status: statusFilter,
        discipline: disciplineFilter,
        reviewer: reviewerFilter,
        lowConfidenceOnly,
        keyword,
      }),
  });

  // Dynamically compute list of SME reviewers
  const availableReviewers = useMemo(() => {
    const set = new Set<string>(DEFAULT_REVIEWERS);
    extractions.forEach((item) => {
      if (item.sme_reviewer && item.sme_reviewer.trim()) {
        set.add(item.sme_reviewer.trim());
      }
      if (item.document_owner && item.document_owner.trim()) {
        set.add(item.document_owner.trim());
      }
    });
    return Array.from(set);
  }, [extractions]);

  // Group requirements by document (unique by document number + revision/version)
  const documentGroups = useMemo<DocumentGroup[]>(() => {
    const groupMap = new Map<string, DocumentGroup>();

    for (const item of extractions) {
      const docNum = (item.document_number && item.document_number.trim()) || (item.document_title ? item.document_title.trim() : 'UNASSIGNED-DOC');
      const docVer = (item.document_version && item.document_version.trim()) || '1.0';
      const groupKey = `${docNum}:::${docVer}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          groupKey,
          documentNumber: item.document_number?.trim() || 'No Document Number',
          documentVersion: item.document_version?.trim() || '1.0',
          documentTitle: item.document_title?.trim() || item.section_title?.trim() || 'Engineering Document Specification',
          documentType: item.document_type || 'Standard',
          documentDate: item.document_date || undefined,
          documentOwner: item.document_owner || undefined,
          items: [],
        });
      }
      groupMap.get(groupKey)!.items.push(item);
    }

    return Array.from(groupMap.values());
  }, [extractions]);

  // Single update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => updateExtraction(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extractions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setEditingItem(null);
    },
  });

  // Bulk update mutation
  const bulkMutation = useMutation({
    mutationFn: (payload: { items: any[]; reviewer: string; defaultStatus?: string }) =>
      bulkUpdateExtractions(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extractions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setRowSelection({});
    },
  });

  // Create flag mutation
  const flagMutation = useMutation({
    mutationFn: (payload: any) => createDocumentFlag(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentFlags'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setFlaggingItem(null);
      setFlagIssue('');
    },
  });

  const handleEditClick = (item: ExtractionRecord) => {
    setEditingItem(item);
    setEditText(item.requirement_text);
    setEditDiscipline(item.engineering_discipline);
    setEditCompliance(item.compliance_level);
    setEditType(item.item_type || 'Requirement');
    setEditCost(item.estimated_cost_impact || 'TBD');
    setEditComments(item.sme_comments || '');
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      payload: {
        status: 'Edited',
        sme_reviewer: activeSigner,
        requirement_text: editText,
        engineering_discipline: editDiscipline,
        compliance_level: editCompliance,
        item_type: editType,
        estimated_cost_impact: editCost,
        sme_comments: editComments,
      },
    });
  };

  const handleApproveSingle = (item: ExtractionRecord) => {
    updateMutation.mutate({
      id: item.id,
      payload: {
        status: 'Approved',
        sme_reviewer: activeSigner,
        sme_comments: 'Approved by SME during review queue check',
      },
    });
  };

  const handleRejectSingle = (item: ExtractionRecord) => {
    updateMutation.mutate({
      id: item.id,
      payload: {
        status: 'Rejected',
        sme_reviewer: activeSigner,
        sme_comments: 'Rejected by SME during validation',
      },
    });
  };

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const selectedItems = extractions.filter((item) => rowSelection[item.id]);

  const handleBulkApprove = () => {
    if (selectedItems.length === 0) return;
    bulkMutation.mutate({
      items: selectedItems.map((r) => ({ id: r.id, status: 'Approved' })),
      reviewer: activeSigner,
      defaultStatus: 'Approved',
    });
  };

  const handleBulkReject = () => {
    if (selectedItems.length === 0) return;
    bulkMutation.mutate({
      items: selectedItems.map((r) => ({ id: r.id, status: 'Rejected' })),
      reviewer: activeSigner,
      defaultStatus: 'Rejected',
    });
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    documentGroups.forEach((g) => {
      allCollapsed[g.groupKey] = true;
    });
    setCollapsedGroups(allCollapsed);
  };

  const toggleGroupSelection = (group: DocumentGroup) => {
    const allSelected = group.items.length > 0 && group.items.every((item) => rowSelection[item.id]);
    const updated = { ...rowSelection };
    group.items.forEach((item) => {
      if (allSelected) {
        delete updated[item.id];
      } else {
        updated[item.id] = true;
      }
    });
    setRowSelection(updated);
  };

  const toggleSingleRowSelection = (id: string) => {
    setRowSelection((prev) => {
      const updated = { ...prev };
      if (updated[id]) {
        delete updated[id];
      } else {
        updated[id] = true;
      }
      return updated;
    });
  };

  const handleApproveGroupPending = (group: DocumentGroup) => {
    const pendingItems = group.items.filter((item) => item.status === 'Pending Review');
    if (pendingItems.length === 0) return;
    bulkMutation.mutate({
      items: pendingItems.map((r) => ({ id: r.id, status: 'Approved' })),
      reviewer: activeSigner,
      defaultStatus: 'Approved',
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          📋 SME Review & Validation Queue
        </h1>
        <p className="text-slate-600 mt-1">
          Review extracted clauses, validate low-confidence items (&lt; 0.85), edit discipline classifications, and ensure strict compliance before project scoping.
        </p>
      </div>

      {/* Filter and Action Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:ring-1 focus:ring-brand-500 font-medium"
            >
              <option>All</option>
              <option>Pending Review</option>
              <option>Approved</option>
              <option>Edited</option>
              <option>Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Discipline</label>
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:ring-1 focus:ring-brand-500 font-medium"
            >
              <option>All</option>
              {EngineeringDisciplineValues.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Active SME Reviewer
            </label>
            <select
              value={reviewerFilter}
              onChange={(e) => setReviewerFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:ring-1 focus:ring-brand-500 font-medium text-slate-900"
            >
              {availableReviewers.map((rev) => (
                <option key={rev} value={rev}>
                  {rev === 'All' ? 'ALL (All Reviewers)' : rev}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Search Keywords</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search clause, code, doc..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 pl-8 text-xs focus:ring-1 focus:ring-brand-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer w-full text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={lowConfidenceOnly}
                onChange={(e) => setLowConfidenceOnly(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span>⚠️ Low Confidence (&lt;0.85)</span>
            </label>
          </div>
        </div>

        {/* Bulk Action Controls */}
        {selectedCount > 0 && (
          <div className="flex items-center justify-between p-3 bg-brand-50 rounded-lg border border-brand-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-900">
                {selectedCount} item(s) selected
              </span>
              <button
                type="button"
                onClick={() => setRowSelection({})}
                className="text-xs text-brand-700 hover:underline font-semibold"
              >
                Clear Selection
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkMutation.isPending}
                className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Bulk Approve Selected ({selectedCount})
              </button>
              <button
                type="button"
                onClick={handleBulkReject}
                disabled={bulkMutation.isPending}
                className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Bulk Reject Selected ({selectedCount})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table Summary & Expand/Collapse Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-medium">
            Found <strong className="text-slate-900">{extractions.length}</strong> requirements across{' '}
            <strong className="text-slate-900">{documentGroups.length}</strong> document(s)
          </span>
          {reviewerFilter !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold border border-brand-200">
              <UserCheck className="w-3 h-3" />
              Filter: {reviewerFilter}
            </span>
          )}
        </div>

        {documentGroups.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Document-Grouped Requirements View */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500 shadow-sm">
          Loading requirements queue...
        </div>
      ) : documentGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500 shadow-sm">
          No requirements found matching the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {documentGroups.map((group) => {
            const isCollapsed = Boolean(collapsedGroups[group.groupKey]);
            const allGroupSelected =
              group.items.length > 0 && group.items.every((item) => rowSelection[item.id]);
            const someGroupSelected =
              !allGroupSelected && group.items.some((item) => rowSelection[item.id]);

            const pendingCount = group.items.filter((i) => i.status === 'Pending Review').length;
            const lowConfCount = group.items.filter((i) => (i.confidence_score ?? 1.0) < 0.85).length;
            const approvedCount = group.items.filter((i) => i.status === 'Approved').length;

            return (
              <div
                key={group.groupKey}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all deferred-requirement-card"
              >
                {/* Document Group Header Banner */}
                <div className="bg-slate-50/90 border-b border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.groupKey)}
                      className="p-1 hover:bg-slate-200/70 rounded-md text-slate-600 transition-colors mt-0.5 sm:mt-0"
                      title={isCollapsed ? 'Expand Document Requirements' : 'Collapse Document Requirements'}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-700" />
                      )}
                    </button>

                    <input
                      type="checkbox"
                      checked={allGroupSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someGroupSelected;
                      }}
                      onChange={() => toggleGroupSelection(group)}
                      title="Select all in this document"
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4 mt-1 sm:mt-0"
                    />

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-brand-600" />
                          {group.documentNumber}
                        </span>

                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                          Rev {group.documentVersion}
                        </span>

                        {group.documentType && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                            {group.documentType}
                          </span>
                        )}

                        {group.documentOwner && (
                          <span className="text-[11px] font-medium text-slate-600">
                            Owner: <strong>{group.documentOwner}</strong>
                          </span>
                        )}

                        {group.documentDate && (
                          <span className="text-[11px] text-slate-500">
                            Date: {group.documentDate}
                          </span>
                        )}
                      </div>

                      <h2 className="text-sm font-semibold text-slate-900">
                        {group.documentTitle}
                      </h2>
                    </div>
                  </div>

                  {/* Document Metrics & Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        {group.items.length} reqs
                      </span>
                      {pendingCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          {pendingCount} Pending
                        </span>
                      )}
                      {lowConfCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          {lowConfCount} Low Conf
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {approvedCount} Approved
                        </span>
                      )}
                    </div>

                    {pendingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleApproveGroupPending(group)}
                        disabled={bulkMutation.isPending}
                        className="py-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Approve all pending requirements in this document"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve Pending ({pendingCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Document Group Requirements Table */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 text-slate-700 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-10 text-center">
                            <span className="sr-only">Select</span>
                          </th>
                          <th className="p-3 w-28">Code</th>
                          <th className="p-3 w-24">Type</th>
                          <th className="p-3 w-28">Discipline</th>
                          <th className="p-3">Requirement Clause</th>
                          <th className="p-3 w-24">Confidence</th>
                          <th className="p-3 w-28">Status</th>
                          <th className="p-3 w-36 text-center">Review Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-800">
                        {group.items.map((item) => {
                          const isSelected = Boolean(rowSelection[item.id]);
                          const score = item.confidence_score ?? 1.0;
                          const isLow = score < 0.85;

                          let statusColor = 'bg-slate-100 text-slate-800 border-slate-200';
                          if (item.status === 'Approved')
                            statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                          if (item.status === 'Pending Review')
                            statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
                          if (item.status === 'Rejected')
                            statusColor = 'bg-rose-100 text-rose-800 border-rose-200';
                          if (item.status === 'Edited')
                            statusColor = 'bg-sky-100 text-sky-800 border-sky-200';

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                isSelected ? 'bg-brand-50/50' : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSingleRowSelection(item.id)}
                                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                />
                              </td>
                              <td className="p-3">
                                <span className="font-mono font-bold text-brand-700">
                                  {item.requirement_code || 'REQ'}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                                  {item.item_type || 'Requirement'}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="font-medium text-slate-800">
                                  {item.engineering_discipline}
                                </span>
                              </td>
                              <td className="p-3">
                                <p className="max-w-md font-normal leading-relaxed text-slate-800 text-pretty line-clamp-3 hover:line-clamp-none transition-all">
                                  {item.requirement_text}
                                </p>
                                {item.sme_comments && (
                                  <p className="mt-1 text-[11px] text-slate-500 italic">
                                    💬 {item.sme_comments}
                                  </p>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="space-y-0.5">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                                      isLow
                                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}
                                  >
                                    {(score * 100).toFixed(0)}%
                                  </span>
                                  {isLow && (
                                    <span className="block text-[10px] text-rose-600 font-semibold">
                                      Low Conf
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${statusColor}`}
                                >
                                  {item.status}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveSingle(item)}
                                    title="Approve Requirement"
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-colors"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectSingle(item)}
                                    title="Reject Requirement"
                                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditClick(item)}
                                    title="Edit Clause"
                                    className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 border border-brand-200 transition-colors"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFlaggingItem(item)}
                                    title="Flag Document Revision"
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 border border-amber-200 transition-colors"
                                  >
                                    <Flag className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Drawer / Modal */}
      {editingItem && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-clause-modal-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 id="edit-clause-modal-title" className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-brand-600" />
                Edit Specification Clause: {editingItem.requirement_code || 'REQ'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Clause Text (Will update knowledge base & log feedback)
                </label>
                <textarea
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option>Requirement</option>
                    <option>Recommendation</option>
                    <option>Guideline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Discipline</label>
                  <select
                    value={editDiscipline}
                    onChange={(e) => setEditDiscipline(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    {EngineeringDisciplineValues.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Compliance</label>
                  <select
                    value={editCompliance}
                    onChange={(e) => setEditCompliance(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option>Mandatory</option>
                    <option>Recommended</option>
                    <option>Optional</option>
                    <option>Informational</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Cost Impact</label>
                  <select
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                    <option>Negligible</option>
                    <option>TBD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  SME Rationale & Comments
                </label>
                <input
                  type="text"
                  value={editComments}
                  onChange={(e) => setEditComments(e.target.value)}
                  placeholder="Explain reason for modification..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="py-2 px-4 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={handleSaveEdit}
                className="py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow transition-colors disabled:opacity-50"
              >
                Save & Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Standard Modal */}
      {flaggingItem && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="flag-document-modal-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 id="flag-document-modal-title" className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Flag className="w-5 h-5 text-rose-600" />
                Flag Upstream Document Revision
              </h3>
              <button
                type="button"
                onClick={() => setFlaggingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Flags standard <strong>{flaggingItem.document_number || flaggingItem.document_title || 'Engineering Specification'} (Rev {flaggingItem.document_version || '1.0'})</strong> to review for obsolescence, ambiguity, or regulatory changes.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Issue Description / Feedback
                </label>
                <textarea
                  rows={3}
                  value={flagIssue}
                  onChange={(e) => setFlagIssue(e.target.value)}
                  placeholder="E.g., ASME Section VIII Div 1 updated allowable stress limits..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Suggested Action
                </label>
                <select
                  value={flagAction}
                  onChange={(e) => setFlagAction(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  <option>Review and Update Standard</option>
                  <option>Retire / Deprecate Clause</option>
                  <option>Issue Clarification Addendum</option>
                  <option>Harmonize with Global Standard</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setFlaggingItem(null)}
                className="py-2 px-4 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={flagMutation.isPending || !flagIssue.trim()}
                onClick={() =>
                  flagMutation.mutate({
                    document_id: flaggingItem.document_id || null,
                    document_title: flaggingItem.document_title || flaggingItem.section_title || 'Engineering Specification',
                    document_owner: flaggingItem.document_owner || 'Engineering Lead',
                    flagged_by: activeSigner,
                    issue_description: flagIssue,
                    suggested_action: flagAction,
                  })
                }
                className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow transition-colors disabled:opacity-50"
              >
                Create Revision Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
