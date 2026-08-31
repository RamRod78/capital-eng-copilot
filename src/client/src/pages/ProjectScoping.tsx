import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderKanban,
  Sparkles,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  Download,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Loader2,
  Database,
  Search,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  X,
  Sliders,
  Building2,
  Gauge,
  Check,
  Lightbulb,
  Layers,
} from 'lucide-react';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  matchScopeRequirements,
  fetchProjectPackage,
  saveRFPPackage,
  createFeedbackLesson,
  searchSimilarRequirements,
} from '../api/client.js';
import {
  ProjectScopeRecord,
  ProjectCreateInput,
  RFPPackage,
  ScopingRequirementItem,
  SearchResult,
  groupRequirementsByDiscipline,
  sortRequirementItems,
} from '@shared/schemas';

const ALL_DISCIPLINES = [
  'Mechanical',
  'Piping',
  'Electrical',
  'I&C',
  'Process',
  'Civil/Structural',
  'HSE',
  'Telecom',
];

const SAMPLE_PROJECTS: ProjectCreateInput[] = [
  {
    project_name: 'Gulf Coast NGL Expansion Project',
    project_code: 'CAP-2026-NGL-01',
    facility_type: 'NGL Fractionation & Gas Processing Facility',
    operating_conditions: 'Sour service (H2S > 50 ppm), 1480 psig design pressure, -40F to 350F',
    disciplines: ['Mechanical', 'Piping', 'Electrical', 'I&C', 'Process', 'HSE'],
    scope_description: 'Engineering, procurement, and fabrication of three 150,000 BPD fractionation trains, high-pressure amine contactor vessels, ASME B31.3 piping, and SIL-3 safety instrumented systems.',
    status: 'Configured',
    created_by: 'Lead Facilities Engineer',
  },
  {
    project_name: 'Permian Basin Cryogenic Gas Plant',
    project_code: 'PRM-2026-CRY-04',
    facility_type: 'Cryogenic Deep-Cut Gas Processing Plant',
    operating_conditions: 'Inlet 1100 psig, -150F cold section, molecular sieve dehydration',
    disciplines: ['Mechanical', 'Process', 'Piping', 'Electrical', 'I&C'],
    scope_description: '200 MMSCFD turbo-expander cryogenic processing unit with high recovery residue gas re-compression, NGL demethanizer column, and API 618 reciprocating compressors.',
    status: 'Configured',
    created_by: 'Senior Process SME',
  },
  {
    project_name: 'Offshore Water Injection Facility Mod',
    project_code: 'OFF-2026-WIF-02',
    facility_type: 'Offshore Production Platform topsides',
    operating_conditions: 'High pressure seawater injection (3200 psig), super duplex SS, topsides vibration limits',
    disciplines: ['Piping', 'Mechanical', 'HSE', 'Civil/Structural'],
    scope_description: 'Topsides brownfield debottlenecking, adding two 45,000 BWPD multistage centrifugal water injection pumps with duplex 2507 piping and deluge fire suppression.',
    status: 'Configured',
    created_by: 'Offshore Project Lead',
  },
];

