"use client";

import { useEffect, useState, useCallback } from "react";

interface DlqEntry {
  id: string;
  sourceQueue: string;
  jobData: Record<string, unknown>;
  errorMessage: string;
  failedAt: string;
  attemptsMade: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export default function DlqDashboardPage() {
  const [jobs, setJobs] = useState<DlqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dlq`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJobs(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleRetry = async (job: DlqEntry) => {
    setRetrying(job.id);
    try {
      const res = await fetch(`${API_BASE}/api/dlq/${job.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceQueue: job.sourceQueue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } catch (e: any) {
      setError(`Retry failed: ${e.message}`);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dead Letter Queue</h1>
          <p className="mt-1 text-sm text-gray-500">
            Jobs that exhausted all retry attempts. Inspect errors and manually re-queue.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading failed jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 font-medium">No failed jobs</p>
            <p className="mt-1 text-sm text-gray-400">The DLQ is empty — everything is running smoothly.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">
                {jobs.length} failed job{jobs.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={fetchJobs}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Refresh
              </button>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Job ID</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Queue</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Attempts</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Failed At</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">
                      {String((job.jobData as any).jobId ?? job.id).slice(0, 20)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                        {job.sourceQueue}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 max-w-sm">
                      <span
                        className="block truncate"
                        title={job.errorMessage}
                      >
                        {job.errorMessage.slice(0, 120)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{job.attemptsMade}</td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {new Date(job.failedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleRetry(job)}
                        disabled={retrying === job.id}
                        className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {retrying === job.id ? "Retrying…" : "Retry"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
