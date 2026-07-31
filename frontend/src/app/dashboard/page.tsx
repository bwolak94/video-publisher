"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

interface Project {
  id: string;
  title: string;
  mode: string;
  status: string;
  storyboard: { scenes?: unknown[]; meta?: { aspectRatio?: string } } | null;
  updatedAt: string;
}

interface Stats {
  totalProjects: number;
  totalScenes: number;
  projectsByStatus: Record<string, number>;
}

interface WorkerSettings {
  enabled: boolean;
  cronSchedule: string;
}

// ─── Status pill ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  completed: { dot: "bg-success",         text: "text-success-text",  bg: "bg-success-bg border border-success-border" },
  running:   { dot: "bg-info",            text: "text-info-glow",     bg: "bg-info-dim border border-info/20" },
  failed:    { dot: "bg-danger",          text: "text-danger-text",   bg: "bg-danger-bg border border-danger-border" },
  draft:     { dot: "bg-ink-placeholder", text: "text-ink-muted",     bg: "bg-subtle border border-line" },
  idle:      { dot: "bg-ink-placeholder", text: "text-ink-muted",     bg: "bg-subtle border border-line" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const sceneCount = project.storyboard?.scenes?.length ?? 0;
  const ratio = project.storyboard?.meta?.aspectRatio ?? "16:9";
  const isCreator = project.mode === "creator";
  const href = isCreator ? `/project/${project.id}/timeline` : "#";

  // Thumbnail placeholder aspect ratio
  const paddingPct = ratio === "9:16" ? "177.78%" : ratio === "1:1" ? "100%" : "56.25%";

  return (
    <Link
      href={href}
      className="group flex flex-col bg-panel border border-line rounded-xl overflow-hidden hover:border-line-strong hover:shadow-md transition-all duration-150 cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative w-full bg-subtle" style={{ paddingTop: paddingPct }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-ink-placeholder">
            <rect x="2" y="2" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 9L20 14L10 19V9Z" fill="currentColor" opacity="0.4" />
          </svg>
        </div>
        {/* Mode badge */}
        <div className="absolute top-2 left-2">
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
              isCreator
                ? "bg-accent/20 text-accent border border-accent/30"
                : "bg-warning-bg text-warning-text border border-warning-border"
            }`}
          >
            {isCreator ? "Creator" : "Worker"}
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <p className="text-sm font-medium text-ink truncate group-hover:text-accent transition-colors">{project.title}</p>
        <div className="flex items-center justify-between">
          <StatusPill status={project.status} />
          <span className="text-xs text-ink-muted">
            {sceneCount > 0 ? `${sceneCount} scenes` : new Date(project.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Stat block ──────────────────────────────────────────────────────────────

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-3xl font-bold text-ink tabular-nums">{value}</p>
      <p className="text-xs text-ink-secondary">{label}</p>
      {sub && <p className="text-2xs text-ink-muted">{sub}</p>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [stats, setStats]               = useState<Stats | null>(null);
  const [workerSettings, setWorkerSettings] = useState<WorkerSettings | null>(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/projects`).then((r) => r.ok ? r.json() : { data: [] }),
      fetch(`${API_BASE}/api/projects/stats`).then((r) => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/settings`).then((r) => r.ok ? r.json() : null),
    ]).then(([p, s, cfg]) => {
      const projectsList = Array.isArray(p) ? p : (Array.isArray(p?.data) ? p.data : []);
      setProjects(projectsList);
      setStats(s);
      if (cfg?.worker) setWorkerSettings(cfg.worker);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const workerOn  = workerSettings?.enabled ?? false;
  const completed = stats?.projectsByStatus?.completed ?? 0;
  const scenes    = stats?.totalScenes ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-app">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-line px-6 h-14 flex items-center justify-between bg-panel">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-ink">Dashboard</h1>
        </div>
        <Link
          href="/create"
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-all duration-100 hover:opacity-90 active:scale-95"
          style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New project
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">

          {/* ── KPI strip ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Projects", value: loading ? "…" : String(stats?.totalProjects ?? 0) },
              { label: "Completed", value: loading ? "…" : String(completed) },
              { label: "Scenes generated", value: loading ? "…" : String(scenes) },
              { label: "Worker", value: loading ? "…" : workerOn ? "Active" : "Idle", sub: workerSettings?.cronSchedule },
            ].map((s) => (
              <div key={s.label} className="bg-panel border border-line rounded-xl px-5 py-4 shadow-inner-t">
                <StatBlock label={s.label} value={s.value} sub={s.sub} />
              </div>
            ))}
          </div>

          {/* ── Quick-start cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">

            {/* Creator Mode */}
            <div className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4 hover:border-line-strong transition-colors">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(91,110,245,0.12)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1L8.3 4.7H12.5L9.1 7L10.4 10.7L7 8.5L3.6 10.7L4.9 7L1.5 4.7H5.7L7 1Z" fill="#5b6ef5" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">Creator Mode</p>
                  <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                    AI-assisted long-form video — chat, outline, storyboard, render. Full control at every step.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {["Chat with AI to build your outline", "Edit narration, visuals and timing", "Live preview before render"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-ink-secondary">
                    <span className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-1">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white transition-all duration-100 hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
                >
                  Start creating
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 5.5H9.5M6.5 2.5L9.5 5.5L6.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Worker Mode */}
            <div className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4 hover:border-line-strong transition-colors">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(217,119,6,0.1)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="2.5" fill="#d97706" />
                    <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.69 2.69l1.06 1.06M10.25 10.25l1.06 1.06M2.69 11.31l1.06-1.06M10.25 3.75l1.06-1.06" stroke="#d97706" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">Worker Mode</p>
                    <span
                      className={`flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded-full ${
                        workerOn
                          ? "bg-success-bg text-success-text border border-success-border"
                          : "bg-subtle text-ink-muted border border-line"
                      }`}
                    >
                      <span className={`w-1 h-1 rounded-full ${workerOn ? "bg-success animate-pulse-dot" : "bg-ink-placeholder"}`} />
                      {workerOn ? "Active" : "Idle"}
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                    Fully autonomous Shorts pipeline. Runs in the background.
                  </p>
                </div>
              </div>
              <div className="bg-subtle rounded-lg border border-line px-3 py-2.5 space-y-2">
                {[
                  { k: "Schedule", v: workerSettings?.cronSchedule ?? "—", code: true },
                  { k: "Status",   v: workerOn ? "Running" : "Idle" },
                ].map(({ k, v, code }) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{k}</span>
                    {code
                      ? <code className="font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded text-2xs">{v}</code>
                      : <span className={`font-medium ${workerOn && k === "Status" ? "text-success-text" : "text-ink"}`}>{v}</span>
                    }
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-1">
                <Link
                  href="/dashboard/settings#worker"
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-ink border border-line bg-hover hover:bg-muted transition-colors"
                >
                  Configure Worker
                </Link>
              </div>
            </div>
          </div>

          {/* ── Recent projects ──────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-ink">Recent Projects</p>
              <Link href="/create" className="text-xs text-accent hover:text-accent-hover font-medium transition-colors">
                + New project
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-panel border border-line rounded-xl overflow-hidden animate-pulse">
                    <div className="bg-subtle" style={{ paddingTop: "56.25%" }} />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-subtle rounded w-3/4" />
                      <div className="h-2.5 bg-subtle rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="bg-panel border border-line rounded-xl py-16 flex flex-col items-center gap-3 text-center">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="text-ink-placeholder">
                  <rect x="3" y="3" width="30" height="30" rx="6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M13 12L24 18L13 24V12Z" fill="currentColor" opacity="0.4" />
                </svg>
                <p className="text-sm font-medium text-ink-secondary">No projects yet</p>
                <p className="text-xs text-ink-muted max-w-xs">
                  Create your first video project using Creator Mode or configure the Worker to run autonomously.
                </p>
                <Link
                  href="/create"
                  className="mt-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
                >
                  Create first project
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {projects.slice(0, 12).map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
