"use client";

import Link from "next/link";

const RECENT_PROJECTS = [
  {
    id: "proj-001",
    title: "10 React Hooks You Should Know",
    mode: "creator" as const,
    status: "completed" as const,
    scenes: 8,
    duration: "4:32",
    updatedAt: "2 hours ago",
  },
  {
    id: "proj-002",
    title: "TypeScript Generics Explained",
    mode: "creator" as const,
    status: "running" as const,
    scenes: 6,
    duration: "3:18",
    updatedAt: "5 hours ago",
  },
  {
    id: "proj-003",
    title: "Auto-Short: Next.js App Router",
    mode: "worker" as const,
    status: "completed" as const,
    scenes: 3,
    duration: "0:58",
    updatedAt: "Yesterday",
  },
  {
    id: "proj-004",
    title: "Auto-Short: Tailwind Tips #42",
    mode: "worker" as const,
    status: "completed" as const,
    scenes: 3,
    duration: "0:54",
    updatedAt: "2 days ago",
  },
];

const STATS = [
  { label: "Videos Produced", value: "24" },
  { label: "Total Duration", value: "1h 47m" },
  { label: "Scenes Generated", value: "163" },
  { label: "Cache Hit Rate", value: "68%" },
];

const WORKER_STATUS = {
  running: false,
  lastPublished: "Auto-Short: Next.js App Router",
  lastPublishedAt: "Yesterday at 14:22",
  queueLength: 0,
};

function StatusBadge({ status }: { status: "completed" | "running" | "idle" | "failed" }) {
  const styles = {
    completed: "bg-green-100 text-green-700",
    running: "bg-blue-100 text-blue-700",
    idle: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ModeBadge({ mode }: { mode: "creator" | "worker" }) {
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
          {STATS.map((s) => (
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
                  <StatusBadge status={WORKER_STATUS.running ? "running" : "idle"} />
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
                  {WORKER_STATUS.running ? "Running" : "Idle"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Queue length</span>
                <span className="text-gray-900 font-medium">{WORKER_STATUS.queueLength} jobs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last published</span>
                <span className="text-gray-900 font-medium truncate ml-4 text-right">
                  {WORKER_STATUS.lastPublishedAt}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 truncate">
              &quot;{WORKER_STATUS.lastPublished}&quot;
            </p>

            <div className="mt-auto">
              <button
                disabled
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md opacity-50 cursor-not-allowed"
                title="Worker Mode coming soon"
              >
                Configure Worker
              </button>
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
            {RECENT_PROJECTS.map((p) => (
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
                    <span className="text-xs text-gray-400">
                      {p.scenes} scenes · {p.duration}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-gray-400 w-20 text-right">{p.updatedAt}</span>
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
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
