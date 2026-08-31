import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  Sparkles,
  Download,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Loader2,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { matchScopeRequirements, saveRFPPackage } from '../api/client.js';
import { RFPPackage, ScopingRequirementItem } from '@shared/schemas';

interface ScopingFormData {
  project_name: string;
  project_code: string;
  facility_type: string;
  operating_conditions: string;
  disciplines: string[];
  scope_description: string;
  top_k: number;
}

export default function ProjectScoping() {
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<ScopingFormData>({
    defaultValues: {
      project_name: 'Gulf Coast NGL Expansion Project',
      project_code: 'CAP-2026-NGL-01',
      facility_type: 'NGL Fractionation & Gas Processing Facility',
      operating_conditions: 'Sour service (H2S > 50 ppm), 1480 psig design pressure, -40F to 350F',
      disciplines: ['Mechanical', 'Piping', 'Electrical', 'I&C', 'Process', 'HSE'],
      scope_description: 'Engineering, procurement, and fabrication of three 150,000 BPD fractionation trains, high-pressure amine contactor vessels, ASME B31.3 piping, and SIL-3 safety instrumented systems.',
      top_k: 12,
    },
  });

  const [rfpPackage, setRfpPackage] = useState<RFPPackage | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const matchMutation = useMutation({
    mutationFn: (data: ScopingFormData) => matchScopeRequirements(data as any),
    onSuccess: (data) => {
      setRfpPackage(data);
      const initialMap: Record<string, boolean> = {};
      [...data.mandatory_requirements, ...data.recommendations, ...data.guidelines].forEach((item) => {
        initialMap[item.scoping_item_id] = true;
      });
      setSelectedItems(initialMap);
      setSaveSuccess(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (pkg: RFPPackage) => saveRFPPackage(pkg),
    onSuccess: () => {
      setSaveSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const onSubmit = (data: ScopingFormData) => {
    matchMutation.mutate(data);
  };

  // Export Markdown
  const handleExportMarkdown = () => {
    if (!rfpPackage) return;
    const activeMandatory = rfpPackage.mandatory_requirements.filter((i) => selectedItems[i.scoping_item_id]);
    const activeRecs = rfpPackage.recommendations.filter((i) => selectedItems[i.scoping_item_id]);
    const activeGuides = rfpPackage.guidelines.filter((i) => selectedItems[i.scoping_item_id]);

    let md = `# REQUEST FOR PROPOSAL (RFP) & SCOPE OF WORK\n\n`;
    md += `**Project:** ${rfpPackage.project_name} (${rfpPackage.project_code || 'N/A'})\n`;
    md += `**Facility Type:** ${rfpPackage.facility_type}\n`;
    md += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
    md += `## 1. Project Scope & Technical Objectives\n${rfpPackage.scope_summary}\n\n`;

    md += `## 2. Mandatory Engineering Requirements\n`;
    activeMandatory.forEach((item, idx) => {
      md += `### 2.${idx + 1} [${item.requirement_code || 'REQ'}] ${item.engineering_discipline}\n`;
      md += `> ${item.requirement_text}\n\n`;
    });

    md += `## 3. Recommended Best Practices\n`;
    activeRecs.forEach((item, idx) => {
      md += `### 3.${idx + 1} [${item.requirement_code || 'REC'}] ${item.engineering_discipline}\n`;
      md += `> ${item.requirement_text}\n\n`;
    });

    md += `## 4. Optional Guidelines\n`;
    activeGuides.forEach((item, idx) => {
      md += `### 4.${idx + 1} [${item.requirement_code || 'GDL'}] ${item.engineering_discipline}\n`;
      md += `> ${item.requirement_text}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfpPackage.project_name.replace(/\s+/g, '_')}_RFP.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!rfpPackage) return;
    const all = [
      ...rfpPackage.mandatory_requirements.map((i) => ({ ...i, tier: 'Mandatory' })),
      ...rfpPackage.recommendations.map((i) => ({ ...i, tier: 'Recommendation' })),
      ...rfpPackage.guidelines.map((i) => ({ ...i, tier: 'Guideline' })),
    ].filter((i) => selectedItems[i.scoping_item_id]);

    let csv = `Item Code,Tier,Discipline,Compliance,Requirement Statement,Relevance Score\n`;
    all.forEach((item) => {
      const sanitized = item.requirement_text.replace(/"/g, '""');
      csv += `"${item.requirement_code || 'N/A'}","${item.tier}","${item.engineering_discipline}","${item.compliance_level}","${sanitized}","${(item.relevance_score * 100).toFixed(1)}%"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfpPackage.project_name.replace(/\s+/g, '_')}_Matrix.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          🎯 Capital Project Scoping & RFP Generator Agent
        </h1>
        <p className="text-slate-600 mt-1">
          Ingest new project scopes, match relevant engineering specifications, recommendations, and guidelines using hybrid pgvector search, and assemble an RFP / SOW package.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
              📝 Capital Project Intake Specifications
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  {...register('project_name', { required: true })}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Project / WBS Code
                </label>
                <input
                  type="text"
                  {...register('project_code')}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Facility Type / Process Unit
                </label>
                <input
                  type="text"
                  {...register('facility_type', { required: true })}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Operating Envelope (Pressure, Temp, Fluid)
                </label>
                <input
                  type="text"
                  {...register('operating_conditions')}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Detailed Scope of Work Description
              </label>
              <textarea
                rows={4}
                {...register('scope_description', { required: true })}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={matchMutation.isPending}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {matchMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Matching Requirements with pgvector Agent...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Execute Scoping Matcher Agent
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right 1 Col: Info */}
        <div className="space-y-4">
          <div className="bg-slate-900 text-white p-6 rounded-xl space-y-4 shadow-md">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Target className="w-5 h-5 text-brand-400" />
              Scoping Agent Capabilities
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Synthesizes dense semantic vector search with domain ontology rules to match mandatory ASME/API/company specifications with zero manual search fatigue.
            </p>
            <div className="pt-2 border-t border-slate-800 space-y-2 text-xs text-slate-300">
              <div>🎯 <strong>Tier 1:</strong> Mandatory Requirements (Shall)</div>
              <div>💡 <strong>Tier 2:</strong> Recommended Best Practices (Should)</div>
              <div>📘 <strong>Tier 3:</strong> Design Guidelines & Options (May)</div>
            </div>
          </div>
        </div>
      </div>

      {/* RFP Package Preview & Curation */}
      {rfpPackage && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                RFP Package: {rfpPackage.project_name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{rfpPackage.facility_type}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="py-2 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export Markdown RFP
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="py-2 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV Matrix
              </button>

              <button
                type="button"
                disabled={saveMutation.isPending || saveSuccess}
                onClick={() => saveMutation.mutate(rfpPackage)}
                className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Database className="w-3.5 h-3.5" />
                {saveSuccess ? 'Saved in Database' : 'Save Scope Package'}
              </button>
            </div>
          </div>

          {/* Section: Mandatory Requirements */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 uppercase tracking-wider text-rose-700">
              🔴 Mandatory Engineering Requirements ({rfpPackage.mandatory_requirements.length})
            </h3>
            <div className="space-y-2">
              {rfpPackage.mandatory_requirements.map((item) => (
                <div
                  key={item.scoping_item_id}
                  onClick={() => toggleItem(item.scoping_item_id)}
                  className={`p-3.5 rounded-lg border text-xs cursor-pointer transition-all flex items-start gap-3 deferred-requirement-card ${
                    selectedItems[item.scoping_item_id]
                      ? 'bg-rose-50/50 border-rose-200 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0 text-rose-600">
                    {selectedItems[item.scoping_item_id] ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-rose-800">{item.requirement_code || 'REQ'}</span>
                      <span className="font-medium text-slate-500">{item.engineering_discipline}</span>
                    </div>
                    <p className="font-normal leading-relaxed text-pretty">{item.requirement_text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Recommendations */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 uppercase tracking-wider text-amber-700">
              🟡 Recommended Best Practices ({rfpPackage.recommendations.length})
            </h3>
            <div className="space-y-2">
              {rfpPackage.recommendations.map((item) => (
                <div
                  key={item.scoping_item_id}
                  onClick={() => toggleItem(item.scoping_item_id)}
                  className={`p-3.5 rounded-lg border text-xs cursor-pointer transition-all flex items-start gap-3 deferred-requirement-card ${
                    selectedItems[item.scoping_item_id]
                      ? 'bg-amber-50/50 border-amber-200 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0 text-amber-600">
                    {selectedItems[item.scoping_item_id] ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-800">{item.requirement_code || 'REC'}</span>
                      <span className="font-medium text-slate-500">{item.engineering_discipline}</span>
                    </div>
                    <p className="font-normal leading-relaxed text-pretty">{item.requirement_text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
