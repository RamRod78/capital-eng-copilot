import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  Trash2,
  AlertTriangle,
  Database,
  FileText,
  Layers,
  Cpu,
  Target,
  Briefcase,
  ListChecks,
  Lightbulb,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
  AlertOctagon,
  Share2,
  Network,
} from 'lucide-react';
import { fetchAdminCounts, purgeDatabaseRecords, reindexAdminEmbeddings } from '../api/client.js';

type PurgeTarget =
  | 'all'
  | 'extractions'
  | 'projects'
  | 'scoping_items'
  | 'feedback'
  | 'kg'
  | 'kg_edges';

interface PurgeConfig {
  target: PurgeTarget;
  title: string;
  description: string;
  affectedTables: string[];
  severity: 'high' | 'critical';
}

const PURGE_OPTIONS: PurgeConfig[] = [
  {
    target: 'all',
    title: 'Purge Entire Database (Full Factory Reset)',
    description: 'Permanently deletes all engineering documents, extractions, vector embeddings, knowledge graph nodes, relationship edges, project scopes, scoping items, lessons learned, and revision flags.',
    affectedTables: ['documents', 'extractions', 'requirement_embeddings', 'kg_nodes', 'kg_edges', 'project_scopes', 'scoping_items', 'feedback_lessons', 'document_revision_flags'],
    severity: 'critical',
  },
  {
    target: 'extractions',
    title: 'Purge Ingested Documents & Extractions',
    description: 'Deletes all uploaded engineering standards, specifications, extracted requirements, pgvector embeddings, and linked Knowledge Graph nodes/edges.',
    affectedTables: ['documents', 'extractions', 'requirement_embeddings', 'kg_nodes', 'kg_edges'],
    severity: 'high',
  },
  {
    target: 'kg',
    title: 'Purge Knowledge Graph (Nodes & Edges)',
    description: 'Deletes all extracted canonical entity nodes (standards, equipment, parameters) and multi-hop relationship edges. Ingested documents and extractions remain preserved for one-click re-generation / backfill.',
    affectedTables: ['kg_nodes', 'kg_edges'],
    severity: 'high',
  },
  {
    target: 'kg_edges',
    title: 'Purge KG Relationship Edges Only',
    description: 'Clears multi-hop connection edges and relationship weights between nodes while retaining canonical entity node definitions.',
    affectedTables: ['kg_edges'],
    severity: 'high',
  },
  {
    target: 'projects',
    title: 'Purge Projects & Project Scopes',
    description: 'Deletes all capital project profiles, scoping configurations, and their linked RFP scoping requirement sets.',
    affectedTables: ['project_scopes', 'scoping_items'],
    severity: 'high',
  },
  {
    target: 'scoping_items',
    title: 'Purge Scoping Items & Matched RFPs Only',
    description: 'Deletes generated scoping requirements and RFP line items while preserving project definitions and facility profiles.',
    affectedTables: ['scoping_items'],
    severity: 'high',
  },
  {
    target: 'feedback',
    title: 'Purge Lessons Learned & Revision Flags',
    description: 'Deletes SME feedback lessons, rationale records, and document revision action flags.',
    affectedTables: ['feedback_lessons', 'document_revision_flags'],
    severity: 'high',
  },
];

