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
    // If we have an in-memory storyboard from Creator Mode, use it
    if (storyboardJson) {
      const storyboard = storyboardJson as VideoStoryboard;
      if (storyboard?.timeline?.length > 0) {
        useTimelineStore.getState().initScenes(storyboard.timeline);
      }
      return;
    }

    // Otherwise fetch the project storyboard from the DB (e.g. navigating directly from dashboard)
    if (!projectId) return;
    const alreadyLoaded = useTimelineStore.getState().sceneOrder.length > 0;
    if (alreadyLoaded) return;

    setLoading(true);
    fetch(`${API_BASE}/api/projects/${projectId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((project) => {
        const storyboard = project?.storyboard as VideoStoryboard | null;
        if (storyboard?.timeline?.length > 0) {
          useTimelineStore.getState().initScenes(storyboard.timeline);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [storyboardJson, projectId]);

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
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-500">Loading project…</p>
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
