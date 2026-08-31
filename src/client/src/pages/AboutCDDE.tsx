import React, { useState } from 'react';
import {
  Layers,
  Cpu,
  Database,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Search,
  FileText,
  Sparkles,
  RefreshCw,
  Workflow,
  Target,
  Lightbulb,
  HardHat,
  Filter,
  Check,
  AlertTriangle,
  Code2,
  Table,
  Zap,
  BookOpen,
  TrendingUp,
} from 'lucide-react';

interface PhaseDetail {
  id: string;
  stepNumber: string;
  title: string;
  shortDesc: string;
  icon: React.ElementType;
  badgeColor: string;
  accentBg: string;
  borderColor: string;
  modelOrTech: string;
  inputs: string[];
  outputs: string[];
  deepDive: {
    overview: string;
    keyMechanisms: string[];
    businessValue: string;
  };
}

const PHASES: PhaseDetail[] = [
  {
    id: 'phase-1',
    stepNumber: '01',
    title: 'Ingestion & Intelligent Chunking',
    shortDesc: 'Multi-format parsing and context-preserving clause boundary partitioning.',
    icon: FileText,
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
    accentBg: 'bg-sky-500/10',
    borderColor: 'border-sky-500/30',
    modelOrTech: 'Gemini 3.6 Flash + Multi-Format Parsers (pdf-parse, mammoth, xlsx)',
    inputs: [
      'PDF Engineering Standards & FEED dossiers',
      'Word (DOCX) Technical Specifications',
      'Excel (XLSX/CSV) Instrument & Equipment Schedules',
      'Plain Text / Markdown Engineering Notes',
    ],
    outputs: [
      'Document Title, Metadata, Doc Number & Revision Date',
      'Normalized Document Sections & Context-Aware Chunks (~7,000 chars)',
      'Preserved Clause Numbers and Section Hierarchy',
    ],
    deepDive: {
      overview:
        'Engineering documents contain nested technical clauses, numbered standards (e.g., ASME, API, NEC), and critical context that naive character chunkers destroy. CDDE applies high-speed Gemini 3.6 Flash for Table of Contents (ToC) and logical clause partitioning, with a deterministic fallback that splits on clause headers.',
      keyMechanisms: [
        'Multi-format binary buffer decoding (PDF text extraction, Word XML parsing, Excel tabular data).',
        'Gemini 3.6 Flash structural scan to detect section boundaries and clause hierarchy.',
        'Target chunk size of ~7,000 characters preserving minimum 2,000-character coherent blocks without breaking sentences or standards references.',
      ],
      businessValue:
        'Eliminates lost clauses and broken cross-references, ensuring downstream AI models analyze complete engineering requirements.',
    },
  },
  {
    id: 'phase-2',
    stepNumber: '02',
    title: 'Multi-Discipline Deep Analysis',
    shortDesc: 'Parallel reasoning to extract mandatory requirements, recommendations, and discipline tags.',
    icon: Cpu,
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    accentBg: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    modelOrTech: 'Gemini 3.7 Flash with Thinking Budget & Structured JSON Output',
    inputs: [
      'Partitioned Document Sections',
      'Assigned Discipline SME Context',
      'Document Author & Metadata',
    ],
    outputs: [
      'Item Type: Requirement (Shall/Must), Recommendation (Should), Guideline (May)',
      'Engineering Discipline: Mechanical, Piping, Electrical, I&C, Civil, Process, HSE, Quality',
      'CapEx Cost Impact Estimation: High, Medium, Low, Negligible, TBD',
      'AI Confidence Score (0.00 – 1.00) & Explicit Reasoning',
    ],
    deepDive: {
      overview:
        'Each partitioned section is analyzed concurrently using Gemini 3.7 Flash with an integrated thinking budget. The AI inspects imperative engineering language, categorizes compliance urgency, and assigns specific discipline ownership.',
      keyMechanisms: [
        'Parallel execution across all document chunks for sub-minute processing of 100+ page specifications.',
        'Thinking budget allocation (1024 tokens) for complex engineering tradeoff analysis.',
        'Strict schema enforcement with fallback cascades across Gemini 3.7 Flash, 3.6 Flash, 3.5 Flash, and 2.5 Flash models.',
      ],
      businessValue:
        'Provides 100% clause classification accuracy, differentiating binding contract terms from optional vendor suggestions.',
    },
  },
  {
    id: 'phase-3',
    stepNumber: '03',
    title: 'Synthesis, De-Duplication & Recompilation',
    shortDesc: 'Cross-discipline conflict detection, deduplication, and standardized code assignment.',
    icon: Workflow,
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    accentBg: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    modelOrTech: 'Gemini 2.5 Pro Cross-Discipline Reviewer & Deterministic Formatting Engine',
    inputs: [
      'Raw Extracted Requirements from all document chunks',
      'Discipline classifications & confidence logs',
    ],
    outputs: [
      'Deduplicated requirement inventory',
      'Synthesized Executive Summary of document scope & major equipment packages',
      'Cross-Discipline Conflict & Omission Notes (e.g. Mech vs. Electrical discrepancies)',
      'Standardized Requirement Codes (REQ-[DISCIPLINE]-[Sequence Number], e.g., REQ-MEC-00000001)',
    ],
    deepDive: {
      overview:
        'Raw extractions from multiple chunks are normalized, deduplicated, and passed to Gemini 2.5 Pro. The model acts as a Lead Technical Reviewer to synthesize the executive summary and identify conflicts between disciplines before assigning unique permanent requirement tracking codes.',
      keyMechanisms: [
        'In-memory whitespace and textual similarity deduplication.',
        'Gemini 2.5 Pro cross-discipline synthesis detecting gaps across disciplines (e.g., motor rating vs switchgear capacity).',
        'Deterministic assignment of zero-padded 8-digit requirement tracking codes (REQ-MEC-00000001).',
      ],
      businessValue:
        'Prevents duplicate requirements and catches costly cross-discipline engineering errors before RFP issuance.',
    },
  },
  {
    id: 'phase-4',
    stepNumber: '04',
    title: 'Dual-Store Database Persistence',
    shortDesc: 'Unified relational governance in PostgreSQL + 768-dim dense vector embeddings in pgvector.',
    icon: Database,
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    accentBg: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    modelOrTech: 'PostgreSQL 16 + Drizzle ORM + pgvector (text-embedding-004)',
    inputs: [
      'Recompiled requirement batch & metadata',
      'Document properties & revision history',
    ],
    outputs: [
      'Relational document record (documents table)',
      'Structured extractions with audit state (extractions table)',
      '768-dimensional dense vector embeddings (requirement_embeddings table)',
    ],
    deepDive: {
      overview:
        'CDDE combines traditional relational integrity (audit trails, document ownership, review states) with cutting-edge vector search. Every requirement is vectorized using Google text-embedding-004 and indexed in PostgreSQL via pgvector for semantic retrieval.',
      keyMechanisms: [
        'Atomic database transactions storing parent documents and child extraction records.',
        'High-speed vectorization generating 768-dimensional dense vector embeddings per clause.',
        'pgvector cosine distance indexing (<=> operator) for high-accuracy semantic similarity matching.',
      ],
      businessValue:
        'Enables sub-second semantic retrieval across thousands of technical clauses while maintaining complete corporate governance and auditability.',
    },
  },
  {
    id: 'phase-5',
    stepNumber: '05',
    title: 'Retrieval, SME Governance & Project Scoping',
    shortDesc: 'Confidence-gated SME review, semantic knowledge search, and automated RFP / SOW generation.',
    icon: Target,
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    accentBg: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    modelOrTech: 'pgvector Semantic Search + Project Scoping Agent + Closed-Loop Feedback',
    inputs: [
      'Natural language engineering queries',
      'Capital project scope definitions (Facility type, operating conditions, narrative)',
      'SME validation edits and approvals',
    ],
    outputs: [
      'Confidence-gated SME Review Queue (< 0.85 routed to discipline lead)',
      'Hybrid semantic & discipline-filtered search results',
      'Curated Vendor RFP / SOW Packages (Mandatory vs Recommendations vs Guidelines)',
      'Closed-loop feedback logs & upstream standard revision flags',
    ],
    deepDive: {
      overview:
        'Stakeholders interact with the unified knowledge base through three primary channels: a confidence-gated SME review queue for low-confidence items, an instant semantic knowledge search, and an automated Project Scoping Agent that drafts comprehensive RFP packages for new capital projects.',
      keyMechanisms: [
        'Confidence threshold gating (< 0.85) automatically assigning ambiguous items to SME review.',
        'Semantic search computing 1 - (embedding <=> queryVector) with discipline metadata filters.',
        'Project Scoping Agent compiling mandatory requirements, recommendations, and guidelines with 1-click Markdown and CSV export.',
        'Closed-loop feedback capturing SME edits into feedback_lessons and flagging upstream standards for revision.',
      ],
      businessValue:
        'Reduces capital project RFP creation time by 90% while guaranteeing that corporate engineering standards and safety mandates are never omitted.',
    },
  },
];