export default function Admin() {
  const queryClient = useQueryClient();
  const [activePurge, setActivePurge] = useState<PurgeConfig | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dismiss modal on Escape key (Modern Web Guidance: platform-controls-dismiss-dialog)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activePurge) {
        setActivePurge(null);
      }
    };
    if (activePurge) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activePurge]);

  // Fetch current database counts
  const {
    data: counts,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['adminCounts'],
    queryFn: fetchAdminCounts,
    refetchInterval: 10000,
  });

  // Mutation for purging
  const purgeMutation = useMutation({
    mutationFn: (target: PurgeTarget) => purgeDatabaseRecords(target),
    onSuccess: (data) => {
      setSuccessMessage(data.message || 'Database records successfully purged.');
      setActivePurge(null);
      // Invalidate all query caches across the application
      queryClient.invalidateQueries({ queryKey: ['adminCounts'] });
      queryClient.invalidateQueries({ queryKey: ['kgGraph'] });
      queryClient.invalidateQueries({ queryKey: ['kgStats'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['extractions'] });
      queryClient.invalidateQueries({ queryKey: ['scopes'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['flags'] });
    },
  });

  // Mutation for re-indexing embeddings
  const reindexMutation = useMutation({
    mutationFn: () => reindexAdminEmbeddings(),
    onSuccess: (data) => {
      setSuccessMessage(data.message || 'Embeddings successfully indexed.');
      queryClient.invalidateQueries({ queryKey: ['adminCounts'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const handleConfirmPurge = () => {
    if (!activePurge) return;
    setSuccessMessage(null);
    purgeMutation.mutate(activePurge.target);
  };

  const missingEmbeddings = (counts?.extractions ?? 0) - (counts?.requirement_embeddings ?? 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-rose-600" />
            Database Administration & Maintenance
          </h1>
          <p className="text-slate-600 mt-1">
            Monitor table record volumes, manage storage, and purge dataset records.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {missingEmbeddings > 0 && (
            <button
              type="button"
              onClick={() => reindexMutation.mutate()}
              disabled={reindexMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {reindexMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cpu className="w-4 h-4" />
              )}
              Index Missing Embeddings ({missingEmbeddings})
            </button>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh Table Counts
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold text-sm">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Record Counts Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-brand-600" />
          Current Database Record Volumes
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Documents</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.documents ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Extractions</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.extractions ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Vector Embeddings</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.requirement_embeddings ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">KG Entities (Nodes)</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.kg_nodes ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">KG Relations (Edges)</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.kg_edges ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Projects & Scopes</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : ((counts?.projects ?? counts?.project_scopes) ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
              <ListChecks className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Scoping Items</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.scoping_items ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <Lightbulb className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Lessons Learned</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.feedback_lessons ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Revision Flags</p>
              <p className="text-2xl font-black text-slate-900">
                {isLoading ? '...' : (counts?.document_revision_flags ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-800 text-brand-400 rounded-lg">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Total Records</p>
              <p className="text-2xl font-black text-white">
                {isLoading ? '...' : (counts?.total ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Purge Operations Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-rose-600" />
          Purge Actions
        </h2>
        <p className="text-sm text-slate-500">
          Select a category below to purge records. You will be prompted with a confirmation dialog before any deletions are executed.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PURGE_OPTIONS.map((opt) => {
            const isCritical = opt.severity === 'critical';
            return (
              <div
                key={opt.target}
                className={`p-6 rounded-xl border transition-all flex flex-col justify-between ${
                  isCritical
                    ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        isCritical
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {isCritical ? 'High Impact • Full Wipe' : 'Selective Purge'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{opt.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{opt.description}</p>
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase block mb-1">
                      Affected Tables:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {opt.affectedTables.map((t) => (
                        <code
                          key={t}
                          className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-700 rounded border border-slate-200 font-mono"
                        >
                          {t}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => setActivePurge(opt)}
                    className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 ${
                      isCritical
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    Purge {isCritical ? 'Everything' : 'Selected Records'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal ("Are You Sure?" Popup) */}
      {activePurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-scale-up"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purge-modal-title"
          >
            {/* Modal Header */}
            <div className="bg-rose-50 p-6 border-b border-rose-100 flex items-start gap-4">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-full shrink-0">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 id="purge-modal-title" className="text-lg font-black text-rose-950">Are you sure?</h3>
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                  Permanent Data Deletion Warning
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-slate-700 text-sm">
              <p className="font-semibold text-slate-900">{activePurge.title}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{activePurge.description}</p>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                <span className="font-bold text-slate-700 block">Tables to be truncated:</span>
                <div className="flex flex-wrap gap-1.5">
                  {activePurge.affectedTables.map((t) => (
                    <code
                      key={t}
                      className="px-2 py-0.5 text-[11px] bg-white text-rose-700 font-bold rounded border border-rose-200"
                    >
                      {t}
                    </code>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>This action cannot be undone. All selected records will be permanently removed.</span>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={purgeMutation.isPending}
                onClick={() => setActivePurge(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purgeMutation.isPending}
                onClick={handleConfirmPurge}
                className="px-5 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-md shadow-rose-600/20 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {purgeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Purging Records...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Purge Records
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
