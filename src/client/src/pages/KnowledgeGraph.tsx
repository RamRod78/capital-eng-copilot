import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Layers,
  BookOpen,
  FileText,
  Shield,
  Settings2,
  Info,
  ExternalLink,
  ChevronRight,
  Database,
  CheckCircle2,
  Share2,
  Zap,
  Tag,
  Loader2,
  X,
} from 'lucide-react';
import {
  fetchKnowledgeGraph,
  fetchKGStats,
  fetchKGNodeDetails,
  queryGraphRAG,
  backfillKnowledgeGraph,
} from '../api/client.js';
import {
  KGNode,
  KGEdge,
  KGEntityType,
  KGEntityTypeValues,
  EngineeringDisciplineValues,
  GraphRAGQueryResponse,
} from '@shared/schemas';

// Visual Style Configuration by Entity Type
export const ENTITY_COLORS: Record<KGEntityType | string, { bg: string; border: string; text: string; fill: string }> = {
  Document: { bg: '#e0f2fe', border: '#0284c7', text: '#0369a1', fill: '#0284c7' },
  Requirement: { bg: '#e0e7ff', border: '#4f46e5', text: '#3730a3', fill: '#4f46e5' },
  Standard: { bg: '#fef3c7', border: '#d97706', text: '#92400e', fill: '#d97706' },
  Equipment: { bg: '#d1fae5', border: '#059669', text: '#065f46', fill: '#059669' },
  Discipline: { bg: '#ede9fe', border: '#7c3aed', text: '#5b21b6', fill: '#7c3aed' },
  Parameter: { bg: '#ffe4e6', border: '#e11d48', text: '#9f1239', fill: '#e11d48' },
  Condition: { bg: '#ffedd5', border: '#ea580c', text: '#9a3412', fill: '#ea580c' },
  Topic: { bg: '#f1f5f9', border: '#475569', text: '#1e293b', fill: '#475569' },
};

interface SimulationNode extends KGNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimulationEdge {
  id: string;
  source: SimulationNode;
  target: SimulationNode;
  relation_type: string;
  weight: number;
  context_text?: string | null;
}

