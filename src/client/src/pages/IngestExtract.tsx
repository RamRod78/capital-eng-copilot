import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Database,
  Sparkles,
  Loader2,
  Clock,
  Check,
  Cpu,
  ChevronDown,
  ChevronUp,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { parseUploadedFile, extractRequirementsStream, saveExtractionBatch } from '../api/client.js';
import { ExtractionBatch, ExtractionProgressEvent, ExtractionStageId } from '@shared/schemas';

interface StageCardState {
  stageId: 1 | 2 | 3;
  title: string;
  model: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  statusMessage?: string;
  details?: {
    sectionsFound?: number;
    sectionTitles?: string[];
    currentSectionIndex?: number;
    currentSectionTitle?: string;
    totalSections?: number;
    rawItemsCount?: number;
    finalItemsCount?: number;
  };
}

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

  // Progress Tracking State
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<ExtractionProgressEvent[]>([]);
  const [currentStage, setCurrentStage] = useState<ExtractionStageId | 0>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showLogTerminal, setShowLogTerminal] = useState(true);
  const timerRef = useRef<any>(null);
  const trackerRef = useRef<HTMLDivElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Timer effect during active extraction
  useEffect(() => {
    if (isExtracting) {
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isExtracting]);

  // Auto-scroll activity log
  useEffect(() => {
    if (logEndRef.current && isExtracting) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progressEvents, isExtracting]);

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

  // Run Gemini extraction with real-time SSE progress streaming
  const handleStartExtraction = async () => {
    if (!rawText.trim() || isExtracting) return;

    setIsExtracting(true);
    setExtractionError(null);
    setProgressEvents([]);
    setCurrentStage(1);
    setElapsedMs(0);
    setExtractionResult(null);
    setSaveSuccess(null);

    // Smooth scroll to progress tracker
    setTimeout(() => {
      trackerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    try {
      const result = await extractRequirementsStream(
        {
          content: rawText,
          documentTitle: docTitle,
          documentNumber: docNumber,
          documentDate: docDate,
          documentOwner: docOwner,
        },
        (event: ExtractionProgressEvent) => {
          setProgressEvents((prev) => [...prev, event]);
          if (event.stage === 1 || event.stage === 2 || event.stage === 3) {
            setCurrentStage(event.stage);
          } else if (event.stage === 'complete') {
            setCurrentStage('complete');
          }
        }
      );

      setExtractionResult(result);
      setCurrentStage('complete');
    } catch (err: any) {
      setExtractionError(err.message || 'Extraction pipeline failed.');
      setCurrentStage('error');
    } finally {
      setIsExtracting(false);
    }
  };

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

  // Compute aggregated details for each stage
  const getStageAggregates = () => {
    const stage1Events = progressEvents.filter((e) => e.stage === 1);
    const stage2Events = progressEvents.filter((e) => e.stage === 2);
    const stage3Events = progressEvents.filter((e) => e.stage === 3);

    const stage1Completed = stage1Events.some((e) => e.status === 'completed') || currentStage === 2 || currentStage === 3 || currentStage === 'complete';
    const stage2Completed = stage2Events.some((e) => e.status === 'completed') || currentStage === 3 || currentStage === 'complete';
    const stage3Completed = stage3Events.some((e) => e.status === 'completed') || currentStage === 'complete';

    const stage1Details = stage1Events.reduce(
      (acc, e) => ({ ...acc, ...e.details }),
      {} as NonNullable<ExtractionProgressEvent['details']>
    );

    const stage2Details = stage2Events.reduce(
      (acc, e) => {
        const next = { ...acc, ...e.details };
        if (e.details?.currentSectionIndex !== undefined) {
          next.currentSectionIndex = Math.max(next.currentSectionIndex ?? 0, e.details.currentSectionIndex);
        }
        if (e.details?.rawItemsCount !== undefined) {
          next.rawItemsCount = Math.max(next.rawItemsCount ?? 0, e.details.rawItemsCount);
        }
        return next;
      },
      {} as NonNullable<ExtractionProgressEvent['details']>
    );
    if (stage2Completed && stage2Details.totalSections) {
      stage2Details.currentSectionIndex = stage2Details.totalSections;
    }

    const stage3Details = stage3Events.reduce(
      (acc, e) => ({ ...acc, ...e.details }),
      {} as NonNullable<ExtractionProgressEvent['details']>
    );

    return {
      stage1Events,
      stage2Events,
      stage3Events,
      stage1Completed,
      stage2Completed,
      stage3Completed,
      stage1Details,
      stage2Details,
      stage3Details,
    };
  };

  // Calculate overall progress percentage
  const calculateOverallProgress = (): number => {
    if (currentStage === 0) return 0;
    if (currentStage === 'complete') return 100;
    if (currentStage === 'error') return 100;

    if (currentStage === 1) {
      const hasCompleted = progressEvents.some((e) => e.stage === 1 && e.status === 'completed');
      return hasCompleted ? 33 : 15;
    }

    if (currentStage === 2) {
      const { stage2Details } = getStageAggregates();
      const total = stage2Details.totalSections || 1;
      const current = stage2Details.currentSectionIndex || 0;
      const sectionPct = Math.min(Math.round((current / total) * 33), 33);
      return 33 + (sectionPct || 10);
    }

    if (currentStage === 3) {
      const hasCompleted = progressEvents.some((e) => e.stage === 3 && e.status === 'completed');
      return hasCompleted ? 95 : 75;
    }

    return 0;
  };

  // Compute stage cards information
  const getStageCards = (): StageCardState[] => {
    const {
      stage1Events,
      stage2Events,
      stage3Events,
      stage1Completed,
      stage2Completed,
      stage3Completed,
      stage1Details,
      stage2Details,
      stage3Details,
    } = getStageAggregates();

    const latestStage1 = stage1Events[stage1Events.length - 1];
    const latestStage2 = stage2Events[stage2Events.length - 1];
    const latestStage3 = stage3Events[stage3Events.length - 1];

    return [
      {
        stageId: 1,
        title: 'Stage 1: ToC & Structure Chunking',
        model: 'Gemini 3.6 Flash',
        description: 'Scans layout, identifies engineering clauses & partitions logical sections.',
        status: stage1Completed ? 'completed' : currentStage === 1 ? 'running' : 'pending',
        statusMessage: latestStage1?.message || (stage1Completed ? 'ToC chunking complete.' : 'Awaiting document ingestion...'),
        details: Object.keys(stage1Details).length > 0 ? stage1Details : latestStage1?.details,
      },
      {
        stageId: 2,
        title: 'Stage 2: Parallel Deep Extraction',
        model: 'Gemini 3.7 Flash (Thinking)',
        description: 'Runs concurrent deep extraction with structured outputs and thinking process.',
        status: stage2Completed ? 'completed' : currentStage === 2 ? 'running' : 'pending',
        statusMessage: latestStage2?.message || (stage2Completed ? 'Deep extraction complete.' : 'Pending Stage 1 completion...'),
        details: Object.keys(stage2Details).length > 0 ? stage2Details : latestStage2?.details,
      },
      {
        stageId: 3,
        title: 'Stage 3: Synthesis & De-duplication',
        model: 'Gemini 2.5 Pro',
        description: 'De-duplicates clauses, analyzes cross-discipline conflicts & assigns sequence IDs.',
        status: stage3Completed ? 'completed' : currentStage === 3 ? 'running' : 'pending',
        statusMessage: latestStage3?.message || (stage3Completed ? 'Synthesis complete.' : 'Pending Stage 2 candidate items...'),
        details: Object.keys(stage3Details).length > 0 ? stage3Details : latestStage3?.details,
      },
    ];
  };

  const stageCards = getStageCards();
  const overallProgress = calculateOverallProgress();

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
              disabled={isExtracting || !rawText.trim()}
              onClick={handleStartExtraction}
              className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white rounded-lg font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running 3-Stage Extraction Pipeline ({((elapsedMs / 1000).toFixed(1))}s)...
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
                  Consolidates items, eliminates cross-boundary duplicates, and performs cross-discipline conflict analysis via <strong>Gemini 2.5 Pro</strong>.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Extraction Progress Tracker Card */}
      {(isExtracting || currentStage !== 0) && (
        <div
          ref={trackerRef}
          className="bg-slate-900 text-white rounded-2xl border border-slate-700/80 shadow-2xl p-6 sm:p-8 space-y-6 overflow-hidden transition-all duration-300"
        >
          {/* Header & Status Indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5">
                  {isExtracting ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-500"></span>
                    </>
                  ) : currentStage === 'complete' ? (
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                  ) : (
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                  )}
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  {isExtracting
                    ? '⚡ Extraction Pipeline in Progress'
                    : currentStage === 'complete'
                    ? '✅ Requirements Extraction Completed'
                    : '⚠️ Extraction Pipeline Halted'}
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                {isExtracting
                  ? `Processing "${docTitle}" through multi-model Gemini agents with live SSE telemetry`
                  : currentStage === 'complete'
                  ? `Successfully parsed and structured ${extractionResult?.items.length || 0} requirements across ${extractionResult?.identified_disciplines.length || 0} disciplines`
                  : 'An error occurred during extraction'}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Elapsed Timer */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-xs font-mono text-slate-200">
                <Clock className="w-3.5 h-3.5 text-brand-400" />
                <span>Elapsed: <strong>{(elapsedMs / 1000).toFixed(1)}s</strong></span>
              </div>

              {/* Status Badge */}
              <span
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${
                  isExtracting
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                    : currentStage === 'complete'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {isExtracting
                  ? `Stage ${typeof currentStage === 'number' ? currentStage : 3} Active`
                  : currentStage === 'complete'
                  ? 'Complete (100%)'
                  : 'Error'}
              </span>
            </div>
          </div>

          {/* Overall Animated Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-brand-400" />
                Overall Pipeline Progress
              </span>
              <span className="font-mono font-bold text-brand-300">{overallProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  currentStage === 'complete'
                    ? 'bg-gradient-to-r from-brand-500 via-emerald-500 to-emerald-400'
                    : 'bg-gradient-to-r from-brand-600 via-brand-500 to-brand-400'
                }`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* 3-Stage Interactive Stepper Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stageCards.map((stage) => {
              const isCurrent = currentStage === stage.stageId && isExtracting;
              const isDone = stage.status === 'completed';

              return (
                <div
                  key={stage.stageId}
                  className={`p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between space-y-3 ${
                    isCurrent
                      ? 'bg-brand-950/70 border-brand-500 ring-2 ring-brand-500/30 shadow-lg shadow-brand-950/50'
                      : isDone
                      ? 'bg-slate-800/80 border-emerald-500/50 shadow-sm'
                      : 'bg-slate-800/40 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="space-y-2">
                    {/* Stage Card Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            isDone
                              ? 'bg-emerald-500 text-white'
                              : isCurrent
                              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/50'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {isDone ? (
                            <Check className="w-4 h-4 stroke-[3]" />
                          ) : isCurrent ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            stage.stageId
                          )}
                        </div>
                        <span className="font-bold text-sm text-slate-100">{stage.title}</span>
                      </div>

                      {/* Status Tag */}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isDone
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : isCurrent
                            ? 'bg-brand-900 text-brand-300 border border-brand-700 animate-pulse'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {isDone ? 'Done' : isCurrent ? 'Running' : 'Queued'}
                      </span>
                    </div>

                    {/* Model Badge */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-brand-300 border border-slate-700">
                        {stage.model}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-400 leading-relaxed">{stage.description}</p>
                  </div>

                  {/* Stage-Specific Live Details */}
                  <div className="pt-2 border-t border-slate-700/60 text-xs">
                    {stage.stageId === 1 && stage.details?.sectionsFound ? (
                      <div className="space-y-1.5">
                        <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Found {stage.details.sectionsFound} logical sections:
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto custom-scrollbar">
                          {stage.details.sectionTitles?.slice(0, 4).map((title, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 truncate max-w-[160px]"
                              title={title}
                            >
                              {title}
                            </span>
                          ))}
                          {(stage.details.sectionTitles?.length || 0) > 4 && (
                            <span className="text-[10px] text-slate-500 self-center">
                              +{(stage.details.sectionTitles?.length || 0) - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    ) : stage.stageId === 2 && stage.details ? (
                      <div className="space-y-1.5">
                        {stage.details.totalSections !== undefined && stage.details.totalSections > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                              <span>Sections Processed:</span>
                              <span className="font-mono text-brand-300">
                                {stage.details.currentSectionIndex ?? 0} / {stage.details.totalSections}
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-brand-400 h-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round(
                                      ((stage.details.currentSectionIndex ?? 0) / stage.details.totalSections) * 100
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                        {stage.details.rawItemsCount !== undefined && (
                          <span className="text-brand-300 font-semibold flex items-center gap-1 text-[11px]">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            {stage.details.rawItemsCount} raw items extracted
                          </span>
                        )}
                      </div>
                    ) : stage.stageId === 3 && stage.details?.finalItemsCount !== undefined ? (
                      <div className="space-y-1">
                        <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {stage.details.finalItemsCount} verified requirements ready
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic truncate" title={stage.statusMessage}>
                        {stage.statusMessage}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible Live SSE Telemetry Log Feed */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLogTerminal(!showLogTerminal)}
              className="w-full px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800 flex items-center justify-between text-xs font-mono text-slate-300 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-brand-400" />
                Live Agent Execution Feed ({progressEvents.length} telemetry events)
              </span>
              <div className="flex items-center gap-1 text-slate-400">
                <span>{showLogTerminal ? 'Hide' : 'Show'}</span>
                {showLogTerminal ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showLogTerminal && (
              <div className="p-4 max-h-48 overflow-y-auto space-y-2 font-mono text-xs text-slate-300 custom-scrollbar bg-slate-950">
                {progressEvents.length === 0 ? (
                  <p className="text-slate-500 italic">Initializing pipeline stream...</p>
                ) : (
                  progressEvents.map((evt, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 leading-relaxed">
                      <span className="text-slate-500 shrink-0 text-[10px] mt-0.5">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase ${
                          evt.stage === 1
                            ? 'bg-blue-950 text-blue-400 border border-blue-800'
                            : evt.stage === 2
                            ? 'bg-purple-950 text-purple-400 border border-purple-800'
                            : evt.stage === 3
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}
                      >
                        {evt.stage === 'complete' ? 'READY' : `S${evt.stage}`}
                      </span>
                      <span className="text-slate-300 text-xs">{evt.message}</span>
                    </div>
                  ))
                )}
                {isExtracting && (
                  <div className="flex items-center gap-2 text-brand-400 text-xs animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Gemini agents executing current stage...</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            )}
          </div>

          {/* Extraction Error Alert */}
          {extractionError && (
            <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Extraction Pipeline Error</p>
                <p className="text-xs text-rose-300">{extractionError}</p>
                <button
                  type="button"
                  onClick={handleStartExtraction}
                  className="mt-2 px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  Retry Extraction
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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

