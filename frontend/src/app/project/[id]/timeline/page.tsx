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

  // Bridge: populate timeline store from storyboard JSON generated in Creator Mode
  useEffect(() => {
    if (!storyboardJson) return;
    const storyboard = storyboardJson as VideoStoryboard;
    if (storyboard?.timeline?.length > 0) {
      useTimelineStore.getState().initScenes(storyboard.timeline);
    }
  }, [storyboardJson]);

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
