import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Database,
  Sparkles,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { parseUploadedFile, extractRequirements, saveExtractionBatch } from '../api/client.js';
import { ExtractionBatch } from '@shared/schemas';

export default function IngestExtract() {
  const queryClient = useQueryClient();

  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [docTitle, setDocTitle] = useState('Project FEED Specification - Pressure Vessels & Piping');
  const [docNumber, setDocNumber] = useState('SPEC-ENG-2026-001');
  const [docType, setDocType] = useState('Standard / Specification');
  const [docOwner, setDocOwner] = useState('Mechanical SME');
  const [docVersion, setDocVersion] = useState('2.1');
  const [docDate, setDocDate] = useState('2026-08-31');
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [extractionResult, setExtractionResult] = useState<ExtractionBatch | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Parse uploaded file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setSaveSuccess(null);

    try {
      const data = await parseUploadedFile(file);
      setRawText(data.text);
      if (data.suggestedTitle) {
        setDocTitle(data.suggestedTitle);
      }
      if (data.suggestedDocNumber) {
        setDocNumber(data.suggestedDocNumber);
      }
      if (data.suggestedDocDate) {
        setDocDate(data.suggestedDocDate);
      }
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse file');
    } finally {
      setIsParsing(false);
    }
  };

  // Run Gemini extraction mutation
  const extractMutation = useMutation({
    mutationFn: () =>
      extractRequirements({
        content: rawText,
        documentTitle: docTitle,
        documentNumber: docNumber,
        documentDate: docDate,
        documentOwner: docOwner,
      }),
    onSuccess: (data) => {
      setExtractionResult(data);
      setSaveSuccess(null);
    },
  });

  // Save extraction batch to database
  const saveMutation = useMutation({
    mutationFn: () =>
      saveExtractionBatch({
        documentTitle: docTitle,
        documentNumber: docNumber,
        documentDate: docDate,
        documentType: docType,
        ownerSme: docOwner,
        version: docVersion,
        rawContent: rawText,
        batchId: extractionResult?.batch_id,
        items: extractionResult?.items || [],
      }),
    onSuccess: (data) => {
      setSaveSuccess(`Successfully stored ${data.storedCount} requirements and embeddings in PostgreSQL!`);
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['extractions'] });
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          📥 Ingest Documents & Extract Requirements
        </h1>
        <p className="text-slate-600 mt-1">
          Upload engineering specifications (PDF, Word, Excel, CSV, Text) or paste raw text. Gemini classifies requirements, recommendations, and guidelines with confidence scoring.
        </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Input Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
            {/* Input Mode Selector */}
            <div className="flex gap-4 border-b border-slate-200 pb-4">
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  inputMode === 'upload'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                Upload Document File
              </button>
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  inputMode === 'paste'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                Paste Specification Text
              </button>
            </div>

            {inputMode === 'upload' ? (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Select Document File (PDF, DOCX, XLSX, CSV, TXT)
                </label>
                <div className="border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-xl p-8 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer space-y-2 block">
                    <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
                      {isParsing ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
                    </div>
                    <div className="text-sm font-medium text-slate-700">
                      {isParsing ? 'Parsing document contents...' : 'Click to browse or drag and drop file'}
                    </div>
                    <p className="text-xs text-slate-500">
                      Supports Adobe PDF, Microsoft Word, Excel workbooks, CSV, and Markdown
                    </p>
                  </label>
                </div>
                {parseError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {parseError}
                  </div>
                )}
                {rawText && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Document parsed: {rawText.length.toLocaleString()} characters ready for extraction
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Specification Text Content</label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={8}
                  placeholder="Paste technical requirements, ASME/API clauses, design criteria, or vendor deliverables here..."
                  className="w-full rounded-lg border border-slate-300 p-3.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>
            )}

            {/* Document Metadata Fields */}
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Document Title</label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Document Number</label>
                  <input
                    type="text"
                    value={docNumber}
                    placeholder="e.g. SPEC-ENG-2026-001"
                    onChange={(e) => setDocNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Document Type</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option>Standard / Specification</option>
                    <option>FEED Dossier</option>
                    <option>Equipment Datasheet</option>
                    <option>Vendor RFP</option>
                    <option>Best Practice Guideline</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Revision / Version</label>
                  <input
                    type="text"
                    value={docVersion}
                    placeholder="e.g. 2.1"
                    onChange={(e) => setDocVersion(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Revision / Version Date</label>
                  <input
                    type="date"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Assigned Document Owner / Discipline Lead
                  </label>
                  <select
                    value={docOwner}
                    onChange={(e) => setDocOwner(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option>Mechanical SME</option>
                    <option>Piping SME</option>
                    <option>Electrical SME</option>
                    <option>I&C Lead</option>
                    <option>Process Lead</option>
                    <option>Civil/Structural SME</option>
                    <option>HSE Lead</option>
                    <option>Quality Manager</option>
                    <option>General Engineering Lead</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={extractMutation.isPending || !rawText.trim()}
              onClick={() => extractMutation.mutate()}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {extractMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running 3-Stage Extraction Pipeline...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Run 3-Stage Requirements Extraction
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right 1 Col: Pipeline Info */}
        <div className="space-y-4">
          <div className="bg-brand-900 text-white p-6 rounded-xl space-y-4 shadow-md">
            <h3 className="font-bold text-base flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-brand-300" />
              3-Stage Multi-Agent Extraction Pipeline
            </h3>
            <div className="text-xs text-brand-100 space-y-3.5">
              <div className="bg-brand-950/60 p-3 rounded-lg border border-brand-800/80">
                <span className="font-semibold text-brand-300 block text-xs">Stage 1: ToC & Structure Chunking</span>
                <span className="text-slate-300 text-[11px] mt-0.5 block">
                  Scans document layout with <strong>Gemini 3.6 Flash</strong> and partitions into logical engineering sections preserving clause context.
                </span>
              </div>
              <div className="bg-brand-950/60 p-3 rounded-lg border border-brand-800/80">
                <span className="font-semibold text-brand-300 block text-xs">Stage 2: Parallel Deep Extraction</span>
                <span className="text-slate-300 text-[11px] mt-0.5 block">
                  Runs concurrently across sections with <strong>Gemini 3.7 Flash</strong> (Thinking enabled + Structured Outputs) for 100% valid schema fidelity.
                </span>
              </div>
              <div className="bg-brand-950/60 p-3 rounded-lg border border-brand-800/80">
                <span className="font-semibold text-brand-300 block text-xs">Stage 3: Synthesis & De-duplication</span>
                <span className="text-slate-300 text-[11px] mt-0.5 block">
                  Consolidates items, eliminates cross-boundary duplicates, and performs cross-discipline conflict analysis via <strong>Gemini 3.1 Pro</strong>.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Extraction Results Section */}
      {extractionResult && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Extracted {extractionResult.items.length} Knowledge Items
              </h2>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <p className="text-xs text-slate-500">{extractionResult.document_title}</p>
                {(extractionResult.document_number || docNumber) && (
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                    Doc #: {extractionResult.document_number || docNumber}
                  </span>
                )}
                {(extractionResult.document_date || docDate) && (
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                    Date: {extractionResult.document_date || docDate}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={saveMutation.isPending || !!saveSuccess}
              onClick={() => saveMutation.mutate()}
              className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving & Vectorizing...
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Saved to Knowledge Base
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Save Batch & Index pgvector
                </>
              )}
            </button>
          </div>

          {saveSuccess && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
              {saveSuccess}
            </div>
          )}

          {extractionResult.executive_summary && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700">
              <span className="font-bold text-slate-900 block mb-1">Executive Scope Summary:</span>
              {extractionResult.executive_summary}
            </div>
          )}

          {/* Results Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Discipline</th>
                  <th className="p-3">Compliance</th>
                  <th className="p-3">Requirement Statement</th>
                  <th className="p-3">Cost Impact</th>
                  <th className="p-3">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {extractionResult.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="p-3 font-mono font-bold text-brand-700">{item.requirement_code || 'REQ'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                        {item.item_type}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{item.engineering_discipline}</td>
                    <td className="p-3">{item.compliance_level}</td>
                    <td className="p-3 max-w-md font-normal leading-relaxed">{item.requirement_text}</td>
                    <td className="p-3">{item.estimated_cost_impact}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          item.confidence_score < 0.85
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {(item.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
