import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Filter,
  Layers,
  CheckCircle2,
  Clock,
  Edit3,
  XCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Eye,
  X,
  ExternalLink,
  Tag,
  Hash,
  Calendar,
  User,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  Copy,
  Check,
  Building2,
  ArrowUpDown,
  BookOpen,
} from 'lucide-react';
import { fetchDocuments, fetchDocumentRequirements, fetchDocumentDetails } from '../api/client.js';
import { DocumentSummaryItem, ExtractionRecord, EngineeringDisciplineValues } from '@shared/schemas';

export default function DocumentSearch() {
  // Filters and search state for Documents master table
  const [keyword, setKeyword] = useState('');
  const [documentType, setDocumentType] = useState('All');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selected document state
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Sub-table filters for extracted requirements
  const [reqStatusFilter, setReqStatusFilter] = useState('All');
  const [reqDisciplineFilter, setReqDisciplineFilter] = useState('All');
  const [reqKeyword, setReqKeyword] = useState('');

  // Raw Document View modal
  const [viewingRawDocId, setViewingRawDocId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Fetch paginated documents
  const {
    data: documentsData,
    isLoading: isDocsLoading,
    isRefetching: isDocsRefetching,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['documentsList', { keyword, documentType, page, pageSize, sortBy, sortOrder }],
    queryFn: () =>
      fetchDocuments({
        keyword: keyword.trim() || undefined,
        documentType: documentType === 'All' ? undefined : documentType,
        page,
        pageSize,
        sortBy,
        sortOrder,
      }),
  });

  // Fetch requirements for selected document
  const {
    data: reqsData,
    isLoading: isReqsLoading,
    refetch: refetchReqs,
  } = useQuery({
    queryKey: ['documentRequirements', selectedDocId, { reqStatusFilter, reqDisciplineFilter, reqKeyword }],
    queryFn: () =>
      selectedDocId
        ? fetchDocumentRequirements(selectedDocId, {
            status: reqStatusFilter === 'All' ? undefined : reqStatusFilter,
            discipline: reqDisciplineFilter === 'All' ? undefined : reqDisciplineFilter,
            keyword: reqKeyword.trim() || undefined,
          })
        : Promise.resolve(null),
    enabled: !!selectedDocId,
  });

  // Fetch single document details for raw viewer modal
  const { data: rawDocData, isLoading: isRawDocLoading } = useQuery({
    queryKey: ['documentRaw', viewingRawDocId],
    queryFn: () => (viewingRawDocId ? fetchDocumentDetails(viewingRawDocId) : Promise.resolve(null)),
    enabled: !!viewingRawDocId,
  });

  const documents = documentsData?.items || [];
  const totalDocs = documentsData?.total || 0;
  const totalPages = documentsData?.totalPages || 1;

  // Selected document object
  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) || reqsData?.document,
    [documents, selectedDocId, reqsData]
  );

  const handleSelectDocument = (docId: string) => {
    if (selectedDocId === docId) {
      setSelectedDocId(null);
    } else {
      setSelectedDocId(docId);
      setReqStatusFilter('All');
      setReqDisciplineFilter('All');
      setReqKeyword('');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSortChange = (newSortBy: string) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60 shadow-sm">
              <BookOpen className="w-6 h-6" />
            </span>
            Document Search & Specifications Registry
          </h1>
          <p className="text-slate-600 mt-1.5 text-sm">
            Search, filter, and inspect loaded engineering specifications, standards, and their extracted requirement states.
          </p>
        </div>

        <button
          onClick={() => {
            refetchDocs();
            if (selectedDocId) refetchReqs();
          }}
          disabled={isDocsLoading || isDocsRefetching}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isDocsRefetching ? 'animate-spin text-brand-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Keyword Search */}
          <div className="md:col-span-6 relative">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Search Documents
            </label>
            <div className="relative">
              <input
                type="text"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by Document Number, Title, Type, or SME Owner..."
                className="w-full rounded-lg border border-slate-300 p-2.5 pl-10 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-slate-50/50"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              {keyword && (
                <button
                  onClick={() => {
                    setKeyword('');
                    setPage(1);
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Document Type Filter */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Document Type
            </label>
            <select
              value={documentType}
              onChange={(e) => {
                setDocumentType(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-white focus:ring-1 focus:ring-brand-500"
            >
              <option value="All">All Types</option>
              <option value="Standard">Standard</option>
              <option value="Specification">Specification</option>
              <option value="Guideline">Guideline</option>
              <option value="Datasheet">Datasheet</option>
              <option value="Procedure">Procedure</option>
            </select>
          </div>

          {/* Page Size */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Rows Per Page
            </label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-white focus:ring-1 focus:ring-brand-500"
            >
              <option value="5">5 per page</option>
              <option value="10">10 per page</option>
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
        </div>

        {/* Active Filter Indicators */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Showing:</span>
            <span className="font-semibold text-slate-800">
              {totalDocs === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalDocs)} of {totalDocs} documents
            </span>
            {(keyword || documentType !== 'All') && (
              <button
                onClick={() => {
                  setKeyword('');
                  setDocumentType('All');
                  setPage(1);
                }}
                className="text-brand-600 hover:text-brand-800 font-medium ml-2 underline underline-offset-2"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400">Sort by:</span>
            <button
              onClick={() => handleSortChange('documentNumber')}
              className={`hover:text-brand-600 font-medium inline-flex items-center gap-1 ${
                sortBy === 'documentNumber' ? 'text-brand-600 font-bold' : ''
              }`}
            >
              Doc Number {sortBy === 'documentNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSortChange('filename')}
              className={`hover:text-brand-600 font-medium inline-flex items-center gap-1 ${
                sortBy === 'filename' ? 'text-brand-600 font-bold' : ''
              }`}
            >
              Title {sortBy === 'filename' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSortChange('requirementCount')}
              className={`hover:text-brand-600 font-medium inline-flex items-center gap-1 ${
                sortBy === 'requirementCount' ? 'text-brand-600 font-bold' : ''
              }`}
            >
              Items Count {sortBy === 'requirementCount' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Documents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 uppercase font-semibold text-xs tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center"></th>
                <th
                  onClick={() => handleSortChange('documentNumber')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Document Number</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange('filename')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Document Title</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange('version')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Revision / Version</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange('documentDate')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Revision Date</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange('requirementCount')}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-200/70 transition-colors text-right whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Number of items</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 w-24 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isDocsLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-7 h-7 text-brand-600 animate-spin" />
                      <p className="text-sm font-medium">Loading loaded engineering documents...</p>
                    </div>
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-10 h-10 text-slate-300" />
                      <p className="text-base font-semibold text-slate-700">No documents found</p>
                      <p className="text-xs text-slate-500 max-w-md">
                        {keyword || documentType !== 'All'
                          ? 'Try adjusting your search criteria or clearing filters.'
                          : 'No specifications or standards have been ingested into the repository yet.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const isSelected = selectedDocId === doc.id;
                  return (
                    <React.Fragment key={doc.id}>
                      <tr
                        onClick={() => handleSelectDocument(doc.id)}
                        className={`group cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-brand-50/80 border-l-4 border-l-brand-600'
                            : 'hover:bg-slate-50/90'
                        }`}
                      >
                        {/* Expand/Collapse Chevron */}
                        <td className="py-4 px-3 text-center">
                          <button
                            type="button"
                            aria-label={isSelected ? 'Collapse requirements' : 'Expand requirements'}
                            className={`p-1 rounded-md text-slate-400 group-hover:text-brand-600 transition-transform ${
                              isSelected ? 'text-brand-600 bg-brand-100/60' : ''
                            }`}
                          >
                            {isSelected ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Column 1: Document Number */}
                        <td className="py-4 px-4 font-mono font-medium text-slate-900">
                          {doc.document_number ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-300/80 text-xs font-semibold">
                              <Hash className="w-3 h-3 text-slate-500" />
                              {doc.document_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Unassigned</span>
                          )}
                        </td>

                        {/* Column 2: Document Title */}
                        <td className="py-4 px-4">
                          <div className="font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">
                            {doc.filename}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {doc.document_type}
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              {doc.owner_sme}
                            </span>
                          </div>
                        </td>

                        {/* Column 3: Revision/Version */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Rev {doc.version || '1.0'}
                          </span>
                        </td>

                        {/* Column 4: Revision Date */}
                        <td className="py-4 px-4 whitespace-nowrap text-xs text-slate-600">
                          {doc.document_date ? (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{doc.document_date}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">N/A</span>
                          )}
                        </td>

                        {/* Column 5: Number of items */}
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-brand-100 text-brand-800 border border-brand-200">
                              <Layers className="w-3 h-3" />
                              {doc.requirement_count} {doc.requirement_count === 1 ? 'item' : 'items'}
                            </span>
                            {/* Breakdown mini pills */}
                            {doc.requirement_count > 0 && (
                              <div className="flex items-center gap-1 mt-1 text-[10px]">
                                {doc.status_breakdown.approved > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium" title="Approved">
                                    {doc.status_breakdown.approved} app
                                  </span>
                                )}
                                {doc.status_breakdown.pending > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium" title="Pending Review">
                                    {doc.status_breakdown.pending} pend
                                  </span>
                                )}
                                {doc.status_breakdown.edited > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium" title="Edited">
                                    {doc.status_breakdown.edited} ed
                                  </span>
                                )}
                                {doc.status_breakdown.rejected > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium" title="Rejected">
                                    {doc.status_breakdown.rejected} rej
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Action Column */}
                        <td className="py-4 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setViewingRawDocId(doc.id)}
                            title="View Raw Document Content"
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>

                      {/* Sub-table: Extracted Requirements & Their State */}
                      {isSelected && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={7} className="p-0 border-y border-brand-200">
                            <div className="p-6 space-y-4 bg-gradient-to-b from-brand-50/40 via-slate-50 to-slate-50">
                              {/* Sub-Table Header & Quick Filters */}
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-200">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                      <FileCheck2 className="w-5 h-5 text-brand-600" />
                                      Extracted Requirements & Specification Clauses
                                    </h3>
                                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-200 text-slate-700">
                                      {reqsData?.requirements.length ?? 0} loaded
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Showing requirements extracted from <span className="font-semibold text-slate-700">{doc.filename}</span> ({doc.document_number || 'No Doc Number'})
                                  </p>
                                </div>

                                {/* Quick filter controls */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Sub Search */}
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={reqKeyword}
                                      onChange={(e) => setReqKeyword(e.target.value)}
                                      placeholder="Filter requirements..."
                                      className="rounded-lg border border-slate-300 py-1 px-2.5 pl-8 text-xs bg-white focus:ring-1 focus:ring-brand-500 w-48"
                                    />
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                                  </div>

                                  {/* Status Filter */}
                                  <select
                                    value={reqStatusFilter}
                                    onChange={(e) => setReqStatusFilter(e.target.value)}
                                    className="rounded-lg border border-slate-300 py-1 px-2 text-xs bg-white focus:ring-1 focus:ring-brand-500"
                                  >
                                    <option value="All">All States</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Pending Review">Pending Review</option>
                                    <option value="Edited">Edited</option>
                                    <option value="Rejected">Rejected</option>
                                  </select>

                                  {/* Discipline Filter */}
                                  <select
                                    value={reqDisciplineFilter}
                                    onChange={(e) => setReqDisciplineFilter(e.target.value)}
                                    className="rounded-lg border border-slate-300 py-1 px-2 text-xs bg-white focus:ring-1 focus:ring-brand-500"
                                  >
                                    <option value="All">All Disciplines</option>
                                    {EngineeringDisciplineValues.map((d) => (
                                      <option key={d} value={d}>
                                        {d}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    onClick={() => setViewingRawDocId(doc.id)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"
                                  >
                                    <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                                    View Full Document
                                  </button>
                                </div>
                              </div>

                              {/* Requirements Sub-Table List */}
                              {isReqsLoading ? (
                                <div className="py-10 text-center text-slate-500">
                                  <RefreshCw className="w-6 h-6 text-brand-600 animate-spin mx-auto mb-2" />
                                  <p className="text-xs">Loading extracted requirements...</p>
                                </div>
                              ) : !reqsData || reqsData.requirements.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 bg-white rounded-lg border border-dashed border-slate-200">
                                  <p className="text-sm font-semibold text-slate-700">No matching requirements found</p>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {doc.requirement_count === 0
                                      ? 'No requirements were extracted from this document.'
                                      : 'No items match the current sub-filter settings.'}
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200">
                                        <tr>
                                          <th className="py-2.5 px-3 w-36">Req Code</th>
                                          <th className="py-2.5 px-3 w-40">Discipline & Type</th>
                                          <th className="py-2.5 px-3">Requirement Text</th>
                                          <th className="py-2.5 px-3 w-32">Section / Category</th>
                                          <th className="py-2.5 px-3 w-32 text-center">State</th>
                                          <th className="py-2.5 px-3 w-28 text-right">Confidence</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {reqsData.requirements.map((req) => {
                                          const statusBadge = getStatusBadge(req.status);
                                          const disciplineBadge = getDisciplineBadge(req.engineering_discipline);
                                          return (
                                            <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                                              {/* Req Code */}
                                              <td className="py-3 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                  <span>{req.requirement_code || 'REQ-UNASSIGNED'}</span>
                                                  {req.requirement_code && (
                                                    <button
                                                      onClick={() => handleCopy(req.requirement_code!)}
                                                      title="Copy code"
                                                      className="text-slate-400 hover:text-slate-600"
                                                    >
                                                      {copiedCode === req.requirement_code ? (
                                                        <Check className="w-3 h-3 text-emerald-600" />
                                                      ) : (
                                                        <Copy className="w-3 h-3" />
                                                      )}
                                                    </button>
                                                  )}
                                                </div>
                                              </td>

                                              {/* Discipline & Compliance */}
                                              <td className="py-3 px-3 whitespace-nowrap">
                                                <div className="flex flex-col gap-1 items-start">
                                                  <span className={`px-2 py-0.5 rounded font-medium text-[11px] ${disciplineBadge}`}>
                                                    {req.engineering_discipline}
                                                  </span>
                                                  <span className="text-[10px] text-slate-500 font-medium">
                                                    {req.compliance_level} • {req.item_type}
                                                  </span>
                                                </div>
                                              </td>

                                              {/* Requirement Text */}
                                              <td className="py-3 px-3">
                                                <p className="text-slate-800 font-normal text-xs leading-relaxed">
                                                  {req.requirement_text}
                                                </p>
                                                {req.sme_comments && (
                                                  <div className="mt-1.5 p-1.5 bg-amber-50/80 rounded border border-amber-200/60 text-[11px] text-amber-800">
                                                    <span className="font-semibold">SME Comment:</span> {req.sme_comments}
                                                  </div>
                                                )}
                                              </td>

                                              {/* Section / Category */}
                                              <td className="py-3 px-3 text-slate-600">
                                                <div className="font-medium text-slate-700 truncate max-w-[140px]" title={req.section_title || 'General'}>
                                                  {req.section_title || 'General'}
                                                </div>
                                                {req.category && (
                                                  <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={req.category}>
                                                    {req.category}
                                                  </div>
                                                )}
                                              </td>

                                              {/* State / Status */}
                                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge.classes}`}>
                                                  {statusBadge.icon}
                                                  {req.status}
                                                </span>
                                              </td>

                                              {/* Confidence */}
                                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                                <span
                                                  className={`font-semibold ${
                                                    (req.confidence_score ?? 1) >= 0.85
                                                      ? 'text-emerald-700'
                                                      : (req.confidence_score ?? 1) >= 0.7
                                                      ? 'text-amber-700'
                                                      : 'text-rose-700'
                                                  }`}
                                                >
                                                  {Math.round((req.confidence_score ?? 1) * 100)}%
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <span className="font-bold text-slate-900">{totalDocs === 0 ? 0 : (page - 1) * pageSize + 1}</span> to{' '}
            <span className="font-bold text-slate-900">{Math.min(page * pageSize, totalDocs)}</span> of{' '}
            <span className="font-bold text-slate-900">{totalDocs}</span> documents
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1 || isDocsLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 7 && page > 4) {
                  pageNum = page - 3 + i;
                  if (pageNum > totalPages) pageNum = totalPages - (6 - i);
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                      page === pageNum
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || isDocsLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Raw Document Inspection Modal */}
      {viewingRawDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-100 text-brand-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {rawDocData?.filename || 'Document Content'}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    <span>Doc #: <strong className="text-slate-700">{rawDocData?.documentNumber || 'Unassigned'}</strong></span>
                    <span>•</span>
                    <span>Version: <strong className="text-slate-700">{rawDocData?.version || '1.0'}</strong></span>
                    <span>•</span>
                    <span>Date: <strong className="text-slate-700">{rawDocData?.documentDate || 'N/A'}</strong></span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setViewingRawDocId(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex-1 overflow-y-auto font-mono text-xs bg-slate-950 text-slate-200 custom-scrollbar leading-relaxed whitespace-pre-wrap selection:bg-brand-500 selection:text-white">
              {isRawDocLoading ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
                  <span>Loading raw specification contents...</span>
                </div>
              ) : rawDocData?.rawContent ? (
                rawDocData.rawContent
              ) : (
                <span className="text-slate-500 italic">No raw content available for this document.</span>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Owner SME: <strong className="text-slate-700">{rawDocData?.ownerSme || 'Engineering Lead'}</strong></span>
              <button
                onClick={() => setViewingRawDocId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers for badges
function getStatusBadge(status?: string) {
  switch (status) {
    case 'Approved':
      return {
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />,
      };
    case 'Pending Review':
      return {
        classes: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: <Clock className="w-3 h-3 text-amber-600" />,
      };
    case 'Edited':
      return {
        classes: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: <Edit3 className="w-3 h-3 text-purple-600" />,
      };
    case 'Rejected':
      return {
        classes: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <XCircle className="w-3 h-3 text-rose-600" />,
      };
    default:
      return {
        classes: 'bg-slate-100 text-slate-700 border-slate-200',
        icon: <Clock className="w-3 h-3 text-slate-500" />,
      };
  }
}

function getDisciplineBadge(discipline?: string) {
  switch (discipline) {
    case 'Mechanical':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'Piping':
      return 'bg-cyan-50 text-cyan-700 border border-cyan-200';
    case 'Electrical':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'I&C':
      return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
    case 'Civil/Structural':
      return 'bg-stone-100 text-stone-700 border border-stone-300';
    case 'Process':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'HSE':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'Quality':
      return 'bg-purple-50 text-purple-700 border border-purple-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}
