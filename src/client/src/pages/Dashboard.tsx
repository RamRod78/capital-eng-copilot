import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  AlertTriangle,
  FolderGit2,
  Flag,
  ArrowRight,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { fetchStats, fetchDocumentFlags } from '../api/client.js';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  const { data: flags, isLoading: flagsLoading } = useQuery({
    queryKey: ['documentFlags', { showResolved: false }],
    queryFn: () => fetchDocumentFlags({ showResolved: false }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Capital Design Decision Engine
            </h1>
          </div>
          <p className="text-slate-600 mt-1 text-base">
            AI-powered engineering standards extraction, confidence-gated SME validation & project RFP generation.
          </p>
        </div>

        <Link
          to="/about"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:text-brand-600 hover:border-brand-300 font-semibold text-xs rounded-xl shadow-sm hover:shadow transition-all shrink-0"
        >
          <BookOpen className="w-4 h-4 text-brand-600" />
          <span>About CDDE Architecture & Data Flow</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </div>

      {/* Important Prototype Warning Banner */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3.5 shadow-sm text-amber-950">
        <div className="p-2 bg-amber-200/80 rounded-lg text-amber-800 shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-bold uppercase tracking-wider text-xs text-amber-900">
            Important Notice
          </p>
          <p className="font-medium text-amber-900 leading-relaxed">
            This is a prototype system that is meant for demonstration purposes only. Only use supplied test documents. <span className="font-bold text-rose-700">DO NOT upload corporate confidential information!</span>
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Knowledge Items</span>
            <FileText className="w-5 h-5 text-brand-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {statsLoading ? '...' : stats?.totalItems || 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">From {stats?.totalDocs || 0} specifications</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending SME Reviews</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-amber-600">
            {statsLoading ? '...' : stats?.pendingReviews || 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">Awaiting discipline validation</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Confidence (&lt;0.85)</span>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600">
            {statsLoading ? '...' : stats?.lowConfidenceItems || 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">Require owner inspection</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Capital Project Scopes</span>
            <FolderGit2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600">
            {statsLoading ? '...' : stats?.projectScopes || 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">Generated vendor RFP packages</p>
        </div>
      </div>

      {/* Main Grid: Quick Actions + Document Revision Flags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Quick Workflow Navigation */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">🚀 Quick Workflow Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/ingest"
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div>
                <h3 className="font-bold text-base text-slate-900 group-hover:text-brand-600 transition-colors flex items-center justify-between">
                  1. Ingest & Extract Documents
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-slate-600 mt-2">
                  Upload PDF, Word, Excel, CSV, or text specifications. Run Gemini to parse requirements, recommendations, and guidelines with confidence scores.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-brand-600">
                <span>Start Extraction</span>
              </div>
            </Link>

            <Link
              to="/review"
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div>
                <h3 className="font-bold text-base text-slate-900 group-hover:text-brand-600 transition-colors flex items-center justify-between">
                  2. SME Review Queue
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-slate-600 mt-2">
                  Inspect low-confidence clauses (&lt; 0.85). Edit discipline, compliance tiers, approve, reject, or flag upstream standards.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-brand-600">
                <span>Review Items ({stats?.pendingReviews || 0})</span>
              </div>
            </Link>

            <Link
              to="/scoping"
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div>
                <h3 className="font-bold text-base text-slate-900 group-hover:text-brand-600 transition-colors flex items-center justify-between">
                  3. Project Scoping & RFP
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-slate-600 mt-2">
                  Ingest new capital project requirements, match mandatory specs & recommendations, and export vendor-ready RFP / SOW documents.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-brand-600">
                <span>Launch Scoping Agent</span>
              </div>
            </Link>

            <Link
              to="/lessons"
              className="p-5 bg-white rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div>
                <h3 className="font-bold text-base text-slate-900 group-hover:text-brand-600 transition-colors flex items-center justify-between">
                  4. Lessons Learned
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-slate-600 mt-2">
                  Closed-loop feedback engine tracking SME modifications, rejected specifications, and action items for upstream document owners.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-brand-600">
                <span>View Feedback Log</span>
              </div>
            </Link>
          </div>
        </div>

        {/* Right Column: Active Document Revision Flags */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Flag className="w-5 h-5 text-rose-600" />
              Document Revision Flags
            </h2>
            <Link to="/lessons" className="text-xs font-semibold text-brand-600 hover:underline">
              View All
            </Link>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            {flagsLoading ? (
              <p className="text-sm text-slate-500">Loading flags...</p>
            ) : !flags || flags.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-900">All Standards Up to Date</p>
                <p className="text-xs text-slate-500 mt-1">No open document revision flags found.</p>
              </div>
            ) : (
              flags.slice(0, 3).map((flag) => (
                <div key={flag.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5 text-xs">
                  <div className="font-bold text-slate-900 text-sm truncate">{flag.document_title}</div>
                  <div className="text-slate-600">
                    <span className="font-semibold">Owner:</span> {flag.document_owner} | <span className="font-semibold">Flagged By:</span> {flag.flagged_by}
                  </div>
                  <p className="text-slate-700 bg-amber-50 p-2 rounded border border-amber-200/80 font-mono text-[11px]">
                    {flag.issue_description}
                  </p>
                  <div className="text-slate-500 font-medium pt-1 flex justify-between items-center">
                    <span>Action: {flag.suggested_action}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
