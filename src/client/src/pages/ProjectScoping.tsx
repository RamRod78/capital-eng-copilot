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
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  X,
  Sliders,
  Building2,
  Gauge,
  Check,
  Lightbulb,
  Layers,
  Zap,
  Activity,
  Cpu,
  ChevronDown,
  ChevronUp,
  Filter,
  Copy,
  FileCheck,
  RefreshCw,
  Eye,
  CheckCheck,
  HelpCircle,
} from 'lucide-react';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  matchScopeRequirements,
  fetchProjectPackage,
  saveRFPPackage,
  auditScopeRequirements,
  createFeedbackLesson,
  searchSimilarRequirements,
} from '../api/client.js';
import {
  ProjectScopeRecord,
  ProjectCreateInput,
  RFPPackage,
  ScopingRequirementItem,
  ScopeQualityAuditReport,
  RequirementQualityFlag,
  ScopeAuditInput,
  SearchResult,
  groupRequirementsByDiscipline,
  sortRequirementItems,
  EngineeringDisciplineValues,
} from '@shared/schemas';

const ALL_DISCIPLINES = EngineeringDisciplineValues;

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

  // Wizard Step: 1 = Configure Projects, 2 = Generate RFPs, 3 = Validate RFPs, 4 = Quality & Conflict Scan
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

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

  // Step 4: Quality & Conflict Audit State
  const [qualityAuditReport, setQualityAuditReport] = useState<ScopeQualityAuditReport | null>(null);
  const [selectedAuditModel, setSelectedAuditModel] = useState<string>('gemini-3.7-flash');
  const [auditFilterTab, setAuditFilterTab] = useState<'all' | 'conflicts' | 'ambiguities' | 'duplicates' | 'clean'>('all');
  const [expandedFlagIds, setExpandedFlagIds] = useState<Record<string, boolean>>({});

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
    setSelectedDisciplines([...EngineeringDisciplineValues]);
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
      if (pkg.quality_audit) {
        setQualityAuditReport(pkg.quality_audit);
      } else {
        setQualityAuditReport(null);
      }
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
      setQualityAuditReport(null);
      setCurrentStep(3);
      showNotification(
        `AI matched ${data.mandatory_requirements.length + data.recommendations.length + data.guidelines.length} specifications for validation.`
      );
    },
    onError: (err: any) => {
      showNotification(`Matching error: ${err.message}`, 'error');
    },
  });

  // Save RFP Package Mutation (Step 3 & 4)
  const saveRFPMutation = useMutation({
    mutationFn: async (pkg: RFPPackage) => {
      const payload: RFPPackage = {
        ...pkg,
        package_id: activeProject?.id || pkg.package_id,
        quality_audit: qualityAuditReport || pkg.quality_audit,
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

  // Step 4: Audit Mutation (Quality, Ambiguity & Cross-Discipline Conflicts)
  const auditMutation = useMutation({
    mutationFn: async () => {
      if (!rfpPackage) throw new Error('No active RFP package to audit');
      const allActiveItems = [
        ...rfpPackage.mandatory_requirements,
        ...rfpPackage.recommendations,
        ...rfpPackage.guidelines,
      ].filter((item) => selectedItems[item.scoping_item_id] ?? true);

      if (allActiveItems.length === 0) {
        throw new Error('Please select at least 1 requirement clause to scan.');
      }

      const auditInput: ScopeAuditInput = {
        package_id: activeProject?.id || rfpPackage.package_id,
        project_name: rfpPackage.project_name,
        project_code: rfpPackage.project_code,
        facility_type: rfpPackage.facility_type,
        operating_conditions: activeProject?.operating_conditions,
        scope_description: rfpPackage.scope_summary,
        selected_items: allActiveItems,
        model: selectedAuditModel,
      };

      return auditScopeRequirements(auditInput);
    },
    onSuccess: (data) => {
      setQualityAuditReport(data);
      setRfpPackage((prev) => (prev ? { ...prev, quality_audit: data } : null));
      setCurrentStep(4);
      showNotification(
        `Scope Quality & Conflict Scan complete: Health Score ${data.quality_score}% (${data.flags.length} findings).`
      );
    },
    onError: (err: any) => {
      showNotification(`Audit error: ${err.message}`, 'error');
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

    if (qualityAuditReport) {
      md += `## 5. Scope Quality, Ambiguity & Cross-Discipline Conflict Audit\n\n`;
      md += `**Scope Health Score:** ${qualityAuditReport.quality_score}/100\n`;
      md += `**Scanned Model:** ${qualityAuditReport.model_used}\n`;
      md += `**Audited Date:** ${new Date(qualityAuditReport.scanned_at).toLocaleString()}\n\n`;
      md += `### 5.1 Executive Findings Summary\n${qualityAuditReport.executive_summary}\n\n`;
      md += `### 5.2 RFP Package Manager Decision Guidance\n${qualityAuditReport.manager_guidance}\n\n`;
      md += `### 5.3 Audit Breakdown\n`;
      md += `- **Cross-Discipline Conflicts:** ${qualityAuditReport.conflict_count}\n`;
      md += `- **Ambiguous Clauses:** ${qualityAuditReport.ambiguity_count}\n`;
      md += `- **Duplicate Specifications:** ${qualityAuditReport.duplication_count}\n\n`;

      if (qualityAuditReport.flags.length > 0) {
        md += `### 5.4 Identified Quality & Conflict Flags (${qualityAuditReport.flags.length} Flags)\n\n`;
        qualityAuditReport.flags.forEach((f, idx) => {
          md += `#### 5.4.${idx + 1} [${f.issue_type} - ${f.severity}] ${f.title}\n`;
          md += `- **Finding:** ${f.description}\n`;
          md += `- **Suggested Action:** ${f.suggested_action}\n`;
          if (f.conflicting_requirement_codes.length > 0) {
            md += `- **Conflicting Codes:** ${f.conflicting_requirement_codes.join(', ')}\n`;
          }
          md += `\n`;
        });
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfpPackage.project_name.replace(/\s+/g, '_')}_Validated_RFP.md`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported Markdown RFP package with Quality Audit.');
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

    const flagsByItemId = new Map<string, RequirementQualityFlag[]>();
    if (qualityAuditReport) {
      for (const flag of qualityAuditReport.flags) {
        const existing = flagsByItemId.get(flag.scoping_item_id) || [];
        existing.push(flag);
        flagsByItemId.set(flag.scoping_item_id, existing);
      }
    }

    let csv = `Item Code,Tier,Discipline,Compliance,Requirement Statement,Relevance Score,Status,Quality Flags,Quality Action\n`;
    all.forEach((item) => {
      const sanitized = item.requirement_text.replace(/"/g, '""');
      const itemFlags = flagsByItemId.get(item.scoping_item_id) || [];
      const flagSummary = itemFlags.map((f) => `[${f.issue_type}:${f.severity}] ${f.title}`).join('; ').replace(/"/g, '""');
      const actionSummary = itemFlags.map((f) => f.suggested_action).join('; ').replace(/"/g, '""');
      csv += `"${item.requirement_code || 'N/A'}","${item.tier}","${item.engineering_discipline}","${item.compliance_level}","${sanitized}","${(item.relevance_score * 100).toFixed(1)}%","Validated & Included","${flagSummary || 'Clean'}","${actionSummary || 'None'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfpPackage.project_name.replace(/\s+/g, '_')}_Matrix.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported CSV Requirements Matrix with Quality Audit columns.');
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
          End-to-end 4-step pipeline: Configure Capital Projects, Generate AI-Matched Specifications, Validate & Curate Clauses, and Scan for Duplication, Ambiguity & Cross-Discipline Conflicts.
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

      {/* 4-Step Visual Stepper */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
          {/* Step 1 Tab */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-3.5 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 1
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 1
                  ? 'bg-brand-600 text-white shadow-md'
                  : projects.length > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {projects.length > 0 && currentStep !== 1 ? <Check className="w-5 h-5" /> : '1'}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Step 1</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                <FolderKanban className="w-4 h-4 text-brand-600 shrink-0" />
                Configure Projects
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} in db
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
            className={`flex items-center gap-3.5 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 2
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 2
                  ? 'bg-brand-600 text-white shadow-md'
                  : rfpPackage
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {rfpPackage && currentStep > 2 ? <Check className="w-5 h-5" /> : '2'}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Step 2</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                Generate RFPs
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {activeProject ? activeProject.project_name : 'Select & Match'}
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
            className={`flex items-center gap-3.5 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 3
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 3
                  ? 'bg-brand-600 text-white shadow-md'
                  : qualityAuditReport && currentStep > 3
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {qualityAuditReport && currentStep > 3 ? <Check className="w-5 h-5" /> : '3'}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Step 3</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Validate & Curate
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {rfpPackage ? `${totalSelectedCount} of ${totalItemsCount} clauses` : 'Review & Curate'}
              </div>
            </div>
          </button>

          {/* Step 4 Tab: Quality & Conflict Scan */}
          <button
            type="button"
            onClick={() => {
              if (rfpPackage) {
                if (!qualityAuditReport && !auditMutation.isPending) {
                  auditMutation.mutate();
                } else {
                  setCurrentStep(4);
                }
              }
            }}
            disabled={!rfpPackage}
            className={`flex items-center gap-3.5 p-4 rounded-xl text-left border transition-all cursor-pointer ${
              currentStep === 4
                ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                currentStep === 4
                  ? 'bg-brand-600 text-white shadow-md'
                  : qualityAuditReport
                  ? qualityAuditReport.quality_score >= 80
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {auditMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              ) : qualityAuditReport ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                '4'
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Step 4</div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0" />
                Quality & Conflicts
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {qualityAuditReport
                  ? `${qualityAuditReport.quality_score}% Score · ${qualityAuditReport.flags.length} Flags`
                  : 'Scan & Finalize'}
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
                    3-Stage AI Scope Matching In Progress
                  </h4>
                  <div className="text-xs text-brand-900 space-y-1.5 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      <span>Stage 1: Generating 768-dim embeddings & pgvector search...</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                      <span>Stage 2: Gemini 3.7 Flash Thinking reasoning on operating conditions...</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Stage 3: Gemini 2.5 Pro RFP scope package synthesis...</span>
                    </div>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Step 3: Validation & Curation
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs font-semibold text-slate-600">{rfpPackage.facility_type}</span>
                  {rfpPackage.token_usage && rfpPackage.token_usage.totalTokens > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-600" />
                      LLM Matching Tokens: {rfpPackage.token_usage.totalTokens.toLocaleString()}
                    </span>
                  )}
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
                  disabled={auditMutation.isPending || totalSelectedCount === 0}
                  onClick={() => {
                    if (!qualityAuditReport) {
                      auditMutation.mutate();
                    } else {
                      setCurrentStep(4);
                    }
                  }}
                  className="py-2 px-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Run Step 4 Quality & Conflict Scan"
                >
                  {auditMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-purple-200" />
                  )}
                  {auditMutation.isPending
                    ? 'Scanning...'
                    : qualityAuditReport
                    ? 'Quality & Conflicts (Step 4) →'
                    : 'Step 4: Quality & Conflict Scan →'}
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

          {/* AI Requirement Matching Token Observability & LLM Consumption Widget */}
          {rfpPackage.token_usage && rfpPackage.token_usage.totalTokens > 0 && (
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-brand-400" />
                  <h3 className="font-bold text-sm text-slate-100">
                    AI Scope Matching Token Observability & LLM Consumption
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Total Process: <strong className="text-brand-300">{rfpPackage.token_usage.totalTokens.toLocaleString()}</strong> tokens
                  </span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    (In: {rfpPackage.token_usage.totalPromptTokens.toLocaleString()} · Out: {rfpPackage.token_usage.totalCandidateTokens.toLocaleString()}
                    {rfpPackage.token_usage.totalThoughtTokens ? ` · Thinking: ${rfpPackage.token_usage.totalThoughtTokens.toLocaleString()}` : ''})
                  </span>
                </div>
              </div>

              {/* 4 Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Stage 1: Vector Retrieval */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-blue-900/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-blue-400">Stage 1: Vector Retrieval</span>
                    <span className="font-mono font-bold text-blue-300">
                      {(rfpPackage.token_usage.stage1?.totalTokens ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Model: {rfpPackage.token_usage.stage1?.model || 'gemini-embedding-001'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Embeddings & pgvector retrieval
                  </div>
                </div>

                {/* Stage 2: AI Scope Alignment */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-purple-900/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-purple-400">Stage 2: AI Clause Reasoning</span>
                    <span className="font-mono font-bold text-purple-300">
                      {(rfpPackage.token_usage.stage2?.totalTokens ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Model: {rfpPackage.token_usage.stage2?.model || 'Gemini 3.7 Flash Thinking'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    In: {(rfpPackage.token_usage.stage2?.promptTokens ?? 0).toLocaleString()} · Out: {(rfpPackage.token_usage.stage2?.candidateTokens ?? 0).toLocaleString()}
                    {rfpPackage.token_usage.stage2?.thoughtTokens ? ` · Think: ${rfpPackage.token_usage.stage2.thoughtTokens.toLocaleString()}` : ''}
                  </div>
                </div>

                {/* Stage 3: Scope Synthesis */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-emerald-900/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-400">Stage 3: RFP Synthesis</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {(rfpPackage.token_usage.stage3?.totalTokens ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Model: {rfpPackage.token_usage.stage3?.model || 'Gemini 2.5 Pro'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    In: {(rfpPackage.token_usage.stage3?.promptTokens ?? 0).toLocaleString()} · Out: {(rfpPackage.token_usage.stage3?.candidateTokens ?? 0).toLocaleString()}
                  </div>
                </div>

                {/* Total Matching Usage */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-amber-900/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-amber-400">Total Matching Usage</span>
                    <span className="font-mono font-bold text-amber-300">
                      {rfpPackage.token_usage.totalTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Input: {rfpPackage.token_usage.totalPromptTokens.toLocaleString()} · Output: {rfpPackage.token_usage.totalCandidateTokens.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-amber-500/80 font-mono">
                    {rfpPackage.token_usage.totalThoughtTokens ? `Thinking Tokens: ${rfpPackage.token_usage.totalThoughtTokens.toLocaleString()}` : 'Standard Generation'}
                  </div>
                </div>
              </div>

              {/* Proportional Stage Consumption Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                    Stage 1 ({Math.round(((rfpPackage.token_usage.stage1?.totalTokens ?? 0) / rfpPackage.token_usage.totalTokens) * 100)}%)
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-500 ml-2"></span>
                    Stage 2 ({Math.round(((rfpPackage.token_usage.stage2?.totalTokens ?? 0) / rfpPackage.token_usage.totalTokens) * 100)}%)
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-2"></span>
                    Stage 3 ({Math.round(((rfpPackage.token_usage.stage3?.totalTokens ?? 0) / rfpPackage.token_usage.totalTokens) * 100)}%)
                  </span>
                  <span>100% Process Budget</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-blue-500 h-full transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, Math.round(((rfpPackage.token_usage.stage1?.totalTokens ?? 0) / rfpPackage.token_usage.totalTokens) * 100))
                      )}%`,
                    }}
                    title={`Stage 1: ${(rfpPackage.token_usage.stage1?.totalTokens ?? 0).toLocaleString()} tokens`}
                  />
                  <div
                    className="bg-purple-500 h-full transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, Math.round(((rfpPackage.token_usage.stage2?.totalTokens ?? 0) / rfpPackage.token_usage.totalTokens) * 100))
                      )}%`,
                    }}
                    title={`Stage 2: ${(rfpPackage.token_usage.stage2?.totalTokens ?? 0).toLocaleString()} tokens`}
                  />
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, Math.round(((rfpPackage.token_usage.stage3?.totalTokens ?? 0) / rfpPackage.token_usage.totalTokens) * 100))
                      )}%`,
                    }}
                    title={`Stage 3: ${(rfpPackage.token_usage.stage3?.totalTokens ?? 0).toLocaleString()} tokens`}
                  />
                </div>
              </div>
            </div>
          )}

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

          {/* Bottom Step 4 Callout in Step 3 */}
          <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white p-6 md:p-8 rounded-2xl border border-purple-800/80 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/80 border border-purple-700/60 text-purple-200 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Step 4 Recommendation
              </div>
              <h4 className="font-extrabold text-lg text-slate-100 flex items-center justify-center md:justify-start gap-2">
                <ShieldAlert className="w-5 h-5 text-purple-400 shrink-0" />
                Scan Selected Requirements for Conflicts & Ambiguities
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                The AI Quality Scanner uses <strong>Gemini 3.7 Flash with Thinking Mode</strong> to cross-reference your {totalSelectedCount} active clauses across disciplines (Mechanical, Piping, Electrical, I&C, HSE, Process), detecting hidden engineering contradictions, vague acceptance criteria, and duplicate specifications.
              </p>
            </div>
            <button
              type="button"
              disabled={auditMutation.isPending || totalSelectedCount === 0}
              onClick={() => {
                if (!qualityAuditReport) {
                  auditMutation.mutate();
                } else {
                  setCurrentStep(4);
                }
              }}
              className="py-3.5 px-6 bg-white hover:bg-purple-50 text-purple-950 font-extrabold text-xs rounded-xl shadow-2xl transition-all flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 hover:scale-[1.02]"
            >
              {auditMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-purple-600" />
              )}
              {auditMutation.isPending
                ? 'Running Multi-Discipline Scan...'
                : qualityAuditReport
                ? `View Step 4 Quality Report (${qualityAuditReport.flags.length} Flags) →`
                : `Scan ${totalSelectedCount} Clauses in Step 4 →`}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: SCOPE QUALITY, AMBIGUITY & CROSS-DISCIPLINE CONFLICT SCAN       */}
      {/* ========================================================================= */}
      {currentStep === 4 && rfpPackage && (() => {
        const allItems = [
          ...rfpPackage.mandatory_requirements,
          ...rfpPackage.recommendations,
          ...rfpPackage.guidelines,
        ];
        const activeItems = allItems.filter((i) => selectedItems[i.scoping_item_id]);

        // Map flags by scoping_item_id
        const flagsMap = new Map<string, RequirementQualityFlag[]>();
        if (qualityAuditReport) {
          for (const f of qualityAuditReport.flags) {
            const existing = flagsMap.get(f.scoping_item_id) || [];
            existing.push(f);
            flagsMap.set(f.scoping_item_id, existing);
          }
        }

        const conflictItems = activeItems.filter((i) =>
          flagsMap.get(i.scoping_item_id)?.some((f) => f.issue_type === 'CrossDisciplineConflict')
        );
        const ambiguityItems = activeItems.filter((i) =>
          flagsMap.get(i.scoping_item_id)?.some((f) => f.issue_type === 'Ambiguity')
        );
        const duplicateItems = activeItems.filter((i) =>
          flagsMap.get(i.scoping_item_id)?.some((f) => f.issue_type === 'Duplication')
        );
        const cleanItems = activeItems.filter(
          (i) => !flagsMap.has(i.scoping_item_id) || flagsMap.get(i.scoping_item_id)?.length === 0
        );

        const filteredList =
          auditFilterTab === 'conflicts'
            ? conflictItems
            : auditFilterTab === 'ambiguities'
            ? ambiguityItems
            : auditFilterTab === 'duplicates'
            ? duplicateItems
            : auditFilterTab === 'clean'
            ? cleanItems
            : activeItems;

        const score = qualityAuditReport?.quality_score ?? 100;
        const scoreBg =
          score >= 85
            ? 'bg-emerald-500'
            : score >= 70
            ? 'bg-amber-500'
            : 'bg-rose-500';

        const toggleFlagExpanded = (flagId: string) => {
          setExpandedFlagIds((prev) => ({ ...prev, [flagId]: !prev[flagId] }));
        };

        return (
          <div className="space-y-6">
            {/* Top Quality Audit Bar */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-purple-600" />
                      Step 4: Quality & Conflict Audit
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-semibold text-slate-600">{rfpPackage.facility_type}</span>
                    {qualityAuditReport?.scanned_at && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200">
                        Scanned: {new Date(qualityAuditReport.scanned_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1 flex items-center gap-2">
                    {rfpPackage.project_name}
                  </h2>
                </div>

                {/* Top Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Step 3: Curate
                  </button>

                  <button
                    type="button"
                    disabled={auditMutation.isPending || activeItems.length === 0}
                    onClick={() => auditMutation.mutate()}
                    className="py-2 px-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {auditMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {auditMutation.isPending ? 'Scanning...' : 'Re-Scan Clauses'}
                  </button>

                  <button
                    type="button"
                    onClick={handleExportMarkdown}
                    className="py-2 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Validated Markdown
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="py-2 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export CSV Matrix
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
                    {saveRFPMutation.isPending ? 'Saving...' : 'Save Audited Package'}
                  </button>
                </div>
              </div>

              {/* Health Scorecard & Metrics Row */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                {/* Score Gauge Card */}
                <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 text-white p-5 rounded-2xl border border-slate-800 flex items-center gap-4 shadow-sm">
                  <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-800"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className={score >= 85 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-rose-500'}
                        strokeDasharray={`${score}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-xl font-black">{score}</span>
                      <span className="text-[10px] text-slate-400 block -mt-1">%</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                      RFP Scope Health Score
                    </div>
                    <div className="text-sm font-extrabold text-slate-100">
                      {score >= 85
                        ? '🟢 Ready for Vendor Tender'
                        : score >= 70
                        ? '🟡 Minor Gaps / Ambiguities'
                        : '🔴 Critical Conflicts Identified'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {activeItems.length} active clauses scanned
                    </div>
                  </div>
                </div>

                {/* 3 Metric Cards */}
                <div
                  onClick={() => setAuditFilterTab('conflicts')}
                  className={`p-4 rounded-xl border text-center cursor-pointer transition-all ${
                    auditFilterTab === 'conflicts'
                      ? 'bg-rose-100/70 border-rose-400 ring-2 ring-rose-400/20'
                      : 'bg-rose-50/50 border-rose-200 hover:bg-rose-100/50'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Conflicts
                  </span>
                  <p className="text-2xl font-black text-rose-800 mt-0.5">{qualityAuditReport?.conflict_count ?? 0}</p>
                  <span className="text-[10px] text-rose-600/80">Cross-Discipline</span>
                </div>

                <div
                  onClick={() => setAuditFilterTab('ambiguities')}
                  className={`p-4 rounded-xl border text-center cursor-pointer transition-all ${
                    auditFilterTab === 'ambiguities'
                      ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/20'
                      : 'bg-amber-50/50 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Ambiguities
                  </span>
                  <p className="text-2xl font-black text-amber-800 mt-0.5">{qualityAuditReport?.ambiguity_count ?? 0}</p>
                  <span className="text-[10px] text-amber-600/80">Subjective Phrasing</span>
                </div>

                <div
                  onClick={() => setAuditFilterTab('duplicates')}
                  className={`p-4 rounded-xl border text-center cursor-pointer transition-all ${
                    auditFilterTab === 'duplicates'
                      ? 'bg-blue-100/70 border-blue-400 ring-2 ring-blue-400/20'
                      : 'bg-blue-50/50 border-blue-200 hover:bg-blue-100/50'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center justify-center gap-1">
                    <Copy className="w-3 h-3" />
                    Duplicates
                  </span>
                  <p className="text-2xl font-black text-blue-800 mt-0.5">{qualityAuditReport?.duplication_count ?? 0}</p>
                  <span className="text-[10px] text-blue-600/80">Redundancies</span>
                </div>
              </div>
            </div>

            {/* AI Model Recommendation & Observability Box */}
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold text-sm text-slate-100">
                    Gemini AI Model Selection & Conflict Reasoning Architecture
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="px-2.5 py-0.5 rounded bg-slate-800 text-purple-300 border border-purple-800/60 font-bold">
                    Active: {selectedAuditModel}
                  </span>
                  {qualityAuditReport?.token_usage && qualityAuditReport.token_usage.totalTokens > 0 && (
                    <span className="text-[11px] text-slate-400 font-sans">
                      ({qualityAuditReport.token_usage.totalTokens.toLocaleString()} tokens used)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Model 1: Gemini 3.7 Flash Thinking (Recommended) */}
                <div
                  onClick={() => setSelectedAuditModel('gemini-3.7-flash')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    selectedAuditModel === 'gemini-3.7-flash'
                      ? 'bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-slate-950/40 border-slate-800 hover:bg-slate-950/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Gemini 3.7 Flash Thinking
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Uses extended chain-of-thought reasoning to systematically cross-reference engineering parameters (pressures, temperatures, metallurgy, area classifications) across disparate disciplines.
                  </p>
                </div>

                {/* Model 2: Gemini 2.5 Pro */}
                <div
                  onClick={() => setSelectedAuditModel('gemini-2.5-pro')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    selectedAuditModel === 'gemini-2.5-pro'
                      ? 'bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-slate-950/40 border-slate-800 hover:bg-slate-950/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-300">
                      Gemini 2.5 Pro
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-400/20 text-blue-300 border border-blue-400/30">
                      Deep Synthesis
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    High-capacity reasoning model ideal for complex multi-hundred clause mega-projects requiring exhaustive multi-turn cross-document harmonization.
                  </p>
                </div>

                {/* Model 3: Gemini 3.5 Flash Lite */}
                <div
                  onClick={() => setSelectedAuditModel('gemini-3.5-flash-lite')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    selectedAuditModel === 'gemini-3.5-flash-lite'
                      ? 'bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-slate-950/40 border-slate-800 hover:bg-slate-950/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-300">
                      Gemini 3.5 Flash Lite
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                      Fast Clustering
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Ultra-fast, lowest-cost model designed for high-throughput semantic duplicate detection and lexical overlap screening.
                  </p>
                </div>
              </div>
            </div>

            {/* RFP Package Manager Executive Decision Guidance Card */}
            {qualityAuditReport && (
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-8 rounded-2xl border border-indigo-800/80 shadow-lg space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-indigo-800/60 pb-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Executive Scope Audit Findings
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-100">
                      RFP Package Manager Decision Guidance & Harmonization
                    </h3>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 shrink-0">
                    Audit ID: {qualityAuditReport.audit_id.slice(0, 8)}
                  </span>
                </div>

                {/* Summary Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Executive Findings */}
                  <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-indigo-900/50">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-indigo-400" />
                      Executive Scope Summary
                    </h4>
                    <p className="text-xs text-slate-200 leading-relaxed font-normal">
                      {qualityAuditReport.executive_summary}
                    </p>
                  </div>

                  {/* Decision Guidance */}
                  <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-indigo-900/50">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4 text-amber-400" />
                      Manager Action Plan
                    </h4>
                    <p className="text-xs text-slate-200 leading-relaxed font-normal">
                      {qualityAuditReport.manager_guidance}
                    </p>
                  </div>
                </div>

                {/* Specific Category Summaries */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-indigo-800/60 text-xs">
                  {/* Conflicts list */}
                  <div className="space-y-2">
                    <span className="font-bold text-rose-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Cross-Discipline Conflicts ({qualityAuditReport.category_summaries.cross_discipline_conflicts.length})
                    </span>
                    {qualityAuditReport.category_summaries.cross_discipline_conflicts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">No engineering contradictions detected.</p>
                    ) : (
                      <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside">
                        {qualityAuditReport.category_summaries.cross_discipline_conflicts.map((c, i) => (
                          <li key={i} className="leading-snug">{c}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Ambiguities list */}
                  <div className="space-y-2">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Ambiguous Wording ({qualityAuditReport.category_summaries.ambiguities.length})
                    </span>
                    {qualityAuditReport.category_summaries.ambiguities.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">No subjective or vague wording detected.</p>
                    ) : (
                      <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside">
                        {qualityAuditReport.category_summaries.ambiguities.map((a, i) => (
                          <li key={i} className="leading-snug">{a}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Duplications list */}
                  <div className="space-y-2">
                    <span className="font-bold text-blue-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Redundancies & Overlaps ({qualityAuditReport.category_summaries.duplications.length})
                    </span>
                    {qualityAuditReport.category_summaries.duplications.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">No redundant clauses found.</p>
                    ) : (
                      <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside">
                        {qualityAuditReport.category_summaries.duplications.map((d, i) => (
                          <li key={i} className="leading-snug">{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Filterable Clause Audit Matrix */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              {/* Filter Tabs Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <Filter className="w-4 h-4 text-purple-600" />
                    Clause Quality Matrix & Highlight Flags
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review and resolve highlighted issues directly. Toggle checkboxes to include or exclude clauses from the final RFP package.
                  </p>
                </div>

                {/* Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      auditFilterTab === 'all'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Active ({activeItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('conflicts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      auditFilterTab === 'conflicts'
                        ? 'bg-rose-700 text-white shadow-sm'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Conflicts ({conflictItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('ambiguities')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      auditFilterTab === 'ambiguities'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
                    }`}
                  >
                    <AlertCircle className="w-3 h-3" />
                    Ambiguities ({ambiguityItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('duplicates')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      auditFilterTab === 'duplicates'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60'
                    }`}
                  >
                    <Copy className="w-3 h-3" />
                    Duplicates ({duplicateItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilterTab('clean')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      auditFilterTab === 'clean'
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Clean ({cleanItems.length})
                  </button>
                </div>
              </div>

              {/* Filtered Clause Cards List */}
              {filteredList.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No requirement clauses match the selected filter tab.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredList.map((item) => {
                    const isSelected = selectedItems[item.scoping_item_id] ?? true;
                    const flags = flagsMap.get(item.scoping_item_id) || [];
                    const hasConflict = flags.some((f) => f.issue_type === 'CrossDisciplineConflict');
                    const hasAmbiguity = flags.some((f) => f.issue_type === 'Ambiguity');
                    const hasDuplication = flags.some((f) => f.issue_type === 'Duplication');

                    const borderStyle = hasConflict
                      ? 'border-rose-300 bg-rose-50/20 hover:border-rose-400'
                      : hasAmbiguity
                      ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400'
                      : hasDuplication
                      ? 'border-blue-300 bg-blue-50/20 hover:border-blue-400'
                      : 'border-slate-200 bg-white hover:border-slate-300';

                    return (
                      <div
                        key={item.scoping_item_id}
                        className={`p-4 rounded-xl border text-xs transition-all space-y-3 ${borderStyle} ${
                          !isSelected ? 'opacity-50 bg-slate-100/50' : 'shadow-sm'
                        }`}
                      >
                        {/* Card Header & Controls */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            {/* Toggle selection */}
                            <button
                              type="button"
                              onClick={() => toggleItem(item.scoping_item_id)}
                              className="text-slate-700 hover:scale-110 transition-transform cursor-pointer"
                              title={isSelected ? 'Included in final RFP (click to exclude)' : 'Excluded from RFP (click to include)'}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>

                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {item.requirement_code || 'REQ'}
                            </span>

                            <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                              {item.engineering_discipline}
                            </span>

                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.compliance_level === 'Mandatory'
                                ? 'bg-rose-100 text-rose-800'
                                : item.compliance_level === 'Recommended'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {item.compliance_level}
                            </span>

                            {/* Highlight Flag Badges */}
                            {hasConflict && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white flex items-center gap-1 shadow-xs">
                                <AlertTriangle className="w-3 h-3" />
                                Conflict
                              </span>
                            )}
                            {hasAmbiguity && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white flex items-center gap-1 shadow-xs">
                                <AlertCircle className="w-3 h-3" />
                                Ambiguity
                              </span>
                            )}
                            {hasDuplication && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white flex items-center gap-1 shadow-xs">
                                <Copy className="w-3 h-3" />
                                Duplicate
                              </span>
                            )}
                            {!hasConflict && !hasAmbiguity && !hasDuplication && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <CheckCheck className="w-3 h-3 text-emerald-600" />
                                Verified Clean
                              </span>
                            )}
                          </div>

                          {/* Match Score & Delete */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-500">
                              Match: {(item.relevance_score * 100).toFixed(0)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeleteItemTarget(item)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-100 transition-colors cursor-pointer"
                              title="Delete requirement & log reason to Lessons Learned"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Requirement Statement */}
                        <p className="font-normal text-slate-800 leading-relaxed pl-6">
                          {item.requirement_text}
                        </p>

                        {/* Expanded Issue Drawers */}
                        {flags.length > 0 && (
                          <div className="pl-6 space-y-2 pt-1">
                            {flags.map((flag) => {
                              const isExpanded = expandedFlagIds[flag.flag_id] ?? true;
                              const flagColor =
                                flag.issue_type === 'CrossDisciplineConflict'
                                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                                  : flag.issue_type === 'Ambiguity'
                                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                                  : 'bg-blue-50 border-blue-200 text-blue-950';

                              return (
                                <div
                                  key={flag.flag_id}
                                  className={`p-3 rounded-xl border text-xs space-y-2 transition-all ${flagColor}`}
                                >
                                  <div
                                    onClick={() => toggleFlagExpanded(flag.flag_id)}
                                    className="flex items-center justify-between cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 font-bold">
                                      {flag.issue_type === 'CrossDisciplineConflict' ? (
                                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                      ) : flag.issue_type === 'Ambiguity' ? (
                                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                      ) : (
                                        <Copy className="w-4 h-4 text-blue-600 shrink-0" />
                                      )}
                                      <span>{flag.title}</span>
                                      <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono font-bold bg-white/70 border border-current/20">
                                        {flag.severity}
                                      </span>
                                    </div>
                                    <button type="button" className="p-0.5 text-current opacity-70 hover:opacity-100">
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>

                                  {isExpanded && (
                                    <div className="space-y-2 pt-1 border-t border-current/15 text-[11px]">
                                      <p className="leading-relaxed opacity-90">{flag.description}</p>
                                      {flag.conflicting_requirement_codes.length > 0 && (
                                        <div className="flex items-center gap-1.5 font-mono">
                                          <span className="font-bold">Conflicting Clauses:</span>
                                          <span className="px-1.5 py-0.5 rounded bg-white/80 border border-current/20 font-bold">
                                            {flag.conflicting_requirement_codes.join(', ')}
                                          </span>
                                        </div>
                                      )}
                                      <div className="p-2 rounded-lg bg-white/60 border border-current/20 space-y-1">
                                        <span className="font-bold uppercase tracking-wider text-[10px] block opacity-80">
                                          💡 Suggested Resolution for RFP Manager:
                                        </span>
                                        <p className="font-medium leading-relaxed">{flag.suggested_action}</p>
                                      </div>

                                      {/* Quick action buttons */}
                                      <div className="flex items-center gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => toggleItem(item.scoping_item_id)}
                                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                                            isSelected
                                              ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300'
                                              : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                                          }`}
                                        >
                                          {isSelected ? 'Exclude from RFP Package' : 'Re-Include in RFP Package'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDeleteItemTarget(item);
                                            setDeleteReason(`Audit Flag [${flag.issue_type}]: ${flag.title}`);
                                          }}
                                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/80 hover:bg-white text-slate-700 border border-slate-300 cursor-pointer"
                                        >
                                          Remove & Log to Lessons Learned
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Finalize CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="space-y-0.5 text-center sm:text-left">
                <h4 className="font-extrabold text-sm text-slate-900">
                  Scope Quality Audit Complete
                </h4>
                <p className="text-xs text-slate-500">
                  {totalSelectedCount} validated clauses selected for the final tender package.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Markdown RFP
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export CSV Matrix
                </button>
                <button
                  type="button"
                  disabled={saveRFPMutation.isPending}
                  onClick={() => saveRFPMutation.mutate(rfpPackage)}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {saveRFPMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                  {saveRFPMutation.isPending ? 'Saving...' : 'Save Audited Scope Package'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}


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
