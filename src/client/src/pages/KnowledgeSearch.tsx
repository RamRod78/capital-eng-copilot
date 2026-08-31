import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Search,
  Sparkles,
  Database,
  Loader2,
  FileCheck,
  Tag,
  FileText,
} from 'lucide-react';
import { searchSimilarRequirements } from '../api/client.js';
import { SearchResult } from '@shared/schemas';

export default function KnowledgeSearch() {
  const [query, setQuery] = useState('Centrifugal pumps shall comply with API 610');
  const [discipline, setDiscipline] = useState('All');
  const [itemType, setItemType] = useState('All');
  const [topK, setTopK] = useState(8);

  const [results, setResults] = useState<SearchResult[] | null>(null);

  const searchMutation = useMutation({
    mutationFn: () =>
      searchSimilarRequirements({
        query,
        discipline: discipline === 'All' ? undefined : discipline,
        item_type: itemType === 'All' ? undefined : itemType,
        top_k: topK,
      }),
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchMutation.mutate();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          🔍 Knowledge Explorer & Semantic Vector Search
        </h1>
        <p className="text-slate-600 mt-1">
          Query engineering specifications, FEED clauses, equipment datasheets, and company standards using dense vector embeddings in pgvector.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600 uppercase">
            Engineering Search Query / Specification Clause
          </label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g., design temperature for cryogenic piping or API 610 pump vibration limits..."
              className="w-full rounded-lg border border-slate-300 p-3.5 pl-10 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Discipline</label>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs bg-white focus:ring-1 focus:ring-brand-500"
            >
              <option>All</option>
              <option>Mechanical</option>
              <option>Piping</option>
              <option>Electrical</option>
              <option>I&C</option>
              <option>Civil/Structural</option>
              <option>Process</option>
              <option>HSE</option>
              <option>Quality</option>
              <option>General</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Item Type</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs bg-white focus:ring-1 focus:ring-brand-500"
            >
              <option>All</option>
              <option>Requirement</option>
              <option>Recommendation</option>
              <option>Guideline</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Max Results</label>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs bg-white focus:ring-1 focus:ring-brand-500"
            >
              <option value={5}>Top 5 matches</option>
              <option value={8}>Top 8 matches</option>
              <option value={15}>Top 15 matches</option>
              <option value={25}>Top 25 matches</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={searchMutation.isPending || !query.trim()}
          className="py-3 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {searchMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching pgvector embeddings...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Execute Semantic Vector Search
            </>
          )}
        </button>
      </form>

      {/* Search Results */}
      {results && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-brand-600" />
              Found {results.length} Semantically Relevant Clauses
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
              No matching requirements found. Try adjusting your search query or discipline filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {results.map((r, idx) => (
                <div
                  key={r.extraction_id || idx}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 hover:border-brand-300 transition-colors deferred-requirement-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-brand-700 text-sm">
                        {r.requirement_code || 'REQ'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                        {r.item_type}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        • {r.engineering_discipline} ({r.compliance_level})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Similarity:</span>
                      <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-brand-100 text-brand-800 font-mono">
                        {(r.similarity_score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-800 leading-relaxed font-normal bg-slate-50 p-3 rounded-lg border border-slate-100 text-pretty">
                    {r.requirement_text}
                  </p>

                  <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-y-2 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {(r.document_number || r.document_title) && (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <FileText className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                          <span>
                            <strong className="text-slate-900">Source:</strong>{' '}
                            {r.document_number ? (
                              <>
                                <span className="font-mono font-bold text-brand-700">{r.document_number}</span>
                                {r.document_title && <span className="text-slate-600"> ({r.document_title})</span>}
                              </>
                            ) : (
                              <span className="text-slate-800 font-semibold">{r.document_title}</span>
                            )}
                          </span>
                          {r.document_version && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-mono font-bold">
                              Rev {r.document_version}
                            </span>
                          )}
                        </div>
                      )}

                      {r.section_title && (
                        <span className="text-slate-600">
                          <strong className="text-slate-800">Section:</strong> {r.section_title}
                        </span>
                      )}

                      <span>
                        <strong className="text-slate-800">Owner:</strong> {r.document_owner || 'Engineering Lead'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-medium">Status:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          r.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'Rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