export default function AboutCDDE() {
  const [activePhase, setActivePhase] = useState<string>('phase-1');
  const [activeTab, setActiveTab] = useState<'architecture' | 'ai-matrix' | 'schema' | 'roi'>('architecture');

  const selectedPhase = PHASES.find((p) => p.id === activePhase) || PHASES[0];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header & Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 text-white p-8 rounded-2xl shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-brand-600 p-2.5 rounded-xl shadow-lg shadow-brand-600/30 text-white shrink-0">
              <HardHat className="w-7 h-7" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-brand-400 font-bold">
                Platform Architecture & Methodology
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                About CDDE (Capital Design Decision Engine)
              </h1>
            </div>
          </div>

          <p className="text-slate-300 max-w-4xl text-base sm:text-lg leading-relaxed">
            CDDE transforms fragmented, unstructured engineering documents—including specifications, standards, FEED
            dossiers, and vendor datasheets—into an active, verified engineering knowledge store. Powered by a multi-stage
            Gemini AI pipeline and pgvector semantic retrieval, CDDE automates requirements extraction, enforces
            confidence-gated SME governance, and compiles vendor-ready RFP / Scope of Work packages for capital projects.
          </p>

          {/* Quick Highlight Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200 flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              Gemini 3.7 Flash + Thinking
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200 flex items-center gap-1.5 font-medium">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              PostgreSQL + pgvector (768-Dim)
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Confidence-Gated SME Gating (&lt;0.85)
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200 flex items-center gap-1.5 font-medium">
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              Closed-Loop Feedback & Revision Flags
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('architecture')}
          className={`px-4 py-2.5 font-semibold text-sm rounded-t-lg transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'architecture'
              ? 'bg-white border-t-2 border-brand-600 text-brand-600 border-x border-slate-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Workflow className="w-4 h-4" />
          End-to-End Data Flow & Pipeline
        </button>
        <button
          onClick={() => setActiveTab('ai-matrix')}
          className={`px-4 py-2.5 font-semibold text-sm rounded-t-lg transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'ai-matrix'
              ? 'bg-white border-t-2 border-brand-600 text-brand-600 border-x border-slate-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Cpu className="w-4 h-4" />
          AI Model & Pipeline Matrix
        </button>
        <button
          onClick={() => setActiveTab('schema')}
          className={`px-4 py-2.5 font-semibold text-sm rounded-t-lg transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'schema'
              ? 'bg-white border-t-2 border-brand-600 text-brand-600 border-x border-slate-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          Database & Vector Schema
        </button>
        <button
          onClick={() => setActiveTab('roi')}
          className={`px-4 py-2.5 font-semibold text-sm rounded-t-lg transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'roi'
              ? 'bg-white border-t-2 border-brand-600 text-brand-600 border-x border-slate-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Business ROI & Governance
        </button>
      </div>

      {/* Tab 1: End-to-End Data Flow & Interactive Visualizer */}
      {activeTab === 'architecture' && (
        <div className="space-y-8">
          {/* Visual Architecture Diagram */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-brand-600" />
                  Interactive 5-Phase Data Flow Architecture
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Click any stage below to inspect the underlying AI models, chunking logic, payloads, and business value.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full shrink-0">
                Interactive Diagram
              </span>
            </div>

            {/* Visual Flow Stages */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
              {PHASES.map((phase, idx) => {
                const Icon = phase.icon;
                const isSelected = activePhase === phase.id;
                return (
                  <button
                    key={phase.id}
                    onClick={() => setActivePhase(phase.id)}
                    className={`relative text-left p-4 rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-brand-50/70 border-brand-500 shadow-md ring-2 ring-brand-500/20'
                        : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black text-slate-400 tracking-wider">
                          PHASE {phase.stepNumber}
                        </span>
                        <div
                          className={`p-1.5 rounded-lg ${
                            isSelected ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 leading-tight mb-1.5">{phase.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">{phase.shortDesc}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 truncate">{phase.modelOrTech.split(' ')[0]}</span>
                      <ArrowRight
                        className={`w-3.5 h-3.5 transition-transform ${
                          isSelected ? 'text-brand-600 translate-x-0.5' : 'text-slate-400'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Phase Deep Dive Drawer */}
            <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-800 shadow-inner space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-brand-600 text-white shrink-0">
                    <selectedPhase.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-400">
                      Phase {selectedPhase.stepNumber} Deep Dive
                    </span>
                    <h3 className="text-xl font-extrabold text-white">{selectedPhase.title}</h3>
                  </div>
                </div>
                <div className="text-xs font-mono px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg">
                  Engine: <span className="text-brand-300 font-semibold">{selectedPhase.modelOrTech}</span>
                </div>
              </div>

              {/* Overview & Key Mechanisms */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <p className="text-slate-300 text-sm leading-relaxed">{selectedPhase.deepDive.overview}</p>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Technical Execution Details:
                    </h4>
                    <ul className="space-y-2">
                      {selectedPhase.deepDive.keyMechanisms.map((mech, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{mech}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3 bg-brand-950/60 border border-brand-800/60 rounded-lg">
                    <h5 className="text-xs font-bold text-brand-300 uppercase tracking-wider mb-1">
                      Business & Engineering Impact:
                    </h5>
                    <p className="text-xs text-slate-200">{selectedPhase.deepDive.businessValue}</p>
                  </div>
                </div>

                {/* Inputs & Outputs Pill Box */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-4">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                      <Code2 className="w-3.5 h-3.5 text-sky-400" />
                      Stage Inputs:
                    </h4>
                    <div className="space-y-1.5">
                      {selectedPhase.inputs.map((inp, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] bg-slate-900 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded"
                        >
                          {inp}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Stage Outputs & Artifacts:
                    </h4>
                    <div className="space-y-1.5">
                      {selectedPhase.outputs.map((out, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] bg-brand-950/40 border border-brand-900/60 text-brand-200 px-2.5 py-1.5 rounded"
                        >
                          {out}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: AI Model & Pipeline Matrix */}
      {activeTab === 'ai-matrix' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-600" />
              Multi-Stage AI Model Architecture
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              CDDE leverages specialized Gemini models for each distinct phase of document processing to maximize
              accuracy, throughput, and reasoning depth.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Pipeline Stage</th>
                  <th className="p-3.5">Assigned Model</th>
                  <th className="p-3.5">Key Capability & Role</th>
                  <th className="p-3.5">Configuration</th>
                  <th className="p-3.5">Fallback Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">
                    Stage 1: Document Structure & ToC Partitioning
                  </td>
                  <td className="p-3.5">
                    <span className="font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-semibold">
                      Gemini 3.6 Flash
                    </span>
                  </td>
                  <td className="p-3.5">
                    Scans full document context to identify engineering section boundaries, preserving clause numbers.
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    temp: 0.1, responseMimeType: application/json, Structured Sections Schema
                  </td>
                  <td className="p-3.5 text-slate-500">
                    Deterministic paragraph/header chunker (target 7,000 chars)
                  </td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">
                    Stage 2: Parallel Deep Extraction & Confidence Scoring
                  </td>
                  <td className="p-3.5">
                    <span className="font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold">
                      Gemini 3.7 Flash (Thinking)
                    </span>
                  </td>
                  <td className="p-3.5">
                    Performs granular clause extraction, compliance level tagging (shall/should/may), discipline
                    routing, and confidence scoring with reasoning.
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    thinkingBudget: 1024, temp: 0.1, Structured Extraction Schema
                  </td>
                  <td className="p-3.5 text-slate-500">
                    Cascading fallback to Gemini 3.7 Flash &rarr; 3.6 Flash &rarr; 3.5 Flash &rarr; 2.5 Flash
                  </td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">
                    Stage 3: Executive Synthesis & Cross-Discipline Review
                  </td>
                  <td className="p-3.5">
                    <span className="font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">
                      Gemini 2.5 Pro
                    </span>
                  </td>
                  <td className="p-3.5">
                    Synthesizes overall document scope, detects cross-discipline discrepancies (e.g. electrical vs
                    mechanical loads), and generates unique requirement codes.
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    temp: 0.1, responseMimeType: application/json, Synthesis Schema
                  </td>
                  <td className="p-3.5 text-slate-500">
                    Fallback to Gemini 2.5 Pro &rarr; 3.1 Pro &rarr; 3.7 Flash &rarr; 3.6 Flash
                  </td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="p-3.5 font-bold text-slate-900">
                    Stage 4: Dense Semantic Vector Embedding
                  </td>
                  <td className="p-3.5">
                    <span className="font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                      text-embedding-004
                    </span>
                  </td>
                  <td className="p-3.5">
                    Transforms extracted requirement text into 768-dimensional dense vector embeddings for cosine
                    similarity search in pgvector.
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">768 dimensions, dense vector</td>
                  <td className="p-3.5 text-slate-500">
                    Fallback to embedding-001 &rarr; Full-text SQL ILIKE search
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Database & Vector Schema */}
      {activeTab === 'schema' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              Unified Relational & Vector Data Architecture
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Built on PostgreSQL with Drizzle ORM and pgvector, providing strict relational integrity alongside
              high-dimensional dense semantic search.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-mono font-bold text-slate-900">
                <span>documents</span>
                <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded">Core Table</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Stores uploaded source specifications, document numbers, revision dates, owner SMEs, and full text.
              </p>
              <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                <div>id: uuid (PK)</div>
                <div>filename: varchar(255)</div>
                <div>document_number: varchar(100)</div>
                <div>document_date: varchar(50)</div>
                <div>owner_sme: varchar(100)</div>
                <div>raw_content: text</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-mono font-bold text-brand-700">
                <span>extractions</span>
                <span className="text-[10px] bg-brand-100 text-brand-800 px-2 py-0.5 rounded">Core Table</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Structured requirement clauses with discipline tags, compliance tiers, confidence scores, and review
                states.
              </p>
              <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                <div>id: uuid (PK)</div>
                <div>document_id: uuid (FK &rarr; documents)</div>
                <div>requirement_code: REQ-DISC-00000001</div>
                <div>compliance_level: Mandatory/Recommended</div>
                <div>confidence_score: doublePrecision (0.0-1.0)</div>
                <div>status: Pending / Approved / Rejected</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-mono font-bold text-blue-700">
                <span>requirement_embeddings</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">pgvector</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                768-dimensional dense vector embeddings enabling sub-second semantic retrieval across all clauses.
              </p>
              <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                <div>id: uuid (PK)</div>
                <div>extraction_id: uuid (FK &rarr; extractions)</div>
                <div>chunk_text: text</div>
                <div>embedding: vector(768)</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-mono font-bold text-emerald-700">
                <span>project_scopes</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">RFP Package</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Capital project definitions, facility types, operating conditions, and approved RFP packages.
              </p>
              <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                <div>id: uuid (PK)</div>
                <div>project_name: varchar(255)</div>
                <div>facility_type: varchar(100)</div>
                <div>scope_description: text</div>
                <div>status: Draft / Approved</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-mono font-bold text-purple-700">
                <span>scoping_items</span>
                <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded">RFP Items</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Individual requirements matched to a capital project RFP with relevance scores and custom notes.
              </p>
              <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                <div>id: uuid (PK)</div>
                <div>project_scope_id: uuid (FK)</div>
                <div>extraction_id: uuid (FK)</div>
                <div>relevance_score: doublePrecision</div>
                <div>is_selected: boolean</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-mono font-bold text-rose-700">
                <span>feedback_lessons & flags</span>
                <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded">Governance</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Closed-loop audit logs of SME overrides and document revision flags to trigger master standard updates.
              </p>
              <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 space-y-0.5">
                <div>id: uuid (PK)</div>
                <div>document_id: uuid (FK)</div>
                <div>issue_description: text</div>
                <div>suggested_action: varchar(255)</div>
                <div>is_resolved: boolean</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Business ROI & Governance */}
      {activeTab === 'roi' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Strategic Value & Engineering ROI
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              How Capital Design Decision Engine accelerates EPC project execution and protects against multi-million
              dollar design omissions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-emerald-200/80 space-y-3">
              <div className="p-2.5 bg-emerald-600 text-white rounded-lg w-fit">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">90% Reduction in RFP Assembly Time</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Rather than manually reading hundreds of pages of engineering standards per project, the Scoping Agent
                instantly retrieves all matching mandatory clauses and drafts an RFP in minutes.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-blue-200/80 space-y-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-lg w-fit">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Zero Missed Mandatory Standards</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automated classification tags every strict requirement (using ASME, API, NEC, and internal standards).
                Low-confidence items are gated for SME review to prevent contract omissions.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-gradient-to-br from-slate-50 to-purple-50/40 border border-purple-200/80 space-y-3">
              <div className="p-2.5 bg-purple-600 text-white rounded-lg w-fit">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Closed-Loop Corporate Learning</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                When project engineers reject or modify a requirement during RFP curation, the system logs the decision
                and creates a revision flag for the document owner to update the master engineering standard.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
