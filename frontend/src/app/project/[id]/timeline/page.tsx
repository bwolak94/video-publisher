"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { useCreatorStore } from "@/store/creatorStore";
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboard } from "@/types/storyboard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export default function TimelinePage() {
  const params = useParams();
  const projectId = params?.id as string | undefined;

  const storyboardJson = useCreatorStore((s) => s.storyboardJson);
  const [renderStatus, setRenderStatus] = useState<"idle" | "queued" | "error">("idle");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Always fetch from the server — this is the source of truth.
    // storyboardJson (in-memory from creation) persists in Zustand for the whole
    // session, so using it as the primary source would skip server-side updates
    // every time the user returns to the project.
    if (!projectId) return;

    setLoading(true);
    fetch(`${API_BASE}/api/projects/${projectId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((project) => {
        const storyboard = project?.storyboard as VideoStoryboard | null;
        if (storyboard != null && (storyboard.timeline?.length ?? 0) > 0) {
          // Server has a storyboard — always use it (overwrites any stale in-memory state)
          useTimelineStore.getState().initScenes(storyboard.timeline);
        } else if (storyboardJson) {
          // API returned no storyboard yet (e.g. project was just created and hasn't
          // been persisted yet) — fall back to the in-memory creation result
          const sb = storyboardJson as VideoStoryboard;
          if (sb?.timeline?.length > 0) {
            useTimelineStore.getState().initScenes(sb.timeline);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]); // projectId only — storyboardJson intentionally excluded

  const handleRender = useCallback(async () => {
    if (!projectId) {
      alert("No project ID — save the project first.");
      return;
    }
    try {
      setRenderStatus("queued");
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/render`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert(`Render queued! Job ID: ${data.jobId}\n\nYou will be notified when the video is ready.`);
    } catch (err: any) {
      setRenderStatus("error");
      alert(`Render failed: ${err.message}`);
    } finally {
      setRenderStatus("idle");
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-app">
        <div className="text-center space-y-3">
          <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-ink-secondary">Loading project…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderStatus === "queued" && (
        <div className="fixed top-4 right-4 z-50 bg-indigo-600 text-white px-4 py-2 rounded shadow-lg text-sm">
          Queuing render…
        </div>
      )}
      <TimelineEditor projectId={projectId} onRender={handleRender} />
    </>
  );
}
