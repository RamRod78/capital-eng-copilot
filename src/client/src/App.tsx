import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileInput,
  ClipboardCheck,
  Target,
  Lightbulb,
  Search,
  HardHat,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { fetchStats } from './api/client.js';

import Dashboard from './pages/Dashboard.js';
import IngestExtract from './pages/IngestExtract.js';
import ReviewQueue from './pages/ReviewQueue.js';
import ProjectScoping from './pages/ProjectScoping.js';
import LessonsLearned from './pages/LessonsLearned.js';
import KnowledgeSearch from './pages/KnowledgeSearch.js';
import Admin from './pages/Admin.js';
import AboutCDDE from './pages/AboutCDDE.js';

export default function App() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15000,
  });

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 border-r border-slate-800 shadow-xl">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-brand-600 p-2.5 rounded-xl shadow-lg shadow-brand-600/30 text-white shrink-0">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-wider bg-gradient-to-r from-white via-slate-100 to-brand-300 bg-clip-text text-transparent leading-none">
              CDDE
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">AI Prototype</p>
          </div>
        </div>

        {/* System Status Indicators */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-950/40 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              Database & Vector
            </span>
            {stats?.dbConnected ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                <AlertTriangle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Gemini AI API</span>
            {stats?.geminiConfigured ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                <XCircle className="w-3 h-3" /> Key Missing
              </span>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/ingest"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <FileInput className="w-4 h-4 shrink-0" />
            <span>1. Ingest & Extract</span>
          </NavLink>

          <NavLink
            to="/review"
            className={({ isActive }) =>
              `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span>2. SME Review Queue</span>
            </div>
            {stats && stats.pendingReviews > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-slate-950">
                {stats.pendingReviews}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/scoping"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <Target className="w-4 h-4 shrink-0" />
            <span>3. Project Scoping & RFP</span>
          </NavLink>

          <NavLink
            to="/lessons"
            className={({ isActive }) =>
              `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <div className="flex items-center gap-3">
              <Lightbulb className="w-4 h-4 shrink-0" />
              <span>4. Lessons Learned</span>
            </div>
            {stats && stats.activeFlags > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500 text-white">
                {stats.activeFlags}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/search"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>5. Knowledge Search</span>
          </NavLink>

          <NavLink
            to="/about"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`
            }
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>About CDDE</span>
          </NavLink>

          <div className="pt-3 mt-3 border-t border-slate-800/80">
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-rose-700 text-white shadow-md shadow-rose-900/30'
                    : 'text-slate-400 hover:bg-rose-950/40 hover:text-rose-300'
                }`
              }
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Admin & Maintenance</span>
            </NavLink>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          TypeScript • React • Hono • pgvector
        </div>
      </aside>

      {/* Main Content View */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-slate-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ingest" element={<IngestExtract />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/scoping" element={<ProjectScoping />} />
          <Route path="/lessons" element={<LessonsLearned />} />
          <Route path="/search" element={<KnowledgeSearch />} />
          <Route path="/about" element={<AboutCDDE />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}
