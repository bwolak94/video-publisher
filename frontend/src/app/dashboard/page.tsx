"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

interface Project {
  id: string;
  title: string;
  mode: string;
  status: string;
  storyboard: { scenes?: unknown[] } | null;
  updatedAt: string;
}

interface Stats {
  totalProjects: number;
  totalScenes: number;
  projectsByStatus: Record<string, number>;
  cacheHitRate: number;
  totalDuration: number;
}

interface WorkerSettings {
  enabled: boolean;
  cronSchedule: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    running: "bg-blue-100 text-blue-700",
    idle: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-500",
  };
  const style = styles[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        mode === "creator"
          ? "bg-indigo-100 text-indigo-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      {mode === "creator" ? "Creator" : "Worker"}
    </span>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [workerSettings, setWorkerSettings] = useState<WorkerSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/projects`).then((r) => r.ok ? r.json() : []),
      fetch(`${API_BASE}/api/projects/stats`).then((r) => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/settings`).then((r) => r.ok ? r.json() : null),
    ]).then(([projectsData, statsData, settingsData]) => {
      setProjects(projectsData ?? []);
      setStats(statsData);
      if (settingsData?.worker) {
        setWorkerSettings(settingsData.worker);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const workerRunning = workerSettings?.enabled ?? false;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
              <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900">AI Video Factory</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <span className="px-3 py-1.5 bg-gray-100 text-gray-900 rounded-md font-medium">
            Dashboard
          </span>
          <Link
            href="/create"
            className="px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            Creator Mode
          </Link>
          <Link
            href="/dashboard/settings"
            className="px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            Settings
          </Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your AI video production</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Videos Produced", value: loading ? "…" : String(stats?.totalProjects ?? 0) },
            { label: "Total Duration", value: "—" },
            { label: "Scenes Generated", value: loading ? "…" : String(stats?.totalScenes ?? 0) },
            { label: "Cache Hit Rate", value: "—" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border px-5 py-4">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Creator Mode card */}
          <div className="bg-white rounded-lg border p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 1L10 6H15L11 9.5L12.5 15L8 12L3.5 15L5 9.5L1 6H6L8 1Z"
                        fill="#6366f1"
                      />
                    </svg>
                  </div>
                  <h2 className="font-semibold text-gray-900">Creator Mode</h2>
                </div>
                <p className="text-sm text-gray-500">
                  AI-assisted long-form video from chat to timeline. You stay in control.
                </p>
              </div>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                Chat with AI to build your outline
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                Edit narration, visuals and timing
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                Live Remotion preview before render
              </li>
            </ul>
            <div className="mt-auto">
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
              >
                New Project
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6H10M7 3L10 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Worker Mode card */}
          <div className="bg-white rounded-lg border p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="3" fill="#f59e0b" />
                      <path
                        d="M8 1V3M8 13V15M1 8H3M13 8H15M3.05 3.05L4.46 4.46M11.54 11.54L12.95 12.95M3.05 12.95L4.46 11.54M11.54 4.46L12.95 3.05"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <h2 className="font-semibold text-gray-900">Worker Mode</h2>
                  <StatusBadge status={workerRunning ? "running" : "idle"} />
                </div>
                <p className="text-sm text-gray-500">
                  Fully autonomous Shorts pipeline. Runs in the background, no input needed.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-md p-3 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="text-gray-900 font-medium">
                  {loading ? "…" : workerRunning ? "Running" : "Idle"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Schedule</span>
                <code className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                  {loading ? "…" : workerSettings?.cronSchedule ?? "—"}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Projects</span>
                <span className="text-gray-900 font-medium">
                  {loading ? "…" : String(stats?.totalProjects ?? 0)}
                </span>
              </div>
            </div>

            <div className="mt-auto">
              <Link
                href="/dashboard/settings#worker"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 transition-colors"
              >
                Configure Worker
              </Link>
            </div>
          </div>
        </div>

        {/* Recent projects */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Recent Projects</h2>
            <Link
              href="/create"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              New project
            </Link>
          </div>

          <div className="bg-white rounded-lg border divide-y">
            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : projects.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No projects yet.{" "}
                <Link href="/create" className="text-indigo-600 hover:text-indigo-700 font-medium">
                  Create your first one.
                </Link>
              </div>
            ) : (
              projects.slice(0, 10).map((p) => {
                const sceneCount = p.storyboard?.scenes?.length ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    {/* Thumbnail placeholder */}
                    <div className="w-16 h-9 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="1" y="1" width="14" height="14" rx="2" stroke="#d1d5db" strokeWidth="1.2" />
                        <path d="M6 5L11 8L6 11V5Z" fill="#d1d5db" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ModeBadge mode={p.mode} />
                        {sceneCount > 0 && (
                          <span className="text-xs text-gray-400">{sceneCount} scenes</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={p.status} />
                      <span className="text-xs text-gray-400 w-28 text-right">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                      {p.mode === "creator" ? (
                        <Link
                          href={`/project/${p.id}/timeline`}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300 font-medium opacity-0 group-hover:opacity-100 w-8">
                          View
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