export default function ProjectScoping() {
  const queryClient = useQueryClient();

  // Wizard Step: 1 = Configure Projects, 2 = Generate RFPs, 3 = Validate RFPs
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Selected project for RFP Generation & Validation
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Step 1: Project Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectScopeRecord | null>(null);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<ProjectScopeRecord | null>(null);

  // Project Form State
  const [projectName, setProjectName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [operatingConditions, setOperatingConditions] = useState('');
  const [scopeDescription, setScopeDescription] = useState('');
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Step 1: Project Filter Tab ('all' | 'saved' | 'draft')
  const [projectFilterTab, setProjectFilterTab] = useState<'all' | 'saved' | 'draft'>('all');
  const [loadingPackageProjectId, setLoadingPackageProjectId] = useState<string | null>(null);

  // Step 2: Generation State
  const [topK, setTopK] = useState(15);
  const [filterDisciplines, setFilterDisciplines] = useState<string[]>([]);

  // Step 3: RFP Package & Validation State
  const [rfpPackage, setRfpPackage] = useState<RFPPackage | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Step 3 Modals
  const [deleteItemTarget, setDeleteItemTarget] = useState<ScopingRequirementItem | null>(null);
  const [deleteReason, setDeleteReason] = useState('Not applicable to project operating envelope (pressure/temp/fluid)');
  const [deleteReviewer, setDeleteReviewer] = useState('Engineering SME');
  const [customDeleteReason, setCustomDeleteReason] = useState('');

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDiscipline, setSearchDiscipline] = useState('All');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addItemTarget, setAddItemTarget] = useState<SearchResult | null>(null);
  const [addTier, setAddTier] = useState<'Mandatory' | 'Recommendation' | 'Guideline'>('Mandatory');
  const [addReason, setAddReason] = useState('Mandatory requirement identified for specific facility conditions');
  const [addReviewer, setAddReviewer] = useState('Engineering SME');
  const [customAddReason, setCustomAddReason] = useState('');

  // Fetch Projects query
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  // Open Add Project Modal
  const handleOpenAddModal = () => {
    setEditingProject(null);
    setProjectName('');
    setProjectCode('');
    setFacilityType('');
    setOperatingConditions('');
    setScopeDescription('');
    setSelectedDisciplines(['Mechanical', 'Piping', 'Electrical', 'I&C', 'Process', 'HSE']);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Project Modal
  const handleOpenEditModal = (project: ProjectScopeRecord) => {
    setEditingProject(project);
    setProjectName(project.project_name);
    setProjectCode(project.project_code || '');
    setFacilityType(project.facility_type);
    setOperatingConditions(project.operating_conditions || '');
    setScopeDescription(project.scope_description);
    setSelectedDisciplines(project.disciplines || []);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Create / Update Project Mutation
  const saveProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectName.trim()) throw new Error('Project name is required');
      if (!facilityType.trim()) throw new Error('Facility type is required');
      if (!scopeDescription.trim()) throw new Error('Scope description is required');

      const payload: ProjectCreateInput = {
        project_name: projectName.trim(),
        project_code: projectCode.trim() || undefined,
        facility_type: facilityType.trim(),
        operating_conditions: operatingConditions.trim() || undefined,
        disciplines: selectedDisciplines,
        scope_description: scopeDescription.trim(),
        status: 'Configured',
        created_by: 'Engineering Lead',
      };

      if (editingProject) {
        return updateProject(editingProject.id, payload);
      } else {
        return createProject(payload);
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsAddModalOpen(false);
      setSelectedProjectId(saved.id);
      showNotification(
        editingProject ? `Project "${saved.project_name}" updated successfully` : `Project "${saved.project_name}" created successfully`
      );
    },
    onError: (err: any) => {
      setFormError(err.message);
    },
  });

  // Delete Project Mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (selectedProjectId === deleteConfirmProject?.id) {
        setSelectedProjectId(null);
      }
      setDeleteConfirmProject(null);
      showNotification('Project deleted successfully');
    },
    onError: (err: any) => {
      showNotification(err.message, 'error');
    },
  });

  // Seed sample projects if database is empty
  const handleSeedSamples = async () => {
    try {
      for (const sample of SAMPLE_PROJECTS) {
        await createProject(sample);
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showNotification('Loaded 3 sample capital projects');
    } catch (err: any) {
      showNotification('Failed to seed sample projects: ' + err.message, 'error');
    }
  };

  // Step 2: Select Project & proceed to Step 2
  const handleSelectProjectAndProceed = (project: ProjectScopeRecord) => {
    setSelectedProjectId(project.id);
    setFilterDisciplines(project.disciplines || ALL_DISCIPLINES);
    setCurrentStep(2);
  };

  // Step 3: Open an existing Saved Scope Package directly for review/editing/re-exporting
  const handleOpenSavedPackage = async (project: ProjectScopeRecord) => {
    setLoadingPackageProjectId(project.id);
    try {
      const pkg = await fetchProjectPackage(project.id);
      setSelectedProjectId(project.id);
      setFilterDisciplines(project.disciplines || ALL_DISCIPLINES);
      setRfpPackage(pkg);
      const initialMap: Record<string, boolean> = {};
      [...pkg.mandatory_requirements, ...pkg.recommendations, ...pkg.guidelines].forEach((item) => {
        initialMap[item.scoping_item_id] = item.is_selected ?? true;
      });
      setSelectedItems(initialMap);
      setCurrentStep(3);
      const totalCount = pkg.mandatory_requirements.length + pkg.recommendations.length + pkg.guidelines.length;
      showNotification(`Loaded saved scope package for "${project.project_name}" (${totalCount} clauses).`);
    } catch (err: any) {
      showNotification(`Failed to load scope package: ${err.message}`, 'error');
    } finally {
      setLoadingPackageProjectId(null);
    }
  };

  // Match Scope Requirements Mutation (Step 2)
  const matchMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error('No project selected');
      return matchScopeRequirements({
        project_id: activeProject.id,
        project_name: activeProject.project_name,
        project_code: activeProject.project_code,
        facility_type: activeProject.facility_type,
        operating_conditions: activeProject.operating_conditions,
        disciplines: filterDisciplines.length > 0 ? filterDisciplines : (activeProject.disciplines || []),
        scope_description: activeProject.scope_description,
        top_k: topK,
      });
    },
    onSuccess: (data) => {
      setRfpPackage(data);
      const initialMap: Record<string, boolean> = {};
      [...data.mandatory_requirements, ...data.recommendations, ...data.guidelines].forEach((item) => {
        initialMap[item.scoping_item_id] = true;
      });
      setSelectedItems(initialMap);
      setCurrentStep(3);
      showNotification(
        `AI matched ${data.mandatory_requirements.length + data.recommendations.length + data.guidelines.length} specifications for validation.`
      );
    },
    onError: (err: any) => {
      showNotification(`Matching error: ${err.message}`, 'error');
    },
  });

  // Save RFP Package Mutation (Step 3) - updates project's scope items without creating a duplicate project
  const saveRFPMutation = useMutation({
    mutationFn: async (pkg: RFPPackage) => {
      const payload: RFPPackage = {
        ...pkg,
        package_id: activeProject?.id || pkg.package_id,
        mandatory_requirements: pkg.mandatory_requirements.map((item) => ({
          ...item,
          is_selected: selectedItems[item.scoping_item_id] ?? true,
        })),
        recommendations: pkg.recommendations.map((item) => ({
          ...item,
          is_selected: selectedItems[item.scoping_item_id] ?? true,
        })),
        guidelines: pkg.guidelines.map((item) => ({
          ...item,
          is_selected: selectedItems[item.scoping_item_id] ?? true,
        })),
      };
      return saveRFPPackage(payload);
    },
    onSuccess: () => {
      const pName = activeProject?.project_name || rfpPackage?.project_name || 'Project';
      showNotification(`Scope package for "${pName}" saved successfully.`);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err: any) => {
      showNotification(`Save error: ${err.message}`, 'error');
    },
  });

  // Toggle item selection
  const toggleItem = (id: string) => {
    setSelectedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Delete Item with Lessons Learned feedback
  const handleConfirmDeleteItem = async () => {
    if (!deleteItemTarget || !rfpPackage) return;
    const finalReason = customDeleteReason.trim() || deleteReason;

    try {
      // 1. Log to lessons learned
      await createFeedbackLesson({
        extraction_id: deleteItemTarget.extraction_id || undefined,
        project_scope_id: activeProject?.id || rfpPackage.package_id,
        original_text: deleteItemTarget.requirement_text,
        original_status: 'Included in RFP Matrix',
        final_status: 'Rejected',
        reviewer: deleteReviewer.trim() || 'Engineering SME',
        reason: `Removed from RFP [${deleteItemTarget.requirement_code || 'REQ'}]: ${finalReason}`,
      });

      // 2. Remove from active RFP Package state
      const targetId = deleteItemTarget.scoping_item_id;
      setRfpPackage({
        ...rfpPackage,
        mandatory_requirements: rfpPackage.mandatory_requirements.filter((i) => i.scoping_item_id !== targetId),
        recommendations: rfpPackage.recommendations.filter((i) => i.scoping_item_id !== targetId),
        guidelines: rfpPackage.guidelines.filter((i) => i.scoping_item_id !== targetId),
      });

      setSelectedItems((prev) => {
        const copy = { ...prev };
        delete copy[targetId];
        return copy;
      });

      queryClient.invalidateQueries({ queryKey: ['feedbackLessons'] });
      setDeleteItemTarget(null);
      setCustomDeleteReason('');
      showNotification(`Clause removed and audit reason logged to Lessons Learned.`, 'success');
    } catch (err: any) {
      showNotification(`Failed to record feedback lesson: ${err.message}`, 'error');
    }
  };

  // Search Knowledge Base for Requirements to Add (Step 3)
  const handleSearchRequirements = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchSimilarRequirements({
        query: searchQuery.trim(),
        top_k: 8,
        discipline: searchDiscipline !== 'All' ? searchDiscipline : undefined,
      });
      setSearchResults(results);
    } catch (err: any) {
      showNotification(`Search error: ${err.message}`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // Add requirement from search with Lessons Learned feedback
  const handleConfirmAddRequirement = async () => {
    if (!addItemTarget || !rfpPackage) return;
    const finalReason = customAddReason.trim() || addReason;

    try {
      // 1. Log to Lessons Learned
      await createFeedbackLesson({
        extraction_id: addItemTarget.extraction_id,
        project_scope_id: activeProject?.id || rfpPackage.package_id,
        original_text: addItemTarget.requirement_text,
        reviewed_text: addItemTarget.requirement_text,
        original_status: 'Knowledge Base Search',
        final_status: 'Approved',
        reviewer: addReviewer.trim() || 'Engineering SME',
        reason: `Manually added to RFP [${addItemTarget.requirement_code || 'REQ'}] as ${addTier}: ${finalReason}`,
      });

      // 2. Create new scoping item
      const newItem: ScopingRequirementItem = {
        scoping_item_id: crypto.randomUUID(),
        extraction_id: addItemTarget.extraction_id,
        requirement_code: addItemTarget.requirement_code || 'REQ-ADDED',
        requirement_text: addItemTarget.requirement_text,
        item_type: 'Requirement',
        engineering_discipline: (addItemTarget.engineering_discipline as any) || 'General',
        compliance_level: (addTier === 'Mandatory' ? 'Mandatory' : addTier === 'Recommendation' ? 'Recommended' : 'Guideline') as any,
        relevance_score: Number(addItemTarget.similarity_score || 1.0),
        is_selected: true,
        custom_notes: `Added by SME: ${finalReason}`,
      };

      // 3. Insert into appropriate category in RFP package
      const updated = { ...rfpPackage };
      if (addTier === 'Mandatory') {
        updated.mandatory_requirements = [newItem, ...updated.mandatory_requirements];
      } else if (addTier === 'Recommendation') {
        updated.recommendations = [newItem, ...updated.recommendations];
      } else {
        updated.guidelines = [newItem, ...updated.guidelines];
      }

      setRfpPackage(updated);
      setSelectedItems((prev) => ({ ...prev, [newItem.scoping_item_id]: true }));
      queryClient.invalidateQueries({ queryKey: ['feedbackLessons'] });
      setAddItemTarget(null);
      setIsSearchModalOpen(false);
      setCustomAddReason('');
      showNotification(`Requirement added to RFP and logged in Lessons Learned.`, 'success');
    } catch (err: any) {
      showNotification(`Failed to add requirement: ${err.message}`, 'error');
    }
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
    md += `**Generated:** ${new Date().toLocaleDateString()}\n`;
    md += `**Author:** Capital Engineering Copilot Agent (Validated by Engineering SME)\n\n`;
    md += `## 1. Project Scope & Technical Objectives\n${rfpPackage.scope_summary}\n\n`;

    md += `## 2. Mandatory Engineering Requirements (${activeMandatory.length} Clauses)\n\n`;
    if (activeMandatory.length === 0) {
      md += `*No mandatory requirements included.*\n\n`;
    } else {
      const grouped = groupRequirementsByDiscipline(activeMandatory);
      grouped.forEach((grp, grpIdx) => {
        md += `### 2.${grpIdx + 1} ${grp.discipline} (${grp.items.length} Clauses)\n\n`;
        grp.items.forEach((item, idx) => {
          md += `#### 2.${grpIdx + 1}.${idx + 1} [${item.requirement_code || 'REQ'}]\n`;
          md += `> ${item.requirement_text}\n\n`;
        });
      });
    }

    md += `## 3. Recommended Best Practices (${activeRecs.length} Clauses)\n\n`;
    if (activeRecs.length === 0) {
      md += `*No recommendations included.*\n\n`;
    } else {
      const grouped = groupRequirementsByDiscipline(activeRecs);
      grouped.forEach((grp, grpIdx) => {
        md += `### 3.${grpIdx + 1} ${grp.discipline} (${grp.items.length} Clauses)\n\n`;
        grp.items.forEach((item, idx) => {
          md += `#### 3.${grpIdx + 1}.${idx + 1} [${item.requirement_code || 'REC'}]\n`;
          md += `> ${item.requirement_text}\n\n`;
        });
      });
    }

    md += `## 4. Design Guidelines & Options (${activeGuides.length} Clauses)\n\n`;
    if (activeGuides.length === 0) {
      md += `*No guidelines included.*\n\n`;
    } else {
      const grouped = groupRequirementsByDiscipline(activeGuides);
      grouped.forEach((grp, grpIdx) => {
        md += `### 4.${grpIdx + 1} ${grp.discipline} (${grp.items.length} Clauses)\n\n`;
        grp.items.forEach((item, idx) => {
          md += `#### 4.${grpIdx + 1}.${idx + 1} [${item.requirement_code || 'GDL'}]\n`;
          md += `> ${item.requirement_text}\n\n`;
        });
      });
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfpPackage.project_name.replace(/\s+/g, '_')}_Validated_RFP.md`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported Markdown RFP package.');
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!rfpPackage) return;
    const activeMandatory = groupRequirementsByDiscipline(
      rfpPackage.mandatory_requirements.filter((i) => selectedItems[i.scoping_item_id])
    ).flatMap((g) => g.items.map((i) => ({ ...i, tier: 'Mandatory' })));

    const activeRecs = groupRequirementsByDiscipline(
      rfpPackage.recommendations.filter((i) => selectedItems[i.scoping_item_id])
    ).flatMap((g) => g.items.map((i) => ({ ...i, tier: 'Recommendation' })));

    const activeGuides = groupRequirementsByDiscipline(
      rfpPackage.guidelines.filter((i) => selectedItems[i.scoping_item_id])
    ).flatMap((g) => g.items.map((i) => ({ ...i, tier: 'Guideline' })));

    const all = [...activeMandatory, ...activeRecs, ...activeGuides];

    let csv = `Item Code,Tier,Discipline,Compliance,Requirement Statement,Relevance Score,Status\n`;
    all.forEach((item) => {
      const sanitized = item.requirement_text.replace(/"/g, '""');
      csv += `"${item.requirement_code || 'N/A'}","${item.tier}","${item.engineering_discipline}","${item.compliance_level}","${sanitized}","${(item.relevance_score * 100).toFixed(1)}%","Validated & Included"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfpPackage.project_name.replace(/\s+/g, '_')}_Matrix.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported CSV Requirements Matrix.');
  };

  const totalItemsCount = rfpPackage
    ? rfpPackage.mandatory_requirements.length + rfpPackage.recommendations.length + rfpPackage.guidelines.length
    : 0;
  const totalSelectedCount = rfpPackage
    ? [...rfpPackage.mandatory_requirements, ...rfpPackage.recommendations, ...rfpPackage.guidelines].filter(
        (i) => selectedItems[i.scoping_item_id]
      ).length
    : 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border text-sm font-semibold transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-700'
              : 'bg-rose-950 text-rose-100 border-rose-700'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          🎯 Capital Project Scoping & RFP Generator
        </h1>
        <p className="text-slate-600 mt-1">
          End-to-end 3-step pipeline: Configure Capital Projects, Generate AI-Matched Specifications, and Validate RFP Matrices with Closed-Loop Lessons Learned.
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

      {/* 3-Step Visual Stepper */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          {/* Step 1 Tab */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-4 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 1
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 1
                  ? 'bg-brand-600 text-white shadow-md'
                  : projects.length > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {projects.length > 0 && currentStep !== 1 ? <Check className="w-5 h-5" /> : '1'}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-slate-500">Step 1</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4 text-brand-600" />
                Configure Projects
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} in database
              </div>
            </div>
          </button>

          {/* Step 2 Tab */}
          <button
            type="button"
            onClick={() => {
              if (selectedProjectId || projects.length > 0) {
                if (!selectedProjectId && projects.length > 0) {
                  setSelectedProjectId(projects[0].id);
                  setFilterDisciplines(projects[0].disciplines || ALL_DISCIPLINES);
                }
                setCurrentStep(2);
              }
            }}
            disabled={projects.length === 0}
            className={`flex items-center gap-4 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 2
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 2
                  ? 'bg-brand-600 text-white shadow-md'
                  : rfpPackage
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {rfpPackage && currentStep === 3 ? <Check className="w-5 h-5" /> : '2'}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-slate-500">Step 2</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Generate RFPs
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {activeProject ? activeProject.project_name : 'Select Project & Match'}
              </div>
            </div>
          </button>

          {/* Step 3 Tab */}
          <button
            type="button"
            onClick={() => {
              if (rfpPackage) setCurrentStep(3);
            }}
            disabled={!rfpPackage}
            className={`flex items-center gap-4 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 3
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 3
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-slate-500">Step 3</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Validate RFPs
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {rfpPackage ? `${totalSelectedCount} of ${totalItemsCount} clauses active` : 'Review & Export'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: CONFIGURE PROJECTS & SCOPE PACKAGES                              */}
      {/* ========================================================================= */}
      {currentStep === 1 && (() => {
        const savedProjects = projects.filter(
          (p) => (p.saved_items_count && p.saved_items_count > 0) || p.status === 'Approved'
        );
        const draftProjects = projects.filter(
          (p) => !(p.saved_items_count && p.saved_items_count > 0) && p.status !== 'Approved'
        );

        const filteredProjects =
          projectFilterTab === 'saved'
            ? savedProjects
            : projectFilterTab === 'draft'
            ? draftProjects
            : projects;

        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-brand-600" />
                  Step 1: Projects & Scope Packages
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Maintain capital projects and select saved scope packages to edit, re-save, or re-export.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {projects.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedSamples}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    Load Sample Projects
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add New Project
                </button>
              </div>
            </div>

            {/* Filter Tabs Bar */}
            {projects.length > 0 && (
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setProjectFilterTab('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectFilterTab === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Projects ({projects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProjectFilterTab('saved')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    projectFilterTab === 'saved'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved Scope Packages ({savedProjects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProjectFilterTab('draft')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectFilterTab === 'draft'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Unscoped Projects ({draftProjects.length})
                </button>
              </div>
            )}

            {/* Project Cards Grid */}
            {projectsLoading ? (
              <div className="p-12 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
                Loading configured projects...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <FolderKanban className="w-12 h-12 text-slate-400 mx-auto" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {projectFilterTab === 'saved'
                      ? 'No Saved Scope Packages Yet'
                      : 'No Projects Found'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {projectFilterTab === 'saved'
                      ? 'Select a project to generate and save your first scope package.'
                      : 'Create your first capital project or click "Load Sample Projects" to get started instantly.'}
                  </p>
                </div>
                {projectFilterTab !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => setProjectFilterTab('all')}
                    className="py-2 px-4 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 shadow cursor-pointer"
                  >
                    View All Projects
                  </button>
                ) : (
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleSeedSamples}
                      className="py-2 px-4 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 shadow cursor-pointer"
                    >
                      Load Sample Projects
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenAddModal}
                      className="py-2 px-4 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 shadow cursor-pointer"
                    >
                      + Add Project
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => {
                  const isSelected = selectedProjectId === project.id;
                  const hasSavedScope =
                    (project.saved_items_count && project.saved_items_count > 0) || project.status === 'Approved';
                  const isLoadingThis = loadingPackageProjectId === project.id;

                  return (
                    <div
                      key={project.id}
                      className={`bg-white rounded-2xl border p-6 flex flex-col justify-between space-y-4 shadow-sm transition-all relative ${
                        isSelected
                          ? 'border-brand-500 ring-2 ring-brand-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-brand-50 text-brand-700 border border-brand-200">
                                {project.project_code || 'CAP-PROJ'}
                              </span>
                              {hasSavedScope && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Scope Package ({project.saved_items_count || 0})
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-base text-slate-900 mt-1 leading-snug">
                              {project.project_name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(project)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Edit Project"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmProject(project)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete Project"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="text-xs text-slate-600 space-y-1.5">
                          <div className="flex items-center gap-1.5 font-medium text-slate-700">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{project.facility_type}</span>
                          </div>
                          {project.operating_conditions && (
                            <div className="flex items-start gap-1.5 text-slate-500">
                              <Gauge className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{project.operating_conditions}</span>
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 line-clamp-3 leading-relaxed font-mono">
                          {project.scope_description}
                        </p>

                        <div className="flex flex-wrap gap-1 pt-1">
                          {project.disciplines.map((disc) => (
                            <span
                              key={disc}
                              className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold"
                            >
                              {disc}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">
                          {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Active'}
                        </span>
                        <div className="flex items-center gap-2">
                          {hasSavedScope && (
                            <button
                              type="button"
                              disabled={isLoadingThis}
                              onClick={() => handleOpenSavedPackage(project)}
                              className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Open saved scope package to edit and re-export"
                            >
                              {isLoadingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FolderKanban className="w-3.5 h-3.5" />
                              )}
                              <span>Open Scope Package</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectProjectAndProceed(project)}
                            className={`py-2 px-3 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                              hasSavedScope
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                : 'bg-brand-600 hover:bg-brand-700 text-white shadow'
                            }`}
                            title={hasSavedScope ? 'Re-generate AI-matched requirements' : 'Select Project & Generate RFP'}
                          >
                            {hasSavedScope ? <Sparkles className="w-3.5 h-3.5 text-amber-500" /> : null}
                            <span>{hasSavedScope ? 'Re-Match' : 'Select & Generate RFP'}</span>
                            {!hasSavedScope && <ArrowRight className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* STEP 2: GENERATE RFPS                                                    */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Step 2: Generate RFP & Match Requirements
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Select target project, adjust match depth, and launch pgvector semantic search + ASME/API domain ontology matcher.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Change Project
            </button>
          </div>

          {/* Banner if project already has a saved scope package */}
          {activeProject && (activeProject.saved_items_count ?? 0) > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    Saved Scope Package Available ({activeProject.saved_items_count} clauses)
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    This project already has a curated scope package. You can open it directly to edit and re-export, or generate a fresh AI match below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenSavedPackage(activeProject)}
                className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <FolderKanban className="w-3.5 h-3.5" />
                Open Saved Scope in Step 3
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 2 Cols: Selected Project Details & Match Configuration */}
            <div className="lg:col-span-2 space-y-6">
              {/* Project Selector / Active Project Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-brand-600" />
                    <h3 className="font-bold text-base text-slate-900">Active Capital Project</h3>
                  </div>
                  {projects.length > 1 && (
                    <select
                      value={selectedProjectId || ''}
                      onChange={(e) => {
                        const proj = projects.find((p) => p.id === e.target.value);
                        if (proj) {
                          setSelectedProjectId(proj.id);
                          setFilterDisciplines(proj.disciplines || ALL_DISCIPLINES);
                        }
                      }}
                      className="rounded-lg border-slate-300 text-xs py-1.5 px-3 font-semibold text-slate-700 focus:border-brand-500 focus:ring-brand-500"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_name} ({p.project_code || 'No Code'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {activeProject ? (
                  <div className="space-y-4 text-xs text-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Title</span>
                        <p className="font-bold text-sm text-slate-900">{activeProject.project_name}</p>
                        <p className="font-mono text-brand-700 font-semibold">{activeProject.project_code || 'N/A'}</p>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Facility Type</span>
                        <p className="font-bold text-slate-900">{activeProject.facility_type}</p>
                        <p className="text-slate-500">{activeProject.operating_conditions || 'Standard operating envelope'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detailed Scope of Work</span>
                      <p className="text-slate-800 leading-relaxed font-mono text-[11px] whitespace-pre-wrap">
                        {activeProject.scope_description}
                      </p>
                    </div>

                    {/* Matching Parameters */}
                    <div className="pt-4 border-t border-slate-200 space-y-4">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-brand-600" />
                        Scoping Match Parameters
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Target Match Depth (Top-K Requirements): {topK}
                          </label>
                          <input
                            type="range"
                            min={5}
                            max={35}
                            step={1}
                            value={topK}
                            onChange={(e) => setTopK(Number(e.target.value))}
                            className="w-full accent-brand-600"
                          />
                          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                            <span>5 (Focused)</span>
                            <span>15 (Standard)</span>
                            <span>35 (Comprehensive)</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Included Disciplines
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {ALL_DISCIPLINES.map((d) => {
                              const active = filterDisciplines.includes(d);
                              return (
                                <button
                                  type="button"
                                  key={d}
                                  onClick={() => {
                                    if (active) {
                                      setFilterDisciplines(filterDisciplines.filter((x) => x !== d));
                                    } else {
                                      setFilterDisciplines([...filterDisciplines, d]);
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                    active
                                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Launch Matcher Button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={matchMutation.isPending}
                        onClick={() => matchMutation.mutate()}
                        className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {matchMutation.isPending ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Synthesizing pgvector Embeddings & Matching Specifications...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5 text-amber-300" />
                            <span>Launch AI Requirement Matching Agent</span>
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">Please select a project from Step 1.</div>
                )}
              </div>
            </div>

            {/* Right 1 Col: Agent Info & Architecture */}
            <div className="space-y-4">
              <div className="bg-slate-900 text-white p-6 rounded-2xl space-y-4 shadow-md">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand-400" />
                  AI Matching Engine
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The Scoping Agent embeds the facility type, operating envelope, and detailed scope into 768-dimensional space and queries pgvector for cosine similarity.
                </p>

                <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span><strong>Tier 1: Mandatory</strong> (Shall / Must)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span><strong>Tier 2: Recommended</strong> (Should)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span><strong>Tier 3: Guidelines</strong> (May / Options)</span>
                  </div>
                </div>
              </div>

              {matchMutation.isPending && (
                <div className="bg-brand-50 border border-brand-200 p-5 rounded-2xl space-y-3 animate-pulse">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-800 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                    Agent Reasoning In Progress
                  </h4>
                  <div className="text-xs text-brand-900 space-y-1.5 font-mono">
                    <div>1. Generating text embeddings (Gemini embedding-001)...</div>
                    <div>2. Executing HNSW cosine distance vector retrieval...</div>
                    <div>3. Partitioning compliance tiers according to ASME/API clauses...</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: VALIDATE RFPS                                                    */}
      {/* ========================================================================= */}
      {currentStep === 3 && rfpPackage && (
        <div className="space-y-6">
          {/* Top Validation Bar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Step 3: Validation & Curation
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs font-semibold text-slate-600">{rfpPackage.facility_type}</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mt-1 flex items-center gap-2">
                  {rfpPackage.project_name}
                </h2>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Return to Projects list"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Projects
                </button>

                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(true)}
                  className="py-2 px-3.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  + Add Requirement from Search
                </button>

                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="py-2 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Markdown
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="py-2 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export CSV
                </button>

                <button
                  type="button"
                  disabled={saveRFPMutation.isPending}
                  onClick={() => saveRFPMutation.mutate(rfpPackage)}
                  className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {saveRFPMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                  {saveRFPMutation.isPending ? 'Saving...' : 'Save Scope Package'}
                </button>
              </div>
            </div>

            {/* Stats Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Matched</span>
                <p className="text-lg font-extrabold text-slate-900">{totalItemsCount}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Included in Export</span>
                <p className="text-lg font-extrabold text-emerald-800">{totalSelectedCount}</p>
              </div>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Mandatory (Shall)</span>
                <p className="text-lg font-extrabold text-rose-800">{rfpPackage.mandatory_requirements.length}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Recommendations</span>
                <p className="text-lg font-extrabold text-amber-800">{rfpPackage.recommendations.length}</p>
              </div>
            </div>
          </div>

          {/* SECTION: Mandatory Requirements */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-rose-700 flex items-center gap-2 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                Mandatory Engineering Requirements ({rfpPackage.mandatory_requirements.length})
              </h3>
              <span className="text-xs text-slate-500">Grouped by discipline & sorted by requirement number</span>
            </div>

            {rfpPackage.mandatory_requirements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No mandatory requirements in this package.</div>
            ) : (
              <div className="space-y-6">
                {groupRequirementsByDiscipline(rfpPackage.mandatory_requirements).map(({ discipline, items }) => (
                  <div key={discipline} className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-1 border-b border-slate-100">
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-rose-600" />
                        {discipline}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100/70 text-rose-800 border border-rose-200/60">
                        {items.length} {items.length === 1 ? 'clause' : 'clauses'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {items.map((item) => {
                        const isSelected = selectedItems[item.scoping_item_id] ?? true;
                        return (
                          <div
                            key={item.scoping_item_id}
                            className={`p-4 rounded-xl border text-xs transition-all flex items-start gap-3.5 ${
                              isSelected
                                ? 'bg-rose-50/40 border-rose-200 text-slate-900 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                            }`}
                          >
                            {/* Checkbox Toggle */}
                            <button
                              type="button"
                              onClick={() => toggleItem(item.scoping_item_id)}
                              className="mt-0.5 text-rose-600 shrink-0 hover:scale-110 transition-transform cursor-pointer"
                              title={isSelected ? 'Included in export (Click to exclude)' : 'Excluded (Click to include)'}
                            >
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>

                            {/* Content */}
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-rose-800 bg-rose-100/70 px-2 py-0.5 rounded text-[11px]">
                                    {item.requirement_code || 'REQ'}
                                  </span>
                                  <span className="font-semibold text-slate-600">{item.engineering_discipline}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold text-slate-500">
                                    Match: {(item.relevance_score * 100).toFixed(0)}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteItemTarget(item)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-100 transition-colors cursor-pointer"
                                    title="Delete requirement & log to Lessons Learned"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="font-normal leading-relaxed text-slate-800">{item.requirement_text}</p>
                              {item.custom_notes && (
                                <div className="text-[11px] font-mono text-brand-700 bg-brand-50 p-1.5 rounded">
                                  {item.custom_notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION: Recommended Best Practices */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-amber-700 flex items-center gap-2 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                Recommended Best Practices ({rfpPackage.recommendations.length})
              </h3>
              <span className="text-xs text-slate-500">Grouped by discipline & sorted by requirement number</span>
            </div>

            {rfpPackage.recommendations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No recommendations in this package.</div>
            ) : (
              <div className="space-y-6">
                {groupRequirementsByDiscipline(rfpPackage.recommendations).map(({ discipline, items }) => (
                  <div key={discipline} className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-1 border-b border-slate-100">
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-600" />
                        {discipline}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100/70 text-amber-800 border border-amber-200/60">
                        {items.length} {items.length === 1 ? 'clause' : 'clauses'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {items.map((item) => {
                        const isSelected = selectedItems[item.scoping_item_id] ?? true;
                        return (
                          <div
                            key={item.scoping_item_id}
                            className={`p-4 rounded-xl border text-xs transition-all flex items-start gap-3.5 ${
                              isSelected
                                ? 'bg-amber-50/40 border-amber-200 text-slate-900 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleItem(item.scoping_item_id)}
                              className="mt-0.5 text-amber-600 shrink-0 hover:scale-110 transition-transform cursor-pointer"
                            >
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>

                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded text-[11px]">
                                    {item.requirement_code || 'REC'}
                                  </span>
                                  <span className="font-semibold text-slate-600">{item.engineering_discipline}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold text-slate-500">
                                    Match: {(item.relevance_score * 100).toFixed(0)}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteItemTarget(item)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-100 transition-colors cursor-pointer"
                                    title="Delete requirement & log to Lessons Learned"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="font-normal leading-relaxed text-slate-800">{item.requirement_text}</p>
                              {item.custom_notes && (
                                <div className="text-[11px] font-mono text-brand-700 bg-brand-50 p-1.5 rounded">
                                  {item.custom_notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION: Guidelines & Options */}
          {rfpPackage.guidelines.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-blue-700 flex items-center gap-2 uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                  Design Guidelines & Options ({rfpPackage.guidelines.length})
                </h3>
                <span className="text-xs text-slate-500">Grouped by discipline & sorted by requirement number</span>
              </div>

              <div className="space-y-6">
                {groupRequirementsByDiscipline(rfpPackage.guidelines).map(({ discipline, items }) => (
                  <div key={discipline} className="space-y-3">
                    <div className="flex items-center gap-2.5 pb-1 border-b border-slate-100">
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        {discipline}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100/70 text-blue-800 border border-blue-200/60">
                        {items.length} {items.length === 1 ? 'clause' : 'clauses'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {items.map((item) => {
                        const isSelected = selectedItems[item.scoping_item_id] ?? true;
                        return (
                          <div
                            key={item.scoping_item_id}
                            className={`p-4 rounded-xl border text-xs transition-all flex items-start gap-3.5 ${
                              isSelected
                                ? 'bg-blue-50/40 border-blue-200 text-slate-900 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleItem(item.scoping_item_id)}
                              className="mt-0.5 text-blue-600 shrink-0 hover:scale-110 transition-transform cursor-pointer"
                            >
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>

                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded text-[11px]">
                                    {item.requirement_code || 'GDL'}
                                  </span>
                                  <span className="font-semibold text-slate-600">{item.engineering_discipline}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold text-slate-500">
                                    Match: {(item.relevance_score * 100).toFixed(0)}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteItemTarget(item)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-100 transition-colors cursor-pointer"
                                    title="Delete requirement & log to Lessons Learned"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="font-normal leading-relaxed text-slate-800">{item.requirement_text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT PROJECT (STEP 1)                                       */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-brand-600" />
                {editingProject ? 'Edit Capital Project' : 'Configure New Capital Project'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Permian Basin Gas Plant"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Project / WBS Code
                  </label>
                  <input
                    type="text"
                    value={projectCode}
                    onChange={(e) => setProjectCode(e.target.value)}
                    placeholder="e.g. CAP-2026-01"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Facility Type / Process Unit *
                  </label>
                  <input
                    type="text"
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    placeholder="e.g. NGL Fractionation Facility"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Operating Envelope
                  </label>
                  <input
                    type="text"
                    value={operatingConditions}
                    onChange={(e) => setOperatingConditions(e.target.value)}
                    placeholder="e.g. Sour service, 1440 psig, -20F to 250F"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Engineering Disciplines in Scope
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DISCIPLINES.map((d) => {
                    const isChecked = selectedDisciplines.includes(d);
                    return (
                      <button
                        type="button"
                        key={d}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedDisciplines(selectedDisciplines.filter((x) => x !== d));
                          } else {
                            setSelectedDisciplines([...selectedDisciplines, d]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isChecked ? '✓ ' : ''}{d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Detailed Scope of Work Description *
                </label>
                <textarea
                  rows={4}
                  value={scopeDescription}
                  onChange={(e) => setScopeDescription(e.target.value)}
                  placeholder="Describe process units, equipment specs, piping classes, electrical substations, safety requirements..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveProjectMutation.isPending}
                onClick={() => saveProjectMutation.mutate()}
                className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {saveProjectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingProject ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE PROJECT CONFIRMATION (STEP 1)                              */}
      {/* ========================================================================= */}
      {deleteConfirmProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900">Delete Project?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete project <strong className="text-slate-900">{deleteConfirmProject.project_name}</strong>?
              This will remove its saved scope and requirement configurations.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmProject(null)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteProjectMutation.isPending}
                onClick={() => deleteProjectMutation.mutate(deleteConfirmProject.id)}
                className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer"
              >
                {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE ITEM WITH REASONING TO LESSONS LEARNED (STEP 3)             */}
      {/* ========================================================================= */}
      {deleteItemTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-rose-700">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Remove Clause & Log Lessons Learned</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteItemTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 space-y-1 font-mono">
              <span className="font-bold text-rose-800 font-sans">
                [{deleteItemTarget.requirement_code || 'REQ'}] {deleteItemTarget.engineering_discipline}:
              </span>
              <p className="line-clamp-3">{deleteItemTarget.requirement_text}</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Reviewer Name
                </label>
                <input
                  type="text"
                  value={deleteReviewer}
                  onChange={(e) => setDeleteReviewer(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Standard Rationale / Reason for Removal
                </label>
                <select
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800"
                >
                  <option value="Not applicable to project operating envelope (pressure/temp/fluid)">
                    Not applicable to project operating envelope (pressure/temp/fluid)
                  </option>
                  <option value="Superseded by client site-specific engineering specification">
                    Superseded by client site-specific engineering specification
                  </option>
                  <option value="Out of vendor battery limits / Scope excluded">
                    Out of vendor battery limits / Scope excluded
                  </option>
                  <option value="Packaged equipment vendor standard design takes precedence">
                    Packaged equipment vendor standard design takes precedence
                  </option>
                  <option value="Other / Custom Engineering Rationale">Other / Custom Engineering Rationale</option>
                </select>
              </div>

              {deleteReason.includes('Other') && (
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Custom Justification *
                  </label>
                  <textarea
                    rows={2}
                    value={customDeleteReason}
                    onChange={(e) => setCustomDeleteReason(e.target.value)}
                    placeholder="Provide specific engineering reason for audit log..."
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeleteItemTarget(null)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteItem}
                className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer"
              >
                Confirm Removal & Record Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD REQUIREMENT FROM SEARCH TO RFP (STEP 3)                       */}
      {/* ========================================================================= */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-brand-600" />
                <h3 className="font-bold text-lg text-slate-900">Search & Add Requirements to RFP</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSearchModalOpen(false);
                  setAddItemTarget(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Query Form */}
            <form onSubmit={handleSearchRequirements} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Semantic Keyword / Specification Query
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., amine contactor metallurgy, ASME B31.3 NDE, SIL-3 logic solver..."
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Filter Discipline
                  </label>
                  <select
                    value={searchDiscipline}
                    onChange={(e) => setSearchDiscipline(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm"
                  >
                    <option value="All">All Disciplines</option>
                    {ALL_DISCIPLINES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Search Knowledge Base</span>
              </button>
            </form>

            {/* If item selected to add, show configuration drawer */}
            {addItemTarget && (
              <div className="bg-brand-50/70 border border-brand-300 p-4 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-brand-900">
                    Add Specification to RFP Package
                  </h4>
                  <button
                    type="button"
                    onClick={() => setAddItemTarget(null)}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div className="p-3 bg-white rounded-lg border border-brand-200 text-xs font-mono text-slate-800">
                  <span className="font-bold text-brand-800 font-sans">
                    [{addItemTarget.requirement_code || 'REQ'}] {addItemTarget.engineering_discipline}:
                  </span>{' '}
                  {addItemTarget.requirement_text}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Target Compliance Tier</label>
                    <select
                      value={addTier}
                      onChange={(e) => setAddTier(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    >
                      <option value="Mandatory">🔴 Mandatory Requirement (Shall)</option>
                      <option value="Recommendation">🟡 Recommended Best Practice (Should)</option>
                      <option value="Guideline">🔵 Design Guideline (May)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Reviewer</label>
                    <input
                      type="text"
                      value={addReviewer}
                      onChange={(e) => setAddReviewer(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Reason / Rationale (Logged to Lessons Learned) *
                  </label>
                  <input
                    type="text"
                    value={customAddReason || addReason}
                    onChange={(e) => setCustomAddReason(e.target.value)}
                    placeholder="Provide specific engineering justification..."
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleConfirmAddRequirement}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Confirm & Insert into RFP
                </button>
              </div>
            )}

            {/* Results List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Search Results ({searchResults.length})
              </h4>

              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  {isSearching ? 'Searching...' : 'Enter a query and search above to find specifications to add.'}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {searchResults.map((res) => (
                    <div
                      key={res.extraction_id}
                      className="p-3.5 bg-slate-50 hover:bg-white rounded-xl border border-slate-200 hover:border-brand-300 transition-all text-xs space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 bg-slate-200/70 px-2 py-0.5 rounded text-[11px]">
                            {res.requirement_code || 'REQ'}
                          </span>
                          <span className="font-semibold text-slate-600">{res.engineering_discipline}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {res.compliance_level}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Score: {(res.similarity_score * 100).toFixed(0)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAddItemTarget(res);
                              setAddTier(
                                res.compliance_level === 'Mandatory'
                                  ? 'Mandatory'
                                  : res.compliance_level === 'Recommended'
                                  ? 'Recommendation'
                                  : 'Guideline'
                              );
                            }}
                            className="py-1 px-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            + Select to Add
                          </button>
                        </div>
                      </div>
                      <p className="text-slate-800 leading-relaxed font-normal">{res.requirement_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
