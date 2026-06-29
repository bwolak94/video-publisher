"use client";
import React, { useCallback, useState } from "react";
import { useTimelineStore } from "@/store/timelineStore";

const CONCURRENCY = 2; // max parallel scenes being generated at once

interface GenerateAllButtonProps {
  projectId?: string;
  defaultVoiceId?: string;
}

/**
 * Generates video + audio for EVERY scene that is missing either asset.
 * Processes up to CONCURRENCY scenes in parallel, shows live progress.
 */
export function GenerateAllButton({ projectId, defaultVoiceId = "21m00Tcm4TlvDq8ikWAM" }: GenerateAllButtonProps) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleGenerateAll = useCallback(async () => {
    const { scenes, sceneOrder, markSceneStatus, updateSceneUrls } = useTimelineStore.getState();

    // Only target scenes missing video OR audio
    const targets = sceneOrder.filter((id) => {
      const s = scenes[id];
      return s && (!s.videoUrl || !s.audioUrl);
    });

    if (targets.length === 0) return;

    setProgress({ done: 0, total: targets.length });
    let done = 0;

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const chunk = targets.slice(i, i + CONCURRENCY);

      await Promise.all(
        chunk.map(async (sceneId) => {
          const scene = useTimelineStore.getState().scenes[sceneId];
          if (!scene) return;

          markSceneStatus(sceneId, "regenerating");

          // Run video + audio in parallel for this scene
          const [videoResult, audioResult] = await Promise.allSettled([
            scene.videoUrl
              ? Promise.resolve({ videoUrl: scene.videoUrl, provider: scene.videoProvider })
              : fetch(`/api/scenes/${sceneId}/regenerate-visual`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    visualPrompt: scene.visualPrompt,
                    ...(projectId ? { projectId } : {}),
                  }),
                }).then((r) => r.json() as Promise<{ videoUrl: string; provider?: string }>),

            scene.audioUrl
              ? Promise.resolve({ audioUrl: scene.audioUrl })
              : fetch(`/api/scenes/${sceneId}/update-voice`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    narrationText: scene.narrationText,
                    voiceId: defaultVoiceId,
                    ...(projectId ? { projectId } : {}),
                  }),
                }).then((r) => r.json() as Promise<{ audioUrl: string }>),
          ]);

          const videoUrl =
            videoResult.status === "fulfilled" ? videoResult.value?.videoUrl : useTimelineStore.getState().scenes[sceneId]?.videoUrl ?? "";
          const audioUrl =
            audioResult.status === "fulfilled" ? audioResult.value?.audioUrl : useTimelineStore.getState().scenes[sceneId]?.audioUrl ?? "";
          const provider =
            videoResult.status === "fulfilled" ? videoResult.value?.provider : undefined;

          if (videoUrl || audioUrl) {
            updateSceneUrls(sceneId, audioUrl ?? "", videoUrl ?? "", provider);
          } else {
            markSceneStatus(sceneId, "error");
          }

          done++;
          setProgress({ done, total: targets.length });
        })
      );
    }

    setProgress(null);
  }, [projectId, defaultVoiceId]);

  const missingCount = useTimelineStore((s) =>
    s.sceneOrder.filter((id) => {
      const sc = s.scenes[id];
      return sc && (!sc.videoUrl || !sc.audioUrl);
    }).length
  );

  if (missingCount === 0 && !progress) return null;

  const isRunning = progress !== null;

  return (
    <button
      onClick={handleGenerateAll}
      disabled={isRunning || missingCount === 0}
      className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
        isRunning
          ? "bg-indigo-100 text-indigo-700 cursor-wait"
          : "bg-indigo-600 text-white hover:bg-indigo-700"
      } disabled:opacity-50`}
    >
      {isRunning
        ? `Generating… ${progress.done}/${progress.total}`
        : `Generate All (${missingCount})`}
    </button>
  );
}
