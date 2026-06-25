"use client";
import React, { memo, useCallback } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import type { SceneState } from "@/store/timelineStore";
import { SceneThumbnail } from "./SceneThumbnail";
import { AudioPlayer } from "./AudioPlayer";
import { VisualPromptField } from "./VisualPromptField";
import { NarrationField } from "./NarrationField";
import { SceneMetadata } from "./SceneMetadata";

export interface SceneCardProps {
  sceneId: string;
}

/**
 * Exported for unit testing (UT-17-01, UT-17-02, UT-17-03).
 * Compares two SceneState objects field-by-field.
 */
export function areScenesEqual(a: SceneState, b: SceneState): boolean {
  return (
    a.sceneId === b.sceneId &&
    a.narrationText === b.narrationText &&
    a.visualPrompt === b.visualPrompt &&
    a.audioUrl === b.audioUrl &&
    a.videoUrl === b.videoUrl &&
    a.isDirty === b.isDirty &&
    a.status === b.status &&
    a.durationInSeconds === b.durationInSeconds &&
    a.sequenceNumber === b.sequenceNumber
  );
}

function SceneCardInner({ sceneId }: SceneCardProps) {
  // Per-scene selector — only re-renders when this scene's data changes (Rule 2)
  const scene = useTimelineStore((s) => s.scenes[sceneId]);

  // Stable callbacks — read from store at call time to avoid stale closures (Rule 3)
  const handleVisualPromptChange = useCallback(
    (value: string) => {
      useTimelineStore.getState().updateSceneField(sceneId, "visualPrompt", value);
    },
    [sceneId]
  );

  const handleNarrationChange = useCallback(
    (value: string) => {
      useTimelineStore.getState().updateSceneField(sceneId, "narrationText", value);
    },
    [sceneId]
  );

  const handleRegenerate = useCallback(() => {
    const store = useTimelineStore.getState();
    store.markSceneStatus(sceneId, "regenerating");
    fetch(`/api/scenes/${sceneId}/regenerate-visual`, { method: "POST" })
      .then((res) => res.json())
      .then((data: { videoUrl: string }) => {
        const currentScene = useTimelineStore.getState().scenes[sceneId];
        store.updateSceneUrls(sceneId, currentScene?.audioUrl ?? "", data.videoUrl);
      })
      .catch(() => {
        store.markSceneStatus(sceneId, "error");
      });
  }, [sceneId]);

  const handleUpdateVoice = useCallback(() => {
    const store = useTimelineStore.getState();
    store.markSceneStatus(sceneId, "regenerating");
    fetch(`/api/scenes/${sceneId}/update-voice`, { method: "POST" })
      .then((res) => res.json())
      .then((data: { audioUrl: string }) => {
        const currentScene = useTimelineStore.getState().scenes[sceneId];
        store.updateSceneUrls(sceneId, data.audioUrl, currentScene?.videoUrl ?? "");
      })
      .catch(() => {
        store.markSceneStatus(sceneId, "error");
      });
  }, [sceneId]);

  if (!scene) return null;

  return (
    <div
      data-testid={`scene-card-${sceneId}`}
      className="bg-white border rounded-lg p-4 shadow-sm"
    >
      <div className="flex gap-4">
        <SceneThumbnail
          videoUrl={scene.videoUrl}
          isRegenerating={scene.status === "regenerating"}
        />
        <div className="flex-1 space-y-2 min-w-0">
          <SceneMetadata
            sequenceNumber={scene.sequenceNumber}
            durationInSeconds={scene.durationInSeconds}
            isDirty={scene.isDirty}
          />
          <AudioPlayer audioUrl={scene.audioUrl} />
          <VisualPromptField
            value={scene.visualPrompt}
            onChange={handleVisualPromptChange}
            onRegenerate={handleRegenerate}
            isRegenerating={scene.status === "regenerating"}
          />
          <NarrationField
            value={scene.narrationText}
            onChange={handleNarrationChange}
            onUpdateVoice={handleUpdateVoice}
            isRegenerating={scene.status === "regenerating"}
          />
        </div>
      </div>
    </div>
  );
}

// React.memo with equality on sceneId — prevents parent re-renders from cascading.
// Zustand per-scene selector handles data-change re-renders independently.
export const SceneCard = memo(
  SceneCardInner,
  (prev, next) => prev.sceneId === next.sceneId
);
