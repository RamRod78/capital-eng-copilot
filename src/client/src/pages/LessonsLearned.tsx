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
} from 'lucide-react';
import { fetchFeedbackLessons, fetchDocumentFlags, resolveDocumentFlag } from '../api/client.js';

export default function LessonsLearned() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'flags' | 'lessons'>('flags');
  const [showResolved, setShowResolved] = useState(false);

  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ['documentFlags', { showResolved }],
    queryFn: () => fetchDocumentFlags({ showResolved }),
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          💡 Closed-Loop Feedback & Lessons Learned
        </h1>
        <p className="text-slate-600 mt-1">
          Audits SME review decisions, rejected clauses, and upstream document revision flags to continuously evolve engineering standards and agent memory.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200">
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
      </div>

      {/* Tab Content */}
      {activeTab === 'flags' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Show Resolved Flags</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flagsLoading ? (
              <div className="col-span-2 p-12 text-center text-sm text-slate-500">Loading flags...</div>
            ) : flags.length === 0 ? (
              <div className="col-span-2 bg-white p-12 rounded-xl border border-slate-200 text-center">
                <ShieldCheck className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-slate-900 text-base">No Open Revision Flags</h3>
                <p className="text-xs text-slate-500 mt-1">All engineering standards and documents are currently up-to-date.</p>
              </div>
            ) : (
              flags.map((flag) => (
                <div
                  key={flag.id}
                  className={`bg-white p-5 rounded-xl border space-y-3 shadow-sm ${
                    flag.is_resolved ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 truncate">{flag.document_title}</span>
                    {flag.is_resolved ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Resolved
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Action Required
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div>
                      <span className="font-semibold text-slate-700">Document Owner:</span> {flag.document_owner}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Flagged By:</span> {flag.flagged_by}
                    </div>
                  </div>

                  <p className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono">
                    {flag.issue_description}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      <strong>Action:</strong> {flag.suggested_action}
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
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {lessonsLoading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading audit log...</div>
          ) : lessons.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">No modification feedback logs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Reviewer</th>
                    <th className="p-3">Original Status</th>
                    <th className="p-3">Final Status</th>
                    <th className="p-3">Original Clause</th>
                    <th className="p-3">Edited Clause</th>
                    <th className="p-3">Reason / Audit Trail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {lessons.map((lesson) => (
                    <tr key={lesson.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-semibold">{lesson.reviewer}</td>
                      <td className="p-3 text-slate-500">{lesson.original_status}</td>
                      <td className="p-3 font-bold text-brand-700">{lesson.final_status}</td>
                      <td className="p-3 max-w-xs font-mono text-[11px] truncate">{lesson.original_text}</td>
                      <td className="p-3 max-w-xs font-mono text-[11px] text-emerald-700 truncate">
                        {lesson.reviewed_text || '—'}
                      </td>
                      <td className="p-3 max-w-xs text-slate-600">{lesson.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
