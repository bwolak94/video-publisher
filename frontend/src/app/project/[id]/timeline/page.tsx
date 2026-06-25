"use client";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { useCreatorStore } from "@/store/creatorStore";
import { useTimelineStore } from "@/store/timelineStore";
import type { VideoStoryboard } from "@/types/storyboard";

export default function TimelinePage() {
  const params = useParams();
  const projectId = params?.id as string | undefined;

  const storyboardJson = useCreatorStore((s) => s.storyboardJson);

  // Bridge: populate timeline store from storyboard JSON generated in Creator Mode
  useEffect(() => {
    if (!storyboardJson) return;
    const storyboard = storyboardJson as VideoStoryboard;
    if (storyboard?.timeline?.length > 0) {
      useTimelineStore.getState().initScenes(storyboard.timeline);
    }
  }, [storyboardJson]);

  return <TimelineEditor projectId={projectId} />;
}