export default function KnowledgeGraph() {
  const queryClient = useQueryClient();

  // Filter & Search States
  const [selectedEntityType, setSelectedEntityType] = useState<string>('All');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('All');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [nodeLimit, setNodeLimit] = useState<number>(150);
  const [activeTab, setActiveTab] = useState<'graph' | 'graphrag' | 'analytics'>('graph');

  // Selected Node Drawer
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // GraphRAG States
  const [ragQuery, setRagQuery] = useState<string>('What are the vibration limits and mechanical seal standards for centrifugal pumps?');
  const [ragResponse, setRagResponse] = useState<GraphRAGQueryResponse | null>(null);

  // Canvas & Physics States
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [hoveredNode, setHoveredNode] = useState<SimulationNode | null>(null);

  // Pan & Zoom
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const isDraggingCanvasRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggedNodeRef = useRef<SimulationNode | null>(null);

  // Fetch Graph Data
  const { data: graphData, isLoading: isGraphLoading, refetch: refetchGraph } = useQuery({
    queryKey: ['kg-graph', selectedEntityType, selectedDiscipline, searchKeyword, nodeLimit],
    queryFn: () =>
      fetchKnowledgeGraph({
        entityType: selectedEntityType === 'All' ? undefined : selectedEntityType,
        discipline: selectedDiscipline === 'All' ? undefined : selectedDiscipline,
        keyword: searchKeyword.trim() ? searchKeyword.trim() : undefined,
        limit: nodeLimit,
      }),
  });

  // Fetch Stats Data
  const { data: statsData, isLoading: isStatsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['kg-stats'],
    queryFn: fetchKGStats,
    refetchInterval: 20000,
  });

  // Fetch Selected Node Details
  const { data: nodeDetails, isLoading: isNodeLoading } = useQuery({
    queryKey: ['kg-node-details', selectedNodeId],
    queryFn: () => (selectedNodeId ? fetchKGNodeDetails(selectedNodeId) : null),
    enabled: Boolean(selectedNodeId),
  });

  // Backfill Mutation
  const backfillMutation = useMutation({
    mutationFn: backfillKnowledgeGraph,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kg-graph'] });
      queryClient.invalidateQueries({ queryKey: ['kg-stats'] });
      refetchGraph();
      refetchStats();
    },
  });

  // GraphRAG Mutation
  const ragMutation = useMutation({
    mutationFn: () =>
      queryGraphRAG({
        query: ragQuery,
        max_hops: 2,
        top_k_seeds: 5,
        disciplines: selectedDiscipline === 'All' ? undefined : [selectedDiscipline],
      }),
    onSuccess: (data) => {
      setRagResponse(data);
    },
  });

  // Simulation Data Preparation
  const simNodes = useRef<SimulationNode[]>([]);
  const simEdges = useRef<SimulationEdge[]>([]);

  useEffect(() => {
    if (!graphData?.nodes) return;

    const existingMap = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const n of simNodes.current) {
      existingMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
    }

    const width = canvasRef.current?.clientWidth || 900;
    const height = canvasRef.current?.clientHeight || 600;

    const newSimNodes: SimulationNode[] = graphData.nodes.map((node, i) => {
      const prev = existingMap.get(node.id);
      const degree = node.degree_count || 1;
      const radius = Math.max(14, Math.min(36, 12 + Math.sqrt(degree) * 5));

      return {
        ...node,
        radius,
        x: prev ? prev.x : width / 2 + (Math.random() - 0.5) * (width * 0.7),
        y: prev ? prev.y : height / 2 + (Math.random() - 0.5) * (height * 0.7),
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0,
      };
    });

    const nodeMap = new Map<string, SimulationNode>(newSimNodes.map((n) => [n.id, n]));
    const newSimEdges: SimulationEdge[] = [];

    for (const edge of graphData.edges) {
      const src = nodeMap.get(edge.source_node_id);
      const tgt = nodeMap.get(edge.target_node_id);
      if (src && tgt) {
        newSimEdges.push({
          id: edge.id,
          source: src,
          target: tgt,
          relation_type: edge.relation_type,
          weight: edge.weight || 1.0,
          context_text: edge.context_text,
        });
      }
    }

    simNodes.current = newSimNodes;
    simEdges.current = newSimEdges;
  }, [graphData]);

  // Force Simulation & Animation Loop
  useEffect(() => {
    let animationFrameId: number;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Physics step (if not paused)
      if (!isPaused) {
        const nodes = simNodes.current;
        const edges = simEdges.current;
        const kCenter = 0.008;
        const kRepulsion = 1200;
        const kSpring = 0.04;
        const damping = 0.88;

        // 1. Center gravity
        const cx = width / 2;
        const cy = height / 2;
        for (const n of nodes) {
          if (n.fx != null && n.fy != null) continue;
          n.vx += (cx - n.x) * kCenter;
          n.vy += (cy - n.y) * kCenter;
        }

        // 2. Node repulsion (all pairs with spatial cutoff)
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy || 1;
            const dist = Math.sqrt(distSq);
            const minDist = n1.radius + n2.radius + 15;

            if (dist < 400) {
              const force = (kRepulsion * (n1.radius + n2.radius)) / (distSq + 100);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (n1.fx == null) {
                n1.vx -= fx;
                n1.vy -= fy;
              }
              if (n2.fx == null) {
                n2.vx += fx;
                n2.vy += fy;
              }
            }

            // Direct collision push
            if (dist < minDist) {
              const overlap = minDist - dist;
              const pushX = (dx / dist) * overlap * 0.5;
              const pushY = (dy / dist) * overlap * 0.5;
              if (n1.fx == null) {
                n1.x -= pushX;
                n1.y -= pushY;
              }
              if (n2.fx == null) {
                n2.x += pushX;
                n2.y += pushY;
              }
            }
          }
        }

        // 3. Edge Springs
        for (const e of edges) {
          const dx = e.target.x - e.source.x;
          const dy = e.target.y - e.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = 110 + (e.source.radius + e.target.radius);
          const springForce = (dist - desiredDist) * kSpring;

          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;

          if (e.source.fx == null) {
            e.source.vx += fx;
            e.source.vy += fy;
          }
          if (e.target.fx == null) {
            e.target.vx -= fx;
            e.target.vy -= fy;
          }
        }

        // 4. Update Positions
        for (const n of nodes) {
          if (n.fx != null && n.fy != null) {
            n.x = n.fx;
            n.y = n.fy;
            n.vx = 0;
            n.vy = 0;
          } else {
            n.vx *= damping;
            n.vy *= damping;
            n.x += n.vx;
            n.y += n.vy;
          }
        }
      }

      // Drawing phase
      ctx.clearRect(0, 0, width, height);
      ctx.save();

      // Pan & Zoom Transform
      const { x: tx, y: ty, k } = transformRef.current;
      ctx.translate(tx, ty);
      ctx.scale(k, k);

      // Draw Edges
      for (const edge of simEdges.current) {
        const isConnectedToSelected =
          selectedNodeId === edge.source.id || selectedNodeId === edge.target.id;
        const isHovered =
          hoveredNode && (hoveredNode.id === edge.source.id || hoveredNode.id === edge.target.id);

        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);

        if (isConnectedToSelected) {
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = Math.max(2, Math.min(4, edge.weight * 1.5));
          ctx.globalAlpha = 0.9;
        } else if (isHovered) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
        } else {
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = Math.max(1, Math.min(2.5, edge.weight * 0.8));
          ctx.globalAlpha = 0.5;
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Draw Relation Label on hover or if selected
        if (isConnectedToSelected || isHovered) {
          const midX = (edge.source.x + edge.target.x) / 2;
          const midY = (edge.source.y + edge.target.y) / 2;

          ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
          const labelText = edge.relation_type.replace(/_/g, ' ');
          const textWidth = ctx.measureText(labelText).width;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midX - textWidth / 2 - 4, midY - 7, textWidth + 8, 14, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1e293b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, midX, midY);
        }
      }

      // Draw Nodes
      for (const node of simNodes.current) {
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const color = ENTITY_COLORS[node.entity_type] || ENTITY_COLORS.Topic;

        // Halo / Selection Ring
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 6, 0, 2 * Math.PI);
          ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.25)' : 'rgba(59, 130, 246, 0.18)';
          ctx.fill();
        }

        // Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? color.border : color.bg;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#1d4ed8' : color.border;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Node Label Pill
        const label = node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name;
        ctx.font = isSelected ? 'bold 11px ui-sans-serif, system-ui, sans-serif' : '10px ui-sans-serif, system-ui, sans-serif';
        const labelWidth = ctx.measureText(label).width;

        // Background box for label text below node
        const labelY = node.y + node.radius + 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = isSelected ? '#2563eb' : '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(node.x - labelWidth / 2 - 4, labelY - 7, labelWidth + 8, 14, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#1e40af' : '#1e293b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, node.x, labelY);

        // Entity Type Icon / Abbreviation Inside Node
        ctx.fillStyle = isSelected ? '#ffffff' : color.text;
        ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
        const typeAbbr = node.entity_type.slice(0, 3).toUpperCase();
        ctx.fillText(typeAbbr, node.x, node.y - 1);
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPaused, selectedNodeId, hoveredNode]);

  // Coordinate Conversion Helper (Screen to World)
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { x: tx, y: ty, k } = transformRef.current;
    const x = (screenX - rect.left - tx) / k;
    const y = (screenY - rect.top - ty) / k;
    return { x, y };
  }, []);

  // Find Node at Screen Coordinates
  const findNodeAt = useCallback(
    (screenX: number, screenY: number): SimulationNode | null => {
      const { x, y } = screenToWorld(screenX, screenY);
      for (let i = simNodes.current.length - 1; i >= 0; i--) {
        const node = simNodes.current[i];
        const dx = node.x - x;
        const dy = node.y - y;
        if (dx * dx + dy * dy <= node.radius * node.radius) {
          return node;
        }
      }
      return null;
    },
    [screenToWorld]
  );

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = findNodeAt(e.clientX, e.clientY);
    if (node) {
      draggedNodeRef.current = node;
      node.fx = node.x;
      node.fy = node.y;
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = {
        x: e.clientX - transformRef.current.x,
        y: e.clientY - transformRef.current.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      draggedNodeRef.current.fx = x;
      draggedNodeRef.current.fy = y;
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
    } else if (isDraggingCanvasRef.current) {
      transformRef.current.x = e.clientX - dragStartRef.current.x;
      transformRef.current.y = e.clientY - dragStartRef.current.y;
    } else {
      const node = findNodeAt(e.clientX, e.clientY);
      setHoveredNode(node);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? 'pointer' : 'default';
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.fx = null;
      draggedNodeRef.current.fy = null;
      draggedNodeRef.current = null;
    }
    isDraggingCanvasRef.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = findNodeAt(e.clientX, e.clientY);
    if (node) {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newK = Math.max(0.2, Math.min(3.5, transformRef.current.k * zoomFactor));
    const kRatio = newK / transformRef.current.k;

    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * kRatio;
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * kRatio;
    transformRef.current.k = newK;
  };

  // Zoom / Pan Action Buttons
  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    if (direction === 'reset') {
      transformRef.current = { x: 0, y: 0, k: 1 };
    } else {
      const factor = direction === 'in' ? 1.2 : 0.8;
      const canvas = canvasRef.current;
      const cx = canvas ? canvas.clientWidth / 2 : 450;
      const cy = canvas ? canvas.clientHeight / 2 : 300;
      const newK = Math.max(0.2, Math.min(3.5, transformRef.current.k * factor));
      const kRatio = newK / transformRef.current.k;

      transformRef.current.x = cx - (cx - transformRef.current.x) * kRatio;
      transformRef.current.y = cy - (cy - transformRef.current.y) * kRatio;
      transformRef.current.k = newK;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Share2 className="w-8 h-8 text-brand-600" />
            Engineering Knowledge Graph Cockpit
          </h1>
          <p className="text-slate-600 mt-1">
            Explore interconnected engineering standards, equipment constraints, parameters, and governing clauses built incrementally from ingested specifications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            title="Scan all documents in database and regenerate Knowledge Graph"
          >
            {backfillMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                Syncing Knowledge Graph...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 text-brand-400" />
                Re-sync & Backfill Graph
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Entities</span>
            <Database className="w-4 h-4 text-brand-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {statsData?.total_nodes ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">Nodes in Knowledge Base</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Relationships</span>
            <Network className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {statsData?.total_edges ?? 0}
          </p>
          <span className="text-[11px] text-slate-500">Interconnected Triples</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Top Standard</span>
            <BookOpen className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg font-bold text-amber-700 mt-1 truncate" title={statsData?.top_standards?.[0]?.name || 'N/A'}>
            {statsData?.top_standards?.[0]?.name || 'API 610'}
          </p>
          <span className="text-[11px] text-slate-500">
            {statsData?.top_standards?.[0]?.count ? `${statsData.top_standards[0].count} connections` : 'Leading hub'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Top Equipment</span>
            <Settings2 className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-lg font-bold text-purple-700 mt-1 truncate" title={statsData?.top_equipment?.[0]?.name || 'N/A'}>
            {statsData?.top_equipment?.[0]?.name || 'Centrifugal Pump'}
          </p>
          <span className="text-[11px] text-slate-500">
            {statsData?.top_equipment?.[0]?.count ? `${statsData.top_equipment[0].count} requirements` : 'Primary asset'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Graph Density</span>
            <Zap className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {((statsData?.density || 0) * 100).toFixed(1)}%
          </p>
          <span className="text-[11px] text-slate-500">Network Connectivity</span>
        </div>
      </div>

      {/* Main View Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('graph')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'graph'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Network className="w-4 h-4" />
          2D Interactive Graph Visualizer
        </button>

        <button
          onClick={() => setActiveTab('graphrag')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'graphrag'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-brand-600" />
          GraphRAG Context Engine (AI Assistant)
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'analytics'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Entity Hubs & Standards Leaderboard
        </button>
      </div>

      {/* TAB 1: 2D Interactive Force Graph Visualizer */}
      {activeTab === 'graph' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Filter entities (e.g. API 610, Pump)..."
                  className="w-full rounded-lg border border-slate-300 p-2 pl-8 text-xs focus:ring-1 focus:ring-brand-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                {searchKeyword && (
                  <button onClick={() => setSearchKeyword('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Entity Type Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {['All', ...KGEntityTypeValues].map((t) => {
                  const isSelected = selectedEntityType === t;
                  const color = t !== 'All' ? ENTITY_COLORS[t] : null;
                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedEntityType(t)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      style={isSelected && color ? { backgroundColor: color.border } : undefined}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Discipline Filter */}
              <select
                value={selectedDiscipline}
                onChange={(e) => setSelectedDiscipline(e.target.value)}
                className="rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-700 focus:ring-1 focus:ring-brand-500"
              >
                <option value="All">All Disciplines</option>
                {EngineeringDisciplineValues.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {/* Limit */}
              <select
                value={nodeLimit}
                onChange={(e) => setNodeLimit(Number(e.target.value))}
                className="rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-700"
              >
                <option value={50}>Top 50 nodes</option>
                <option value={100}>Top 100 nodes</option>
                <option value={200}>Top 200 nodes</option>
                <option value={400}>Top 400 nodes</option>
              </select>
            </div>

            {/* Canvas Action Controls */}
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`p-2 rounded-lg text-xs font-bold border ${
                  isPaused
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title={isPaused ? 'Resume Physics' : 'Pause Physics Simulation'}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => handleZoom('in')}
                className="p-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleZoom('out')}
                className="p-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleZoom('reset')}
                className="p-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                title="Reset View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Graph Canvas Viewport */}
          <div className="relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl h-[620px]">
            {isGraphLoading && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-white gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                <span className="text-sm font-medium">Rendering Knowledge Network...</span>
              </div>
            )}

            {graphData && graphData.nodes.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-slate-400 gap-4 p-8 text-center">
                <Share2 className="w-12 h-12 text-slate-600" />
                <div>
                  <p className="text-base font-bold text-white">No graph entities found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md">
                    Click "Re-sync & Backfill Graph" above to extract and build the Knowledge Graph from documents already saved in your database.
                  </p>
                </div>
                <button
                  onClick={() => backfillMutation.mutate()}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold shadow-md"
                >
                  Sync Graph Now
                </button>
              </div>
            )}

            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleClick}
              onWheel={handleWheel}
              className="w-full h-full block cursor-grab active:cursor-grabbing"
            />

            {/* Canvas Legend */}
            <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-800 text-[11px] text-white flex flex-wrap items-center gap-3 shadow-lg pointer-events-none">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Legend:</span>
              {KGEntityTypeValues.map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: ENTITY_COLORS[t]?.border || '#94a3b8' }}
                  />
                  <span>{t}</span>
                </div>
              ))}
            </div>

            {/* Hover Tooltip Overlay */}
            {hoveredNode && (
              <div className="absolute top-4 left-4 bg-slate-900/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-700 shadow-xl max-w-sm text-white text-xs space-y-1.5 pointer-events-none">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{
                      backgroundColor: ENTITY_COLORS[hoveredNode.entity_type]?.border || '#3b82f6',
                      color: '#ffffff',
                    }}
                  >
                    {hoveredNode.entity_type}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    Degree: {hoveredNode.degree_count}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-100">{hoveredNode.name}</h4>
                {hoveredNode.description && (
                  <p className="text-slate-300 line-clamp-3 leading-relaxed text-[11px]">
                    {hoveredNode.description}
                  </p>
                )}
                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
                  <span>Discipline: {hoveredNode.discipline || 'General'}</span>
                  <span className="text-brand-400 font-medium">Click to inspect</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GraphRAG Context Engine */}
      {activeTab === 'graphrag' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-600" />
                Graph-Augmented Retrieval & AI Context Synthesis (GraphRAG)
              </h2>
              <p className="text-slate-600 text-xs mt-1">
                Enter an engineering query or operating envelope. The GraphRAG engine retrieves seed nodes via vector embeddings, traverses multi-hop relational dependencies, and feeds structured graph context into Gemini for synthesis.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ragQuery.trim()) return;
                ragMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="relative">
                <textarea
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  placeholder="Ask any cross-discipline question or standard requirement query..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Traverses 1-2 hops along Standards, Equipment, and Governing Clauses.
                </span>

                <button
                  type="submit"
                  disabled={ragMutation.isPending || !ragQuery.trim()}
                  className="py-2.5 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-sm shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {ragMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Traversing Graph & Synthesizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Execute GraphRAG Query
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* GraphRAG Response */}
          {ragResponse && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Synthesized Engineering Brief
                </h3>
                {ragResponse.token_usage && (
                  <span className="text-xs font-mono text-slate-500">
                    Tokens: {ragResponse.token_usage.totalTokens.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Connected Context Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                    Connected Standards ({ragResponse.connected_standards.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ragResponse.connected_standards.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-mono text-xs font-bold">
                        {s}
                      </span>
                    ))}
                    {ragResponse.connected_standards.length === 0 && <span className="text-xs text-amber-700">None</span>}
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                    Equipment Classes ({ragResponse.connected_equipment.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ragResponse.connected_equipment.map((eq) => (
                      <span key={eq} className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded text-xs font-semibold">
                        {eq}
                      </span>
                    ))}
                    {ragResponse.connected_equipment.length === 0 && <span className="text-xs text-emerald-700">None</span>}
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider block mb-1">
                    Governing Disciplines ({ragResponse.governing_disciplines.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ragResponse.governing_disciplines.map((d) => (
                      <span key={d} className="px-2 py-0.5 bg-purple-100 text-purple-900 rounded text-xs font-semibold">
                        {d}
                      </span>
                    ))}
                    {ragResponse.governing_disciplines.length === 0 && <span className="text-xs text-purple-700">General</span>}
                  </div>
                </div>
              </div>

              {/* Executive Summary / AI Response */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                {ragResponse.summary}
              </div>

              {/* Subgraph Triples Inspector */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-3">
                  Traversed Subgraph Triples ({ragResponse.subgraph.edges.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {ragResponse.subgraph.edges.map((edge) => {
                    const src = ragResponse.subgraph.nodes.find((n) => n.id === edge.source_node_id);
                    const tgt = ragResponse.subgraph.nodes.find((n) => n.id === edge.target_node_id);
                    return (
                      <div key={edge.id} className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex items-center justify-between gap-2 shadow-2xs">
                        <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={src?.name}>
                          {src?.name || 'Node'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                          {edge.relation_type}
                        </span>
                        <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={tgt?.name}>
                          {tgt?.name || 'Node'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Entity Hubs & Standards Leaderboard */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Standards */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-600" />
              Most Referenced Industry & Corporate Standards
            </h3>
            <div className="space-y-2.5">
              {statsData?.top_standards?.map((s, idx) => (
                <div key={s.name} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-amber-50/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-mono font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 font-mono">
                    {s.count} linkages
                  </span>
                </div>
              ))}
              {(!statsData?.top_standards || statsData.top_standards.length === 0) && (
                <div className="text-center p-8 text-slate-400 text-xs">No standards indexed yet.</div>
              )}
            </div>
          </div>

          {/* Top Equipment Hubs */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-emerald-600" />
              Primary Equipment & Asset Classes
            </h3>
            <div className="space-y-2.5">
              {statsData?.top_equipment?.map((eq, idx) => (
                <div key={eq.name} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-emerald-50/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-900 font-mono font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{eq.name}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 font-mono">
                    {eq.count} clauses
                  </span>
                </div>
              ))}
              {(!statsData?.top_equipment || statsData.top_equipment.length === 0) && (
                <div className="text-center p-8 text-slate-400 text-xs">No equipment indexed yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Node Inspector Drawer */}
      {selectedNodeId && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col transform transition-transform">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-1 rounded-md text-xs font-bold uppercase text-white shadow-xs"
                style={{
                  backgroundColor:
                    ENTITY_COLORS[nodeDetails?.node?.entity_type || '']?.border || '#2563eb',
                }}
              >
                {nodeDetails?.node?.entity_type || 'Node'}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Connections: {nodeDetails?.node?.degree_count || 0}
              </span>
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {isNodeLoading ? (
              <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                <span className="text-sm">Loading entity metadata...</span>
              </div>
            ) : nodeDetails?.node ? (
              <>
                {/* Node Title & Description */}
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">{nodeDetails.node.name}</h2>
                  {nodeDetails.node.discipline && (
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                      {nodeDetails.node.discipline} Engineering
                    </span>
                  )}
                  {nodeDetails.node.description && (
                    <p className="text-sm text-slate-700 mt-3 bg-slate-50 p-3.5 rounded-lg border border-slate-100 leading-relaxed font-normal">
                      {nodeDetails.node.description}
                    </p>
                  )}
                </div>

                {/* Source Document Reference */}
                {(nodeDetails.node.source_document_title || nodeDetails.node.requirement_code) && (
                  <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 text-xs space-y-2">
                    <span className="font-bold text-sky-950 uppercase tracking-wider block">Source Specification</span>
                    {nodeDetails.node.source_document_title && (
                      <div className="flex items-center gap-2 text-sky-900">
                        <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                        <span className="font-semibold">{nodeDetails.node.source_document_title}</span>
                      </div>
                    )}
                    {nodeDetails.node.requirement_code && (
                      <div className="font-mono text-sky-800 font-bold">
                        Clause: {nodeDetails.node.requirement_code}
                      </div>
                    )}
                  </div>
                )}

                {/* Connected Relationships List */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Connected Relationships ({nodeDetails.connectedEdges?.length || 0})
                  </h4>

                  <div className="space-y-2">
                    {nodeDetails.connectedEdges?.map((edge) => {
                      const isOutgoing = edge.source_node_id === selectedNodeId;
                      const neighborLabel = isOutgoing ? edge.target_label : edge.source_label;
                      const neighborType = isOutgoing ? edge.target_type : edge.source_type;
                      const neighborId = isOutgoing ? edge.target_node_id : edge.source_node_id;

                      return (
                        <div
                          key={edge.id}
                          onClick={() => setSelectedNodeId(neighborId)}
                          className="p-3 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: ENTITY_COLORS[neighborType]?.border || '#94a3b8',
                              }}
                            />
                            <div className="truncate">
                              <span className="font-bold text-slate-900 block truncate">{neighborLabel}</span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {isOutgoing ? '➔' : '⬅'} {edge.relation_type}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </div>
                      );
                    })}

                    {(!nodeDetails.connectedEdges || nodeDetails.connectedEdges.length === 0) && (
                      <p className="text-xs text-slate-400 italic">No connected relationships recorded.</p>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
