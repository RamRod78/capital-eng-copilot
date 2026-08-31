import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lightbulb,
  Flag,
  CheckCircle2,
  AlertCircle,
  History,
  ShieldCheck,
  Search,
  Filter,
  Calendar,
  User,
  FileText,
  Eye,
  X,
  Edit3,
  XCircle,
  Tag,
} from 'lucide-react';
import { fetchFeedbackLessons, fetchDocumentFlags, resolveDocumentFlag } from '../api/client.js';
import type { FeedbackEntry, DocumentRevisionFlag } from '../../../shared/schemas.js';

export default function LessonsLearned() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'flags' | 'lessons'>('lessons');
  const [showResolved, setShowResolved] = useState(false);
  const [searchLessonQuery, setSearchLessonQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchFlagQuery, setSearchFlagQuery] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<string>('All');
  const [selectedLesson, setSelectedLesson] = useState<FeedbackEntry | null>(null);

  const { data: rawFlags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ['documentFlags', { showResolved }],
    queryFn: () => fetchDocumentFlags({ showResolved }),
  });

  const { data: rawLessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ['feedbackLessons'],
    queryFn: fetchFeedbackLessons,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveDocumentFlag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentFlags'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  // Normalize lessons with fallback support
  const lessons: FeedbackEntry[] = rawLessons.map((l: any) => ({
    id: l.id,
    extraction_id: l.extraction_id || l.extractionId,
    project_scope_id: l.project_scope_id || l.projectScopeId,
    original_text: l.original_text || l.originalText || '',
    reviewed_text: l.reviewed_text || l.reviewedText || null,
    original_status: l.original_status || l.originalStatus || 'Included in Scope',
    final_status: l.final_status || l.finalStatus || 'Approved',
    reviewer: l.reviewer || 'SME Reviewer',
    reason: l.reason || '',
    created_at: l.created_at || l.createdAt,
  }));

  // Normalize flags with fallback support
  const flags: DocumentRevisionFlag[] = rawFlags.map((f: any) => ({
    id: f.id,
    document_id: f.document_id || f.documentId,
    document_title: f.document_title || f.documentTitle || 'Standard Document',
    document_owner: f.document_owner || f.documentOwner || 'Engineering Lead',
    flagged_by: f.flagged_by || f.flaggedBy || 'SME Reviewer',
    issue_description: f.issue_description || f.issueDescription || '',
    suggested_action: f.suggested_action || f.suggestedAction || 'Review and Update Standard',
    is_resolved: Boolean(f.is_resolved ?? f.isResolved),
    created_at: f.created_at || f.createdAt,
    resolved_at: f.resolved_at || f.resolvedAt,
  }));

  // Filter lessons
  const filteredLessons = lessons.filter((lesson) => {
    const matchesSearch =
      searchLessonQuery.trim() === '' ||
      lesson.reviewer?.toLowerCase().includes(searchLessonQuery.toLowerCase()) ||
      lesson.original_text?.toLowerCase().includes(searchLessonQuery.toLowerCase()) ||
      lesson.reviewed_text?.toLowerCase().includes(searchLessonQuery.toLowerCase()) ||
      lesson.reason?.toLowerCase().includes(searchLessonQuery.toLowerCase()) ||
      lesson.original_status?.toLowerCase().includes(searchLessonQuery.toLowerCase()) ||
      lesson.final_status?.toLowerCase().includes(searchLessonQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' || lesson.final_status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Filter flags
  const flagOwners = Array.from(new Set(flags.map((f) => f.document_owner).filter(Boolean)));
  const filteredFlags = flags.filter((flag) => {
    const matchesSearch =
      searchFlagQuery.trim() === '' ||
      flag.document_title?.toLowerCase().includes(searchFlagQuery.toLowerCase()) ||
      flag.issue_description?.toLowerCase().includes(searchFlagQuery.toLowerCase()) ||
      flag.flagged_by?.toLowerCase().includes(searchFlagQuery.toLowerCase()) ||
      flag.suggested_action?.toLowerCase().includes(searchFlagQuery.toLowerCase());

    const matchesOwner = selectedOwner === 'All' || flag.document_owner === selectedOwner;

    return matchesSearch && matchesOwner;
  });

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Approved
        </span>
      );
    }
    if (s === 'rejected') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
          <XCircle className="w-3 h-3" /> Rejected
        </span>
      );
    }
    if (s === 'edited') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
          <Edit3 className="w-3 h-3" /> Edited
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
        {status}
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
              <Lightbulb className="w-7 h-7" />
            </span>
            Closed-Loop Feedback & Lessons Learned
          </h1>
          <p className="text-slate-600 mt-1 max-w-3xl text-sm">
            Audits SME review decisions, rejected clauses, and upstream document revision flags to continuously evolve engineering standards and agent memory.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('lessons')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'lessons'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="w-4 h-4" />
          SME Feedback & Modification Audit Log ({lessons.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('flags')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'flags'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Flag className="w-4 h-4" />
          Document Revision Flags ({flags.filter((f) => !f.is_resolved).length} Open)
        </button>
      </div>

      {/* Tab 1: SME Feedback & Modification Audit Log */}
      {activeTab === 'lessons' && (
        <div className="space-y-4">
          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail, reviewer, clause, reason..."
                value={searchLessonQuery}
                onChange={(e) => setSearchLessonQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              {searchLessonQuery && (
                <button
                  type="button"
                  onClick={() => setSearchLessonQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 whitespace-nowrap">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                Final Status:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="All">All Statuses</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Edited">Edited</option>
              </select>
            </div>
          </div>

          {/* Lessons Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {lessonsLoading ? (
              <div className="p-16 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="font-semibold text-slate-600">Loading feedback audit log...</p>
              </div>
            ) : filteredLessons.length === 0 ? (
              <div className="p-16 text-center text-sm text-slate-500 space-y-2">
                <Lightbulb className="w-12 h-12 text-slate-300 mx-auto mb-1" />
                <h3 className="font-bold text-slate-800 text-base">
                  {lessons.length === 0 ? 'No Modification Logs Recorded Yet' : 'No Matching Audit Logs Found'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {lessons.length === 0
                    ? 'When engineering SMEs approve, edit, reject clauses, or delete/add items during scoping, closed-loop feedback entries will appear here.'
                    : 'Try clearing or changing your search filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/80 text-slate-700 uppercase font-bold text-[11px] border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Date Logged</th>
                      <th className="py-3 px-4">Reviewer</th>
                      <th className="py-3 px-4">Original Status</th>
                      <th className="py-3 px-4">Final Status</th>
                      <th className="py-3 px-4">Original Clause</th>
                      <th className="py-3 px-4">Edited Clause</th>
                      <th className="py-3 px-4">Reason / Audit Trail</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {filteredLessons.map((lesson) => (
                      <tr key={lesson.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {formatTimestamp(lesson.created_at)}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {lesson.reviewer || 'SME Reviewer'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {getStatusBadge(lesson.original_status)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getStatusBadge(lesson.final_status)}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs font-mono text-[11px] text-slate-700 truncate" title={lesson.original_text}>
                          {lesson.original_text || '—'}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs font-mono text-[11px] text-emerald-800 truncate" title={lesson.reviewed_text || undefined}>
                          {lesson.reviewed_text || <span className="text-slate-400 font-sans italic">None (Unmodified)</span>}
                        </td>
                        <td className="py-3.5 px-4 max-w-sm text-slate-600 truncate" title={lesson.reason}>
                          {lesson.reason || '—'}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedLesson(lesson)}
                            className="p-1.5 text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-md transition-colors"
                            title="View Full Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Document Revision Flags */}
      {activeTab === 'flags' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search document flags, owner, issue..."
                value={searchFlagQuery}
                onChange={(e) => setSearchFlagQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              {searchFlagQuery && (
                <button
                  type="button"
                  onClick={() => setSearchFlagQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              {flagOwners.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Owner:</label>
                  <select
                    value={selectedOwner}
                    onChange={(e) => setSelectedOwner(e.target.value)}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="All">All Owners</option>
                    {flagOwners.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Show Resolved Flags</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flagsLoading ? (
              <div className="col-span-2 p-16 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="font-semibold text-slate-600">Loading document revision flags...</p>
              </div>
            ) : filteredFlags.length === 0 ? (
              <div className="col-span-2 bg-white p-12 rounded-xl border border-slate-200 text-center">
                <ShieldCheck className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-slate-900 text-base">No Open Revision Flags</h3>
                <p className="text-xs text-slate-500 mt-1">All engineering standards and documents are currently up-to-date.</p>
              </div>
            ) : (
              filteredFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={`bg-white p-5 rounded-xl border space-y-3 shadow-sm transition-all hover:shadow-md ${
                    flag.is_resolved ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-brand-600 flex-shrink-0" />
                        <span className="font-bold text-sm text-slate-900 line-clamp-1">{flag.document_title}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Flagged on: {formatTimestamp(flag.created_at)}
                      </p>
                    </div>

                    {flag.is_resolved ? (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Resolved
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 flex-shrink-0">
                        <AlertCircle className="w-3 h-3" /> Action Required
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-700 block text-[11px]">Document Owner</span>
                      <span className="font-medium text-slate-900">{flag.document_owner}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 block text-[11px]">Flagged By</span>
                      <span className="font-medium text-slate-900">{flag.flagged_by}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Issue Description</span>
                    <p className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono leading-relaxed">
                      {flag.issue_description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-600 flex items-center gap-1 text-[11px]">
                      <strong className="text-slate-700">Action:</strong> {flag.suggested_action}
                    </span>
                    {!flag.is_resolved && (
                      <button
                        type="button"
                        onClick={() => resolveMutation.mutate(flag.id)}
                        disabled={resolveMutation.isPending}
                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center gap-1 text-[11px]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark as Resolved
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal: View Full Feedback Details */}
      {selectedLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Lessons Learned Audit Details</h3>
                  <p className="text-xs text-slate-500">
                    Logged by <span className="font-semibold text-slate-700">{selectedLesson.reviewer}</span> on{' '}
                    {formatTimestamp(selectedLesson.created_at)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLesson(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Status Comparison */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-1">
                    Original Status
                  </span>
                  <div>{getStatusBadge(selectedLesson.original_status)}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-1">
                    Final Status
                  </span>
                  <div>{getStatusBadge(selectedLesson.final_status)}</div>
                </div>
              </div>

              {/* Original Clause */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 block">Original Clause / Specification:</span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedLesson.original_text || '—'}
                </div>
              </div>

              {/* Edited Clause if any */}
              {selectedLesson.reviewed_text && (
                <div className="space-y-1.5">
                  <span className="font-bold text-emerald-800 block">Edited / Modified Clause:</span>
                  <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg font-mono text-[11px] text-emerald-900 whitespace-pre-wrap leading-relaxed">
                    {selectedLesson.reviewed_text}
                  </div>
                </div>
              )}

              {/* Reason / Audit Trail */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 block">SME Rationale & Closed-Loop Reasoning:</span>
                <div className="p-3 bg-amber-50/40 border border-amber-200 rounded-lg text-slate-800 leading-relaxed font-medium">
                  {selectedLesson.reason || '—'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLesson(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shadow-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
