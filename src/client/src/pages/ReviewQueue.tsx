import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
} from '@tanstack/react-table';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  Flag,
  Filter,
  Search,
  Check,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  fetchExtractions,
  updateExtraction,
  bulkUpdateExtractions,
  createDocumentFlag,
} from '../api/client.js';
import { ExtractionRecord } from '@shared/schemas';

const columnHelper = createColumnHelper<ExtractionRecord>();

export default function ReviewQueue() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('Pending Review');
  const [disciplineFilter, setDisciplineFilter] = useState('All');
  const [ownerFilter, setOwnerFilter] = useState('All');
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Editing state
  const [editingItem, setEditingItem] = useState<ExtractionRecord | null>(null);
  const [editText, setEditText] = useState('');
  const [editDiscipline, setEditDiscipline] = useState('');
  const [editCompliance, setEditCompliance] = useState('');
  const [editType, setEditType] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editComments, setEditComments] = useState('');
  const [reviewerName, setReviewerName] = useState('Senior Mechanical SME');

  // Flag Modal state
  const [flaggingItem, setFlaggingItem] = useState<ExtractionRecord | null>(null);
  const [flagIssue, setFlagIssue] = useState('');
  const [flagAction, setFlagAction] = useState('Review and Update Standard');

  // Fetch extractions query
  const { data: extractions = [], isLoading } = useQuery({
    queryKey: ['extractions', { statusFilter, disciplineFilter, ownerFilter, lowConfidenceOnly, keyword }],
    queryFn: () =>
      fetchExtractions({
        status: statusFilter,
        discipline: disciplineFilter,
        owner: ownerFilter,
        lowConfidenceOnly,
        keyword,
      }),
  });

  // Single update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => updateExtraction(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extractions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setEditingItem(null);
    },
  });

  // Bulk update mutation
  const bulkMutation = useMutation({
    mutationFn: (payload: { items: any[]; reviewer: string; defaultStatus?: string }) =>
      bulkUpdateExtractions(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extractions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setRowSelection({});
    },
  });

  // Create flag mutation
  const flagMutation = useMutation({
    mutationFn: (payload: any) => createDocumentFlag(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentFlags'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setFlaggingItem(null);
      setFlagIssue('');
    },
  });

  const handleEditClick = (item: ExtractionRecord) => {
    setEditingItem(item);
    setEditText(item.requirement_text);
    setEditDiscipline(item.engineering_discipline);
    setEditCompliance(item.compliance_level);
    setEditType(item.item_type || 'Requirement');
    setEditCost(item.estimated_cost_impact || 'TBD');
    setEditComments(item.sme_comments || '');
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      payload: {
        status: 'Edited',
        sme_reviewer: reviewerName,
        requirement_text: editText,
        engineering_discipline: editDiscipline,
        compliance_level: editCompliance,
        item_type: editType,
        estimated_cost_impact: editCost,
        sme_comments: editComments,
      },
    });
  };

  const handleApproveSingle = (item: ExtractionRecord) => {
    updateMutation.mutate({
      id: item.id,
      payload: {
        status: 'Approved',
        sme_reviewer: reviewerName,
        sme_comments: 'Approved by SME during review queue check',
      },
    });
  };

  const handleRejectSingle = (item: ExtractionRecord) => {
    updateMutation.mutate({
      id: item.id,
      payload: {
        status: 'Rejected',
        sme_reviewer: reviewerName,
        sme_comments: 'Rejected by SME during validation',
      },
    });
  };

  // TanStack Table columns definition
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
        ),
      }),
      columnHelper.accessor('requirement_code', {
        header: 'Code',
        cell: (info) => (
          <span className="font-mono font-bold text-brand-700">{info.getValue() || 'REQ'}</span>
        ),
      }),
      columnHelper.accessor('item_type', {
        header: 'Type',
        cell: (info) => (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('engineering_discipline', {
        header: 'Discipline',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('requirement_text', {
        header: 'Requirement Clause',
        cell: (info) => (
          <p className="max-w-md font-normal leading-relaxed text-slate-800 line-clamp-3 hover:line-clamp-none transition-all">
            {info.getValue()}
          </p>
        ),
      }),
      columnHelper.accessor('confidence_score', {
        header: 'Confidence',
        cell: (info) => {
          const score = info.getValue() ?? 1.0;
          const isLow = score < 0.85;
          return (
            <div className="space-y-0.5">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                  isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {(score * 100).toFixed(0)}%
              </span>
              {isLow && <span className="block text-[10px] text-rose-600 font-semibold">Low Conf</span>}
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = info.getValue();
          let color = 'bg-slate-100 text-slate-800';
          if (status === 'Approved') color = 'bg-emerald-100 text-emerald-800';
          if (status === 'Pending Review') color = 'bg-amber-100 text-amber-800';
          if (status === 'Rejected') color = 'bg-rose-100 text-rose-800';
          if (status === 'Edited') color = 'bg-sky-100 text-sky-800';
          return <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${color}`}>{status}</span>;
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Review Actions',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleApproveSingle(item)}
                title="Approve Requirement"
                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleRejectSingle(item)}
                title="Reject Requirement"
                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleEditClick(item)}
                title="Edit Clause"
                className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 border border-brand-200 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setFlaggingItem(item)}
                title="Flag Document Revision"
                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 border border-amber-200 transition-colors"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          );
        },
      }),
    ],
    [reviewerName]
  );

  const table = useReactTable({
    data: extractions,
    columns,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const handleBulkApprove = () => {
    if (selectedRows.length === 0) return;
    bulkMutation.mutate({
      items: selectedRows.map((r) => ({ id: r.id, status: 'Approved' })),
      reviewer: reviewerName,
      defaultStatus: 'Approved',
    });
  };

  const handleBulkReject = () => {
    if (selectedRows.length === 0) return;
    bulkMutation.mutate({
      items: selectedRows.map((r) => ({ id: r.id, status: 'Rejected' })),
      reviewer: reviewerName,
      defaultStatus: 'Rejected',
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          📋 SME Review & Validation Queue
        </h1>
        <p className="text-slate-600 mt-1">
          Review extracted clauses, validate low-confidence items (&lt; 0.85), edit discipline classifications, and ensure strict compliance before project scoping.
        </p>
      </div>

      {/* Filter and Action Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:ring-1 focus:ring-brand-500"
            >
              <option>All</option>
              <option>Pending Review</option>
              <option>Approved</option>
              <option>Edited</option>
              <option>Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Discipline</label>
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white focus:ring-1 focus:ring-brand-500"
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
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Active SME Reviewer</label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Search Keywords</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search clause text..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 pl-8 text-xs focus:ring-1 focus:ring-brand-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer w-full text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={lowConfidenceOnly}
                onChange={(e) => setLowConfidenceOnly(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span>⚠️ Low Confidence Only (&lt;0.85)</span>
            </label>
          </div>
        </div>

        {/* Bulk Action Controls */}
        {selectedRows.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-brand-50 rounded-lg border border-brand-200">
            <span className="text-xs font-bold text-brand-900">
              {selectedRows.length} item(s) selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkMutation.isPending}
                className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Bulk Approve Selected
              </button>
              <button
                type="button"
                onClick={handleBulkReject}
                disabled={bulkMutation.isPending}
                className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                Bulk Reject Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TanStack Table View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading extractions...</div>
        ) : extractions.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No extractions found matching current filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold border-b border-slate-200">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="p-3">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {extractions.length > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span>
                    Showing{' '}
                    <strong className="text-slate-900">
                      {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
                    </strong>{' '}
                    to{' '}
                    <strong className="text-slate-900">
                      {Math.min(
                        (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                        extractions.length
                      )}
                    </strong>{' '}
                    of <strong className="text-slate-900">{extractions.length}</strong> requirements
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1">
                    <span>Show</span>
                    <select
                      value={table.getState().pagination.pageSize}
                      onChange={(e) => table.setPageSize(Number(e.target.value))}
                      className="p-1 rounded border border-slate-300 bg-white font-medium text-slate-800 focus:ring-1 focus:ring-brand-500"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                    <span>per page</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="mr-2">
                    Page{' '}
                    <strong className="text-slate-900">
                      {table.getState().pagination.pageIndex + 1}
                    </strong>{' '}
                    of <strong className="text-slate-900">{table.getPageCount() || 1}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>

                  <button
                    type="button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Drawer / Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-brand-600" />
                Edit Specification Clause: {editingItem.requirement_code || 'REQ'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Clause Text (Will update knowledge base & log feedback)
                </label>
                <textarea
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option>Requirement</option>
                    <option>Recommendation</option>
                    <option>Guideline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Discipline</label>
                  <select
                    value={editDiscipline}
                    onChange={(e) => setEditDiscipline(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
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
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Compliance</label>
                  <select
                    value={editCompliance}
                    onChange={(e) => setEditCompliance(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option>Mandatory</option>
                    <option>Recommended</option>
                    <option>Optional</option>
                    <option>Informational</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Cost Impact</label>
                  <select
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                    <option>Negligible</option>
                    <option>TBD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  SME Rationale & Comments
                </label>
                <input
                  type="text"
                  value={editComments}
                  onChange={(e) => setEditComments(e.target.value)}
                  placeholder="Explain reason for modification..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="py-2 px-4 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={handleSaveEdit}
                className="py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
              >
                Save & Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Standard Modal */}
      {flaggingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Flag className="w-5 h-5 text-rose-600" />
                Flag Upstream Document Revision
              </h3>
              <button
                type="button"
                onClick={() => setFlaggingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Flags standard <strong>{flaggingItem.document_owner || 'Engineering Lead'}</strong> to review this specification for obsolescence, ambiguity, or regulatory changes.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Issue Description / Feedback
                </label>
                <textarea
                  rows={3}
                  value={flagIssue}
                  onChange={(e) => setFlagIssue(e.target.value)}
                  placeholder="E.g., ASME Section VIII Div 1 updated allowable stress limits..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Suggested Action
                </label>
                <select
                  value={flagAction}
                  onChange={(e) => setFlagAction(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  <option>Review and Update Standard</option>
                  <option>Retire / Deprecate Clause</option>
                  <option>Issue Clarification Addendum</option>
                  <option>Harmonize with Global Standard</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setFlaggingItem(null)}
                className="py-2 px-4 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={flagMutation.isPending || !flagIssue.trim()}
                onClick={() =>
                  flagMutation.mutate({
                    document_title: flaggingItem.section_title || 'Engineering Specification',
                    document_owner: flaggingItem.document_owner || 'Engineering Lead',
                    flagged_by: reviewerName,
                    issue_description: flagIssue,
                    suggested_action: flagAction,
                  })
                }
                className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow transition-colors disabled:opacity-50"
              >
                Create Revision Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
